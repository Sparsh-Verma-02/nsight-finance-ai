"""
Finance AI Backend - Python Flask API
Complete backend with database, AI generation, and PDF/CSV export
"""

import os
import re
import json
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import numpy as np
import pymysql
from dotenv import load_dotenv
import google.generativeai as genai
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from io import BytesIO

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# =====================================================
# CONFIGURATION
# =====================================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    MODEL = genai.GenerativeModel('gemini-2.5-flash-lite')


DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "finance_data"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor
}

FORBIDDEN_SQL = ["insert", "update", "delete", "drop", "alter", "truncate", "create", "grant", "revoke"]

# =====================================================
# UTILITY FUNCTIONS
# =====================================================
def force_numeric(df):
    """Convert numeric strings to actual numbers"""
    for col in df.columns:
        if df[col].dtype == 'object':
            try:
                converted = pd.to_numeric(df[col], errors='coerce')
                if not converted.isna().all():
                    df[col] = converted
            except:
                pass
    return df

def format_number(x):
    """Smart number formatting for display"""
    try:
        if pd.isna(x) or x is None:
            return "N/A"
        val = float(x)
        if abs(val) >= 1000000000:
            return f"${val/1000000000:.2f}B"
        elif abs(val) >= 1000000:
            return f"${val/1000000:.2f}M"
        elif abs(val) >= 1000:
            return f"${val/1000:.2f}K"
        else:
            return f"${val:,.2f}"
    except:
        return str(x)

def enforce_limit(sql):
    """Add LIMIT to queries if needed for safety"""
    sql_l = sql.lower()
    if "limit" in sql_l:
        return sql
    
    aggregate_keywords = ["sum(", "count(", "avg(", "min(", "max("]
    has_aggregate = any(k in sql_l for k in aggregate_keywords)
    has_group_by = "group by" in sql_l
    has_from = "from" in sql_l
    
    if has_from and (has_group_by or not has_aggregate):
        return sql.rstrip(";") + " LIMIT 50;"
    
    return sql

# =====================================================
# DATABASE CLASS
# =====================================================
class DB:
    @staticmethod
    def test_connection():
        """Test database connection"""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            conn.cursor().execute("SELECT 1")
            conn.close()
            return True
        except Exception as e:
            print(f"DB Connection Error: {e}")
            return False
    
    @staticmethod
    def fetch_df(sql, params=None):
        """Execute SQL and return DataFrame"""
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor()
            
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)
            
            result = cursor.fetchall()
            df = pd.DataFrame(result)
            conn.close()
            
            if df.empty:
                return df
            
            df = force_numeric(df)
            return df
        except Exception as e:
            print(f"DB Fetch Error: {e}")
            raise e
    
    @staticmethod
    def get_schema_detailed():
        """Get detailed schema with sample data"""
        sql = """
        SELECT 
            table_name, 
            column_name, 
            data_type,
            column_type
        FROM information_schema.columns
        WHERE table_schema = %s
        ORDER BY table_name, ordinal_position
        """
        try:
            conn = pymysql.connect(**DB_CONFIG)
            cursor = conn.cursor()
            cursor.execute(sql, (DB_CONFIG['database'],))
            result = cursor.fetchall()
            conn.close()
            
            schema = {}
            for row in result:
                table = row['table_name']
                if table not in schema:
                    schema[table] = {
                        'columns': [],
                        'sample_data': None,
                        'row_count': 0
                    }
                
                schema[table]['columns'].append({
                    'name': row['column_name'],
                    'type': row['data_type'],
                    'full_type': row['column_type']
                })
            
            # Get sample data and row count for each table
            for table in schema.keys():
                try:
                    count_df = DB.fetch_df(f"SELECT COUNT(*) as count FROM {table}")
                    if not count_df.empty:
                        schema[table]['row_count'] = int(count_df.iloc[0]['count'])
                    
                    sample_df = DB.fetch_df(f"SELECT * FROM {table} LIMIT 3")
                    if not sample_df.empty:
                        for col in sample_df.columns:
                            if pd.api.types.is_datetime64_any_dtype(sample_df[col]):
                                sample_df[col] = sample_df[col].astype(str)
                        schema[table]['sample_data'] = sample_df.to_dict('records')
                except:
                    pass
            
            return schema
        except Exception as e:
            print(f"Schema Error: {e}")
            return {}
    
    @staticmethod
    def get_schema_text():
        """Get schema as formatted text for AI prompting"""
        schema = DB.get_schema_detailed()
        if not schema:
            return "⚠️ No tables found."
        
        lines = []
        for table, info in schema.items():
            cols = [f"{c['name']} ({c['type']})" for c in info['columns']]
            lines.append(f"{table}:")
            lines.append("  - " + "\n  - ".join(cols))
            lines.append(f"  Rows: {info['row_count']}")
            
            if info.get('sample_data'):
                try:
                    sample_str = json.dumps(info['sample_data'][:2], indent=2)
                    if len(sample_str) < 300:
                        lines.append(f"  Sample: {sample_str}")
                except:
                    pass
            lines.append("")
        
        return "\n".join(lines)

