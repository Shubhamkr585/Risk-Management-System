"""
Model Utility and Feature Engineering Engine for Risk Intelligence.

This module provides data transformation, feature extraction, and target scoring
utilities for training and serving machine learning models that predict customer
return risk and return abuse behavior.

Features Extracted:
- returnRate (float): Return percentage of orders (0-100%).
- totalReturns (int): Cumulative count of returns filed by the customer.
- totalOrders (int): Cumulative order count placed by the customer.
- totalSpent (float): Total lifetime monetary spend of the customer ($).
- daysSinceLastReturn (int): Recency signal measuring days since the last return.
- avgOrderValue (float): Average spent per transaction (totalSpent / totalOrders).
- highRiskShare (float): Share of returns associated with suspicious/high-risk reasons.
"""

import numpy as np
import pandas as pd
from datetime import datetime

# Complete parameter feature list used by ML model regressor
FEATURE_COLUMNS = [
    'returnRate',
    'totalReturns',
    'totalOrders',
    'totalSpent',
    'daysSinceLastReturn',
    'avgOrderValue',
    'highRiskShare',
]

# Business-aligned risk thresholds for categorizing predicted scores
RISK_LEVEL_THRESHOLDS = [
    ('Critical', 85),
    ('High', 70),
    ('Medium', 40),
    ('Low', 0),
]


def calculate_days_since_return(last_return_date):
    """
    Calculates the integer number of days elapsed between now and the customer's last return date.

    Parameters:
    - last_return_date (datetime | str | pd.Timestamp | None): The timestamp of the customer's last return.

    Returns:
    - int: Days elapsed since the return. Returns 3650 (10 years) if no return date exists.
    """
    if last_return_date is None or pd.isna(last_return_date):
        return 365 * 10

    if isinstance(last_return_date, str):
        try:
            last_return_date = datetime.fromisoformat(last_return_date)
        except ValueError:
            return 365 * 10

    try:
        delta = datetime.now() - last_return_date
        return max(delta.days, 0)
    except Exception:
        return 365 * 10


def calculate_customer_risk_target(return_rate, total_returns, total_orders, total_spent, days_since_last_return, avg_order_value, high_risk_share):
    """
    Computes a synthetic ground-truth target risk score (0-100) based on weighted multi-signal logic.

    Parameters:
    - return_rate (float): Percentage of orders returned (0-100%).
    - total_returns (int): Total returns submitted.
    - total_orders (int): Total orders completed.
    - total_spent (float): Total dollars spent.
    - days_since_last_return (int): Days elapsed since last return.
    - avg_order_value (float): Average monetary value per order.
    - high_risk_share (float): Percentage of returns with suspicious return reasons.

    Returns:
    - int: Risk score clipped between 0 and 100.
    """
    total_orders = max(int(total_orders or 0), 1)
    total_returns = max(int(total_returns or 0), 0)
    total_spent = float(total_spent or 0)
    return_rate = float(return_rate or 0)
    avg_order_value = float(avg_order_value or 0)
    high_risk_share = float(high_risk_share or 0)
    days_since_last_return = int(days_since_last_return or 3650)

    # 1. Recency Penalty (Recent returns < 30 days indicate elevated current risk)
    recent_return_penalty = 0.0
    if days_since_last_return <= 30:
        recent_return_penalty = 25.0
    elif days_since_last_return <= 90:
        recent_return_penalty = 10.0

    # 2. Spend Exposure Penalty (Higher spend customers have greater monetary exposure)
    spent_penalty = 0.0
    if total_spent >= 5000:
        spent_penalty = 12.0
    elif total_spent >= 2000:
        spent_penalty = 6.0

    # 3. Frequency & Reason Signals
    return_frequency_signal = min((total_returns / total_orders) * 100.0, 100.0)
    avg_order_signal = min((avg_order_value / 500.0) * 15.0, 15.0)
    risk_share_signal = min(high_risk_share * 0.35, 20.0)

    # Combine weighted feature signals
    risk_score = (
        return_rate * 0.40
        + return_frequency_signal * 0.28
        + recent_return_penalty * 0.60
        + spent_penalty * 0.70
        + avg_order_signal
        + risk_share_signal
    )

    return int(np.clip(round(risk_score), 0, 100))


def risk_level_from_score(score):
    """
    Maps a numerical risk score (0-100) to a business risk level tier.

    Parameters:
    - score (float | int): The risk score.

    Returns:
    - str: Risk category label ('Critical', 'High', 'Medium', 'Low').
    """
    for level, threshold in RISK_LEVEL_THRESHOLDS:
        if score >= threshold:
            return level
    return 'Low'


