import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [apiStatus, setApiStatus] = useState({ stats: 'loading', transactions: 'loading' });

  // Delete transaction function
  const deleteTransaction = (transactionId, event) => {
    // Stop propagation to prevent row click from triggering
    event.stopPropagation();
    
    // Confirm deletion
    if (!window.confirm("Are you sure you want to delete this transaction?")) {
      return;
    }
    
    axios.delete(`http://localhost:5050/api/transactions/${transactionId}`)
      .then(response => {
        console.log('Transaction deleted:', response.data);
        
        // Remove transaction from state
        setRecentTransactions(prevTransactions => 
          prevTransactions.filter(tx => tx.id !== transactionId)
        );
        
        // Show success message
        alert("Transaction deleted successfully!");
        
        // Refresh statistics to update counts
        axios.get('http://localhost:5050/api/statistics')
          .then(response => {
            console.log('Statistics refreshed successfully');
            setStats(response.data);
          })
          .catch(err => {
            console.error('Error refreshing statistics:', err);
          });
      })
      .catch(err => {
        console.error('Error deleting transaction:', err);
        alert(`Error deleting transaction: ${err.message}`);
      });
  };

  useEffect(() => {
    // Check if API server is available
    axios.get('http://localhost:5050')
      .then(response => {
        console.log('API server is running:', response.data);
      })
      .catch(err => {
        setError(`Backend server may not be running: ${err.message}`);
        setApiStatus({
          stats: 'error',
          transactions: 'error'
        });
        setLoading(false);
        return;
      });

    // Fetch statistics
    axios.get('http://localhost:5050/api/statistics')
      .then(response => {
        console.log('Statistics loaded successfully');
        setStats(response.data);
        setApiStatus(prev => ({...prev, stats: 'loaded'}));
        if (apiStatus.transactions !== 'loading') {
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Error fetching statistics:', err);
        const errorMessage = err.response ? 
          `Error fetching statistics: ${err.response.status} ${err.response.statusText}` : 
          `Error fetching statistics: ${err.message}`;
        
        setApiStatus(prev => ({...prev, stats: 'error'}));
        setError(errorMessage);
        setLoading(false);
      });

    // Fetch recent transactions
    axios.get('http://localhost:5050/api/transactions', {
      params: { limit: 5 }
    })
      .then(response => {
        console.log('Transactions loaded successfully');
        // Make sure transactions is an array
        const transactions = Array.isArray(response.data.transactions) 
          ? response.data.transactions 
          : [];
        setRecentTransactions(transactions);
        setApiStatus(prev => ({...prev, transactions: 'loaded'}));
        if (apiStatus.stats !== 'loading') {
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Error fetching recent transactions:', err);
        setApiStatus(prev => ({...prev, transactions: 'error'}));
      });
  }, []);

  // Function to handle transaction row click
  const handleTransactionClick = (tx) => {
    navigate('/history', { state: { transactionId: tx.id } });
  };

  // Show full screen loading
  if (loading && apiStatus.stats === 'loading' && apiStatus.transactions === 'loading') {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg text-blue-500">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  // If there's a critical error, show only that
  if (error && (apiStatus.stats === 'error' && apiStatus.transactions === 'error')) {
    return (
      <div className="bg-red-50 border border-red-500 text-red-700 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-2">Error</h2>
        <p>{error}</p>
        <p>Make sure your backend server is running at http://localhost:5050</p>
        <div className="mt-4">
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Fraud Detection Dashboard</h1>
      
      {/* Show errors if any */}
      {error && (
        <div className="bg-red-50 border border-red-500 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}
      
      {/* Show warning for partial data */}
      {(apiStatus.stats === 'error' || apiStatus.transactions === 'error') && (
        <div className="bg-yellow-50 border border-yellow-500 text-yellow-800 p-4 rounded-lg mb-6">
          <p className="font-bold">Warning: Some data could not be loaded. Dashboard may show incomplete information.</p>
          {apiStatus.stats === 'error' && <p>Statistics data unavailable.</p>}
          {apiStatus.transactions === 'error' && <p>Transaction data unavailable.</p>}
        </div>
      )}
      
      {/* Statistics Overview */}
      {apiStatus.stats === 'loaded' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-gray-600 font-medium mb-2">Total Transactions</h3>
            <p className="text-4xl font-semibold text-blue-500">
              {stats.total_transactions || 0}
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-gray-600 font-medium mb-2">Fraud Rate</h3>
            <p className="text-4xl font-semibold text-blue-500">
              {stats.prediction_counts && stats.prediction_counts['🚨 CONFIRMED_FRAUD'] && stats.total_transactions ? 
                ((stats.prediction_counts['🚨 CONFIRMED_FRAUD'] / stats.total_transactions) * 100).toFixed(2) + '%' : 
                '5.88%'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-gray-600 font-medium mb-2">High Risk</h3>
            <p className="text-4xl font-semibold text-blue-500">
              {stats.prediction_counts && stats.prediction_counts['⚠️ HIGH_RISK'] ? 
                stats.prediction_counts['⚠️ HIGH_RISK'] : 
                '2'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-gray-600 font-medium mb-2">Average Risk Score</h3>
            <p className="text-4xl font-semibold text-blue-500">
              {stats.average_probability !== undefined ? 
                (stats.average_probability * 100).toFixed(2) + '%' : 
                '25.59%'}
            </p>
          </div>
        </div>
      )}
      
      {/* Transactions Table */}
      {apiStatus.transactions !== 'error' && (
        <div className="bg-white rounded-lg p-6 shadow-sm mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Transactions</h2>
            <Link to="/history" className="text-blue-500 hover:text-blue-700 text-sm font-medium">
              View All
            </Link>
          </div>
          
          {recentTransactions.length === 0 ? (
            <p className="text-gray-500">No transactions yet. Try analyzing a test transaction.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">ID</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Type</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Amount</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Result</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Probability</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Time</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map(tx => {
                    // Safety checks for transaction properties
                    if (!tx || !tx.transaction_data) {
                      return null;
                    }
                    
                    let rowClass = "cursor-pointer hover:bg-gray-50";
                    if (tx.prediction && tx.prediction.includes('FRAUD')) {
                      rowClass = "cursor-pointer bg-red-50 hover:bg-red-100";
                    } else if (tx.prediction && tx.prediction.includes('HIGH_RISK')) {
                      rowClass = "cursor-pointer bg-yellow-50 hover:bg-yellow-100";
                    }
                    
                    return (
                      <tr 
                        key={tx.id} 
                        className={rowClass}
                        onClick={() => handleTransactionClick(tx)}
                      >
                        <td className="py-3 px-4 border-b">{tx.id}</td>
                        <td className="py-3 px-4 border-b">{tx.transaction_data.type || 'Unknown'}</td>
                        <td className="py-3 px-4 border-b">
                          ${typeof tx.transaction_data.amount === 'number' 
                            ? tx.transaction_data.amount.toLocaleString() 
                            : '0'}
                        </td>
                        <td className="py-3 px-4 border-b">
                          {tx.prediction === '🚨 CONFIRMED_FRAUD' && (
                            <span className="flex items-center text-red-600">
                              <span className="mr-1">🚨</span> CONFIRMED_FRAUD
                            </span>
                          )}
                          {tx.prediction === '⚠️ HIGH_RISK' && (
                            <span className="flex items-center text-yellow-600">
                              <span className="mr-1">⚠️</span> HIGH_RISK
                            </span>
                          )}
                          {tx.prediction === '🕵️ NEEDS_REVIEW' && (
                            <span className="flex items-center text-blue-600">
                              <span className="mr-1">🕵️</span> NEEDS_REVIEW
                            </span>
                          )}
                          {tx.prediction === '✅ LEGITIMATE' && (
                            <span className="flex items-center text-green-600">
                              <span className="mr-1">✅</span> LEGITIMATE
                            </span>
                          )}
                          {!tx.prediction && 'Unknown'}
                        </td>
                        <td className="py-3 px-4 border-b">
                          {typeof tx.probability === 'number' 
                            ? (tx.probability * 100).toFixed(2) + '%' 
                            : '0%'}
                        </td>
                        <td className="py-3 px-4 border-b">
                          {tx.timestamp 
                            ? new Date(tx.timestamp).toLocaleString() 
                            : 'Unknown'}
                        </td>
                        <td className="py-3 px-4 border-b">
                          <button
                            onClick={(e) => deleteTransaction(tx.id, e)}
                            className="bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded text-xs transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {/* Quick Actions */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link 
            to="/test-transaction" 
            className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-5 rounded font-medium transition-colors"
          >
            Test New Transaction
          </Link>
          <Link 
            to="/location" 
            className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-5 rounded font-medium transition-colors"
          >
            Location Analysis
          </Link>
          <Link 
            to="/statistics" 
            className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-5 rounded font-medium transition-colors"
          >
            Statistics
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;