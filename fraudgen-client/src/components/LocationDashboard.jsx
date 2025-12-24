import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationMap from './LocationMap';

function LocationDashboard() {
  const navigate = useNavigate();
  const [countryStats, setCountryStats] = useState([]);
  const [vpnProxyStats, setVpnProxyStats] = useState([]);
  const [locationTransactions, setLocationTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState('all');

  useEffect(() => {
    const fetchLocationData = async () => {
      setLoading(true);
      try {
        // Fetch location statistics
        const statsResponse = await fetch('http://localhost:5050/api/statistics/locations');
        if (!statsResponse.ok) {
          throw new Error(`Statistics API returned ${statsResponse.status}`);
        }
        const statsData = await statsResponse.json();
        setCountryStats(statsData.country_statistics || []);
        setVpnProxyStats(statsData.vpn_proxy_statistics || []);
        
        // Fetch transactions with location data
        const txQuery = selectedCountry !== 'all' ? `?country=${selectedCountry}&limit=10` : '?limit=10';
        const txResponse = await fetch(`http://localhost:5050/api/transactions${txQuery}`);
        if (!txResponse.ok) {
          throw new Error(`Transactions API returned ${txResponse.status}`);
        }
        const txData = await txResponse.json();
        
        // Set default values for missing data
        const processedTransactions = (txData.transactions || []).map(tx => ({
          ...tx,
          transaction_data: tx.transaction_data || {
            type: 'Unknown',
            amount: 0
          },
          location_data: tx.location_data || {
            country: 'Unknown',
            city: 'Unknown',
            region: 'Unknown',
            latitude: 0,
            longitude: 0,
            is_vpn: false,
            is_proxy: false
          }
        }));
        
        setLocationTransactions(processedTransactions);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching location data:", err);
        setError(err.message);
        setLoading(false);
      }
    };
    
    fetchLocationData();
    
    // Poll for updates every 30 seconds
    const intervalId = setInterval(fetchLocationData, 30000);
    return () => clearInterval(intervalId);
  }, [selectedCountry]);

  const handleCountryChange = (e) => {
    setSelectedCountry(e.target.value);
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      // Fetch location statistics
      const statsResponse = await fetch('http://localhost:5050/api/statistics/locations');
      if (!statsResponse.ok) {
        throw new Error(`Statistics API returned ${statsResponse.status}`);
      }
      const statsData = await statsResponse.json();
      setCountryStats(statsData.country_statistics || []);
      setVpnProxyStats(statsData.vpn_proxy_statistics || []);
      
      // Fetch transactions with location data
      const txQuery = selectedCountry !== 'all' ? `?country=${selectedCountry}&limit=10` : '?limit=10';
      const txResponse = await fetch(`http://localhost:5050/api/transactions${txQuery}`);
      if (!txResponse.ok) {
        throw new Error(`Transactions API returned ${txResponse.status}`);
      }
      const txData = await txResponse.json();
      
      // Set default values for missing data
      const processedTransactions = (txData.transactions || []).map(tx => ({
        ...tx,
        transaction_data: tx.transaction_data || {
          type: 'Unknown',
          amount: 0
        },
        location_data: tx.location_data || {
          country: 'Unknown',
          city: 'Unknown',
          region: 'Unknown',
          latitude: 0,
          longitude: 0,
          is_vpn: false,
          is_proxy: false
        }
      }));
      
      setLocationTransactions(processedTransactions);
      setLoading(false);
    } catch (err) {
      console.error("Error refreshing data:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Function to handle transaction row click
  const handleTransactionClick = (tx) => {
    navigate('/history', { state: { transactionId: tx.id } });
  };

  if (loading && countryStats.length === 0) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg text-blue-500">Loading location data...</p>
        </div>
      </div>
    );
  }

  if (error && countryStats.length === 0) {
    return (
      <div className="bg-red-50 border border-red-500 text-red-700 p-4 rounded-lg mb-5">
        Error loading location data: {error}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Location-Based Fraud Analysis</h1>
      <p className="text-gray-600 mb-6">Monitor fraud patterns by geographic location and detect suspicious location-based activities.</p>
      
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select 
          value={selectedCountry} 
          onChange={handleCountryChange} 
          className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Countries</option>
          {countryStats.map(country => (
            <option key={country.country} value={country.country}>{country.country}</option>
          ))}
        </select>
        <button 
          onClick={handleRefresh}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 transition-colors duration-200"
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      
      {/* Map Visualization */}
      <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Transaction Locations</h2>
        </div>
        <div className="h-80 w-full">
          <LocationMap transactions={locationTransactions} />
        </div>
      </div>
      
      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Country Fraud Rates */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Fraud by Country</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Country</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Transactions</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Fraud Rate</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {countryStats.slice(0, 5).map(country => (
                  <tr key={country.country}>
                    <td className="px-4 py-3 border-b">{country.country}</td>
                    <td className="px-4 py-3 border-b">{country.total_transactions}</td>
                    <td className="px-4 py-3 border-b">{country.fraud_percentage}%</td>
                    <td className="px-4 py-3 border-b">
                      <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            country.fraud_percentage > 50 ? 'bg-red-500' : 
                            country.fraud_percentage > 25 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${country.fraud_percentage}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
                {countryStats.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-4 py-3 text-center border-b text-gray-500">
                      No country statistics available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* VPN/Proxy Stats */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">VPN/Proxy Impact</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">VPN/Proxy Used</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Transactions</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Fraud Rate</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {vpnProxyStats.map(stat => (
                  <tr key={stat.using_vpn_proxy}>
                    <td className="px-4 py-3 border-b">{stat.using_vpn_proxy}</td>
                    <td className="px-4 py-3 border-b">{stat.total_transactions}</td>
                    <td className="px-4 py-3 border-b">{stat.fraud_percentage}%</td>
                    <td className="px-4 py-3 border-b">
                      <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            stat.fraud_percentage > 50 ? 'bg-red-500' : 
                            stat.fraud_percentage > 25 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${stat.fraud_percentage}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
                {vpnProxyStats.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-4 py-3 text-center border-b text-gray-500">
                      No VPN/proxy statistics available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Recent Location-Based Transactions */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Recent Transactions by Location</h2>
        </div>
        
        {locationTransactions.length === 0 ? (
          <p className="text-gray-500">No transactions available for the selected location.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">ID</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Type</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Amount</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Location</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">VPN/Proxy</th>
                  <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 border-b">Result</th>
                </tr>
              </thead>
              <tbody>
                {locationTransactions.map(tx => (
                  <tr 
                    key={tx.id} 
                    className={`
                      cursor-pointer hover:bg-gray-50 transition-colors
                      ${tx.prediction && tx.prediction.includes('FRAUD') ? 'bg-red-50 hover:bg-red-100' : ''} 
                      ${tx.prediction && tx.prediction.includes('HIGH_RISK') ? 'bg-yellow-50 hover:bg-yellow-100' : ''}
                    `}
                    onClick={() => handleTransactionClick(tx)}
                  >
                    <td className="px-4 py-3 border-b">{tx.id}</td>
                    <td className="px-4 py-3 border-b">{tx.transaction_data?.type || 'Unknown'}</td>
                    <td className="px-4 py-3 border-b">
                      ${tx.transaction_data && tx.transaction_data.amount && 
                        typeof tx.transaction_data.amount === 'number' ? 
                        tx.transaction_data.amount.toLocaleString() : '0'}
                    </td>
                    <td className="px-4 py-3 border-b">
                      {tx.location_data ? (
                        `${tx.location_data.city || 'Unknown'}, ${tx.location_data.country || 'Unknown'}`
                      ) : (
                        'Location unavailable'
                      )}
                    </td>
                    <td className="px-4 py-3 border-b">
                      {tx.location_data && (tx.location_data.is_vpn || tx.location_data.is_proxy) ? (
                        <span className="text-red-600 font-bold">Yes</span>
                      ) : (
                        'No'
                      )}
                    </td>
                    <td className="px-4 py-3 border-b">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default LocationDashboard;