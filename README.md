# FraudGen — End-to-End Fraud Detection & Analytics Platform

FraudGen is a full-stack fraud detection and analytics system that combines machine learning, rule-based logic, geolocation analysis, and interactive dashboards to identify, analyze, and explain potentially fraudulent transactions in real time.

This project simulates a production-grade fraud monitoring system, integrating a Python backend with a modern React frontend and cloud deployment.

---

## Live Demo

Frontend (Vercel):  
https://fraud-gen.vercel.app  

Backend API (Render):  
https://fraudgen-api.onrender.com  

---

## Key Features

### Fraud Detection Engine
- Machine learning–based fraud prediction
- Rule-based risk escalation (e.g., cross-country transactions)
- Risk categorization: Low / Medium / High

### Interactive Dashboard
- Fraud statistics and trends
- Recent transaction history
- Risk distribution visualizations using Recharts

### Location Intelligence
- IP-based geolocation tracking
- Interactive map visualization
- Graceful handling of missing or invalid coordinates

### Explainability
- Human-readable explanations for predictions
- Supports explainable AI concepts for fraud analysis

---

## Tech Stack

### Backend
- Python
- Flask
- Scikit-learn
- Pandas / NumPy
- REST API
- Deployed on Render

### Frontend
- React (Create React App)
- Axios
- Recharts
- Leaflet (Maps)
- Deployed on Vercel

### Infrastructure
- GitHub for version control
- Vercel for frontend CI/CD
- Render for backend hosting

---

## Project Structure

Fraud_Gen/
├── fraudgen-client/        # React frontend  
│   ├── src/  
│   │   ├── components/  
│   │   ├── api.js  
│   │   └── App.jsx  
│   └── package.json  
│  
├── backend/                # Flask backend + ML  
│   ├── app.py  
│   ├── model/  
│   ├── utils/  
│   └── requirements.txt  
│  
└── README.md  

---

## Environment Configuration

### Frontend (Vercel)
VITE_API_BASE_URL=https://fraudgen-api.onrender.com  

### Backend (Render)
- CORS enabled
- Port dynamically assigned by Render

---

## Running Locally

### Backend
cd backend  
pip install -r requirements.txt  
python app.py  

Backend runs on:  
http://localhost:5050  

### Frontend
cd fraudgen-client  
npm install  
npm start  

Frontend runs on:  
http://localhost:3000  

---

## Production Build

cd fraudgen-client  
npm run build  

Build output:  
fraudgen-client/build  

---

## Error Handling & Robustness

- Handles invalid or missing location data gracefully
- Prevents insecure HTTP requests in production
- Fallback UI states for API failures
- Strict environment-based configuration

---

## Learning Outcomes

This project demonstrates:
- End-to-end ML system deployment
- Real-world frontend ↔ backend integration
- Handling production-only issues (CORS, HTTPS, environment variables)
- Debugging cloud builds and dependency conflicts
- Clean CI/CD workflows
