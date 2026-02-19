import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Database, Brain, TrendingUp, AlertCircle, CheckCircle, Loader, Sun, Moon, Send, Sparkles, BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, Table as TableIcon, Trash2, History, Plus, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000/api';

const THEMES = {
  light: {
    name: 'Light',
    bg: 'bg-gradient-to-br from-indigo-50 via-white to-purple-50',
    header: 'bg-white',
    card: 'bg-white',
    text: 'text-gray-900',
    textSecondary: 'text-gray-600',
    border: 'border-gray-200',
    input: 'bg-white border-gray-300 text-gray-900',
    chatBg: 'bg-gray-50',
    userMessage: 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white',
    botMessage: 'bg-white border border-gray-200',
    table: {
      header: 'bg-gradient-to-r from-indigo-500 to-purple-600',
      row: 'bg-white',
      hover: 'hover:bg-gray-50'
    }
  },
  dark: {
    name: 'Dark',
    bg: 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900',
    header: 'bg-gray-800',
    card: 'bg-gray-800',
    text: 'text-white',
    textSecondary: 'text-gray-300',
    border: 'border-gray-700',
    input: 'bg-gray-700 border-gray-600 text-white',
    chatBg: 'bg-gray-900',
    userMessage: 'bg-gradient-to-r from-indigo-600 to-purple-700 text-white',
    botMessage: 'bg-gray-800 border border-gray-700',
    table: {
      header: 'bg-gradient-to-r from-indigo-600 to-purple-700',
      row: 'bg-gray-800',
      hover: 'hover:bg-gray-700'
    }
  }
};

const SAMPLE_QUESTIONS = [
  { q: "What were the total sales this year?", icon: "💰" },
  { q: "Show me monthly sales for 2025", icon: "📈" },
  { q: "Revenue by product category", icon: "📊" },
  { q: "Which region had the highest profit?", icon: "🏆" },
  { q: "Top 10 customers by total purchases", icon: "👥" },
  { q: "Compare profits across different departments", icon: "🔍" }
];

const COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];

const formatMessageContent = (content) => {
  if (!content) return content;
  
  // Replace **text** with bold formatting
  const parts = content.split(/(\*\*.*?\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const text = part.slice(2, -2);
      return <strong key={index} className="font-semibold">{text}</strong>;
    }
    return part;
  });
};

