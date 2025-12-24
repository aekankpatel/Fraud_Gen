from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from datetime import datetime
import json
import random
import logging
import os

# Initialize the Flask application
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import ipinfo, but provide a fallback if not available
try:
    import ipinfo
    IPINFO_AVAILABLE = True
    # Initialize IPInfo for geolocation (free tier, replace with your token)
    IPINFO_TOKEN = os.environ.get("IPINFO_TOKEN", "d5e4b36a2fbfd6")  # Replace with actual token
    handler = ipinfo.getHandler(IPINFO_TOKEN)
    logger.info("IPInfo module loaded successfully")
except ImportError:
    IPINFO_AVAILABLE = False
    logger.warning("IPInfo module not available. Using mock location data instead.")

# Initialize SQLite database
def init_db():
    conn = sqlite3.connect('fraud_detection.db')
    cursor = conn.cursor()
    
    # Check if transactions table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
    table_exists = cursor.fetchone()
    
    if not table_exists:
        # Create the table with location fields
        cursor.execute('''
        CREATE TABLE transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_data TEXT,
            prediction TEXT,
            probability REAL,
            action TEXT,
            explanation TEXT,
            timestamp DATETIME,
            ip_address TEXT,
            location_data TEXT
        )
        ''')
        logger.info("Created new transactions table with location fields")
    else:
        # Check if location_data column exists
        try:
            cursor.execute("SELECT location_data FROM transactions LIMIT 1")
            logger.info("Location data column exists in transactions table")
        except sqlite3.OperationalError:
            # Add location columns if they don't exist
            logger.info("Adding location columns to existing transactions table")
            cursor.execute("ALTER TABLE transactions ADD COLUMN ip_address TEXT")
            cursor.execute("ALTER TABLE transactions ADD COLUMN location_data TEXT")
    
    conn.commit()
    conn.close()

# Call init_db function to ensure the database is set up
init_db()

def get_location_from_ip(ip_address):
    """
    Get location information from IP address using IPInfo or fallback to mock data
    """
    if IPINFO_AVAILABLE:
        try:
            details = handler.getDetails(ip_address)
            location_data = {
                "country": details.country,
                "region": details.region,
                "city": details.city,
                "latitude": details.latitude,
                "longitude": details.longitude,
                "is_vpn": details.privacy.vpn if hasattr(details, 'privacy') and hasattr(details.privacy, 'vpn') else False,
                "is_proxy": details.privacy.proxy if hasattr(details, 'privacy') and hasattr(details.privacy, 'proxy') else False
            }
            return location_data
        except Exception as e:
            logger.error(f"Error getting location data: {str(e)}")
            # Fall through to mock data
    
    # Use Jersey City, NJ as default location (from the requirements)
    return {
        "country": "US",
        "region": "New Jersey",
        "city": "Jersey City",
        "latitude": 40.7282,
        "longitude": -74.0776,
        "is_vpn": False,
        "is_proxy": False
    }

def save_transaction(txn_data, prediction_result, ip_address, location_data):
    """
    Save transaction data, prediction results, and location data to the database
    """
    try:
        conn = sqlite3.connect('fraud_detection.db')
        cursor = conn.cursor()
        
        # Convert location_data to JSON string for storage
        location_data_str = json.dumps(location_data)
        
        cursor.execute(
            "INSERT INTO transactions (transaction_data, prediction, probability, action, explanation, timestamp, ip_address, location_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                json.dumps(txn_data),
                prediction_result["decision"],
                prediction_result["probability"],
                prediction_result["action"],
                prediction_result["explanation"],
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ip_address,
                location_data_str
            )
        )
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Error saving transaction: {str(e)}")
        return False

@app.route('/')
def index():
    return jsonify({"message": "FRAUDGEN API is running"})

# Sample transaction for testing
@app.route('/api/test-transaction', methods=['GET'])
def get_test_transaction():
    # Sample test transactions
    samples = [
        {
            "step": 132,
            "type": "TRANSFER",
            "amount": 85000,
            "oldbalanceOrg": 100000,
            "newbalanceOrig": 15000,
            "oldbalanceDest": 5000,
            "newbalanceDest": 90000,
            "receiver_country": "CA"  # Added receiver country
        },
        {
            "step": 210,
            "type": "PAYMENT",
            "amount": 125.75,
            "oldbalanceOrg": 2000.00,
            "newbalanceOrig": 1874.25,
            "oldbalanceDest": 5000.00,
            "newbalanceDest": 5125.75,
            "receiver_country": "US"  # Added receiver country
        },
        {
            "step": 88,
            "type": "TRANSFER",
            "amount": 240000,
            "oldbalanceOrg": 260000,
            "newbalanceOrig": 20000,
            "oldbalanceDest": 10000,
            "newbalanceDest": 250000,
            "receiver_country": "GB"  # Added receiver country
        }
    ]
    
    # Return a random sample
    return jsonify(random.choice(samples))

# Enhanced prediction endpoint with location tracking
@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        
        # Get client IP address (consider X-Forwarded-For for proxy scenarios)
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        location_data = get_location_from_ip(ip_address)
        
        # Log location data for debugging
        logger.info(f"Location data for IP {ip_address}: {location_data}")
        
        # Basic validation
        required_fields = ["type", "amount", "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest"]
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            return jsonify({
                "error": f"Missing required fields: {', '.join(missing_fields)}"
            }), 400
            
        # Set default step if not provided
        if "step" not in data:
            data["step"] = 1
            
        # Add location data to transaction
        data["sender_country"] = location_data["country"]
        data["sender_region"] = location_data["region"]
        
        # Simple rule-based fraud detection
        is_suspicious = False
        fraud_probability = 0.1
        
        # Location-based risk factors
        if location_data["is_vpn"] or location_data["is_proxy"]:
            is_suspicious = True
            fraud_probability = max(fraud_probability, 0.7)
            
        # Check for cross-country transactions
        if "receiver_country" in data and data["receiver_country"] != location_data["country"]:
            fraud_probability += 0.1
        
        # Check for unusual large transfers
        if data["type"] == "TRANSFER" and data["amount"] > 50000:
            is_suspicious = True
            fraud_probability = max(fraud_probability, 0.7)
            
        # Check if entire balance was transferred
        if abs(data["oldbalanceOrg"] - data["newbalanceOrig"] - data["amount"]) < 0.01 and data["amount"] > 10000:
            is_suspicious = True
            fraud_probability = max(fraud_probability, 0.6)
            
        # Check suspicious destination account
        if data["oldbalanceDest"] < 1000 and data["newbalanceDest"] > 50000:
            is_suspicious = True
            fraud_probability = max(fraud_probability, 0.8)
        
        # Add transaction velocity check (high amount relative to step)
        if data["amount"] > 100000 and data["step"] < 100:
            fraud_probability += 0.2
            
        # Cap probability at 0.95
        fraud_probability = min(fraud_probability, 0.95)
        
        # Determine decision based on probability
        if fraud_probability >= 0.9:
            decision = "🚨 CONFIRMED_FRAUD"
            action = "block_and_alert"
            reason = "Model predicted high fraud probability (> 90%)."
        elif fraud_probability >= 0.7:
            decision = "⚠️ HIGH_RISK"
            action = "block_with_review"
            reason = "Model predicted moderately high fraud probability (70%-90%)."
        elif fraud_probability >= 0.2:
            decision = "🕵️ NEEDS_REVIEW"
            action = "manual_review"
            reason = "Model predicted borderline probability (20%-70%)."
        else:
            decision = "✅ LEGITIMATE"
            action = "allow"
            reason = "Model predicted low probability (< 20%)."
        
        # Generate explanation
        explanation = generate_explanation(data, decision, fraud_probability, reason, location_data)
        
        result = {
            "decision": decision,
            "probability": fraud_probability,
            "action": action,
            "explanation": explanation,
            "location": {
                "country": location_data["country"],
                "region": location_data["region"],
                "city": location_data["city"]
            }
        }
        
        # Save transaction to database
        save_transaction(data, result, ip_address, location_data)
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error in prediction endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

def generate_explanation(txn_data, decision, proba, reason, location_data):
    """
    Generate a human-readable explanation for the fraud prediction with location context.
    """
    # Check for specific patterns that might indicate fraud
    suspicious_signals = []
    confirming_signals = []
    
    # Location-based signals
    if location_data["is_vpn"] or location_data["is_proxy"]:
        suspicious_signals.append(f"The transaction appears to be using a {'VPN' if location_data['is_vpn'] else 'proxy'}")
        
    if "receiver_country" in txn_data and txn_data["receiver_country"] != location_data["country"]:
        suspicious_signals.append(f"This is a cross-country transaction from {location_data['country']} to {txn_data['receiver_country']}")
    else:
        confirming_signals.append(f"The transaction is domestic within {location_data['country']}")
    
    # Check transaction amount
    if txn_data["amount"] > 50000:
        suspicious_signals.append("The transaction amount is unusually large")
    else:
        confirming_signals.append("The transaction amount is within normal range")
    
    # Check balance changes
    if abs(txn_data["oldbalanceOrg"] - txn_data["newbalanceOrig"] - txn_data["amount"]) < 0.01:
        suspicious_signals.append("The entire amount was transferred out")
    
    # Check destination account
    if txn_data["oldbalanceDest"] < 10000 and txn_data["type"] == "TRANSFER":
        suspicious_signals.append("The destination account had a low initial balance")
    
    # Check transaction type
    if txn_data["type"] == "TRANSFER" or txn_data["type"] == "CASH_OUT":
        suspicious_signals.append(f"'{txn_data['type']}' transactions are more commonly associated with fraud")
    elif txn_data["type"] == "PAYMENT":
        confirming_signals.append("Payment transactions have lower fraud rates")
    
    # Format explanation based on decision
    if "FRAUD" in decision or "HIGH_RISK" in decision:
        signals = suspicious_signals[:3]  # Get top 3 suspicious signals
        signal_text = "\n- ".join(signals) if signals else "No specific suspicious signals identified"
        explanation = f"""
This transaction was flagged as {decision} with {proba:.1%} probability.

Reason: {reason}

Key suspicious signals:
- {signal_text}

Location: {location_data['city']}, {location_data['region']}, {location_data['country']}

We recommend reviewing this transaction carefully before proceeding.
"""
    else:
        signals = confirming_signals[:3]  # Get top 3 confirming signals
        signal_text = "\n- ".join(signals) if signals else "No specific confirming signals identified"
        explanation = f"""
This transaction appears {decision} with {proba:.1%} probability.

Reason: {reason}

Key confirming signals:
- {signal_text}

Location: {location_data['city']}, {location_data['region']}, {location_data['country']}

The transaction seems to follow normal patterns.
"""
    
    return explanation.strip()

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """
    Endpoint to retrieve historical transactions with location data
    """
    try:
        conn = sqlite3.connect('fraud_detection.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get query parameters for filtering
        limit = request.args.get('limit', default=100, type=int)
        offset = request.args.get('offset', default=0, type=int)
        prediction = request.args.get('prediction', default=None, type=str)
        country = request.args.get('country', default=None, type=str)
        
        # Build query
        query = "SELECT * FROM transactions"
        params = []
        conditions = []
        
        if prediction:
            conditions.append("prediction LIKE ?")
            params.append(f"%{prediction}%")
            
        if country:
            # Fix for country filtering - handle both formats of country data
            # Check for both exact match and JSON string pattern
            country_condition = "(location_data LIKE ? OR location_data LIKE ?)"
            conditions.append(country_condition)
            params.append(f"%\"country\":\"{country}\"%")  # Standard format: "country":"US"
            params.append(f"%\"country\":{country}%")      # Alternative format without quotes
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
            
        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        # Log the query and params for debugging
        logger.info(f"Transactions query: {query}")
        logger.info(f"Query params: {params}")
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # Count total rows for pagination
        count_query = "SELECT COUNT(*) as count FROM transactions"
        if conditions:
            count_query += " WHERE " + " AND ".join(conditions)
        
        cursor.execute(count_query, params[:-2] if params else [])
        total = cursor.fetchone()["count"]
        
        # Convert rows to list of dicts
        transactions = []
        for row in rows:
            transaction = dict(row)
            
            # Handle transaction_data safely
            if transaction.get("transaction_data"):
                try:
                    transaction["transaction_data"] = json.loads(transaction["transaction_data"])
                except (json.JSONDecodeError, TypeError):
                    transaction["transaction_data"] = {}
            else:
                transaction["transaction_data"] = {}
                
            # Handle location_data safely
            if transaction.get("location_data"):
                try:
                    transaction["location_data"] = json.loads(transaction["location_data"])
                except (json.JSONDecodeError, TypeError):
                    transaction["location_data"] = {
                        "country": "Unknown",
                        "region": "Unknown",
                        "city": "Unknown"
                    }
            else:
                transaction["location_data"] = {
                    "country": "Unknown",
                    "region": "Unknown",
                    "city": "Unknown"
                }
                
            transactions.append(transaction)
            
        conn.close()
        
        return jsonify({
            "transactions": transactions,
            "total": total,
            "limit": limit,
            "offset": offset
        })
        
    except Exception as e:
        logger.error(f"Error in transactions endpoint: {str(e)}")
        return jsonify({
            "error": str(e),
            "transactions": [],
            "total": 0,
            "limit": limit,
            "offset": offset
        }), 500

# New endpoint for deleting transactions
@app.route('/api/transactions/<int:transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    try:
        conn = sqlite3.connect('fraud_detection.db')
        cursor = conn.cursor()
        
        # Check if transaction exists
        cursor.execute("SELECT id FROM transactions WHERE id = ?", (transaction_id,))
        transaction = cursor.fetchone()
        
        if not transaction:
            return jsonify({"error": "Transaction not found"}), 404
            
        # Delete the transaction
        cursor.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
        conn.commit()
        conn.close()
        
        return jsonify({"message": "Transaction deleted successfully", "id": transaction_id})
    except Exception as e:
        logger.error(f"Error deleting transaction: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    """
    Endpoint to retrieve fraud detection statistics
    """
    try:
        conn = sqlite3.connect('fraud_detection.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Total transactions
        cursor.execute("SELECT COUNT(*) as count FROM transactions")
        total = cursor.fetchone()["count"]
        
        # Count by prediction type
        cursor.execute("""
        SELECT prediction, COUNT(*) as count 
        FROM transactions 
        GROUP BY prediction
        """)
        prediction_counts = {row["prediction"]: row["count"] for row in cursor.fetchall()}
        
        # Average probability
        cursor.execute("SELECT AVG(probability) as avg_prob FROM transactions")
        avg_probability = cursor.fetchone()["avg_prob"]
        
        # Recent trends (last 5 days)
        cursor.execute("""
        SELECT DATE(timestamp) as date, COUNT(*) as count, 
               SUM(CASE WHEN prediction LIKE '%FRAUD%' OR prediction LIKE '%HIGH_RISK%' THEN 1 ELSE 0 END) as fraud_count
        FROM transactions
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
        LIMIT 5
        """)
        trends = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            "total_transactions": total,
            "prediction_counts": prediction_counts,
            "average_probability": avg_probability if avg_probability is not None else 0,
            "recent_trends": trends
        })
        
    except Exception as e:
        logger.error(f"Error in statistics endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/statistics/locations', methods=['GET'])
def get_location_statistics():
    """
    Endpoint to retrieve fraud statistics by location
    """
    try:
        conn = sqlite3.connect('fraud_detection.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get statistics by country (handle case where location_data might be null or invalid JSON)
        cursor.execute("""
        SELECT 
            prediction,
            location_data
        FROM transactions
        WHERE location_data IS NOT NULL
        """)
        
        rows = cursor.fetchall()
        
        # Process data manually since SQLite JSON functions might not be available
        country_counts = {}
        vpn_proxy_counts = {"Yes": {"total": 0, "fraud": 0}, "No": {"total": 0, "fraud": 0}}
        
        for row in rows:
            try:
                location_data = json.loads(row["location_data"])
                country = location_data.get("country", "Unknown")
                
                # Initialize country if not exists
                if country not in country_counts:
                    country_counts[country] = {"total": 0, "fraud": 0}
                
                # Update counts
                country_counts[country]["total"] += 1
                
                # Check if fraud or high risk
                is_fraud = "FRAUD" in row["prediction"] or "HIGH_RISK" in row["prediction"]
                if is_fraud:
                    country_counts[country]["fraud"] += 1
                
                # VPN/Proxy statistics
                is_vpn_proxy = location_data.get("is_vpn", False) or location_data.get("is_proxy", False)
                vpn_category = "Yes" if is_vpn_proxy else "No"
                
                vpn_proxy_counts[vpn_category]["total"] += 1
                if is_fraud:
                    vpn_proxy_counts[vpn_category]["fraud"] += 1
                    
            except (json.JSONDecodeError, TypeError, KeyError) as e:
                logger.error(f"Error processing location data: {str(e)}")
                continue
        
        # Convert to required format
        for country, data from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from datetime import datetime
import json
import random
import logging
import os

# Initialize the Flask application
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import ipinfo, but provide a fallback if not available
try:
    import ipinfo
    IPINFO_AVAILABLE = True
    # Initialize IPInfo for geolocation (free tier, replace with your token)
    IPINFO_TOKEN = os.environ.get("IPINFO_TOKEN", "d5e4b36a2fbfd6")  # Replace with actual token
    handler = ipinfo.getHandler(IPINFO_TOKEN)
    logger.info("IPInfo module loaded successfully")
except ImportError:
    IPINFO_AVAILABLE = False
    logger.warning("IPInfo module not available. Using mock location data instead.")

# Initialize SQLite database
def init_db():
    conn = sqlite3.connect('fraud_detection.db')
    cursor = conn.cursor()
    
    # Check if transactions table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
    table_exists = cursor.fetchone()
    
    if not table_exists:
        # Create the table with location fields
        cursor.execute('''
        CREATE TABLE transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_data TEXT,
            prediction TEXT,
            probability REAL,
            action TEXT,
            explanation TEXT,
            timestamp DATETIME,
            ip_address TEXT,
            location_data TEXT
        )
        ''')
        logger.info("Created new transactions table with location fields")
    else:
        # Check if location_data column exists
        try:
            cursor.execute("SELECT location_data FROM transactions LIMIT 1")
            logger.info("Location data column exists in transactions table")
        except sqlite3.OperationalError:
            # Add location columns if they don't exist
            logger.info("Adding location columns to existing transactions table")
            cursor.execute("ALTER TABLE transactions ADD COLUMN ip_address TEXT")
            cursor.execute("ALTER TABLE transactions ADD COLUMN location_data TEXT")
    
    conn.commit()
    conn.close()

# Call init_db function to ensure the database is set up
init_db()

def get_location_from_ip(ip_address):
    """
    Get location information from IP address using IPInfo or fallback to mock data
    """
    if IPINFO_AVAILABLE:
        try:
            details = handler.getDetails(ip_address)
            location_data = {
                "country": details.country,
                "region": details.region,
                "city": details.city,
                "latitude": details.latitude,
                "longitude": details.longitude,
                "is_vpn": details.privacy.vpn if hasattr(details, 'privacy') and hasattr(details.privacy, 'vpn') else False,
                "is_proxy": details.privacy.proxy if hasattr(details, 'privacy') and hasattr(details.privacy, 'proxy') else False
            }
            return location_data
        except Exception as e:
            logger.error(f"Error getting location data: {str(e)}")
            # Fall through to mock data
    
    # Use Jersey City, NJ as default location (from the requirements)
    return {
        "country": "US",
        "region": "New Jersey",
        "city": "Jersey City",
        "latitude": 40.7282,
        "longitude": -74.0776,
        "is_vpn": False,
        "is_proxy": False
    }

def save_transaction(txn_data, prediction_result, ip_address, location_data):
    """
    Save transaction data, prediction results, and location data to the database
    """
    try:
        conn = sqlite3.connect('fraud_detection.db')
        cursor = conn.cursor()
        
        # Convert location_data to JSON string for storage
        location_data_str = json.dumps(location_data)
        
        cursor.execute(
            "INSERT INTO transactions (transaction_data, prediction, probability, action, explanation, timestamp, ip_address, location_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                json.dumps(txn_data),
                prediction_result["decision"],
                prediction_result["probability"],
                prediction_result["action"],
                prediction_result["explanation"],
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ip_address,
                location_data_str
            )
        )
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Error saving transaction: {str(e)}")
        return False

@app.route('/')
def index():
    return jsonify({"message": "FRAUDGEN API is running"})

# Sample transaction for testing
@app.route('/api/test-transaction', methods=['GET'])
def get_test_transaction():
    # Sample test transactions
    samples = [
        {
            "step": 132,
            "type": "TRANSFER",
            "amount": 85000,
            "oldbalanceOrg": 100000,
            "newbalanceOrig": 15000,
            "oldbalanceDest": 5000,
            "newbalanceDest": 90000,
            "receiver_country": "CA"  # Added receiver country
        },
        {
            "step": 210,
            "type": "PAYMENT",
            "amount": 125.75,
            "oldbalanceOrg": 2000.00,
            "newbalanceOrig": 1874.25,
            "oldbalanceDest": 5000.00,
            "newbalanceDest": 5125.75,
            "receiver_country": "US"  # Added receiver country
        },
        {
            "step": 88,
            "type": "TRANSFER",
            "amount": 240000,
            "oldbalanceOrg": 260000,
            "newbalanceOrig": 20000,
            "oldbalanceDest": 10000,
            "newbalanceDest": 250000,
            "receiver_country": "GB"  # Added receiver country
        }
    ]
    
    # Return a random sample
    return jsonify(random.choice(samples))

# Enhanced prediction endpoint with location tracking
@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        
        # Get client IP address (consider X-Forwarded-For for proxy scenarios)
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        location_data = get_location_from_ip(ip_address)
        
        # Log location data for debugging
        logger.info(f"Location data for IP {ip_address}: {location_data}")
        
        # Basic validation
        required_fields = ["type", "amount", "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest"]
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            return jsonify({
                "error": f"Missing required fields: {', '.join(missing_fields)}"
            }), 400
            
        # Set default step if not provided
        if "step" not in data:
            data["step"] = 1
            
        # Add location data to transaction
        data["sender_country"] = location_data["country"]
        data["sender_region"] = location_data["region"]
        
        # Simple rule-based fraud detection
        is_suspicious = False
        fraud_probability = 0.1
        
        # Location-based risk factors
        if location_data["is_vpn"] or location_data["is_proxy"]:
            is_suspicious = True
            fraud_probability = max(fraud_probability, 0.7)
            
        # Check for cross-country transactions
        if "receiver_country" in data and data["receiver_country"] != location_data["country"]:
            fraud_probability += 0.1
        
        # Check for unusual large transfers
        if data["type"] == "TRANSFER" and data["amount"] > 50000:
            is_suspicious = True
            fraud_probability = max(fraud_probability, 0.7)
            
        # Check if entire balance was transferred
        if abs(data["oldbalanceOrg"] - data["newbalanceOrig"] - data["amount"]) < 0.01 and data["amount"] > 10000:
            is_suspicious = True
            fraud_probability = max(fraud_probability, 0.6)
            
        # Check suspicious destination account
        if data["oldbalanceDest"] < 1000 and data["newbalanceDest"] > 50000:
            is_suspicious = True
            fraud_probability = max(fraud_probability, 0.8)
        
        # Add transaction velocity check (high amount relative to step)
        if data["amount"] > 100000 and data["step"] < 100:
            fraud_probability += 0.2
            
        # Cap probability at 0.95
        fraud_probability = min(fraud_probability, 0.95)
        
        # Determine decision based on probability
        if fraud_probability >= 0.9:
            decision = " CONFIRMED_FRAUD"
            action = "block_and_alert"
            reason = "Model predicted high fraud probability (> 90%)."
        elif fraud_probability >= 0.7:
            decision = " HIGH_RISK"
            action = "block_with_review"
            reason = "Model predicted moderately high fraud probability (70%-90%)."
        elif fraud_probability >= 0.2:
            decision = " NEEDS_REVIEW"
            action = "manual_review"
            reason = "Model predicted borderline probability (20%-70%)."
        else:
            decision = " LEGITIMATE"
            action = "allow"
            reason = "Model predicted low probability (< 20%)."
        
        # Generate explanation
        explanation = generatein country_counts.items():
            fraud_percentage = round((data["fraud"] / data["total"]) * 100, 2) if data["total"] > 0 else 0
            country_stats.append({
                "country": country,
                "total_transactions": data["total"],
                "fraud_transactions": data["fraud"],
                "fraud_percentage": fraud_percentage
            })
        
        # Sort by fraud count
        country_stats.sort(key=lambda x: x["fraud_transactions"], reverse=True)
        
        # Convert VPN/Proxy stats
        vpn_proxy_stats = []
        for category, data in vpn_proxy_counts.items():
            fraud_percentage = round((data["fraud"] / data["total"]) * 100, 2) if data["total"] > 0 else 0
            vpn_proxy_stats.append({
                "using_vpn_proxy": category,
                "total_transactions": data["total"],
                "fraud_transactions": data["fraud"],
                "fraud_percentage": fraud_percentage
            })
        
        conn.close()
        
        return jsonify({
            "country_statistics": country_stats[:10],  # Top 10 countries
            "vpn_proxy_statistics": vpn_proxy_stats
        })
        
    except Exception as e:
        logger.error(f"Error in location statistics endpoint: {str(e)}")
        return jsonify({
            "error": str(e),
            "country_statistics": [],
            "vpn_proxy_statistics": []
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)