def build_customer_risk_dataset(raw_df):
    """
    Aggregates raw transaction records into a customer-level feature dataset for model training.

    Parameters:
    - raw_df (pd.DataFrame): Raw transactional data containing orders and returns.

    Returns:
    - pd.DataFrame: Processed dataframe containing feature columns and target risk scores.
    """
    if raw_df is None or raw_df.empty:
        return pd.DataFrame()

    df = raw_df.copy()
    required_columns = {'User_ID', 'Order_ID', 'Product_Price', 'Order_Quantity', 'Return_Status'}
    missing = required_columns - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns for feature engineering: {sorted(missing)}")

    # Calculate monetary value per transaction line
    df['Order_Amount'] = pd.to_numeric(df['Product_Price'], errors='coerce').fillna(0.0) * pd.to_numeric(df['Order_Quantity'], errors='coerce').fillna(0)
    df['Is_Returned'] = df['Return_Status'].astype(str).str.strip().str.lower().eq('returned').astype(int)
    df['Return_Reason'] = df.get('Return_Reason', pd.Series(['Unknown'] * len(df)))
    
    # High-risk suspicious reason flag
    suspicious_keywords = ['defective', 'wrong item', 'not as described', 'empty box', 'damaged']
    df['HighRiskReason'] = df['Return_Reason'].fillna('Unknown').astype(str).str.lower().apply(
        lambda r: 1 if any(kw in r for kw in suspicious_keywords) else 0
    )

    # Convert Return_Date string to datetime
    df['Return_Date_Parsed'] = pd.to_datetime(df['Return_Date'], errors='coerce')

    # Aggregate by customer User_ID
    customer_df = df.groupby('User_ID', as_index=False).agg(
        totalOrders=('Order_ID', 'count'),
        totalReturns=('Is_Returned', 'sum'),
        totalSpent=('Order_Amount', 'sum'),
        highRiskReturns=('HighRiskReason', 'sum'),
        lastReturnDate=('Return_Date_Parsed', lambda s: s.dropna().max() if s.notna().any() else pd.NaT),
    )

    # Compute derived ratio features
    customer_df['returnRate'] = np.where(
        customer_df['totalOrders'] > 0,
        (customer_df['totalReturns'] / customer_df['totalOrders']) * 100,
        0.0,
    )
    customer_df['avgOrderValue'] = np.where(
        customer_df['totalOrders'] > 0,
        customer_df['totalSpent'] / customer_df['totalOrders'],
        0.0,
    )
    customer_df['daysSinceLastReturn'] = customer_df['lastReturnDate'].apply(calculate_days_since_return)
    customer_df['highRiskShare'] = np.where(
        customer_df['totalOrders'] > 0,
        (customer_df['highRiskReturns'] / customer_df['totalOrders']) * 100,
        0.0,
    )

    # Compute target risk score and level
    customer_df['riskScore'] = customer_df.apply(
        lambda row: calculate_customer_risk_target(
            row['returnRate'],
            row['totalReturns'],
            row['totalOrders'],
            row['totalSpent'],
            row['daysSinceLastReturn'],
            row['avgOrderValue'],
            row['highRiskShare'],
        ),
        axis=1,
    )
    customer_df['riskLevel'] = customer_df['riskScore'].apply(risk_level_from_score)

    return customer_df[FEATURE_COLUMNS + ['riskScore', 'riskLevel']]


def preprocess_customer_data(customers_df):
    """
    Preprocesses customer MongoDB document exports for model evaluation or training.

    Parameters:
    - customers_df (pd.DataFrame): Dataframe of customer documents.

    Returns:
    - pd.DataFrame: Standardized feature dataset.
    """
    if customers_df.empty:
        return pd.DataFrame()

    df = customers_df.copy()
    for column in ['returnRate', 'totalReturns', 'totalOrders', 'totalSpent']:
        if column not in df.columns:
            df[column] = 0

    df['returnRate'] = df['returnRate'].fillna(0).astype(float)
    df['totalReturns'] = df['totalReturns'].fillna(0).astype(int)
    df['totalOrders'] = df['totalOrders'].fillna(0).astype(int)
    df['totalSpent'] = df['totalSpent'].fillna(0).astype(float)
    df['daysSinceLastReturn'] = df.get('lastReturnDate', pd.Series([None] * len(df))).apply(calculate_days_since_return)
    df['avgOrderValue'] = np.where(df['totalOrders'] > 0, df['totalSpent'] / df['totalOrders'], 0.0)
    df['highRiskShare'] = 0.0

    df['riskScore'] = df.apply(
        lambda row: calculate_customer_risk_target(
            row['returnRate'],
            row['totalReturns'],
            row['totalOrders'],
            row['totalSpent'],
            row['daysSinceLastReturn'],
            row['avgOrderValue'],
            row['highRiskShare'],
        ),
        axis=1,
    )
    df['riskLevel'] = df['riskScore'].apply(risk_level_from_score)

    return df[FEATURE_COLUMNS + ['riskScore', 'riskLevel']]


def prepare_features_for_prediction(data):
    """
    Converts a single customer dictionary payload into a 1-row DataFrame matched to FEATURE_COLUMNS.

    Parameters:
    - data (dict): Dictionary input from API prediction request.

    Returns:
    - pd.DataFrame: Single row DataFrame aligned with model features.
    """
    df = pd.DataFrame([data])

    total_orders = int(df.at[0, 'totalOrders'] if 'totalOrders' in df.columns and df.at[0, 'totalOrders'] is not None else 0)
    total_returns = int(df.at[0, 'totalReturns'] if 'totalReturns' in df.columns and df.at[0, 'totalReturns'] is not None else 0)
    total_spent = float(df.at[0, 'totalSpent'] if 'totalSpent' in df.columns and df.at[0, 'totalSpent'] is not None else 0.0)

    if 'returnRate' not in df.columns or df.at[0, 'returnRate'] is None:
        df['returnRate'] = 0.0
        if total_orders > 0:
            df.at[0, 'returnRate'] = min((total_returns / total_orders) * 100, 100)

    df['avgOrderValue'] = (total_spent / total_orders) if total_orders > 0 else 0.0
    df['highRiskShare'] = float(data.get('highRiskShare', 0.0))

    for column in FEATURE_COLUMNS:
        if column not in df.columns:
            df[column] = 0

    df['returnRate'] = df['returnRate'].fillna(0).astype(float)
    df['totalReturns'] = df['totalReturns'].fillna(0).astype(int)
    df['totalOrders'] = df['totalOrders'].fillna(0).astype(int)
    df['totalSpent'] = df['totalSpent'].fillna(0).astype(float)
    df['daysSinceLastReturn'] = df.apply(
        lambda row: calculate_days_since_return(row.get('lastReturnDate')) if 'lastReturnDate' in row else 3650,
        axis=1,
    )

    return df[FEATURE_COLUMNS]