# =====================================================
# AI GENERATION CLASS
# =====================================================
class GeminiAI:
    @staticmethod
    def validate_sql(sql):
        """Validate SQL for safety"""
        if not sql:
            raise ValueError("Empty SQL query")
        
        sql_lower = sql.lower()
        
        for forbidden in FORBIDDEN_SQL:
            if forbidden in sql_lower:
                raise ValueError(f"Unsafe SQL operation: {forbidden}")
        
        if not sql_lower.strip().startswith('select'):
            raise ValueError("Only SELECT queries allowed")
        
        return sql
    
    @staticmethod
    def generate_sql(question, schema_text):
        """Generate SQL query using Gemini AI"""
        current_year = datetime.now().year
        
        prompt = f"""You are a senior SQL analyst with 10+ years of experience.

CURRENT YEAR: {current_year}

DATABASE SCHEMA:
{schema_text}

CRITICAL RULES:
1. Use table.column format (e.g., pnl_data.Revenue)
2. For year filtering:
   - If column type is DATE/DATETIME: use YEAR(table.column_name) = {current_year}
   - If column type is INT (year): use table.column_name = {current_year}
3. For "this year" or "current year", filter by year {current_year}
4. **ALWAYS include numeric values in SELECT** - Never return just category names
5. Use SUM() for totals and include the sum in SELECT
6. Add GROUP BY when aggregating by categories
7. Use ORDER BY DESC for rankings
8. When finding "highest/lowest", include the actual amount in SELECT
9. MySQL syntax ONLY
10. READ ONLY queries
11. Use ONLY existing tables and columns from the schema

USER QUESTION: {question}

Return ONLY the SQL query - no explanations, no markdown, no backticks.

SQL:"""
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = MODEL.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.1,
                        max_output_tokens=500
                    )
                )
                
                sql = response.text.strip()
                # Clean up the response
                sql = re.sub(r'```sql|```|`', '', sql, flags=re.IGNORECASE)
                sql = sql.strip()
                
                # Remove comments and extra lines
                lines = [line.strip() for line in sql.split('\n') 
                        if line.strip() and not line.strip().startswith(('#', '//', '--', 'Note:', 'Question:'))]
                sql = ' '.join(lines)
                
                # Extract SELECT statement if embedded in text
                if not sql.lower().startswith('select'):
                    select_match = re.search(r'(SELECT\s+.*?)(?:;|$)', sql, re.IGNORECASE | re.DOTALL)
                    if select_match:
                        sql = select_match.group(1).strip()
                
                if sql.lower().startswith('select'):
                    sql = enforce_limit(sql)
                    return sql
                
            except Exception as e:
                if attempt == max_retries - 1:
                    print(f"SQL generation failed: {e}")
        
        return None
    
    @staticmethod
    def generate_chart_spec(df, question):
        """Generate intelligent chart specification"""
        prompt = f"""Analyze this data and decide the best visualization.

Columns: {list(df.columns)}
Row count: {len(df)}
User question: {question}

Data preview:
{df.head(10).to_string()}

Return ONLY valid JSON (no text, no markdown):

{{
  "chart": "line|bar|pie|scatter|table",
  "x": "column_name",
  "y": "column_name",
  "title": "Chart Title"
}}

For single values, use "table".
For time series, use "line".
For comparisons, use "bar".
For proportions, use "pie"."""
        
        try:
            response = MODEL.generate_content(prompt)
            raw = response.text.strip()
            raw = re.sub(r"```json|```", "", raw, flags=re.IGNORECASE).strip()
            spec = json.loads(raw)
            return spec
        except:
            return {
                "chart": "table",
                "x": None,
                "y": None,
                "title": "Data Preview"
            }
    
    @staticmethod
    def generate_insights(df, question, sql):
        """Generate business insights from query results"""
        if df.empty:
            return "No data found for this query."
        
        has_nan = df.isna().any().any()
        nan_cols = df.columns[df.isna().any()].tolist()
        
        summary = []
        summary.append(f"Total Rows: {len(df)}")
        summary.append(f"Columns: {', '.join(df.columns.tolist())}")
        
        if has_nan:
            summary.append(f"\n⚠️ WARNING: Found NULL/NaN values in columns: {', '.join(nan_cols)}")
        
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) > 0:
            summary.append("\nNumeric Statistics:")
            for col in numeric_cols[:3]:
                non_null = df[col].dropna()
                if len(non_null) > 0:
                    summary.append(f"- {col}: Min={non_null.min():,.2f}, Max={non_null.max():,.2f}, Mean={non_null.mean():,.2f}")
        
        preview = df.head(15).to_string(index=False)
        
        prompt = f"""You are a senior data analyst. Analyze this query result and provide actionable business insights.

USER QUESTION: {question}

SQL QUERY:
{sql}

DATA SUMMARY:
{chr(10).join(summary)}

DATA PREVIEW:
{preview}

INSTRUCTIONS:
1. BE CONCISE - Focus on numbers immediately
2. Start with the direct answer using actual numbers
3. Provide 2-3 specific insights with bold for key numbers
4. One clear recommendation

FORMAT:
**Direct Answer:** [Answer with numbers]

**Key Findings:**
- [Insight 1]
- [Insight 2]
- [Insight 3]

**Recommendation:** [Action]

ANALYSIS:"""
        
        try:
            response = MODEL.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=800
                )
            )
            return response.text.strip()
        except Exception as e:
            return f"Analysis Error: {str(e)}"

