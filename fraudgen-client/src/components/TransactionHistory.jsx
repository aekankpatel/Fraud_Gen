import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [filters, setFilters] = useState({
    prediction: '',
    country: '',
    limit: 20,
    offset: 0
  });

  const location = useLocation();
  const navigate = useNavigate();
  
  // Available countries with codes
  const countries = [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'JP', name: 'Japan' },
    { code: 'CN', name: 'China' },
    { code: 'AU', name: 'Australia' },
    { code: 'IN', name: 'India' },
    { code: 'BR', name: 'Brazil' }
  ];
  
  // Get country name from code
  const getCountryName = (code) => {
    const country = countries.find(c => c.code === code);
    return country ? country.name : code;
  };

  // Check if a transaction ID was passed via location state
  useEffect(() => {
    if (location.state && location.state.transactionId) {
      // If a transaction ID is provided, fetch and select that transaction
      fetchTransactionDetails(location.state.transactionId);
    } else {
      // Otherwise, load all transactions
      fetchTransactions();
    }
  }, [location.state]);

  // Fetch all transactions with pagination and filters
  const fetchTransactions = () => {
    setLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    queryParams.append('limit', filters.limit);
    queryParams.append('offset', filters.offset);
    
    if (filters.prediction) {
      queryParams.append('prediction', filters.prediction);
    }
    
    // Important: Send only the country code to the backend
    if (filters.country) {
      queryParams.append('country', filters.country);
    }

    console.log('Fetching transactions with params:', queryParams.toString());

    axios.get(`http://localhost:5050/api/transactions?${queryParams.toString()}`)
      .then(response => {
        console.log('API Response:', response.data);
        setTransactions(response.data.transactions || []);
        setTotalTransactions(response.data.total || 0);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching transactions:', err);
        setError(`Error fetching transactions: ${err.message}`);
        setLoading(false);
      });
  };

  // Fetch a specific transaction by ID
  const fetchTransactionDetails = (transactionId) => {
    setLoading(true);
    setError(null);

    axios.get(`http://localhost:5050/api/transactions?limit=1000`)
      .then(response => {
        const transactions = response.data.transactions || [];
        const transaction = transactions.find(tx => tx.id === parseInt(transactionId));
        
        if (transaction) {
          setSelectedTransaction(transaction);
          setTransactions(transactions);
          setTotalTransactions(response.data.total || 0);
        } else {
          setError(`Transaction with ID ${transactionId} not found.`);
        }
        
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching transaction details:', err);
        setError(`Error fetching transaction details: ${err.message}`);
        setLoading(false);
      });
  };
  
  // Delete transaction function
  const deleteTransaction = (transactionId, event) => {
    // Stop propagation to prevent row click from triggering
    event.stopPropagation();
    
    // Confirm deletion
    if (!window.confirm("Are you sure you want to delete this transaction?")) {
      return;
    }
    
    setLoading(true);
    
    axios.delete(`http://localhost:5050/api/transactions/${transactionId}`)
      .then(response => {
        console.log('Transaction deleted:', response.data);
        
        // Remove transaction from state
        setTransactions(prevTransactions => 
          prevTransactions.filter(tx => tx.id !== transactionId)
        );
        
        // If the deleted transaction was the selected one, clear selection
        if (selectedTransaction && selectedTransaction.id === transactionId) {
          setSelectedTransaction(null);
        }
        
        // Show success message
        alert("Transaction deleted successfully!");
        
        // Update total count
        setTotalTransactions(prev => prev - 1);
        
        setLoading(false);
      })
      .catch(err => {
        console.error('Error deleting transaction:', err);
        setError(`Error deleting transaction: ${err.message}`);
        setLoading(false);
      });
  };

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value,
      offset: 0 // Reset to first page when filters change
    });
  };

  // Apply filters when button is clicked
  const applyFilters = () => {
    fetchTransactions();
  };

  // Handle pagination
  const handlePrevPage = () => {
    if (filters.offset - filters.limit >= 0) {
      setFilters({
        ...filters,
        offset: filters.offset - filters.limit
      });
    }
  };

  const handleNextPage = () => {
    if (filters.offset + filters.limit < totalTransactions) {
      setFilters({
        ...filters,
        offset: filters.offset + filters.limit
      });
    }
  };

  // Update transactions when filters change
  useEffect(() => {
    fetchTransactions();
  }, [filters.offset, filters.limit]);

  // Handle row click to show transaction details
  const handleRowClick = (transaction) => {
    setSelectedTransaction(transaction);
    // Update URL without reloading
    navigate(`/history?id=${transaction.id}`, { replace: true });
    // Scroll to the top of the page
    window.scrollTo(0, 0);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4">
      <h1 className="text-2xl font-bold mb-6">Transaction History</h1>
      
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select 
          name="prediction" 
          value={filters.prediction} 
          onChange={handleFilterChange}
          className="px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Predictions</option>
          <option value="FRAUD">Fraud</option>
          <option value="HIGH_RISK">High Risk</option>
          <option value="NEEDS_REVIEW">Needs Review</option>
          <option value="LEGITIMATE">Legitimate</option>
        </select>
        
        <select 
          name="country" 
          value={filters.country} 
          onChange={handleFilterChange}
          className="px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Countries</option>
          {countries.map(country => (
            <option key={country.code} value={country.code}>{country.name}</option>
          ))}
        </select>
        
        <select 
          name="limit" 
          value={filters.limit} 
          onChange={handleFilterChange}
          className="px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="10">10 per page</option>
          <option value="20">20 per page</option>
          <option value="50">50 per page</option>
          <option value="100">100 per page</option>
        </select>
        
        <button 
          onClick={applyFilters} 
          className="px-4 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Apply Filters
        </button>
      </div>
      
      {/* Transaction Details */}
      {selectedTransaction && (
        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">Transaction Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-3">Basic Information</h3>
              <p className="mb-2"><span className="font-semibold">ID:</span> {selectedTransaction.id}</p>
              <p className="mb-2"><span className="font-semibold">Type:</span> {selectedTransaction.transaction_data?.type || 'Unknown'}</p>
              <p className="mb-2"><span className="font-semibold">Amount:</span> ${selectedTransaction.transaction_data?.amount?.toLocaleString() || '0'}</p>
              <p className="mb-2"><span className="font-semibold">Time:</span> {formatDate(selectedTransaction.timestamp)}</p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-3">Fraud Detection Result</h3>
              <p className="mb-2"><span className="font-semibold">Decision:</span> {selectedTransaction.prediction || 'Unknown'}</p>
              <p className="mb-2"><span className="font-semibold">Probability:</span> {(selectedTransaction.probability * 100).toFixed(2)}%</p>
              <p className="mb-2"><span className="font-semibold">Action:</span> {selectedTransaction.action?.replace('_', ' ').toUpperCase() || 'Unknown'}</p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-3">Account Information</h3>
              <p className="mb-2"><span className="font-semibold">Origin Initial Balance:</span> ${selectedTransaction.transaction_data?.oldbalanceOrg?.toLocaleString() || '0'}</p>
              <p className="mb-2"><span className="font-semibold">Origin New Balance:</span> ${selectedTransaction.transaction_data?.newbalanceOrig?.toLocaleString() || '0'}</p>
              <p className="mb-2"><span className="font-semibold">Destination Initial Balance:</span> ${selectedTransaction.transaction_data?.oldbalanceDest?.toLocaleString() || '0'}</p>
              <p className="mb-2"><span className="font-semibold">Destination New Balance:</span> ${selectedTransaction.transaction_data?.newbalanceDest?.toLocaleString() || '0'}</p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-3">Location Information</h3>
              <p className="mb-2"><span className="font-semibold">Sender:</span> {selectedTransaction.location_data?.city || 'Unknown'}, {selectedTransaction.location_data?.region || 'Unknown'}, {selectedTransaction.location_data?.country || 'Unknown'}</p>
              <p className="mb-2"><span className="font-semibold">Receiver Country:</span> {getCountryName(selectedTransaction.transaction_data?.receiver_country) || 'Unknown'}</p>
              <p className="mb-2"><span className="font-semibold">Using VPN/Proxy:</span> {
                (selectedTransaction.location_data?.is_vpn || selectedTransaction.location_data?.is_proxy) ? 
                <span className="text-red-600 font-bold">Yes</span> : 'No'
              }</p>
              <p className="mb-2"><span className="font-semibold">IP Address:</span> {selectedTransaction.ip_address || 'Unknown'}</p>
            </div>
          </div>
          
          <div className="mb-5">
            <h3 className="font-medium mb-3">Explanation</h3>
            <pre className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap font-mono text-sm">{selectedTransaction.explanation || 'No explanation available.'}</pre>
          </div>
          
          <div className="flex space-x-4">
            <button 
              className="px-4 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => setSelectedTransaction(null)}
            >
              Return to Transaction List
            </button>
            
            <button 
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              onClick={(e) => deleteTransaction(selectedTransaction.id, e)}
            >
              Delete Transaction
            </button>
          </div>
        </div>
      )}
      
      {/* Transactions Table */}
      <div className="bg-white rounded-lg p-6 shadow-sm mb-8">
        <h2 className="text-xl font-semibold mb-4">All Transactions</h2>
        
        {loading && <p className="text-blue-500">Loading transactions...</p>}
        
        {error && (
          <div className="bg-red-50 border border-red-500 text-red-700 p-4 rounded-lg mb-5">
            {error}
          </div>
        )}
        
        {!loading && !error && transactions.length === 0 && (
          <p className="text-gray-500">No transactions found. Try adjusting your filters.</p>
        )}
        
        {!loading && !error && transactions.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">ID</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Type</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Amount</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Location</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Result</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Probability</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Time</th>
                    <th className="py-3 px-4 text-left bg-gray-50 font-semibold text-gray-700 border-b">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr 
                      key={tx.id} 
                      className={`cursor-pointer hover:bg-gray-50 transition-colors
                        ${tx.prediction && tx.prediction.includes('FRAUD') ? 'bg-red-50 hover:bg-red-100' : ''} 
                        ${tx.prediction && tx.prediction.includes('HIGH_RISK') ? 'bg-yellow-50 hover:bg-yellow-100' : ''}
                      `}
                      onClick={() => handleRowClick(tx)}
                    >
                      <td className="py-3 px-4 border-b">{tx.id}</td>
                      <td className="py-3 px-4 border-b">{tx.transaction_data?.type || 'Unknown'}</td>
                      <td className="py-3 px-4 border-b">
                        ${tx.transaction_data && tx.transaction_data.amount ? 
                          Number(tx.transaction_data.amount).toLocaleString() : '0'}
                      </td>
                      <td className="py-3 px-4 border-b">
                        {tx.location_data ? 
                          `${tx.location_data.city || 'Unknown'}, ${tx.location_data.country || 'Unknown'}` : 
                          'Unknown'}
                      </td>
                      <td className="py-3 px-4 border-b">
                        {tx.prediction && tx.prediction.includes('FRAUD') && (
                          <span className="flex items-center text-red-600">
                            <span className="mr-1">🚨</span> FRAUD
                          </span>
                        )}
                        {tx.prediction && tx.prediction.includes('HIGH_RISK') && (
                          <span className="flex items-center text-yellow-600">
                            <span className="mr-1">⚠️</span> HIGH_RISK
                          </span>
                        )}
                        {tx.prediction && tx.prediction.includes('NEEDS_REVIEW') && (
                          <span className="flex items-center text-blue-600">
                            <span className="mr-1">🕵️</span> NEEDS_REVIEW
                          </span>
                        )}
                        {tx.prediction && tx.prediction.includes('LEGITIMATE') && (
                          <span className="flex items-center text-green-600">
                            <span className="mr-1">✅</span> LEGITIMATE
                          </span>
                        )}
                        {!tx.prediction && 'Unknown'}
                      </td>
                      <td className="py-3 px-4 border-b">
                        {typeof tx.probability === 'number' ? 
                          (tx.probability * 100).toFixed(2) + '%' : '0%'}
                      </td>
                      <td className="py-3 px-4 border-b">{formatDate(tx.timestamp)}</td>
                      <td className="py-3 px-4 border-b">
                        <button
                          onClick={(e) => deleteTransaction(tx.id, e)}
                          className="bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded text-xs transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            <div className="flex justify-between items-center mt-5">
              <div>
                Showing {Math.min(filters.offset + 1, totalTransactions)} to {Math.min(filters.offset + transactions.length, totalTransactions)} of {totalTransactions} transactions
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handlePrevPage} 
                  disabled={filters.offset === 0}
                  className={`px-3 py-2 rounded-md ${
                    filters.offset === 0 
                      ? 'bg-gray-300 cursor-not-allowed' 
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  Previous
                </button>
                <button 
                  onClick={handleNextPage} 
                  disabled={filters.offset + filters.limit >= totalTransactions}
                  className={`px-3 py-2 rounded-md ${
                    filters.offset + filters.limit >= totalTransactions 
                      ? 'bg-gray-300 cursor-not-allowed' 
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TransactionHistory;