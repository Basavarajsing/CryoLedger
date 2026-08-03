const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    recipient: {
        type: String,
        required: true,
        index: true
    },
    recipientRole: {
        type: String,
        enum: ['admin', 'user', 'distributor', 'retailer'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    read: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);
