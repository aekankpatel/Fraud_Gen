import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

function Statistics() {
  const [statistics, setStatistics] = useState(null);
  const [locationStats, setLocationStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('all');
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });

  // Chart colors
  const COLORS = ['#2ecc71', '#f39c12', '#e74c3c', '#3498db', '#9b59b6', '#1abc9c', '#d35400', '#34495e'];
  
  // For fraud severity pie chart
  const FRAUD_COLORS = {
    'CONFIRMED_FRAUD': '#e74c3c',
    'HIGH_RISK': '#f39c12',
    'NEEDS_REVIEW': '#3498db',
    'LEGITIMATE': '#2ecc71'
  };

  useEffect(() => {
    fetchStatistics();
    fetchLocationStats();
  }, []);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:5050/api/statistics');
      setStatistics(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching statistics:', err);
      setError(`Error loading statistics: ${err.message}`);
      setLoading(false);
    }
  };

  const fetchLocationStats = async () => {
    try {
      const response = await axios.get('http://localhost:5050/api/statistics/locations');
      setLocationStats({
       country_statistics: response.data.country_stats,
       vpn_proxy_statistics: response.data.vpn_proxy_stats
      });
    } catch (err) {
      console.error('Error fetching location statistics:', err);
      setError(`Error loading location statistics: ${err.message}`);
    }
  };

  const handleRefresh = () => {
    fetchStatistics();
    fetchLocationStats();
  };

  const handleTimeframeChange = (e) => {
    setTimeframe(e.target.value);
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange({
      ...dateRange,
      [name]: value
    });
  };

  // Prepare data for fraud types pie chart
  const prepareFraudTypesData = () => {
    if (!statistics || !statistics.prediction_counts) return [];

    return Object.entries(statistics.prediction_counts).map(([key, value]) => ({
      name: key.replace('🚨 ', '').replace('⚠️ ', '').replace('🕵️ ', '').replace('✅ ', ''),
      value: value
    }));
  };

  // Prepare data for country fraud bar chart
  const prepareCountryFraudData = () => {
    if (!locationStats || !locationStats.country_statistics) return [];

    return locationStats.country_statistics.map(item => ({
      ...item,
      fraud_percentage: item.total > 0 ? Math.round((item.fraud / item.total) * 100) : 0
    }))
   .sort((a, b) => b.fraud_percentage - a.fraud_percentage)
   .slice(0, 7);  // Top 7 countries
  };

  // Prepare data for VPN/Proxy comparison
  const prepareVpnProxyData = () => {
    if (!locationStats || !locationStats.vpn_proxy_statistics) return [];

    return locationStats.vpn_proxy_statistics.map(item => ({
     using_vpn_proxy: item.vpn_proxy,
     total_transactions: item.total,
      fraud_percentage: item.total > 0 ? Math.round((item.fraud / item.total) * 100) : 0
    }));
  };

  // Prepare data for transaction trends
  const prepareTrendData = () => {
    if (!statistics || !statistics.recent_trends) return [];

    return statistics.recent_trends
      .map(day => ({
        date: day.date,
        total: day.count,
        fraudulent: day.fraud_count,
        rate: day.count > 0 ? Math.round((day.fraud_count / day.count) * 100) : 0
      }))
      .reverse(); // Chronological order
  };

  if (loading && !statistics && !locationStats) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg text-blue-500">Loading statistics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Fraud Detection Statistics</h1>
      <p className="text-gray-600 mb-6">Analyze fraud patterns, trends, and detection performance across your transactions.</p>
      
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="text-gray-700">Timeframe:</label>
        <select 
          value={timeframe} 
          onChange={handleTimeframeChange} 
          className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="custom">Custom Range</option>
        </select>
        
        {timeframe === 'custom' && (
          <>
            <label className="text-gray-700">From:</label>
            <input 
              type="date" 
              name="start" 
              value={dateRange.start} 
              onChange={handleDateChange} 
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            
            <label className="text-gray-700">To:</label>
            <input 
              type="date" 
              name="end" 
              value={dateRange.end} 
              onChange={handleDateChange} 
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
          </>
        )}
        
        <button 
          onClick={handleRefresh} 
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
        >
          Refresh Data
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-500 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}
      
      {/* Statistical Overview */}
      {statistics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm text-center">
            <h3 className="text-gray-600 font-medium mb-2">Total Transactions</h3>
            <p className="text-4xl font-semibold text-blue-500">
              {statistics.total_transactions || 0}
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm text-center">
            <h3 className="text-gray-600 font-medium mb-2">Fraud Rate</h3>
            <p className="text-4xl font-semibold text-blue-500">
              {statistics.prediction_counts && statistics.prediction_counts['🚨 CONFIRMED_FRAUD'] && statistics.total_transactions ? 
                ((statistics.prediction_counts['🚨 CONFIRMED_FRAUD'] / statistics.total_transactions) * 100).toFixed(2) + '%' : 
                '0%'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm text-center">
            <h3 className="text-gray-600 font-medium mb-2">High Risk Transactions</h3>
            <p className="text-4xl font-semibold text-blue-500">
              {statistics.prediction_counts && statistics.prediction_counts['⚠️ HIGH_RISK'] ? 
                statistics.prediction_counts['⚠️ HIGH_RISK'] : 
                '0'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm text-center">
            <h3 className="text-gray-600 font-medium mb-2">Average Risk Score</h3>
            <p className="text-4xl font-semibold text-blue-500">
              {statistics.average_probability !== undefined ? 
                (statistics.average_probability * 100).toFixed(2) + '%' : 
                '0%'}
            </p>
          </div>
        </div>
      )}
      
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Transaction Types Pie Chart */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Transaction Risk Distribution</h2>
          </div>
          <div className="h-[300px] mb-4">
            {statistics && statistics.prediction_counts && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={prepareFraudTypesData()}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({name, percent}) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {prepareFraudTypesData().map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={FRAUD_COLORS[entry.name.replace(' ', '_')] || COLORS[index % COLORS.length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value, 'Transactions']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        
        {/* Countries Bar Chart */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Fraud Rates by Country</h2>
          </div>
          <div className="h-[300px] mb-4">
            {locationStats && locationStats.country_statistics && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={prepareCountryFraudData()}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="country" />
                  <YAxis label={{ value: 'Fraud %', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Fraud Rate']} />
                  <Legend />
                  <Bar dataKey="fraud_percentage" name="Fraud Rate %" fill="#e74c3c" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        
        {/* VPN/Proxy Impact */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">VPN/Proxy Impact on Fraud</h2>
          </div>
          <div className="h-[300px] mb-4">
            {locationStats && locationStats.vpn_proxy_statistics && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={prepareVpnProxyData()}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="using_vpn_proxy" />
                  <YAxis yAxisId="left" orientation="left" label={{ value: 'Transactions', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'Fraud %', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="total_transactions" name="Total Transactions" fill="#3498db" />
                  <Bar yAxisId="right" dataKey="fraud_percentage" name="Fraud Rate %" fill="#e74c3c" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        
        {/* Transaction Trends */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Fraud Trends</h2>
          </div>
          <div className="h-[300px] mb-4">
            {statistics && statistics.recent_trends && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={prepareTrendData()}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" orientation="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="total" name="Total Transactions" stroke="#3498db" activeDot={{ r: 8 }} />
                  <Line yAxisId="left" type="monotone" dataKey="fraudulent" name="Fraudulent Transactions" stroke="#e74c3c" />
                  <Line yAxisId="right" type="monotone" dataKey="rate" name="Fraud Rate %" stroke="#f39c12" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
      
      {/* Transaction Type Analysis - FIXED VERSION */}
      <div className="bg-white rounded-lg p-6 shadow-sm mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Transaction Type Analysis</h2>
        </div>
        <div className="h-[350px] mb-4"> {/* Increased height from 300px to 350px */}
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={[
                { name: 'PAYMENT', legitimate: 85, high_risk: 10, fraud: 5 },
                { name: 'TRANSFER', legitimate: 70, high_risk: 20, fraud: 10 },
                { name: 'CASH_OUT', legitimate: 60, high_risk: 25, fraud: 15 },
                { name: 'CASH_IN', legitimate: 90, high_risk: 7, fraud: 3 },
                { name: 'DEBIT', legitimate: 80, high_risk: 12, fraud: 8 }
              ]}
              margin={{
                top: 20,
                right: 30,
                left: 80,  // Keep this for Y axis labels
                bottom: 40  // Increased from 5 to 40 for X axis labels and title
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                type="number" 
                label={{ 
                  value: 'Percentage', 
                  position: 'insideBottomRight', 
                  offset: -10,
                  dy: 15 // Move label down
                }}
                domain={[0, 100]}
                tickCount={6} // Control number of ticks (0, 20, 40, 60, 80, 100)
              />
              <YAxis 
                dataKey="name" 
                type="category"
                tick={{ fontSize: 12 }} // Adjust font size if needed
              />
              <Tooltip formatter={(value) => [`${value}%`, '']} />
              <Legend 
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Bar dataKey="legitimate" name="Legitimate" stackId="a" fill="#2ecc71" />
              <Bar dataKey="high_risk" name="High Risk" stackId="a" fill="#f39c12" />
              <Bar dataKey="fraud" name="Fraud" stackId="a" fill="#e74c3c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-gray-500 italic">Note: Transaction type analysis uses sample data until the backend supports transaction type statistics.</p>
      </div>
    </div>
  );
}

export default Statistics;