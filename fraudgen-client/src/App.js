import React, { useState, useEffect } from 'react'; // useState kept for headerHeight
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import LocationDashboard from './components/LocationDashboard';
import TransactionForm from './components/TransactionForm';
import TransactionHistory from './components/TransactionHistory';
import Statistics from './components/Statistics';

// Import CSS
import './index.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const update = () => {
      const el = document.querySelector('.app-header');
      if (el) setHeaderHeight(el.offsetHeight);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <Router>
      <div className="app-container bg-gray-100">
        <Header className="app-header" />

        <div className="content-wrapper">
          <Navigation
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(o => !o)}
            style={{ top: `${headerHeight}px` }}
            className="app-sidebar"
          />

          <main
            className="main-content"
            style={{
              marginLeft: sidebarOpen ? '16rem' : '3.5rem',
              marginTop: `${headerHeight}px`,
            }}
          >
            <div className="page-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/location" element={<LocationDashboard />} />
                <Route path="/test-transaction" element={<TransactionForm />} />
                <Route path="/history" element={<TransactionHistory />} />
                <Route path="/statistics" element={<Statistics />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;