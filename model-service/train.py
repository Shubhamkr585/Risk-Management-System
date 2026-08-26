"""
Model Training and Evaluation Pipeline for Customer Risk Regressor.

This script loads synthetic or MongoDB transaction data, extracts customer feature
vectors, splits datasets into training/testing subsets, trains a Random Forest regressor,
evaluates model performance metrics (MAE, R²), logs feature importances, and saves the
serialized model binary to disk (risk_model.joblib).
"""

import os
import pandas as pd
from pymongo import MongoClient
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from dotenv import load_dotenv
from model_utils import preprocess_customer_data, build_customer_risk_dataset, FEATURE_COLUMNS

# Load environment variables (.env)
load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'risk_model.joblib')
CSV_PATH = os.path.join(BASE_DIR, 'ecommerce_returns_synthetic_data.csv')

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME")


def load_training_dataframe():
    """
    Loads raw customer transactions either from the synthetic CSV dataset or MongoDB collections.

    Returns:
    - pd.DataFrame: Aggregated customer feature dataframe ready for model training.
    """
    if os.path.exists(CSV_PATH):
        print(f"Loading synthetic transaction training data from: {CSV_PATH}")
        raw_df = pd.read_csv(CSV_PATH)
        if not raw_df.empty:
            return build_customer_risk_dataset(raw_df)

    if MONGODB_URI:
        print("Connecting to MongoDB for customer training data...")
        try:
            client = MongoClient(MONGODB_URI)
            if DB_NAME:
                db = client.get_database(DB_NAME)
            else:
                db = client.get_default_database()
                if db is None:
                    db = client.get_database("CustomerReturnRiskAnalyser")
            customers_cursor = db.customers.find({})
            customers_list = list(customers_cursor)
            customers_df = pd.DataFrame(customers_list)
            if not customers_df.empty:
                print(f"Fetched {len(customers_df)} customers from MongoDB.")
                return preprocess_customer_data(customers_df)
        except Exception as e:
            print(f"Error connecting to MongoDB: {e}")

    return pd.DataFrame()


def train_model():
    """
    Executes model training, prints performance metrics and feature importances, and saves serialized model.

    Returns:
    - dict: Execution status, MAE, R², and feature importances.
    """
    data = load_training_dataframe()

    if data.empty:
        print("No customer data found. Skipping training.")
        return {"success": False, "message": "No customer data found in CSV or MongoDB."}

    print(f"Dataset successfully prepared: {len(data)} unique customer records.")
    
    # Extract feature matrix X and target array y
    X = data[FEATURE_COLUMNS]
    y = data['riskScore']

    print(f"Training parameters ({len(FEATURE_COLUMNS)} features): {FEATURE_COLUMNS}")
    print(f"Target distribution summary -> mean: {y.mean():.2f}, min: {y.min()}, max: {y.max()}")

    # Perform train-test split (80% train, 20% test)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, shuffle=True)

    print("Training Random Forest Regressor (200 trees)...")
    clf = RandomForestRegressor(n_estimators=200, random_state=42, max_depth=None)
    clf.fit(X_train, y_train)

    # Evaluate predictions on holdout test set
    y_pred = clf.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    print("--- Model Performance Metrics ---")
    print(f"Mean Absolute Error (MAE): {mae:.4f}")
    print(f"R-squared Score (R²): {r2:.4f}")

    # Calculate and print Feature Importances
    importances = dict(zip(FEATURE_COLUMNS, clf.feature_importances_))
    print("\n--- Feature Importance Breakdown ---")
    for feature, imp in sorted(importances.items(), key=lambda item: item[1], reverse=True):
        print(f"  - {feature}: {imp * 100:.2f}%")

    print(f"\nSaving trained model binary to: {MODEL_PATH}")
    joblib.dump(clf, MODEL_PATH)

    return {
        "success": True,
        "metrics": {
            "mean_absolute_error": round(mae, 4),
            "r2_score": round(r2, 4),
            "feature_importances": {k: round(v, 4) for k, v in importances.items()}
        },
    }


if __name__ == "__main__":
    train_model()
