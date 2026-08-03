const mongoose = require('mongoose');

const AccessRequestSchema = new mongoose.Schema({
    productId: { type: String, required: true, index: true },
    requestedLocation: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    approved: { type: Boolean, default: false },
    username: { type: String, default: "" },
    role: { type: String, default: "" },
    email: { type: String, default: "" }
}, { timestamps: true });

// Prevent duplicate pending or approved requests for the same product in a similar location
// A location is similar if its lat/lng are within about ~10 meters (which is roughly 0.0001 decimal degrees)
// We will perform similarity checks inside routes, but here we can define the schema
module.exports = mongoose.model('AccessRequest', AccessRequestSchema);
