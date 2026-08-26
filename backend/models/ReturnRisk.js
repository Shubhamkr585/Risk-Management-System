import mongoose from 'mongoose';

// ReturnRisk Schema: Stores the calculated return risk for each customer.
const ReturnRiskSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer', // Reference to the Customer model
        required: true,
        unique: true // Ensure one risk entry per customer
    },
    riskScore: {
        type: Number,
        required: true,
        min: 0,
        max: 100 // Example: score from 0 to 100
    },
    riskLevel: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Critical'],
        required: true
    },
    source: {
        type: String,
        enum: ['local', 'model', 'hybrid'],
        default: 'local',
    },
    modelVersion: {
        type: String,
        default: 'unknown',
    },
    fallbackUsed: {
        type: Boolean,
        default: false,
    },
    analysisDate: {
        type: Date,
        default: Date.now
    },
    // You can add more fields based on your risk analysis algorithm
    // e.g., factors contributing to the score, recommendations, etc.
    factors: {
        type: Map, // Stores key-value pairs of contributing factors
        of: Number
    },
    recommendations: {
        type: [String] // Array of strings for actions/recommendations
    }
});

const ReturnRisk = mongoose.model('ReturnRisk', ReturnRiskSchema);

export default ReturnRisk;
