const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema({
  verifierLocation: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  matchedCenter: { type: String, default: null },
  status: { type: String, required: true }, // e.g. "Authorized Center Verified", "Unauthorized Location", "Pending Approval", etc.
  username: { type: String, default: "" },
  role: { type: String, default: "" },
  neglected: { type: Boolean, default: false },
  verifiedAt: { type: Date, default: Date.now }
});

const CenterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true }
});

const JourneySchema = new mongoose.Schema({
  stage: { type: String, required: true }, // 'Manufacturer', 'Distributor', 'Retailer', 'Customer'
  entityId: { type: String, default: "" }, // e.g. distributorId, retailerId
  name: { type: String, default: "" }, // entity name
  action: { type: String, required: true }, // 'Registered', 'Assigned', 'Received', 'Purchased'
  timestamp: { type: Date, default: Date.now },
  location: { type: String, default: "" },
  verified: { type: Boolean, default: true }
});

const ProductSchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  manufacturerName: { type: String, required: true },
  manufacturerAddress: { type: String, default: "" },
  manufacturerLocation: {
    address: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  authorizedCenters: [CenterSchema],
  qrCodePath: { type: String, default: "" },
  scanCount: { type: Number, default: 0 },
  verificationHistory: [HistorySchema],

  // Digital Passport
  brand: { type: String, default: "" },
  category: { type: String, default: "" },
  modelNumber: { type: String, default: "" },
  batchNumber: { type: String, default: "" },
  expiryDate: { type: Date, default: null },
  productImage: { type: String, default: "" },
  warrantyDetails: { type: String, default: "" },

  // Smart Warranty
  warrantyAvailable: { type: Boolean, default: false },
  warrantyPeriod: { type: Number, default: 0 }, // in months
  warrantyType: { type: String, default: "" },
  warrantyTerms: { type: String, default: "" },
  warrantyActivated: { type: Boolean, default: false },
  warrantyStartDate: { type: Date, default: null },
  warrantyEndDate: { type: Date, default: null },
  warrantyStatus: { type: String, default: 'Inactive' }, // 'Inactive', 'Active', 'Expired'

  // Product Recall Management
  isRecalled: { type: Boolean, default: false },
  recallReason: { type: String, default: "" },
  recallDate: { type: Date, default: null },
  recallSeverity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Low' },
  recallInstructions: { type: String, default: "" },
  recallRefundAvailable: { type: Boolean, default: false },
  recallNearestCentre: { type: String, default: "" },
  isReturnedForRecall: { type: Boolean, default: false },
  returnedByRole: { type: String, default: "" },
  returnedByUsername: { type: String, default: "" },
  targetCustomer: { type: String, default: "" },

  // Authorized Supply Chain Tracking
  distributorId: { type: String, default: "" },
  distributorStatus: { type: String, enum: ['Pending', 'Assigned', 'Received', 'Dispatched'], default: 'Pending' },
  distributorReceivedAt: { type: Date, default: null },
  retailerId: { type: String, default: "" },
  retailerStatus: { type: String, enum: ['Pending', 'Assigned', 'Received', 'Dispatched'], default: 'Pending' },
  retailerReceivedAt: { type: Date, default: null },
  createdByAdmin: { type: String, default: "" },
  supplyChainJourney: [JourneySchema]
}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);
