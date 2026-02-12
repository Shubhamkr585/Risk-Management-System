import pandas as pd
import numpy as np
from datetime import datetime

def calculate_days_since_return(last_return_date):
    if pd.isna(last_return_date):
        return 365 * 10  # Large number if no return
    try:
        # success if it's already a datetime object
        delta = datetime.now() - last_return_date
        return delta.days
    except TypeError:
        # unexpected format
        return 365 * 10

def preprocess_return_data(returns_df, customers_df):
    """
    Preprocesses the raw Mongo data into a format suitable for training.
    """
    if returns_df.empty:
        return pd.DataFrame()

    # Ensure customerId is present in returns
    if 'customerId' not in returns_df.columns:
        print("Warning: 'customerId' missing from returns data")
        return pd.DataFrame()
        
    merged_df = returns_df.copy()

    if not customers_df.empty:
        # Merge returns with customers on 'customerId'
        # We need to ensure types match for merging. Usually they are strings in your schema.
        merged_df['customerId'] = merged_df['customerId'].astype(str)
        customers_df['customerId'] = customers_df['customerId'].astype(str)
        
        merged_df = pd.merge(merged_df, customers_df, on='customerId', how='left', suffixes=('', '_cust'))
    else:
        print("Warning: No customer data found, using defaults for customer features")
        # Add missing columns with defaults if no customer data
        merged_df['returnRate'] = 0
        merged_df['totalReturns'] = 0
        merged_df['totalOrders'] = 0

    # Feature Engineering
    # Fill NaNs for features we expect
    merged_df['returnRate'] = merged_df['returnRate'].fillna(0)
    merged_df['totalReturns'] = merged_df['totalReturns'].fillna(0)
    merged_df['totalOrders'] = merged_df['totalOrders'].fillna(0)
    merged_df['productPrice'] = merged_df['productPrice'].fillna(0)
    
    # Select numeric features for Random Forest
    features = ['returnRate', 'totalReturns', 'totalOrders', 'productPrice']
    
    # Target: 1 if Rejected, 0 otherwise
    if 'status' in merged_df.columns:
        merged_df['is_rejected'] = merged_df['status'].apply(lambda x: 1 if x == 'Rejected' else 0)
    else:
        # If testing without status
        merged_df['is_rejected'] = 0
    
    # Final check on feature columns existence
    for col in features:
        if col not in merged_df.columns:
            merged_df[col] = 0
            
    # Return features + target
    return merged_df[features + ['is_rejected']]

def prepare_features_for_prediction(data):
    """
    Prepares a single data point for prediction.
    Expects a dictionary with keys: returnRate, totalReturns, totalOrders, productPrice
    """
    features_list = ['returnRate', 'totalReturns', 'totalOrders', 'productPrice']
    
    # Create DataFrame with 1 row
    df = pd.DataFrame([data])
    
    # Ensure all columns exist, fill with 0 if missing
    for col in features_list:
        if col not in df.columns:
            df[col] = 0
            
    # Reorder columns to match training
    return df[features_list]
