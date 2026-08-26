// backend/models/Return.js
import mongoose from 'mongoose';

const ReturnSchema = new mongoose.Schema(
  {
    returnId: { // Unique ID for each return (e.g., RET001)
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    orderId: { // NEW: Order ID
      type: String,
      required: true,
      trim: true,
    },
    customer: { // Reference to the Customer who made the return
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    customerId: { // Store customerId for easier lookup/display without populate
      type: String,
      required: true,
      ref: 'Customer',
    },
    customerName: { // Store customer name for easier display
      type: String,
      required: true,
    },
    product: { // Name of the product returned
      type: String,
      required: true,
      trim: true,
    },
    productSku: { // NEW: Product SKU
      type: String,
      trim: true,
    },
    productCategory: { // NEW: Product Category
      type: String,
      trim: true,
    },
    productPrice: { // NEW: Product Price
      type: Number,
      required: true,
      min: 0,
    },
    reason: { // Reason for the return
      type: String,
      required: true,
      enum: ['Defective item', 'Wrong size/color', 'Not as described', 'Changed mind', 'Damaged in transit', 'Performance issues', 'Other'],
    },
    status: { // NEW: Return Status
      type: String,
      required: true,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    returnDate: { // Date of the return
      type: Date,
      default: Date.now,
    },
    responseTime: { // NEW: Response time
      type: String,
    },
    images: { // NEW: Array of image URLs
      type: [String],
      default: [],
    },
    adminNotes: { // NEW: Admin Notes
      type: String,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    flags: { // NEW: Risk flags (from your data dump)
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Remove duplicate indexes - keep only one method
ReturnSchema.index({ customer: 1 });
ReturnSchema.index({ returnId: 1 });
ReturnSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const Return = mongoose.model('Return', ReturnSchema);

export default Return;