const FinanceAIDashboard = () => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [theme, setTheme] = useState('light');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [chartTypes, setChartTypes] = useState({}); // Track chart type for each message
  const [showHistory, setShowHistory] = useState(true); // Changed to true by default
  const [savedConversations, setSavedConversations] = useState([]);

  const currentTheme = THEMES[theme];
  const messagesEndRef = React.useRef(null);

  const STORAGE_KEY = 'finbot_conversations';
  const CURRENT_CHAT_KEY = 'finbot_current_chat';

  useEffect(() => {
  fetchSystemStatus();
  loadConversations();
  loadCurrentChat();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Auto-save current chat whenever messages change
    if (messages.length > 1) { // Only save if there are messages beyond welcome
      try {
        const chatData = {
          messages,
          chartTypes,
          lastUpdated: new Date().toISOString()
        };
        localStorage.setItem(CURRENT_CHAT_KEY, JSON.stringify(chatData));
      } catch (err) {
        console.error('Failed to save current chat:', err);
      }
    }
  }, [messages, chartTypes, CURRENT_CHAT_KEY]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadConversations = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSavedConversations(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const loadCurrentChat = () => {
    try {
      const saved = localStorage.getItem(CURRENT_CHAT_KEY);
      if (saved) {
        const { messages: savedMessages, chartTypes: savedChartTypes } = JSON.parse(saved);
        setMessages(savedMessages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })));
        setChartTypes(savedChartTypes || {});
        setShowSuggestions(savedMessages.length <= 1);
      } else {
        // Initialize with welcome message
        setMessages([{
          type: 'bot',
          content: "👋 Hello! I'm N-Finbot, your intelligent financial data analyst. Ask me anything about your financial data - sales trends, revenue analysis, customer insights, and more!",
          timestamp: new Date()
        }]);
      }
    } catch (err) {
      console.error('Failed to load current chat:', err);
      setMessages([{
        type: 'bot',
        content: "👋 Hello! I'm N-Finbot, your intelligent financial data analyst. Ask me anything about your financial data - sales trends, revenue analysis, customer insights, and more!",
        timestamp: new Date()
      }]);
    }
  };

  const saveConversation = () => {
    if (messages.length <= 1) return; // Don't save if only welcome message

    try {
      const conversations = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const newConversation = {
        id: Date.now(),
        title: messages[1]?.content?.substring(0, 50) + '...' || 'Untitled Conversation',
        messages,
        chartTypes,
        timestamp: new Date().toISOString()
      };
      
      const updatedConversations = [newConversation, ...conversations].slice(0, 20); // Keep last 20
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedConversations));
      setSavedConversations(updatedConversations);
      
      alert('Conversation saved successfully!');
    } catch (err) {
      console.error('Failed to save conversation:', err);
      alert('Failed to save conversation');
    }
  };

  const loadConversation = (conversation) => {
    setMessages(conversation.messages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    })));
    setChartTypes(conversation.chartTypes || {});
    setShowSuggestions(false);
    setShowHistory(false);
  };

  const deleteConversation = (id) => {
    try {
      const updated = savedConversations.filter(conv => conv.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setSavedConversations(updated);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const startNewChat = () => {
    setMessages([{
      type: 'bot',
      content: "👋 Hello! I'm N-Finbot, your intelligent financial data analyst. Ask me anything about your financial data - sales trends, revenue analysis, customer insights, and more!",
      timestamp: new Date()
    }]);
    setChartTypes({});
    setShowSuggestions(true);
    localStorage.removeItem(CURRENT_CHAT_KEY);
  };

  const clearAllHistory = () => {
    if (window.confirm('Are you sure you want to clear all saved conversations? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEY);
      setSavedConversations([]);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/status`);
      const data = await response.json();
      setSystemStatus(data);
    } catch (err) {
      console.error('Failed to fetch system status:', err);
    }
  };

  const handleQuery = async (queryText = null) => {
    const questionToAsk = queryText || question;
    if (!questionToAsk.trim()) return;

    const userMessage = {
      type: 'user',
      content: questionToAsk,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setShowSuggestions(false);
    setQuestion('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionToAsk })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Query failed');
      }

      const botMessage = {
        type: 'bot',
        content: data.insights,
        data: data,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      const errorMessage = {
        type: 'error',
        content: err.message,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (messageData) => {
    if (!messageData) return;

    try {
      const response = await fetch(`${API_BASE_URL}/download/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Query',
          insights: messageData.insights,
          sql: messageData.sql,
          data: messageData.data
        })
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance_report_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download PDF');
    }
  };

  const downloadCSV = async (messageData) => {
    if (!messageData) return;

    try {
      const response = await fetch(`${API_BASE_URL}/download/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: messageData.data })
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance_data_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download CSV');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  };

  const changeChartType = (messageIndex, newChartType) => {
    setChartTypes(prev => ({
      ...prev,
      [messageIndex]: newChartType
    }));
  };

  const getChartType = (messageIndex, defaultType) => {
    return chartTypes[messageIndex] || defaultType || 'bar';
  };

  const renderChart = (data, messageIndex) => {
    if (!data?.data || data.data.length === 0) return null;

    const { chart: defaultChart, x, y } = data.chart_spec || {};
    const currentChartType = getChartType(messageIndex, defaultChart);
    const chartData = data.data.slice(0, 50);

    const hasValidColumns = x && y && data.data[0] && 
                           (data.data[0].hasOwnProperty(x) || data.data[0].hasOwnProperty(x.toUpperCase())) &&
                           (data.data[0].hasOwnProperty(y) || data.data[0].hasOwnProperty(y.toUpperCase()));

    if (currentChartType === 'table' || !hasValidColumns) {
      return (
        <div className="overflow-x-auto rounded-lg max-h-96">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className={currentTheme.table.header}>
              <tr>
                {Object.keys(data.data[0] || {}).map(key => (
                  <th key={key} className="px-4 py-2 text-left text-xs font-medium text-white uppercase">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`${currentTheme.table.row} divide-y divide-gray-200`}>
              {data.data.slice(0, 10).map((row, idx) => (
                <tr key={idx} className={currentTheme.table.hover}>
                  {Object.values(row).map((val, i) => (
                    <td key={i} className={`px-4 py-2 whitespace-nowrap text-xs ${currentTheme.text}`}>
                      {val !== null && val !== undefined ? 
                        (typeof val === 'number' ? val.toLocaleString() : String(val)) : 'N/A'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const commonProps = {
      width: '100%',
      height: 300,
      data: chartData,
      margin: { top: 10, right: 20, left: 10, bottom: 40 }
    };

    switch (currentChartType) {
      case 'bar':
        return (
          <ResponsiveContainer {...commonProps}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={x} angle={-45} textAnchor="end" height={80} style={{ fontSize: '11px' }} />
              <YAxis style={{ fontSize: '11px' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey={y} fill="#667eea" />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer {...commonProps}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={x} angle={-45} textAnchor="end" height={80} style={{ fontSize: '11px' }} />
              <YAxis style={{ fontSize: '11px' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={y} stroke="#667eea" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer {...commonProps}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey={y}
                nameKey={x}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`h-screen flex flex-col ${currentTheme.bg}`}>
      {/* Header */}
      <header className={`${currentTheme.header} shadow-sm border-b ${currentTheme.border} flex-shrink-0`}>
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Sidebar Toggle */}
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg ${currentTheme.card} ${currentTheme.border} border hover:bg-gray-100 dark:hover:bg-gray-700 transition`}
                title={showHistory ? "Hide Sidebar" : "Show Sidebar"}
              >
                {showHistory ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  N-Finbot
                </h1>
                <p className={`text-xs ${currentTheme.textSecondary}`}>AI Financial Assistant</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* New Chat Button */}
              <button
                onClick={startNewChat}
                className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>New Chat</span>
              </button>

              {/* Theme Toggle */}
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className={`p-2 rounded-lg ${currentTheme.card} ${currentTheme.border} border hover:bg-gray-100 dark:hover:bg-gray-700 transition`}
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {/* System Status */}
              {systemStatus && (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-1">
                    <Database className="w-4 h-4 text-gray-400" />
                    <span className={`text-xs ${systemStatus.db_status === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                      {systemStatus.db_status === 'connected' ? <CheckCircle className="w-3 h-3 inline" /> : <AlertCircle className="w-3 h-3 inline" />}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Brain className="w-4 h-4 text-gray-400" />
                    <span className={`text-xs ${systemStatus.ai_status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                      {systemStatus.ai_status === 'active' ? <CheckCircle className="w-3 h-3 inline" /> : <AlertCircle className="w-3 h-3 inline" />}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${showHistory ? 'w-80' : 'w-0'} transition-all duration-300 ${currentTheme.card} border-r ${currentTheme.border} flex flex-col overflow-hidden`}>
          {showHistory && (
            <>
              {/* Sidebar Header */}
              <div className={`p-4 border-b ${currentTheme.border}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="w-5 h-5 text-indigo-600" />
                    <h3 className={`font-semibold ${currentTheme.text}`}>Conversations</h3>
                  </div>
                  <span className={`text-xs ${currentTheme.textSecondary} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>
                    {savedConversations.length}
                  </span>
                </div>
                
                <button
                  onClick={saveConversation}
                  className="w-full px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Save Current Chat</span>
                </button>
                
                {savedConversations.length > 0 && (
                  <button
                    onClick={clearAllHistory}
                    className="w-full mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg text-sm hover:bg-red-100 dark:hover:bg-red-900/30 transition flex items-center justify-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear All History</span>
                  </button>
                )}
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {savedConversations.length === 0 ? (
                  <div className="text-center py-12">
                    <History className={`w-12 h-12 mx-auto mb-3 ${currentTheme.textSecondary} opacity-50`} />
                    <p className={`text-sm ${currentTheme.textSecondary}`}>
                      No saved conversations yet
                    </p>
                    <p className={`text-xs ${currentTheme.textSecondary} mt-2`}>
                      Click "Save Current Chat" to save
                    </p>
                  </div>
                ) : (
                  savedConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`border ${currentTheme.border} rounded-lg p-3 hover:border-indigo-500 hover:shadow-md transition cursor-pointer group relative`}
                      onClick={() => loadConversation(conv)}
                    >
                      <div className="flex items-start space-x-2">
                        <MessageSquare className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-medium ${currentTheme.text} mb-1 line-clamp-2`}>
                            {conv.title}
                          </h4>
                          <div className="flex items-center justify-between">
                            <p className={`text-xs ${currentTheme.textSecondary}`}>
                              {new Date(conv.timestamp).toLocaleDateString()}
                            </p>
                            <span className={`text-xs ${currentTheme.textSecondary} bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded`}>
                              {conv.messages.length} msgs
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="absolute top-2 right-2 p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col overflow-hidden ${currentTheme.chatBg}`}>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Messages */}
          {messages.map((message, idx) => (
            <div key={idx} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-3xl ${message.type === 'user' ? 'w-auto' : 'w-full'}`}>
                {message.type === 'bot' && (
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <span className={`text-sm font-medium ${currentTheme.text}`}>N-Finbot</span>
                  </div>
                )}
                
                <div className={`rounded-2xl p-4 ${
                  message.type === 'user' 
                    ? currentTheme.userMessage 
                    : message.type === 'error'
                    ? 'bg-red-50 border border-red-200 text-red-900'
                    : currentTheme.botMessage
                } shadow-sm`}>
                  {message.type === 'error' && (
                    <div className="flex items-center space-x-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <span className="font-medium">Error</span>
                    </div>
                  )}
                  
                  <div className={`text-sm whitespace-pre-wrap ${
                    message.type === 'user' 
                      ? 'text-white' 
                      : message.type === 'error'
                      ? 'text-red-900'
                      : currentTheme.text
                  }`}>
                    {formatMessageContent(message.content)}
                  </div>

                  {/* Data Visualization for Bot Messages */}
                  {message.type === 'bot' && message.data && (
                    <div className="mt-4 space-y-4">
                      {/* Chart */}
                      {message.data.chart_spec && (
                        <div className={`${currentTheme.card} rounded-lg p-4 border ${currentTheme.border}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <BarChart3 className="w-4 h-4 text-purple-600" />
                              <span className="text-sm font-medium text-purple-600">
                                {message.data.chart_spec.title || 'Visualization'}
                              </span>
                            </div>
                            
                            {/* Chart Type Selector */}
                            <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                              <button
                                onClick={() => changeChartType(idx, 'bar')}
                                className={`p-1.5 rounded transition ${
                                  getChartType(idx, message.data.chart_spec?.chart) === 'bar'
                                    ? 'bg-white dark:bg-gray-600 shadow text-indigo-600'
                                    : 'text-gray-600 hover:text-gray-900'
                                }`}
                                title="Bar Chart"
                              >
                                <BarChart3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => changeChartType(idx, 'line')}
                                className={`p-1.5 rounded transition ${
                                  getChartType(idx, message.data.chart_spec?.chart) === 'line'
                                    ? 'bg-white dark:bg-gray-600 shadow text-indigo-600'
                                    : 'text-gray-600 hover:text-gray-900'
                                }`}
                                title="Line Chart"
                              >
                                <LineChartIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => changeChartType(idx, 'pie')}
                                className={`p-1.5 rounded transition ${
                                  getChartType(idx, message.data.chart_spec?.chart) === 'pie'
                                    ? 'bg-white dark:bg-gray-600 shadow text-indigo-600'
                                    : 'text-gray-600 hover:text-gray-900'
                                }`}
                                title="Pie Chart"
                              >
                                <PieChartIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => changeChartType(idx, 'table')}
                                className={`p-1.5 rounded transition ${
                                  getChartType(idx, message.data.chart_spec?.chart) === 'table'
                                    ? 'bg-white dark:bg-gray-600 shadow text-indigo-600'
                                    : 'text-gray-600 hover:text-gray-900'
                                }`}
                                title="Table View"
                              >
                                <TableIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {renderChart(message.data, idx)}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center space-x-2 pt-2">
                        <button
                          onClick={() => downloadPDF(message.data)}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={() => downloadCSV(message.data)}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-xs"
                        >
                          <Download className="w-3 h-3" />
                          <span>CSV</span>
                        </button>
                        {message.data.row_count && (
                          <span className={`text-xs ${currentTheme.textSecondary} ml-auto`}>
                            {message.data.row_count} rows
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {message.type === 'user' && (
                  <div className="flex items-center justify-end space-x-2 mt-1">
                    <span className={`text-xs ${currentTheme.textSecondary}`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-3xl">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <span className={`text-sm font-medium ${currentTheme.text}`}>N-Finbot</span>
                </div>
                <div className={`rounded-2xl p-4 ${currentTheme.botMessage} shadow-sm`}>
                  <div className="flex items-center space-x-2">
                    <Loader className="w-4 h-4 animate-spin text-indigo-600" />
                    <span className="text-sm text-indigo-600">Analyzing your data...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Suggestions */}
          {showSuggestions && messages.length === 1 && (
            <div className="space-y-3">
              <p className={`text-sm ${currentTheme.textSecondary} text-center`}>Try asking:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SAMPLE_QUESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuery(item.q)}
                    className={`text-left p-3 border ${currentTheme.border} rounded-xl hover:border-indigo-500 hover:shadow-md transition ${currentTheme.card}`}
                  >
                    <div className="flex items-start space-x-2">
                      <span className="text-lg">{item.icon}</span>
                      <span className={`text-sm ${currentTheme.text}`}>{item.q}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className={`${currentTheme.header} border-t ${currentTheme.border} flex-shrink-0`}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about your financial data..."
                rows="1"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition resize-none ${currentTheme.input}`}
                disabled={loading}
                style={{ minHeight: '50px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={() => handleQuery()}
              disabled={loading || !question.trim()}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-3 rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
            >
              {loading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceAIDashboard;