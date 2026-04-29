from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from datetime import datetime
import json
import random
import logging
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- IPInfo setup ---
try:
    import ipinfo
    IPINFO_AVAILABLE = True
    IPINFO_TOKEN = os.environ.get("IPINFO_TOKEN", "d5e4b36a2fbfd6")
    handler = ipinfo.getHandler(IPINFO_TOKEN)
    logger.info("IPInfo loaded")
except ImportError:
    IPINFO_AVAILABLE = False
    logger.warning("IPInfo not available, using fallback location")

# --- ML model setup ---
import pandas as pd
import numpy as np
import joblib

ML_AVAILABLE = False
fraud_model = None
feature_names = None
type_mapping = {"CASH_OUT": 0, "PAYMENT": 1, "CASH_IN": 2, "TRANSFER": 3, "DEBIT": 4}
amount_q9995 = None
amount_median = None

try:
    model_dir = os.path.dirname(os.path.abspath(__file__))
    fraud_model = joblib.load(os.path.join(model_dir, "fraud_model.pkl"))
    preprocess_info = joblib.load(os.path.join(model_dir, "preprocess_info.pkl"))
    feature_names = preprocess_info["feature_names"]
    type_mapping = preprocess_info["type_mapping"]
    amount_q9995 = preprocess_info.get("amount_quantile_9995")
    amount_median = preprocess_info.get("amount_median")
    ML_AVAILABLE = True
    logger.info(f"XGBoost model loaded. Features: {feature_names}")
    logger.info(f"Rule thresholds — amount_q9995: {amount_q9995}, amount_median: {amount_median}")
except Exception as e:
    logger.warning(f"Could not load ML model: {e}. Falling back to rule-based detection.")

# --- Ollama setup ---
import requests as http_requests

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

try:
    resp = http_requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
    OLLAMA_AVAILABLE = resp.status_code == 200
    if OLLAMA_AVAILABLE:
        logger.info(f"Ollama available at {OLLAMA_BASE_URL}, model: {OLLAMA_MODEL}")
    else:
        logger.warning("Ollama responded with non-200. Using static explanations.")
except Exception:
    OLLAMA_AVAILABLE = False
    logger.warning(f"Ollama not reachable at {OLLAMA_BASE_URL}. Using static explanations.")


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def init_db():
    conn = sqlite3.connect('fraud_detection.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
    table_exists = cursor.fetchone()

    if not table_exists:
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
        logger.info("Created transactions table")
    else:
        try:
            cursor.execute("SELECT location_data FROM transactions LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE transactions ADD COLUMN ip_address TEXT")
            cursor.execute("ALTER TABLE transactions ADD COLUMN location_data TEXT")

    conn.commit()
    conn.close()

init_db()


def get_location_from_coords(lat, lon):
    """Reverse-geocode browser-provided coordinates using Nominatim (free, no key)."""
    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lon, "format": "json"},
            headers={"User-Agent": "FraudGen/1.0"},
            timeout=5
        )
        resp.raise_for_status()
        addr = resp.json().get("address", {})
        country_code = addr.get("country_code", "").upper()
        region = addr.get("state") or addr.get("region") or ""
        city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or "Unknown"
        return {
            "country": country_code,
            "region": region,
            "city": city,
            "latitude": lat,
            "longitude": lon,
            "is_vpn": False,
            "is_proxy": False
        }
    except Exception as e:
        logger.error(f"Reverse geocoding failed: {e}")
        return None


def get_location_from_ip(ip_address):
    if IPINFO_AVAILABLE:
        try:
            details = handler.getDetails(ip_address)
            return {
                "country": details.country,
                "region": details.region,
                "city": details.city,
                "latitude": details.latitude,
                "longitude": details.longitude,
                "is_vpn": getattr(details.privacy, "vpn", False),
                "is_proxy": getattr(details.privacy, "proxy", False)
            }
        except Exception as e:
            logger.error(f"IPInfo error: {e}")

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
    try:
        conn = sqlite3.connect('fraud_detection.db')
        cursor = conn.cursor()
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
                json.dumps(location_data)
            )
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Error saving transaction: {e}")
        return False


# ---------------------------------------------------------------------------
# ML inference helpers
# ---------------------------------------------------------------------------

def prepare_features(data):
    """Build the 9-feature DataFrame the XGBoost model expects."""
    type_val = type_mapping.get(data["type"], 1)
    row = {
        "step": data.get("step", 1),
        "type": type_val,
        "amount": data["amount"],
        "oldbalanceOrg": data["oldbalanceOrg"],
        "newbalanceOrig": data["newbalanceOrig"],
        "oldbalanceDest": data["oldbalanceDest"],
        "newbalanceDest": data["newbalanceDest"],
        "balance_change_orig": data["oldbalanceOrg"] - data["newbalanceOrig"],
        "balance_change_dest": data["oldbalanceDest"] - data["newbalanceDest"],
    }
    return pd.DataFrame([row])[feature_names]


def rule_based_filter_single(data):
    """
    Mirrors the notebook's rule_based_filter using precomputed population thresholds.
    Returns True only for large-amount night-time complete-drain TRANSFER transactions.
    """
    if amount_q9995 is None or amount_median is None:
        return False
    type_val = type_mapping.get(data["type"], -1)
    amount = data["amount"]
    step = data.get("step", 1)
    return (
        type_val == 3 and                                            # TRANSFER
        amount > amount_q9995 and                                    # top 0.05% amount
        abs(data["oldbalanceOrg"] - data["newbalanceOrig"] - amount) < 0.01 and  # full drain
        step % 24 < 6 and                                           # night hours 12AM–6AM
        amount > 3 * amount_median                                  # 3× population median
    )


# ---------------------------------------------------------------------------
# Explanation generation
# ---------------------------------------------------------------------------

def generate_llm_explanation(txn_data, decision, probability, location_data):
    """Use Ollama (local LLM) to generate a structured fraud explanation."""
    if not OLLAMA_AVAILABLE:
        return generate_fallback_explanation(txn_data, decision, probability, location_data)

    try:
        balance_drained = abs(txn_data["oldbalanceOrg"] - txn_data["newbalanceOrig"] - txn_data["amount"]) < 0.01
        cross_country = bool(txn_data.get("receiver_country") and
                             txn_data["receiver_country"] != location_data.get("country"))
        hour_of_day = txn_data.get("step", 1) % 24
        city   = location_data.get("city", "Unknown")
        region = location_data.get("region", "Unknown")
        country = location_data.get("country", "Unknown")
        is_vpn = location_data.get("is_vpn") or location_data.get("is_proxy")

        if "CONFIRMED_FRAUD" in decision:
            reason = "Model predicted very high fraud probability (≥ 90%)."
            signal_label = "Key suspicious signals"
            closing = "We strongly recommend blocking this transaction immediately."
        elif "HIGH_RISK" in decision:
            reason = "Model predicted high fraud probability (70%–89%)."
            signal_label = "Key suspicious signals"
            closing = "We recommend blocking this transaction pending manual review."
        elif "NEEDS_REVIEW" in decision:
            reason = "Model predicted borderline probability (40%–69%)."
            signal_label = "Key signals requiring attention"
            closing = "We recommend a manual review before proceeding."
        else:
            reason = "Model predicted low fraud probability (< 40%)."
            signal_label = "Key confirming signals"
            closing = "The transaction seems to follow normal patterns."

        prompt = f"""You are a financial fraud analyst. Output ONLY the explanation in the exact format below — no preamble, no extra commentary.

TRANSACTION FACTS:
- Decision: {decision}
- Fraud probability: {probability:.1%}
- Type: {txn_data["type"]}
- Amount: ${txn_data["amount"]:,.2f}
- Sender balance before/after: ${txn_data["oldbalanceOrg"]:,.2f} / ${txn_data["newbalanceOrig"]:,.2f}
- Receiver balance before/after: ${txn_data["oldbalanceDest"]:,.2f} / ${txn_data["newbalanceDest"]:,.2f}
- Complete balance drain: {"Yes" if balance_drained else "No"}
- Hour of day (step % 24): {hour_of_day}{"  [night-time]" if hour_of_day < 6 else ""}
- Cross-country: {"Yes" if cross_country else "No"}
- VPN/Proxy: {"Yes" if is_vpn else "No"}
- Location: {city}, {region}, {country}

OUTPUT FORMAT — reproduce this exactly, replacing only the bullet points:

This transaction appears {decision} with {probability:.1%} probability.

Reason: {reason}

{signal_label}:
- [bullet 1 based on the facts above]
- [bullet 2]
- [bullet 3]
- [bullet 4]
- [bullet 5]

Location: {city}, {region}, {country}

{closing}"""

        response = http_requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False
            },
            timeout=30
        )
        response.raise_for_status()
        return response.json()["message"]["content"]

    except Exception as e:
        logger.error(f"Ollama explanation failed: {e}")
        return generate_fallback_explanation(txn_data, decision, probability, location_data)