# =====================================================
# PDF GENERATOR
# =====================================================
class PDFGenerator:
    @staticmethod
    def generate_pdf(question, insights, df, sql):
        """Generate professional PDF report"""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, 
                              rightMargin=0.75*inch, leftMargin=0.75*inch,
                              topMargin=0.75*inch, bottomMargin=0.75*inch)
        
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Title'],
            fontSize=24,
            textColor=colors.HexColor('#667eea'),
            spaceAfter=30,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#667eea'),
            spaceAfter=12,
            spaceBefore=12,
            fontName='Helvetica-Bold'
        )
        
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=10,
            fontName='Helvetica'
        )
        
        elements = []
        
        # Title
        elements.append(Paragraph("Nsight Finance AI", title_style))
        elements.append(Paragraph("Data Analysis Report", styles['Heading3']))
        elements.append(Spacer(1, 0.3*inch))
        
        # Timestamp
        timestamp = datetime.now().strftime("%B %d, %Y at %I:%M %p")
        elements.append(Paragraph(f"<b>Generated:</b> {timestamp}", normal_style))
        elements.append(Spacer(1, 0.2*inch))
        
        # Question
        elements.append(Paragraph("Question", heading_style))
        elements.append(Paragraph(question, normal_style))
        elements.append(Spacer(1, 0.2*inch))
        
        # Insights
        elements.append(Paragraph("Analysis & Insights", heading_style))
        insight_lines = insights.split('\n')
        for line in insight_lines:
            if line.strip():
                clean_line = line.replace('**', '').replace('##', '').replace('###', '')
                elements.append(Paragraph(clean_line, normal_style))
        
        elements.append(Spacer(1, 0.3*inch))
        
        # Data Table
        if df is not None and not df.empty:
            elements.append(Paragraph("Data Preview (Top 15 Rows)", heading_style))
            elements.append(Spacer(1, 0.1*inch))
            
            display_df = df.head(15).copy()
            
            for col in display_df.columns:
                if pd.api.types.is_numeric_dtype(display_df[col]):
                    display_df[col] = display_df[col].apply(
                        lambda x: f"{x:,.2f}" if pd.notna(x) else "N/A"
                    )
                else:
                    display_df[col] = display_df[col].fillna("N/A")
            
            table_data = [display_df.columns.tolist()] + display_df.values.tolist()
            
            available_width = 7 * inch
            num_cols = len(display_df.columns)
            col_width = available_width / num_cols
            
            table = Table(table_data, colWidths=[col_width] * num_cols, repeatRows=1)
            
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            
            elements.append(table)
        
        doc.build(elements)
        buffer.seek(0)
        return buffer

