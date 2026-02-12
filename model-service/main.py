from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import os
import pandas as pd
from train import train_model
from model_utils import prepare_features_for_prediction

app = FastAPI(title="Risk Analysis Model Service")

# Global model variable
model = None

class PredictionRequest(BaseModel):
    returnRate: float
    totalReturns: int
    totalOrders: int
    productPrice: float

class TrainingResponse(BaseModel):
    success: bool
    message: str
    accuracy: float = None

@app.on_event("startup")
def load_model():
    global model
    model_path = "risk_model.joblib"
    if os.path.exists(model_path):
        try:
            model = joblib.load(model_path)
            print("Model loaded successfully.")
        except Exception as e:
            print(f"Failed to load model: {e}")
    else:
        print("No trained model found. Please trigger training.")

@app.get("/")
def read_root():
    return {"message": "Risk Analysis Model Service is running"}

@app.post("/train", response_model=TrainingResponse)
def trigger_training():
    global model
    try:
        result = train_model()
        if result["success"]:
            # Reload the model
            model = joblib.load("risk_model.joblib")
            return {
                "success": True, 
                "message": "Training completed successfully", 
                "accuracy": result.get("accuracy")
            }
        else:
            return {
                "success": False, 
                "message": f"Training failed: {result.get('error')}"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict")
def predict_risk(request: PredictionRequest):
    global model
    if model is None:
        raise HTTPException(status_code=400, detail="Model not trained yet. Call /train first.")
    
    try:
        # Convert request to DataFrame
        data = request.dict()
        input_df = prepare_features_for_prediction(data)
        
        # Predict
        prediction = model.predict(input_df)[0] # 0 or 1
        probability = model.predict_proba(input_df)[0][1] # Probability of being 1 (Rejected)
        
        return {
            "risk_score": float(probability * 100), # 0-100 score
            "recommendation": "Reject" if prediction == 1 else "Approve",
            "is_rejected_prediction": int(prediction)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
