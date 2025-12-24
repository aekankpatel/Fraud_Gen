import React, { useState, useEffect } from 'react';
import axios from 'axios';

function TransactionForm() {
  const [formData, setFormData] = useState({
    step: 3, // Fixed time step value
    type: "PAYMENT",
    amount: 1000,
    oldbalanceOrg: 10000,
    newbalanceOrig: 9000,
    oldbalanceDest: 5000,
    newbalanceDest: 6000,
    receiver_country: "US"
  });
  
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const loadSampleTransaction = () => {
    setLoading(true);
    axios.get('http://localhost:5050/api/test-transaction')
      .then(response => {
        // Always use step value 3
        const sampleWithTimeStep = {
          ...response.data,
          step: 3
        };
        setFormData(sampleWithTimeStep);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    
    // Ensure step is always 3
    const submissionData = {
      ...formData,
      step: 3
    };
    
    axios.post('http://localhost:5050/api/predict', submissionData)
      .then(response => {
        setResult(response.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.error || err.message);
        setLoading(false);
      });
  };
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    const numericFields = ['amount', 'oldbalanceOrg', 'newbalanceOrig', 'oldbalanceDest', 'newbalanceDest'];
    const newValue = numericFields.includes(name) ? parseFloat(value) : value;
    
    setFormData({
      ...formData,
      [name]: newValue,
    });
  };
  
  useEffect(() => {
    if (formData.type === "PAYMENT" || formData.type === "TRANSFER" || formData.type === "CASH_OUT") {
      setFormData(prev => ({
        ...prev,
        newbalanceOrig: Math.max(0, prev.oldbalanceOrg - prev.amount)
      }));
    } else if (formData.type === "CASH_IN") {
      setFormData(prev => ({
        ...prev,
        newbalanceOrig: prev.oldbalanceOrg + prev.amount
      }));
    }
  }, [formData.amount, formData.oldbalanceOrg, formData.type]);
  
  useEffect(() => {
    if (formData.type === "PAYMENT" || formData.type === "TRANSFER" || formData.type === "CASH_IN") {
      setFormData(prev => ({
        ...prev,
        newbalanceDest: prev.oldbalanceDest + prev.amount
      }));
    } else if (formData.type === "CASH_OUT") {
      setFormData(prev => ({
        ...prev,
        newbalanceDest: Math.max(0, prev.oldbalanceDest - prev.amount)
      }));
    }
  }, [formData.amount, formData.oldbalanceDest, formData.type]);
  
  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Test Fraud Detection</h1>
      <p className="text-gray-600 mb-6">Fill out the form below to test the fraud detection system with a transaction.</p>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-5">
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <button 
            type="button" 
            onClick={loadSampleTransaction} 
            className="px-4 py-2.5 bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors mb-5"
          >
            Load Sample Transaction
          </button>
          
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="mb-4">
              <label htmlFor="type" className="block mb-1.5 font-medium">Transaction Type</label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                required
                className="w-full p-2.5 border border-gray-300 rounded h-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="PAYMENT">Payment</option>
                <option value="TRANSFER">Transfer</option>
                <option value="CASH_OUT">Cash Out</option>
                <option value="CASH_IN">Cash In</option>
                <option value="DEBIT">Debit</option>
              </select>
            </div>
            
            <div className="mb-4">
              <label htmlFor="amount" className="block mb-1.5 font-medium">Amount</label>
              <input
                type="number"
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
                className="w-full p-2.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="oldbalanceOrg" className="block mb-1.5 font-medium">Origin Account Initial Balance</label>
              <input
                type="number"
                id="oldbalanceOrg"
                name="oldbalanceOrg"
                value={formData.oldbalanceOrg}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
                className="w-full p-2.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="newbalanceOrig" className="block mb-1.5 font-medium">Origin Account New Balance</label>
              <input
                type="number"
                id="newbalanceOrig"
                name="newbalanceOrig"
                value={formData.newbalanceOrig}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
                className="w-full p-2.5 border border-gray-300 rounded bg-gray-100 text-base"
                readOnly
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="oldbalanceDest" className="block mb-1.5 font-medium">Destination Account Initial Balance</label>
              <input
                type="number"
                id="oldbalanceDest"
                name="oldbalanceDest"
                value={formData.oldbalanceDest}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
                className="w-full p-2.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="newbalanceDest" className="block mb-1.5 font-medium">Destination Account New Balance</label>
              <input
                type="number"
                id="newbalanceDest"
                name="newbalanceDest"
                value={formData.newbalanceDest}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
                className="w-full p-2.5 border border-gray-300 rounded bg-gray-100 text-base"
                readOnly
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="receiver_country" className="block mb-1.5 font-medium">Receiver Country</label>
              <select
                id="receiver_country"
                name="receiver_country"
                value={formData.receiver_country}
                onChange={handleChange}
                required
                className="w-full p-2.5 border border-gray-300 rounded h-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="FR">France</option>
                <option value="DE">Germany</option>
                <option value="JP">Japan</option>
                <option value="CN">China</option>
                <option value="AU">Australia</option>
                <option value="IN">India</option>
                <option value="BR">Brazil</option>
                <option value="MX">Mexico</option>
                <option value="RU">Russia</option>
              </select>
            </div>
            
            {/* Time Step field is hidden from the UI but still in the formData with fixed value 3 */}
            
            <div className="mt-4 mb-4 p-3 bg-blue-50 rounded text-sm">
              <p><strong>Note:</strong> Your current location is detected as Jersey City, New Jersey, US. Cross-country transactions may have different risk profiles.</p>
            </div>
            
            <button 
              type="submit" 
              className="py-3 px-5 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 transition-colors mt-4 disabled:opacity-70 disabled:cursor-not-allowed text-base"
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Check for Fraud'}
            </button>
          </form>
        </div>
        
        <div className="bg-white rounded-lg p-6 shadow-sm">
          {loading && (
            <div className="flex justify-center items-center py-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-lg text-blue-500">Processing transaction...</p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-500 text-red-700 p-4 rounded mb-4">
              Error: {error}
            </div>
          )}
          
          {result && (
            <div>
              <h2 className="text-xl font-semibold mb-5">Detection Result</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <h3 className="font-medium mb-2">Decision</h3>
                  <p>{result.decision}</p>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Fraud Probability</h3>
                  <div className="h-6 bg-gray-200 rounded-full relative overflow-hidden mt-2">
                    <div 
                      className={`h-full rounded-full ${
                        result.probability > 0.7 ? 'bg-red-500' : 
                        result.probability > 0.2 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${result.probability * 100}%` }}
                    ></div>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
                      {(result.probability * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Recommended Action</h3>
                  <p>{result.action.replace('_', ' ').toUpperCase()}</p>
                </div>
              </div>
              
              {result.location && (
                <div className="mb-6">
                  <h3 className="font-medium mb-2">Location Information</h3>
                  <div className="flex flex-col sm:flex-row justify-between gap-3">
                    <div>
                      <p><strong>Sender:</strong> {result.location.city}, {result.location.region}, {result.location.country}</p>
                    </div>
                    <div>
                      <p><strong>Receiver:</strong> {formData.receiver_country}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div>
                <h3 className="font-medium mb-2">Explanation</h3>
                <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap font-mono text-sm">{result.explanation}</pre>
              </div>
            </div>
          )}
          
          {!loading && !error && !result && (
            <div className="flex items-center justify-center h-64">
              <p className="text-gray-500">Submit a transaction to see fraud detection results.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TransactionForm;