# =====================================================
# API ENDPOINTS
# =====================================================
@app.route('/api/status', methods=['GET'])
def get_status():
    """Get system status and database info"""
    db_status = 'connected' if DB.test_connection() else 'offline'
    ai_status = 'active' if GEMINI_API_KEY else 'offline'
    
    schema = {}
    total_rows = 0
    tables = []
    
    if db_status == 'connected':
        try:
            schema = DB.get_schema_detailed()
            total_rows = sum(t.get('row_count', 0) for t in schema.values())
            tables = list(schema.keys())[:5]
        except:
            pass
    
    return jsonify({
        'db_status': db_status,
        'ai_status': ai_status,
        'tables': tables,
        'total_rows': total_rows
    })

@app.route('/api/query', methods=['POST'])
def process_query():
    """Process natural language query and return results"""
    try:
        data = request.json
        question = data.get('question', '')
        
        if not question:
            return jsonify({'error': 'Question is required'}), 400
        
        # Get database schema
        schema_text = DB.get_schema_text()
        if not schema_text or "⚠️" in schema_text:
            return jsonify({'error': 'Unable to access database schema'}), 500
        
        # Generate SQL from natural language
        sql = GeminiAI.generate_sql(question, schema_text)
        if not sql:
            return jsonify({'error': 'Could not generate SQL query'}), 500
        
        # Validate SQL for safety
        sql = GeminiAI.validate_sql(sql)
        
        # Execute query
        df = DB.fetch_df(sql)
        
        if df.empty:
            return jsonify({
                'message': 'Query returned no results',
                'sql': sql,
                'data': [],
                'insights': 'No data found for this query.',
                'chart_spec': None
            })
        
        # Generate insights
        insights = GeminiAI.generate_insights(df, question, sql)
        
        # Generate chart specification
        chart_spec = GeminiAI.generate_chart_spec(df, question)
        
        # Clean DataFrame for JSON serialization
        df_clean = df.copy()
        for col in df_clean.columns:
            if pd.api.types.is_datetime64_any_dtype(df_clean[col]):
                df_clean[col] = df_clean[col].astype(str)
            elif pd.api.types.is_numeric_dtype(df_clean[col]):
                df_clean[col] = df_clean[col].replace({np.nan: None})
        
        data_records = df_clean.to_dict('records')
        
        return jsonify({
            'sql': sql,
            'data': data_records,
            'insights': insights,
            'chart_spec': chart_spec,
            'row_count': len(df)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/pdf', methods=['POST'])
def download_pdf():
    """Generate and download PDF report"""
    try:
        data = request.json
        question = data.get('question', '')
        insights = data.get('insights', '')
        sql = data.get('sql', '')
        data_records = data.get('data', [])
        
        df = pd.DataFrame(data_records) if data_records else pd.DataFrame()
        
        pdf_buffer = PDFGenerator.generate_pdf(question, insights, df, sql)
        
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'finance_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/csv', methods=['POST'])
def download_csv():
    """Generate and download CSV file"""
    try:
        data = request.json
        data_records = data.get('data', [])
        
        df = pd.DataFrame(data_records)
        
        csv_buffer = BytesIO()
        df.to_csv(csv_buffer, index=False)
        csv_buffer.seek(0)
        
        return send_file(
            csv_buffer,
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'finance_data_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =====================================================
# RUN APPLICATION
# =====================================================
if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Finance AI Backend Starting...")
    print("=" * 60)
    print(f"Database: {DB_CONFIG['database']}")
    print(f"AI Model: {'Gemini 2.0 Flash' if GEMINI_API_KEY else 'Not configured'}")
    print(f"Server: http://localhost:5000")
    print("=" * 60)
    
    app.run(debug=True, host='0.0.0.0', port=5000)