from fastapi import FastAPI, HTTPException
from typing import Optional
from pydantic import BaseModel
import joblib
import os
from datetime import datetime
from train import train_model
from model_utils import prepare_features_for_prediction, risk_level_from_score

app = FastAPI(title="Risk Analysis Model Service")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'risk_model.joblib')

# Global model variable
model = None

class PredictionRequest(BaseModel):
    returnRate: Optional[float] = 0.0
    totalReturns: Optional[int] = 0
    totalOrders: Optional[int] = 0
    totalSpent: Optional[float] = 0.0
    lastReturnDate: Optional[datetime] = None

class TrainingResponse(BaseModel):
    success: bool
    message: str
    warning: Optional[str] = None
    metrics: Optional[dict] = None

@app.on_event("startup")
def load_model():
    global model
    if os.path.exists(MODEL_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            print(f"Model loaded successfully from {MODEL_PATH}.")
        except Exception as e:
            print(f"Failed to load model: {e}")
    else:
        print(f"No trained model found at {MODEL_PATH}. Please trigger training.")

@app.get("/")
def read_root():
    return {"message": "Risk Analysis Model Service is running"}

@app.post("/train", response_model=TrainingResponse)
def trigger_training():
    global model
    try:
        result = train_model()
        if result["success"]:
            model = joblib.load(MODEL_PATH)
            response = {
                "success": True,
                "message": "Training completed successfully",
                "warning": result.get("warning"),
                "metrics": result.get("metrics"),
            }
            return response
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
        data = request.dict()
        input_df = prepare_features_for_prediction(data)

        prediction = model.predict(input_df)[0]
        risk_score = float(max(0.0, min(prediction, 100.0)))
        risk_level = risk_level_from_score(risk_score)

        return {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "recommendation": "Monitor closely" if risk_level in ['High', 'Critical'] else "No immediate action",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
