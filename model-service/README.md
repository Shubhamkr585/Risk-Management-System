# Risk Analysis Model Service

This is a Python/FastAPI microservice for training and serving the risk analysis model.

## Setup

1.  **Install Dependencies**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Environment Variables**
    Create a `.env` file in this directory (copy from `.env.example`) and add your MongoDB connection string:
    ```
    MONGODB_URI=mongodb://localhost:27017/risk-analyser
    PORT=8000
    ```

## Usage

1.  **Start the Server**
    ```bash
    python -m uvicorn main:app --reload
    ```
    The API will be available at `http://localhost:8000`.

2.  **Train the Model**
    Send a POST request to trigger training using your MongoDB data:
    ```bash
    curl -X POST http://localhost:8000/train
    ```

3.  **Seed Data (Optional)**
    If you have less than 500 records, generate synthetic data:
    ```bash
    python seed_data.py
    ```

4.  **Get Predictions**
    Send a POST request to get a risk score:
    ```bash
    curl -X POST http://localhost:8000/predict \
      -H "Content-Type: application/json" \
      -d '{
        "returnRate": 15.5,
        "totalReturns": 5,
        "totalOrders": 20,
        "productPrice": 100.0
      }'
    ```

## Files
- `main.py`: The API server.
- `train.py`: Logic to fetch data from Mongo and train the model.
- `model_utils.py`: Helper functions for data processing.
