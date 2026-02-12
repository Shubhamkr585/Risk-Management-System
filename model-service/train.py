import os
import pandas as pd
from pymongo import MongoClient
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from dotenv import load_dotenv
from model_utils import preprocess_return_data

# Load environment variables
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = "risk-analyser" # Default, can be overridden if needed or parsed from URI

def train_model():
    print("Connecting to MongoDB...")
    try:
        client = MongoClient(MONGODB_URI)
        db = client.get_database(DB_NAME) 
        # If DB name is in URI, client.get_database() (no args) might work, but safer to specify if known or extract. 
        # For now let's assume 'risk-analyser' based on user's previous context, or try to get default.
        if db is None:
             db = client.get_default_database()
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
        return {"success": False, "error": str(e)}

    print("Fetching data...")
    # Fetch Returns
    returns_cursor = db.returns.find({})
    returns_list = list(returns_cursor)
    returns_df = pd.DataFrame(returns_list)
    print(f"Fetched {len(returns_df)} returns.")

    # Fetch Customers
    customers_cursor = db.customers.find({})
    customers_list = list(customers_cursor)
    customers_df = pd.DataFrame(customers_list)
    print(f"Fetched {len(customers_df)} customers.")

    if returns_df.empty:
        print("No return data found. Skipping training.")
        return {"success": False, "message": "No return data found."}

    print("Preprocessing data...")
    data = preprocess_return_data(returns_df, customers_df)
    
    if data.empty:
        print("Data extraction failed or insufficient data.")
        return {"success": False, "error": "Data preprocessing failed"}

    X = data.drop(columns=['is_rejected'])
    y = data['is_rejected']

    # Check class balance
    print("Class distribution:\n", y.value_counts())

    if len(y.unique()) < 2:
        print("Warning: Only one class present in target. Model might be biased.")

    # Split Data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Train Model
    print("Training Random Forest...")
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)

    # Evaluate
    y_pred = clf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"Model Accuracy: {accuracy:.4f}")
    print(classification_report(y_test, y_pred))

    # Save Model
    print("Saving model...")
    joblib.dump(clf, "risk_model.joblib")
    
    return {
        "success": True, 
        "accuracy": accuracy, 
        "metrics": classification_report(y_test, y_pred, output_dict=True)
    }

if __name__ == "__main__":
    train_model()