def generate_fallback_explanation(txn_data, decision, probability, location_data):
    """Static explanation used when the Claude API is unavailable."""
    signals = []

    if location_data.get("is_vpn") or location_data.get("is_proxy"):
        signals.append(f"connection via {'VPN' if location_data.get('is_vpn') else 'proxy'}")

    if txn_data.get("receiver_country") and txn_data["receiver_country"] != location_data.get("country"):
        signals.append(f"cross-country transfer ({location_data.get('country')} → {txn_data['receiver_country']})")

    if abs(txn_data["oldbalanceOrg"] - txn_data["newbalanceOrig"] - txn_data["amount"]) < 0.01:
        signals.append("sender's entire balance was drained")

    if txn_data["oldbalanceDest"] < 1000 and txn_data["newbalanceDest"] > 50000:
        signals.append("funds moved into a near-empty destination account")

    if txn_data["amount"] > 50000:
        signals.append(f"large amount (${txn_data['amount']:,.2f})")

    if txn_data["type"] in ("TRANSFER", "CASH_OUT"):
        signals.append(f"{txn_data['type']} type is historically high-risk")

    signal_text = "; ".join(signals) if signals else "transaction pattern matched fraud indicators"

    return (
        f"This transaction was classified as {decision} with {probability:.1%} fraud probability by the ML model. "
        f"Key factors: {signal_text}. "
        f"Location: {location_data.get('city', 'Unknown')}, {location_data.get('country', 'Unknown')}."
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return jsonify({"message": "FRAUDGEN API is running", "ml_model_loaded": ML_AVAILABLE})


@app.route('/api/test-transaction', methods=['GET'])
def get_test_transaction():
    samples = [
        {
            "step": 132,
            "type": "TRANSFER",
            "amount": 85000,
            "oldbalanceOrg": 100000,
            "newbalanceOrig": 15000,
            "oldbalanceDest": 5000,
            "newbalanceDest": 90000,
            "receiver_country": "CA"
        },
        {
            "step": 210,
            "type": "PAYMENT",
            "amount": 125.75,
            "oldbalanceOrg": 2000.00,
            "newbalanceOrig": 1874.25,
            "oldbalanceDest": 5000.00,
            "newbalanceDest": 5125.75,
            "receiver_country": "US"
        },
        {
            "step": 88,
            "type": "TRANSFER",
            "amount": 240000,
            "oldbalanceOrg": 260000,
            "newbalanceOrig": 20000,
            "oldbalanceDest": 10000,
            "newbalanceDest": 250000,
            "receiver_country": "GB"
        }
    ]
    return jsonify(random.choice(samples))


@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)

        # Use browser-provided coordinates if available, otherwise fall back to IP lookup
        user_lat = data.get("user_latitude")
        user_lon = data.get("user_longitude")
        if user_lat is not None and user_lon is not None:
            location_data = get_location_from_coords(float(user_lat), float(user_lon))
        if not user_lat or not user_lon or location_data is None:
            location_data = get_location_from_ip(ip_address)

        required_fields = ["type", "amount", "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest"]
        missing_fields = [f for f in required_fields if f not in data]
        if missing_fields:
            return jsonify({"error": f"Missing required fields: {', '.join(missing_fields)}"}), 400

        if "step" not in data:
            data["step"] = 1
        data["sender_country"] = location_data["country"]
        data["sender_region"] = location_data["region"]

        if ML_AVAILABLE:
            features = prepare_features(data)
            proba = float(fraud_model.predict_proba(features)[0][1])
            is_confirmed_fraud = rule_based_filter_single(data)

            # Cross-country transfer always adds at least 40% risk on top of ML score
            is_cross_country = (
                data.get("receiver_country") and
                data["receiver_country"] != location_data["country"]
            )
            if is_cross_country:
                proba = min(proba + 0.4, 0.99)
        else:
            # Rule-based fallback when model files are missing
            proba = 0.1
            if location_data["is_vpn"] or location_data["is_proxy"]:
                proba = max(proba, 0.7)
            if data.get("receiver_country") and data["receiver_country"] != location_data["country"]:
                proba += 0.1
            if data["type"] == "TRANSFER" and data["amount"] > 50000:
                proba = max(proba, 0.7)
            if abs(data["oldbalanceOrg"] - data["newbalanceOrig"] - data["amount"]) < 0.01 and data["amount"] > 10000:
                proba = max(proba, 0.6)
            if data["oldbalanceDest"] < 1000 and data["newbalanceDest"] > 50000:
                proba = max(proba, 0.8)
            if data["amount"] > 100000 and data["step"] < 100:
                proba += 0.2
            proba = min(proba, 0.95)
            is_confirmed_fraud = False

        # Decision tiers — rule filter or ≥90% → CONFIRMED_FRAUD
        if is_confirmed_fraud or proba >= 0.9:
            decision = "🚨 CONFIRMED_FRAUD"
            action = "block_and_alert"
            proba = max(proba, 0.9)
        elif proba >= 0.7:
            decision = "⚠️ HIGH_RISK"
            action = "block_with_review"
        elif proba >= 0.4:
            decision = "🕵️ NEEDS_REVIEW"
            action = "manual_review"
        else:
            decision = "✅ LEGITIMATE"
            action = "allow"

        explanation = generate_llm_explanation(data, decision, proba, location_data)

        result = {
            "decision": decision,
            "probability": round(proba, 4),
            "action": action,
            "explanation": explanation,
            "location": {
                "country": location_data["country"],
                "region": location_data["region"],
                "city": location_data["city"]
            }
        }

        save_transaction(data, result, ip_address, location_data)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    try:
        conn = sqlite3.connect('fraud_detection.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        limit = request.args.get('limit', default=100, type=int)
        offset = request.args.get('offset', default=0, type=int)
        prediction = request.args.get('prediction', default=None, type=str)
        country = request.args.get('country', default=None, type=str)

        query = "SELECT * FROM transactions"
        params = []
        conditions = []

        if prediction:
            conditions.append("prediction LIKE ?")
            params.append(f"%{prediction}%")

        if country:
            conditions.append("(location_data LIKE ? OR location_data LIKE ?)")
            params.append(f'%"country":"{country}"%')
            params.append(f'%"country":{country}%')

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()

        count_query = "SELECT COUNT(*) as count FROM transactions"
        if conditions:
            count_query += " WHERE " + " AND ".join(conditions)
        cursor.execute(count_query, params[:-2] if params else [])
        total = cursor.fetchone()["count"]

        transactions = []
        for row in rows:
            transaction = dict(row)
            if transaction.get("transaction_data"):
                try:
                    transaction["transaction_data"] = json.loads(transaction["transaction_data"])
                except (json.JSONDecodeError, TypeError):
                    transaction["transaction_data"] = {}
            else:
                transaction["transaction_data"] = {}

            if transaction.get("location_data"):
                try:
                    transaction["location_data"] = json.loads(transaction["location_data"])
                except (json.JSONDecodeError, TypeError):
                    transaction["location_data"] = {"country": "Unknown", "region": "Unknown", "city": "Unknown"}
            else:
                transaction["location_data"] = {"country": "Unknown", "region": "Unknown", "city": "Unknown"}

            transactions.append(transaction)

        conn.close()
        return jsonify({"transactions": transactions, "total": total, "limit": limit, "offset": offset})

    except Exception as e:
        logger.error(f"Error in transactions endpoint: {e}")
        return jsonify({"error": str(e), "transactions": [], "total": 0, "limit": limit, "offset": offset}), 500


@app.route('/api/transactions/<int:transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    try:
        conn = sqlite3.connect('fraud_detection.db')
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM transactions WHERE id = ?", (transaction_id,))
        if not cursor.fetchone():
            return jsonify({"error": "Transaction not found"}), 404
        cursor.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Transaction deleted successfully", "id": transaction_id})
    except Exception as e:
        logger.error(f"Error deleting transaction: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    try:
        conn = sqlite3.connect('fraud_detection.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as count FROM transactions")
        total = cursor.fetchone()["count"]

        cursor.execute("SELECT prediction, COUNT(*) as count FROM transactions GROUP BY prediction")
        prediction_counts = {row["prediction"]: row["count"] for row in cursor.fetchall()}

        cursor.execute("SELECT AVG(probability) as avg_prob FROM transactions")
        avg_probability = cursor.fetchone()["avg_prob"]

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
            "average_probability": avg_probability or 0,
            "recent_trends": trends
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/statistics/locations', methods=['GET'])
def get_location_statistics():
    try:
        conn = sqlite3.connect('fraud_detection.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT prediction, location_data FROM transactions WHERE location_data IS NOT NULL")
        rows = cursor.fetchall()

        country_counts = {}
        vpn_proxy_counts = {"Yes": {"total": 0, "fraud": 0}, "No": {"total": 0, "fraud": 0}}

        for row in rows:
            try:
                location_data = json.loads(row["location_data"])
                country = location_data.get("country", "Unknown")

                if country not in country_counts:
                    country_counts[country] = {"total": 0, "fraud": 0}
                country_counts[country]["total"] += 1

                is_fraud = "FRAUD" in row["prediction"] or "HIGH_RISK" in row["prediction"]
                if is_fraud:
                    country_counts[country]["fraud"] += 1

                vpn_category = "Yes" if location_data.get("is_vpn") or location_data.get("is_proxy") else "No"
                vpn_proxy_counts[vpn_category]["total"] += 1
                if is_fraud:
                    vpn_proxy_counts[vpn_category]["fraud"] += 1
            except Exception:
                continue

        country_statistics = [
            {
                "country": k,
                "total_transactions": v["total"],
                "fraud": v["fraud"],
                "fraud_percentage": round(v["fraud"] / v["total"] * 100, 1) if v["total"] else 0
            }
            for k, v in country_counts.items()
        ]
        vpn_proxy_statistics = [
            {
                "using_vpn_proxy": k,
                "total_transactions": v["total"],
                "fraud": v["fraud"],
                "fraud_percentage": round(v["fraud"] / v["total"] * 100, 1) if v["total"] else 0
            }
            for k, v in vpn_proxy_counts.items()
        ]

        conn.close()
        return jsonify({"country_statistics": country_statistics, "vpn_proxy_statistics": vpn_proxy_statistics})

    except Exception as e:
        return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5050)
