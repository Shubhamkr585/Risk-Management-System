import mongoose from 'mongoose';

const RiskAlertSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    riskLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      required: true,
    },
    alertType: {
      type: String,
      enum: ['warning_email', 'manual_review', 'escalation'],
      default: 'warning_email',
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'ignored'],
      default: 'pending',
    },
    message: {
      type: String,
      trim: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    triggeredAt: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

RiskAlertSchema.index({ customer: 1, alertType: 1, riskLevel: 1, triggeredAt: -1 });

const RiskAlert = mongoose.model('RiskAlert', RiskAlertSchema);

export default RiskAlert;
