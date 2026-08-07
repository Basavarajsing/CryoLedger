const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['admin', 'user', 'distributor', 'retailer'],
        required: true
    },
    email: {
        type: String,
        default: ""
    }
    profilePhoto: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

