"""
Re-scores all existing transactions using the current XGBoost model + rules,
and regenerates Ollama explanations. Timestamps are preserved.
"""

import sqlite3
import json
import joblib
import pandas as pd
import time
import requests

# ── Load model artifacts ──────────────────────────────────────────────────────
model         = joblib.load("fraud_model.pkl")
preprocess    = joblib.load("preprocess_info.pkl")
feature_names = preprocess["feature_names"]
type_mapping  = preprocess["type_mapping"]
amount_q9995  = preprocess["amount_quantile_9995"]
amount_median = preprocess["amount_median"]

OLLAMA_URL   = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "llama3.1:8b"

# ── Helpers (mirror app.py logic) ────────────────────────────────────────────

def prepare_features(data):
    row = {
        "step":               data.get("step", 1),
        "type":               type_mapping.get(data.get("type", "PAYMENT"), 1),
        "amount":             data["amount"],
        "oldbalanceOrg":      data["oldbalanceOrg"],
        "newbalanceOrig":     data["newbalanceOrig"],
        "oldbalanceDest":     data["oldbalanceDest"],
        "newbalanceDest":     data["newbalanceDest"],
        "balance_change_orig": data["oldbalanceOrg"] - data["newbalanceOrig"],
        "balance_change_dest": data["oldbalanceDest"] - data["newbalanceDest"],
    }
    return pd.DataFrame([row])[feature_names]


def rule_based_filter(data):
    type_val = type_mapping.get(data.get("type", ""), -1)
    amount   = data["amount"]
    step     = data.get("step", 1)
    return (
        type_val == 3 and
        amount > amount_q9995 and
        abs(data["oldbalanceOrg"] - data["newbalanceOrig"] - amount) < 0.01 and
        step % 24 < 6 and
        amount > 3 * amount_median
    )


def score(txn_data, location_data):
    proba            = float(model.predict_proba(prepare_features(txn_data))[0][1])
    is_rule_fraud    = rule_based_filter(txn_data)
    is_cross_country = (
        txn_data.get("receiver_country") and
        txn_data["receiver_country"] != location_data.get("country", "")
    )
    if is_cross_country:
        proba = min(proba + 0.4, 0.99)

    if is_rule_fraud or proba >= 0.9:
        return "🚨 CONFIRMED_FRAUD", "block_and_alert",   round(max(proba, 0.9), 4)
    elif proba >= 0.7:
        return "⚠️ HIGH_RISK",       "block_with_review", round(proba, 4)
    elif proba >= 0.4:
        return "🕵️ NEEDS_REVIEW",   "manual_review",     round(proba, 4)
    else:
        return "✅ LEGITIMATE",      "allow",             round(proba, 4)


def build_explanation(txn_data, decision, probability, location_data):
    balance_drained = abs(
        txn_data["oldbalanceOrg"] - txn_data["newbalanceOrig"] - txn_data["amount"]
    ) < 0.01
    cross_country = bool(
        txn_data.get("receiver_country") and
        txn_data["receiver_country"] != location_data.get("country")
    )
    hour_of_day = txn_data.get("step", 1) % 24
    city    = location_data.get("city",   "Unknown")
    region  = location_data.get("region", "Unknown")
    country = location_data.get("country","Unknown")
    is_vpn  = location_data.get("is_vpn") or location_data.get("is_proxy")

    if "CONFIRMED_FRAUD" in decision:
        reason, signal_label, closing = (
            "Model predicted very high fraud probability (≥ 90%).",
            "Key suspicious signals",
            "We strongly recommend blocking this transaction immediately."
        )
    elif "HIGH_RISK" in decision:
        reason, signal_label, closing = (
            "Model predicted high fraud probability (70%–89%).",
            "Key suspicious signals",
            "We recommend blocking this transaction pending manual review."
        )
    elif "NEEDS_REVIEW" in decision:
        reason, signal_label, closing = (
            "Model predicted borderline probability (40%–69%).",
            "Key signals requiring attention",
            "We recommend a manual review before proceeding."
        )
    else:
        reason, signal_label, closing = (
            "Model predicted low fraud probability (< 40%).",
            "Key confirming signals",
            "The transaction seems to follow normal patterns."
        )

    prompt = f"""You are a financial fraud analyst. Output ONLY the explanation in the exact format below — no preamble, no extra commentary.

TRANSACTION FACTS:
- Decision: {decision}
- Fraud probability: {probability:.1%}
- Type: {txn_data.get("type")}
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

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={"model": OLLAMA_MODEL, "messages": [{"role": "user", "content": prompt}], "stream": False},
            timeout=60
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]
    except Exception as e:
        print(f"    Ollama failed: {e} — using fallback")
        return (
            f"This transaction appears {decision} with {probability:.1%} probability.\n\n"
            f"Reason: {reason}\n\n"
            f"Location: {city}, {region}, {country}\n\n"
            f"{closing}"
        )


# ── Main reprocessing loop ────────────────────────────────────────────────────

conn   = sqlite3.connect("fraud_detection.db")
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT id, transaction_data, location_data FROM transactions ORDER BY id")
rows = cursor.fetchall()
total = len(rows)
print(f"Reprocessing {total} transactions...\n")

for i, row in enumerate(rows, 1):
    txn_id = row["id"]
    try:
        txn_data      = json.loads(row["transaction_data"] or "{}")
        location_data = json.loads(row["location_data"]    or "{}")
    except json.JSONDecodeError:
        print(f"[{i}/{total}] ID {txn_id}: skipped (bad JSON)")
        continue

    decision, action, proba = score(txn_data, location_data)
    print(f"[{i}/{total}] ID {txn_id}: {decision}  ({proba:.4f})")

    explanation = build_explanation(txn_data, decision, proba, location_data)

    cursor.execute(
        "UPDATE transactions SET prediction=?, probability=?, action=?, explanation=? WHERE id=?",
        (decision, proba, action, explanation, txn_id)
    )
    conn.commit()

    # Brief pause so Ollama doesn't get hammered
    time.sleep(0.5)

conn.close()
print(f"\nDone — {total} transactions reprocessed.")
