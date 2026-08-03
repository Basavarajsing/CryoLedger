require("dotenv").config({ override: true });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const Product = require('./models/Product');
const AccessRequest = require('./models/AccessRequest');
const User = require('./models/User');
const Distributor = require('./models/Distributor');
const Retailer = require('./models/Retailer');
const Notification = require('./models/Notification');
const { sendAssignEmail } = require('./utils/mailHelper');
const EmailService = require('./services/emailService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cryoledger_jwt_secret_key_8492049';

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error("CRITICAL ERROR: MONGODB_URI is not set in the environment or .env file.");
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
// Ensure qrcodes directory exists and serve it
const qrCodesDir = path.join(__dirname, 'public', 'qrcodes');
if (!fs.existsSync(qrCodesDir)) {
    fs.mkdirSync(qrCodesDir, { recursive: true });
}

// Connect to MongoDB
const dbName = process.env.NODE_ENV === 'test' ? 'cryoledger_test' : 'cryoledger';
mongoose.connect(MONGO_URI, { dbName })
    .then(() => console.log(`Connected to MongoDB Atlas (Database: ${dbName})`))
    .catch((err) => {
        console.error('MongoDB Atlas connection error:', err.message);
        process.exit(1);
    });

// Haversine formula to compute distance in meters between two lat/lng coordinates
function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Dist in meters
}

// Helper to check geographical proximity
function isNearLocation(lat1, lon1, lat2, lon2, maxDistanceMeters = 100) {
    const dist = getHaversineDistance(lat1, lon1, lat2, lon2);
    return dist <= maxDistanceMeters;
}

// ===================================
// AUTHENTICATION MIDDLEWARE & ROUTING
// ===================================

function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1]; // Authorization: Bearer <token>
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({ success: false, message: "Forbidden: Invalid or expired token." });
            }
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ success: false, message: "Unauthorized: Access token missing." });
    }
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ success: false, message: `Access denied: Requires ${role} role.` });
        }
        next();
    };
}

function requireAnyRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: `Access denied: Requires one of [${roles.join(', ')}] roles.` });
        }
        next();
    };
}

// Auth API Endpoints
// Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role, email } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: "Username, password and role are required." });
        }
        if (role !== 'admin' && role !== 'user' && role !== 'distributor' && role !== 'retailer') {
            return res.status(400).json({ success: false, message: "Invalid role value." });
        }

        if (!email) {
            return res.status(400).json({ success: false, message: "Email address is required." });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "Invalid email format." });
        }
        const existingEmailUser = await User.findOne({ email: email.toLowerCase() });
        if (existingEmailUser) {
            return res.status(400).json({ success: false, message: "Email address already registered." });
        }

        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username: username.toLowerCase(),
            password: hashedPassword,
            role,
            email: email.toLowerCase()
        });
        await newUser.save();

        // Auto send Welcome Email (Event 1)
        EmailService.sendWelcomeEmail(newUser.email, { username: newUser.username, role: newUser.role })
            .catch(err => console.error("[EmailServiceError] Welcome email failed:", err.message));

        res.status(201).json({ success: true, message: "User registered successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Registration failed.", error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: "Username, password and portal role check are required." });
        }

        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user || user.role !== role) {
            return res.status(401).json({ success: false, message: "Invalid credentials or account role mismatch." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        const token = jwt.sign(
            { userId: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Event 23: New Device Login Alert
        const userAgentStr = req.headers['user-agent'] || '';
        let browser = 'Unknown Browser';
        let os = 'Unknown OS';

        if (/chrome|crios/i.test(userAgentStr)) browser = 'Chrome';
        else if (/firefox|fxios/i.test(userAgentStr)) browser = 'Firefox';
        else if (/safari/i.test(userAgentStr)) browser = 'Safari';
        else if (/edg/i.test(userAgentStr)) browser = 'Edge';
        else if (/opr/i.test(userAgentStr)) browser = 'Opera';

        if (/windows/i.test(userAgentStr)) os = 'Windows';
        else if (/macintosh|mac os x/i.test(userAgentStr)) os = 'macOS';
        else if (/linux/i.test(userAgentStr)) os = 'Linux';
        else if (/android/i.test(userAgentStr)) os = 'Android';
        else if (/iphone|ipad|ipod/i.test(userAgentStr)) os = 'iOS';

        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

        if (user.email) {
            EmailService.sendNewDeviceLoginEmail(user.email, {
                username: user.username,
                browser,
                os,
                ip: clientIp,
                time: new Date().toLocaleString()
            }).catch(err => console.error("[EmailServiceError] Login alert email failed:", err.message));
        }

        res.json({
            success: true,
            message: "Login successful.",
            token,
            role: user.role
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Login failed.", error: error.message });
    }
});

// Forgot Password API Endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { username, email } = req.body;
        if (!username || !email) {
            return res.status(400).json({ success: false, message: "Username and email details are required." });
        }

        const user = await User.findOne({ username: username.toLowerCase(), email: email.trim().toLowerCase() });
        if (!user) {
            // Keep status generic for security details exposure protection
            return res.json({ success: true, message: "If details match, a credentials reset link has been dispatched." });
        }

        // Generate stateless reset JWT token valid for 15 minutes
        const resetToken = jwt.sign({ resetUsername: user.username }, JWT_SECRET, { expiresIn: '15m' });
        const host = req.headers.host || `localhost:${PORT}`;
        const protocol = req.secure ? 'https' : 'http';
        const resetLink = `${protocol}://${host}/reset-password.html?token=${encodeURIComponent(resetToken)}`;

        EmailService.sendPasswordResetEmail(user.email, {
            username: user.username,
            resetLink,
            expiryTime: '15 Minutes'
        }).catch(err => console.error("[EmailServiceError] Password reset email failed:", err));

        res.json({ success: true, message: "If details match, a credentials reset link has been dispatched." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Password reset request failed.", error: error.message });
    }
});

// Reset Password API Endpoint
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ success: false, message: "Verify token and new password are required." });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            return res.status(400).json({ success: false, message: "Reset token is invalid or has expired." });
        }

        const user = await User.findOne({ username: decoded.resetUsername });
        if (!user) {
            return res.status(404).json({ success: false, message: "User linked to token not found." });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        if (user.email) {
            EmailService.sendPasswordChangedEmail(user.email, { username: user.username })
                .catch(err => console.error("[EmailServiceError] Password changed email failed:", err));
        }

        res.json({ success: true, message: "Password credential updated successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Password reset operation failed.", error: error.message });
    }
});

// ===================================
// BACKEND API ROUTES
// ===================================

// 1. Add Product
app.post('/add-product', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const {
            productId,
            name,
            manufacturerName,
            manufacturerAddress,
            manufacturerLocation,
            authorizedCenters,
            brand,
            category,
            modelNumber,
            batchNumber,
            expiryDate,
            productImage,
            warrantyAvailable,
            warrantyPeriod,
            warrantyType,
            warrantyTerms
        } = req.body;

        if (!productId || !name || !manufacturerName || !manufacturerLocation) {
            return res.status(400).json({ success: false, message: "Missing required product registration fields." });
        }

        if (!manufacturerLocation.address || manufacturerLocation.latitude == null || manufacturerLocation.longitude == null) {
            return res.status(400).json({ success: false, message: "Invalid manufacturer location." });
        }

        if (!authorizedCenters || !Array.isArray(authorizedCenters) || authorizedCenters.length === 0) {
            return res.status(400).json({ success: false, message: "At least one authorized center is required." });
        }

        const existingProduct = await Product.findOne({ productId });
        if (existingProduct) {
            return res.status(400).json({ success: false, message: `Product ID "${productId}" already exists.` });
        }

        // Generate QR code
        const host = req.headers.host || `localhost:${PORT}`;
        const protocol = req.secure ? 'https' : 'http';
        const verifyUrl = `${protocol}://${host}/verify.html?productId=${encodeURIComponent(productId)}`;
        const qrFileName = `${productId.replace(/[^a-zA-Z0-9-_]/g, '_')}_qr.png`;
        const qrFilePath = path.join(qrCodesDir, qrFileName);

        await QRCode.toFile(qrFilePath, verifyUrl, {
            color: {
                dark: '#0f172a',  // Dark navy
                light: '#ffffff'  // White
            },
            width: 300
        });

        const qrCodePath = `/qrcodes/${qrFileName}`;

        // Initialize supply chain journey with the manufacturer record
        const initialJourney = [{
            stage: 'Manufacturer',
            entityId: manufacturerName,
            name: manufacturerName,
            action: 'Registered',
            timestamp: new Date(),
            location: manufacturerLocation.address,
            verified: true
        }];

        const hasWarranty = warrantyAvailable === 'Yes' || warrantyAvailable === true;

        const newProduct = new Product({
            productId,
            name,
            manufacturerName,
            manufacturerAddress: manufacturerAddress || "",
            manufacturerLocation,
            authorizedCenters,
            qrCodePath,
            createdByAdmin: req.user.username,
            // Passport
            brand: brand || "",
            category: category || "",
            modelNumber: modelNumber || "",
            batchNumber: batchNumber || "",
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            productImage: productImage || "",
            warrantyDetails: warrantyTerms || "",
            // Warranty System
            warrantyAvailable: hasWarranty,
            warrantyPeriod: hasWarranty ? parseInt(warrantyPeriod) || 0 : 0,
            warrantyType: hasWarranty ? warrantyType || "" : "",
            warrantyTerms: hasWarranty ? warrantyTerms || "" : "",
            warrantyActivated: false,
            warrantyStatus: 'Inactive',
            // Supply Chain Track
            supplyChainJourney: initialJourney
        });

        await newProduct.save();

        // Event 4: Manufacturer Added Product
        if (req.user && req.user.email) {
            EmailService.sendManufacturerAddedProductEmail(req.user.email, {
                username: req.user.username,
                productId: newProduct.productId,
                productName: newProduct.name,
                creationTime: (newProduct.createdAt || new Date()).toLocaleString(),
                authorizedCenters: newProduct.authorizedCenters.map(c => c.name).join(', ')
            }).catch(err => console.error("[EmailServiceError] Manufacturer added product email failed:", err.message));
        }

        // Also notify manager
        const adminUsers = await User.find({ role: 'admin' });
        adminUsers.forEach(admin => {
            if (admin.email && admin.email !== req.user.email) {
                EmailService.sendManufacturerAddedProductEmail(admin.email, {
                    username: admin.username,
                    productId: newProduct.productId,
                    productName: newProduct.name,
                    creationTime: (newProduct.createdAt || new Date()).toLocaleString(),
                    authorizedCenters: newProduct.authorizedCenters.map(c => c.name).join(', ')
                }).catch(err => console.error("[EmailServiceError] Manager product added notification failed:", err.message));
            }
        });

        res.status(201).json({
            success: true,
            message: "Product registered successfully.",
            data: newProduct
        });
    } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).json({ success: false, message: "Failed to register product.", error: error.message });
    }
});

// 2. Get Products Listing
app.get('/products', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const products = await Product.find({ createdByAdmin: req.user.username }, 'productId name manufacturerName manufacturerAddress authorizedCenters qrCodePath scanCount createdAt');
        res.json({ success: true, message: "Products retrieved.", data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch products.", error: error.message });
    }
});

// 3. Get Product Details (Only if authorized/approved or just checking metadata)
// Note: When calling this via product records, we can display generic info.
app.get('/product/:productId', authenticateJWT, async (req, res) => {
    try {
        const product = await Product.findOne({ productId: req.params.productId });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Designated customer access lock
        if (product.targetCustomer && req.user && req.user.role === 'user') {
            if (product.targetCustomer !== req.user.username.toLowerCase()) {
                return res.status(403).json({ success: false, message: "Access Denied: You are not the designated recipient of this product." });
            }
        }

        // Cascading access block if returned for recall
        if (product.isReturnedForRecall) {
            const reqRole = req.user && req.user.role ? req.user.role : "";
            if (product.returnedByRole === 'distributor') {
                if (reqRole === 'retailer' || reqRole === 'user') {
                    return res.status(403).json({ success: false, message: "Access Denied: Product returned by distributor for recall." });
                }
            } else if (product.returnedByRole === 'retailer') {
                if (reqRole === 'user') {
                    return res.status(403).json({ success: false, message: "Access Denied: Product returned by retailer for recall." });
                }
            }
        }

        res.json({ success: true, message: "Product details retrieved.", data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching product details.", error: error.message });
    }
});

// Public Endpoint: Visitor trust and safety stats & live feed
app.get('/api/public/stats', async (req, res) => {
    try {
        const registered = await Product.countDocuments();

        // Count protected (warranty available)
        const protectedCount = await Product.countDocuments({ warrantyAvailable: true });

        // Sum scans + count all verifications from histories
        const allProds = await Product.find({}, 'verificationHistory scanCount');
        let verificationAttempts = 0;
        let activeLeaksBlock = 0;
        let logsList = [];

        allProds.forEach(p => {
            verificationAttempts += (p.scanCount || 0);
            if (p.verificationHistory && p.verificationHistory.length > 0) {
                p.verificationHistory.forEach(h => {
                    if (h.status === 'Unauthorized Location') {
                        activeLeaksBlock++;
                    }
                    logsList.push({
                        productId: p.productId,
                        status: h.status,
                        verifiedAt: h.verifiedAt
                    });
                });
            }
        });

        // Sort to get last 5
        logsList.sort((a, b) => new Date(b.verifiedAt) - new Date(a.verifiedAt));
        const recentAlerts = logsList.slice(0, 5).map(lg => {
            const shortId = lg.productId ? lg.productId.substring(0, 8) : 'UNKNOWN';
            let label = '';
            let styleClass = 'success';
            if (lg.status === 'Authorized Center Verified' || lg.status === 'Authorized Centre Verified') {
                label = `Product [${shortId}...] securely authenticated at Depot/Outlet.`;
            } else if (lg.status === 'Admin Approved') {
                label = `Product [${shortId}...] verify request approved.`;
            } else if (lg.status === 'Unauthorized Location') {
                label = `WARNING: Unauthorized check-in blocked for Product [${shortId}...]!`;
                styleClass = 'danger';
            } else {
                label = `Verification check registered on Product [${shortId}...].`;
            }
            return {
                label,
                styleClass,
                time: lg.verifiedAt
            };
        });

        res.json({
            success: true,
            data: {
                registered,
                protected: protectedCount,
                verificationAttempts,
                activeLeaksBlock,
                recentAlerts
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Public Endpoint: Retrieve all user locations across all roles from database
app.get('/api/public/user-locations', async (req, res) => {
    try {
        const locations = [];

        // 1. Fetch Distributors
        const DistributorsModel = mongoose.model('Distributor');
        const distributors = await DistributorsModel.find({ status: { $ne: 'Inactive' } });
        distributors.forEach(d => {
            if (typeof d.latitude === 'number' && typeof d.longitude === 'number') {
                locations.push({
                    name: d.name || d.distributorId,
                    address: d.address || "Authorized Depot",
                    lat: d.latitude,
                    lng: d.longitude,
                    role: "distributor"
                });
            }
        });

        // 2. Fetch Retailers
        const RetailersModel = mongoose.model('Retailer');
        const retailers = await RetailersModel.find({ status: { $ne: 'Inactive' } });
        retailers.forEach(r => {
            if (typeof r.latitude === 'number' && typeof r.longitude === 'number') {
                locations.push({
                    name: r.name || r.retailerId,
                    address: r.address || "Authorized Outlet",
                    lat: r.latitude,
                    lng: r.longitude,
                    role: "retailer"
                });
            }
        });

        // 3. Fetch Products (Manufacturers and verification history scans)
        const products = await Product.find({});
        products.forEach(p => {
            // Manufacturer Location
            if (p.manufacturerLocation && typeof p.manufacturerLocation.latitude === 'number' && typeof p.manufacturerLocation.longitude === 'number') {
                locations.push({
                    name: p.manufacturerName || "BioPharma LabHQ",
                    address: p.manufacturerLocation.address || p.manufacturerAddress || "Manufacturer HQ Center",
                    lat: p.manufacturerLocation.latitude,
                    lng: p.manufacturerLocation.longitude,
                    role: "admin"
                });
            }
            // Scan histories (all users, any role)
            if (p.verificationHistory && p.verificationHistory.length > 0) {
                p.verificationHistory.forEach(h => {
                    if (typeof h.latitude === 'number' && typeof h.longitude === 'number') {
                        locations.push({
                            name: h.username || "End User Scan",
                            address: h.verifierLocation || "Checkpoint Geolocation",
                            lat: h.latitude,
                            lng: h.longitude,
                            role: h.role || "user"
                        });
                    }
                });
            }
        });

        // Deduplicate or group locations at very close coordinates to avoid clutter
        const uniqueLocs = [];
        const seen = new Set();
        locations.forEach(loc => {
            const key = `${loc.lat.toFixed(4)}_${loc.lng.toFixed(4)}_${loc.role}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueLocs.push(loc);
            }
        });

        res.json({ success: true, count: uniqueLocs.length, data: uniqueLocs });
    } catch (error) {
        console.error("Error fetching public user locations:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Verify Product Coordinates (Location-based Auth)
// Accepts GET query params: lat, lng, locationText
app.get('/verify/:productId', authenticateJWT, requireAnyRole(['admin', 'user', 'distributor', 'retailer']), async (req, res) => {
    try {
        const { productId } = req.params;
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const locationText = req.query.locationText || "Unknown Location";

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ success: false, message: "Coordinates (lat, lng) are required for location verification." });
        }

        const product = await Product.findOne({ productId });
        if (!product) {
            return res.status(404).json({ success: false, locationStatus: "Product Not Found", message: "Product not found in our database." });
        }

        // Designated customer access lock
        if (product.targetCustomer && req.user && req.user.role === 'user') {
            if (product.targetCustomer !== req.user.username.toLowerCase()) {
                return res.status(403).json({ success: false, message: "Access Denied: You are not the designated recipient of this product." });
            }
        }

        // Cascading access block if returned for recall
        if (product.isReturnedForRecall) {
            const reqRole = req.user && req.user.role ? req.user.role : "";
            if (product.returnedByRole === 'distributor') {
                if (reqRole === 'retailer' || reqRole === 'user') {
                    return res.status(403).json({ success: false, message: "Access Denied: Product returned by distributor for recall." });
                }
            } else if (product.returnedByRole === 'retailer') {
                if (reqRole === 'user') {
                    return res.status(403).json({ success: false, message: "Access Denied: Product returned by retailer for recall." });
                }
            }
        }

        // Feature 5: Product Recall Interception
        if (product.isRecalled) {
            return res.json({
                success: false,
                locationStatus: "PRODUCT RECALLED",
                message: "WARNING: This product or batch has been recalled!",
                data: {
                    productId: product.productId,
                    name: product.name,
                    brand: product.brand,
                    category: product.category,
                    modelNumber: product.modelNumber,
                    batchNumber: product.batchNumber,
                    isRecalled: true,
                    recallInfo: {
                        reason: product.recallReason,
                        severity: product.recallSeverity,
                        recallDate: product.recallDate,
                        instructions: product.recallInstructions,
                        refundAvailable: product.recallRefundAvailable,
                        nearestCentre: product.recallNearestCentre
                    }
                }
            });
        }

        // Custody chain sequence check: if retailer is assigned, customer cannot verify until dispatched by retailer
        const reqUsernameLower = req.user && req.user.username ? req.user.username.toLowerCase() : "";
        const reqRole = req.user && req.user.role ? req.user.role : "";

        if (reqRole === 'user' && product.retailerId && product.retailerStatus !== 'Dispatched') {
            return res.json({
                success: false,
                locationStatus: "Pending Handover",
                message: "Warning: Product custody handover not completed by Retailer. Details are protected."
            });
        }

        // Increment scanCount
        product.scanCount = (product.scanCount || 0) + 1;

        // Check if the coordinate falls within 100 meters of any authorized center
        let matchedCenter = null;
        for (const center of product.authorizedCenters) {
            if (isNearLocation(lat, lng, center.latitude, center.longitude, 100)) {
                matchedCenter = center;
                break;
            }
        }

        // Determine if this scan is from the assigned distributor or retailer for the first time

        const isAssignedDistributor = reqRole === 'distributor' && req.user.username.toUpperCase() === product.distributorId;
        const isAssignedRetailer = reqRole === 'retailer' && req.user.username.toUpperCase() === product.retailerId;
        const isHandledEntity = isAssignedDistributor || isAssignedRetailer;

        let isNeglectedScan = false;
        if (isHandledEntity) {
            const hasScannedBefore = product.verificationHistory.some(h => h.username === reqUsernameLower);
            if (!hasScannedBefore) {
                isNeglectedScan = true;
            }
        }

        let isSuccessfulScan = false;
        let scanStatus = "";
        let scanMatchedCenterName = null;

        if (matchedCenter) {
            isSuccessfulScan = true;
            scanStatus = "Authorized Center Verified";
            scanMatchedCenterName = matchedCenter.name;

            // Record verification history
            const historyItem = {
                verifierLocation: locationText,
                latitude: lat,
                longitude: lng,
                matchedCenter: matchedCenter.name,
                status: "Authorized Center Verified",
                username: reqUsernameLower,
                role: reqRole,
                neglected: isNeglectedScan,
                verifiedAt: new Date()
            };
            product.verificationHistory.push(historyItem);
        } else {
            // Otherwise, check if there is an approved or pending AccessRequest in MongoDB
            const recentRequests = await AccessRequest.find({ productId });
            let existingRequest = null;

            for (const reqObj of recentRequests) {
                if (isNearLocation(lat, lng, reqObj.latitude, reqObj.longitude, 100)) {
                    existingRequest = reqObj;
                    break;
                }
            }

            if (existingRequest) {
                if (existingRequest.status === 'Approved') {
                    isSuccessfulScan = true;
                    scanStatus = "Admin Approved";
                    scanMatchedCenterName = "Admin Approved Access";

                    const historyItem = {
                        verifierLocation: locationText,
                        latitude: lat,
                        longitude: lng,
                        matchedCenter: "Admin Approved Access",
                        status: "Admin Approved",
                        username: reqUsernameLower,
                        role: reqRole,
                        neglected: isNeglectedScan,
                        verifiedAt: new Date()
                    };
                    product.verificationHistory.push(historyItem);
                } else if (existingRequest.status === 'Pending') {
                    await product.save();
                    return res.json({
                        success: false,
                        locationStatus: "Admin Approval Pending",
                        message: "Verification request is currently pending admin approval. Please wait.",
                        data: {
                            productId: product.productId,
                            name: product.name,
                            manufacturerName: product.manufacturerName,
                            status: "Pending Administrative Approval"
                        }
                    });
                } else if (existingRequest.status === 'Rejected') {
                    // Log attempt history
                    const historyItem = {
                        verifierLocation: locationText,
                        latitude: lat,
                        longitude: lng,
                        matchedCenter: null,
                        status: "Request Rejected",
                        username: reqUsernameLower,
                        role: reqRole,
                        neglected: isNeglectedScan,
                        verifiedAt: new Date()
                    };
                    product.verificationHistory.push(historyItem);
                    await product.save();
                    return res.json({
                        success: false,
                        locationStatus: "Request Rejected",
                        message: "Request Rejected. Contact Manufacturer.",
                        data: {
                            productId: product.productId,
                            status: "Access Request Rejected"
                        }
                    });
                }
            } else {
                // Completely unauthorized location, record attempt
                const historyItem = {
                    verifierLocation: locationText,
                    latitude: lat,
                    longitude: lng,
                    matchedCenter: null,
                    status: "Unauthorized Location",
                    username: reqUsernameLower,
                    role: reqRole,
                    neglected: isNeglectedScan,
                    verifiedAt: new Date()
                };
                product.verificationHistory.push(historyItem);
            }
        }

        // Feature 2: Smart Warranty Activation logic
        if (isSuccessfulScan && product.warrantyAvailable && !product.warrantyActivated) {
            product.warrantyActivated = true;
            product.warrantyStartDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + product.warrantyPeriod);
            product.warrantyEndDate = endDate;
            product.warrantyStatus = 'Active';
        }

        // Recalculate remaining days and status if active
        let warrantyRemainingDays = 0;
        if (product.warrantyActivated && product.warrantyStatus === 'Active') {
            const now = new Date();
            if (now > product.warrantyEndDate) {
                product.warrantyStatus = 'Expired';
            } else {
                const diffTime = Math.abs(product.warrantyEndDate - now);
                warrantyRemainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        // Feature 3: Health & Trust calculations
        const unauthCount = product.verificationHistory.filter(h => h.status === 'Unauthorized Location' && !h.neglected).length;
        const successCount = product.verificationHistory.filter(h => h.status === 'Authorized Center Verified' || h.status === 'Authorized Centre Verified' || h.status === 'Admin Approved').length;

        let overallHealth = "Healthy";
        let trustLevel = "High";
        let riskLevel = "Low";
        let recommendation = "Product is authentic and secure. No risk detected.";

        if (unauthCount > 0) {
            if (unauthCount <= 2) {
                overallHealth = "Suspicious";
                trustLevel = "Medium";
                riskLevel = "Medium";
                recommendation = "Monitor verification history. Minor unauthorized scan locations detected.";
            } else {
                overallHealth = "Compromised";
                trustLevel = "Low";
                riskLevel = "High";
                recommendation = "WARNING: Multiple unauthorized verification attempts detected! Audit custody chain.";
            }
        }

        // Check for any customer star rating feedback overrides
        const feedbackLog = product.verificationHistory.slice().reverse().find(h => h.status && h.status.startsWith('Customer Feedback: '));
        if (feedbackLog) {
            const calculatedHealth = feedbackLog.status.replace('Customer Feedback: ', '');
            overallHealth = calculatedHealth;
            if (overallHealth === 'Optimal') {
                trustLevel = "High";
                riskLevel = "Low";
                recommendation = "Product is in pristine condition based on user reviews.";
            } else if (overallHealth === 'Healthy') {
                trustLevel = "High";
                riskLevel = "Low";
                recommendation = "Product is working perfectly based on user reviews.";
            } else if (overallHealth === 'Fair / Notice') {
                trustLevel = "Medium";
                riskLevel = "Low";
                recommendation = "Product has minor notes or feedback reported by customer.";
            } else if (overallHealth === 'Suspicious / Warning') {
                trustLevel = "Medium";
                riskLevel = "Medium";
                recommendation = "Warning: Customer reported possible issues with product.";
            } else if (overallHealth === 'Compromised / Critical') {
                trustLevel = "Low";
                riskLevel = "High";
                recommendation = "Critical: Customer reported product has been compromised or damaged.";
            }
        }

        // Feature 6: Supply Chain Tracking
        let supplyChainStatus = 'Complete';
        if (!product.distributorId || product.distributorStatus !== 'Received' || !product.retailerId || product.retailerStatus !== 'Received') {
            if (isSuccessfulScan) {
                supplyChainStatus = 'Supply Chain Incomplete';
            } else {
                supplyChainStatus = 'Unauthorized Supply Chain Detected';
            }
        }

        // Create journey timeline array
        const journeyTimeline = [];
        journeyTimeline.push({
            stage: 'Manufacturer',
            name: product.manufacturerName,
            location: product.manufacturerLocation.address,
            status: 'Done',
            date: product.createdAt
        });

        journeyTimeline.push({
            stage: 'Distributor',
            name: product.distributorId ? product.distributorId : 'Not Assigned',
            location: product.distributorId ? 'Authorized Depot' : 'N/A',
            status: product.distributorStatus,
            date: product.distributorReceivedAt
        });

        journeyTimeline.push({
            stage: 'Retailer',
            name: product.retailerId ? product.retailerId : 'Not Assigned',
            location: product.retailerId ? 'Authorized Outlet' : 'N/A',
            status: product.retailerStatus,
            date: product.retailerReceivedAt
        });

        journeyTimeline.push({
            stage: 'Customer',
            name: 'End User Scan',
            location: locationText,
            status: isSuccessfulScan ? 'Verified' : 'Pending Verification',
            date: isSuccessfulScan ? new Date() : null
        });

        // Add Customer check point to journey if successful and not already there
        if (isSuccessfulScan && reqRole === 'user') {
            product.supplyChainJourney.push({
                stage: 'Customer',
                entityId: 'Customer',
                name: 'End User Scan',
                action: 'Purchased',
                timestamp: new Date(),
                location: locationText,
                verified: true
            });
        }

        await product.save();

        if (isSuccessfulScan) {
            const scanUserObj = await User.findOne({ username: reqUsernameLower });
            const scanUserEmail = scanUserObj ? scanUserObj.email : (req.user && req.user.email ? req.user.email : `${reqUsernameLower}@cryoledger.com`);
            const adminsList = await User.find({ role: 'admin' });
            const adminEmail = (adminsList.length > 0 && adminsList[0].email) ? adminsList[0].email : "admin@cryoledger.com";

            const distUserObj = await User.findOne({ username: product.distributorId?.toLowerCase(), role: 'distributor' });
            const distUserEmail = distUserObj ? distUserObj.email : `${product.distributorId}@cryoledger.com`;

            const retUserObj = await User.findOne({ username: product.retailerId?.toLowerCase(), role: 'retailer' });
            const retUserEmail = retUserObj ? retUserObj.email : `${product.retailerId}@cryoledger.com`;

            // Event 18: Product Verification Successful
            EmailService.sendVerificationSuccessEmail(scanUserEmail, {
                productName: product.name,
                verificationTime: new Date().toLocaleString(),
                blockchainStatus: 'Verified & Anchored in Ledger',
                transactionHash: 'Ganache Local Block Hashed'
            }).catch(err => console.error("[EmailServiceError] Verification success email failed:", err.message));

            // Events for Customer handover
            if (reqRole === 'user') {
                // Event 16: Retailer Delivered Product
                EmailService.sendRetailerDeliveredEmail(
                    { customerEmail: scanUserEmail, managerEmail: adminEmail, distributorEmail: distUserEmail },
                    {
                        customerName: product.targetCustomer,
                        managerName: product.manufacturerName,
                        distributorName: product.distributorId,
                        productId: product.productId,
                        productName: product.name
                    }
                ).catch(err => console.error("[EmailServiceError] Event 16 email failed:", err.message));

                // Event 17: Delivery Completed
                EmailService.sendDeliveryCompletedEmail(
                    { customerEmail: scanUserEmail, managerEmail: adminEmail, distributorEmail: distUserEmail, retailerEmail: retUserEmail },
                    {
                        customerName: product.targetCustomer,
                        managerName: product.manufacturerName,
                        productId: product.productId,
                        productName: product.name
                    }
                ).catch(err => console.error("[EmailServiceError] Event 17 email failed:", err.message));

                // Event 20: Product Ownership Changed
                EmailService.sendOwnershipChangedEmail(
                    { oldOwnerEmail: retUserEmail, newOwnerEmail: scanUserEmail },
                    {
                        oldOwner: product.retailerId,
                        newOwner: product.targetCustomer,
                        productId: product.productId,
                        productName: product.name
                    }
                ).catch(err => console.error("[EmailServiceError] Event 20 email failed:", err.message));
            }

            return res.json({
                success: true,
                locationStatus: scanStatus,
                message: `Product is genuine and verified.`,
                matchedCenter: scanMatchedCenterName,
                passport: {
                    productId: product.productId,
                    name: product.name,
                    brand: product.brand,
                    category: product.category,
                    modelNumber: product.modelNumber,
                    batchNumber: product.batchNumber,
                    manufacturingDate: product.createdAt,
                    expiryDate: product.expiryDate,
                    manufacturerName: product.manufacturerName,
                    manufacturerAddress: product.manufacturerAddress,
                    manufacturerLocation: product.manufacturerLocation,
                    qrCodePath: product.qrCodePath,
                    productImage: product.productImage,
                    scanCount: product.scanCount,
                    verificationHistory: product.verificationHistory,
                    authorizedCenters: product.authorizedCenters
                },
                warranty: {
                    warrantyAvailable: product.warrantyAvailable,
                    warrantyActivated: product.warrantyActivated,
                    warrantyStartDate: product.warrantyStartDate,
                    warrantyEndDate: product.warrantyEndDate,
                    warrantyStatus: product.warrantyStatus,
                    warrantyPeriod: product.warrantyPeriod,
                    remainingDays: warrantyRemainingDays,
                    warrantyType: product.warrantyType,
                    warrantyTerms: product.warrantyTerms
                },
                healthReport: {
                    overallHealth,
                    trustLevel,
                    riskLevel,
                    verificationStatus: "Verified",
                    unauthorizedAttempts: unauthCount,
                    totalSuccessfulVerifications: successCount,
                    recommendation
                },
                supplyChain: {
                    status: supplyChainStatus,
                    timeline: journeyTimeline
                }
            });
        }

        // Otherwise (unauthorized location)
        let messageVal = "Warning: Verification is outside any authorized location. Details are protected.";
        if (reqRole === 'user' && product.retailerStatus === 'Dispatched') {
            messageVal = "Warning: Product custody handover not completed. Details are protected.";
        }

        // Event 19: Product Verification Failed
        const scanUserObj = await User.findOne({ username: reqUsernameLower });
        const scanUserEmail = scanUserObj ? scanUserObj.email : (req.user && req.user.email ? req.user.email : `${reqUsernameLower}@cryoledger.com`);
        EmailService.sendVerificationFailedEmail(scanUserEmail, {
            productName: product.name,
            verificationTime: new Date().toLocaleString(),
            reason: messageVal
        }).catch(err => console.error("[EmailServiceError] Verification failed email failed:", err.message));

        return res.json({
            success: false,
            locationStatus: "Unauthorized Location",
            message: messageVal,
            passport: {
                productId: product.productId,
                name: product.name,
                brand: product.brand,
                manufacturerName: product.manufacturerName,
                qrCodePath: product.qrCodePath
            },
            healthReport: {
                overallHealth,
                trustLevel,
                riskLevel,
                verificationStatus: "Unauthorized",
                unauthorizedAttempts: unauthCount,
                totalSuccessfulVerifications: successCount,
                recommendation
            },
            supplyChain: {
                status: supplyChainStatus,
                timeline: journeyTimeline
            }
        });
    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({ success: false, message: "Error verifying location.", error: error.message });
    }
});

// 5. Request Access
app.post('/request-access', authenticateJWT, requireRole('user'), async (req, res) => {
    try {
        const { productId, requestedLocation, latitude, longitude } = req.body;

        if (!productId || !requestedLocation || latitude == null || longitude == null) {
            return res.status(400).json({ success: false, message: "Missing required request parameters." });
        }

        const product = await Product.findOne({ productId });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Check if duplicate request exists near this coordinate
        const recentRequests = await AccessRequest.find({ productId });
        let duplicateRequest = null;
        for (const reqObj of recentRequests) {
            if (isNearLocation(latitude, longitude, reqObj.latitude, reqObj.longitude, 100)) {
                duplicateRequest = reqObj;
                break;
            }
        }

        const requesterUser = await User.findOne({ username: req.user.username.toLowerCase() });
        const requesterEmail = requesterUser ? requesterUser.email : "";

        if (duplicateRequest) {
            if (duplicateRequest.status === 'Pending') {
                return res.status(400).json({ success: false, message: "A pending approval request already exists for this coordinates area." });
            }
            if (duplicateRequest.status === 'Approved') {
                return res.status(400).json({ success: false, message: "Access has already been approved for this coordinates area. Try verifying again." });
            }
            // If rejected, let them create a new request or show message. 
            // Let's allow creating a new request if the old one was rejected before (resets to Pending)
            duplicateRequest.status = 'Pending';
            duplicateRequest.requestedLocation = requestedLocation;
            duplicateRequest.latitude = latitude;
            duplicateRequest.longitude = longitude;
            duplicateRequest.approved = false;
            duplicateRequest.username = req.user.username.toLowerCase();
            duplicateRequest.role = req.user.role;
            duplicateRequest.email = requesterEmail;
            await duplicateRequest.save();

            return res.json({
                success: true,
                message: "Previous request resubmitted. Access Request Sent Successfully. Waiting for admin approval.",
                data: duplicateRequest
            });
        }

        const newRequest = new AccessRequest({
            productId,
            requestedLocation,
            latitude,
            longitude,
            status: 'Pending',
            approved: false,
            username: req.user.username.toLowerCase(),
            role: req.user.role,
            email: requesterEmail
        });

        await newRequest.save();

        res.json({
            success: true,
            message: "Access Request Sent Successfully. Waiting for admin approval.",
            data: newRequest
        });

    } catch (error) {
        console.error("Error creating access request:", error);
        res.status(500).json({ success: false, message: "Failed to request access.", error: error.message });
    }
});

// 6. Request Status
app.get('/request-status/:productId', authenticateJWT, requireRole('user'), async (req, res) => {
    try {
        const { productId } = req.params;
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ success: false, message: "Coordinates required." });
        }

        const recentRequests = await AccessRequest.find({ productId });
        let matchedRequest = null;
        for (const reqObj of recentRequests) {
            if (isNearLocation(lat, lng, reqObj.latitude, reqObj.longitude, 100)) {
                matchedRequest = reqObj;
                break;
            }
        }

        if (!matchedRequest) {
            return res.json({ success: true, data: { status: 'None' } });
        }

        res.json({ success: true, data: matchedRequest });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching request status.", error: error.message });
    }
});

// 7. Get All Access Requests for Admin
app.get('/admin/requests', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const createdByAdmin = req.user.username;
        const adminProducts = await Product.find({ createdByAdmin }, 'productId');
        const productIds = adminProducts.map(p => p.productId);

        const requests = await AccessRequest.find({ productId: { $in: productIds } }).sort({ createdAt: -1 });

        // Supplement request with product names
        const enhancedRequests = [];
        for (const r of requests) {
            const p = await Product.findOne({ productId: r.productId }, 'name');
            enhancedRequests.push({
                _id: r._id,
                productId: r.productId,
                productName: p ? p.name : "Unknown Product",
                requestedLocation: r.requestedLocation,
                latitude: r.latitude,
                longitude: r.longitude,
                status: r.status,
                createdAt: r.createdAt
            });
        }

        res.json({ success: true, message: "Requests retrieved.", data: enhancedRequests });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to retrieve access requests.", error: error.message });
    }
});

// 8. Approve Request
app.post('/admin/request/:id/approve', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const request = await AccessRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Access request not found." });
        }

        request.status = 'Approved';
        request.approved = true;
        await request.save();

        // Account Approved (Bypass Access Coordinates Request Approved - Event 2)
        if (request.email) {
            EmailService.sendAccountApprovedEmail(request.email, {
                username: request.username,
                role: request.role,
                approvalMessage: `Bypass coordinates matching request for Product ${request.productId} approved.`
            }).catch(err => console.error("[EmailServiceError] Approved email failed:", err.message));
        }

        res.json({ success: true, message: "Request approved successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error approving request.", error: error.message });
    }
});

// 9. Reject Request
app.post('/admin/request/:id/reject', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const request = await AccessRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Access request not found." });
        }

        request.status = 'Rejected';
        request.approved = false;
        await request.save();

        // Account Rejected (Bypass Access Coordinates Request Rejected - Event 3)
        if (request.email) {
            EmailService.sendAccountRejectedEmail(request.email, {
                username: request.username,
                reason: `Bypass coordinates matching request for Product ${request.productId} rejected.`
            }).catch(err => console.error("[EmailServiceError] Rejected email failed:", err.message));
        }

        res.json({ success: true, message: "Request rejected successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error rejecting request.", error: error.message });
    }
});

// 10. Verification History
app.get('/product/:productId/history', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const product = await Product.findOne({ productId: req.params.productId });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }
        res.json({ success: true, message: "History retrieved.", data: product.verificationHistory });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error retrieving verification history.", error: error.message });
    }
});

// ============================================
// FEATURE 4: ANALYTICS DASHBOARD API
// ============================================
app.get('/api/admin/dashboard-stats', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const createdByAdmin = req.user.username;
        const adminProducts = await Product.find({ createdByAdmin }, 'productId');
        const productIds = adminProducts.map(p => p.productId);

        const totalProducts = await Product.countDocuments({ createdByAdmin });
        const verifiedProductsCount = await Product.countDocuments({ createdByAdmin, scanCount: { $gt: 0 } });

        // Requests stats
        const pendingRequests = await AccessRequest.countDocuments({ productId: { $in: productIds }, status: 'Pending' });
        const approvedRequests = await AccessRequest.countDocuments({ productId: { $in: productIds }, status: 'Approved' });
        const rejectedRequests = await AccessRequest.countDocuments({ productId: { $in: productIds }, status: 'Rejected' });

        // Warranties stats
        const activeWarranties = await Product.countDocuments({ createdByAdmin, warrantyActivated: true, warrantyStatus: 'Active' });
        const expiredWarranties = await Product.countDocuments({ createdByAdmin, warrantyActivated: true, warrantyStatus: 'Expired' });

        // Near Expiry calculations (<= 30 days remaining)
        const products = await Product.find({ createdByAdmin, warrantyActivated: true, warrantyStatus: 'Active' });
        const now = new Date();
        let nearExpiryWarranties = 0;
        for (const p of products) {
            if (p.warrantyEndDate) {
                const diffTime = Math.abs(p.warrantyEndDate - now);
                const remaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (remaining <= 30) nearExpiryWarranties++;
            }
        }

        // Recalls stats
        const totalRecalled = await Product.countDocuments({ createdByAdmin, isRecalled: true });
        const activeRecalls = await Product.countDocuments({ createdByAdmin, isRecalled: true }); // equivalent here
        const completedRecalls = await Product.countDocuments({ createdByAdmin, isRecalled: false, recallDate: { $ne: null } }); // was once recalled

        // Centers stats
        const allProducts = await Product.find({ createdByAdmin });
        let totalAuthorizedCentres = 0;
        let unauthorizedAttempts = 0;
        let successfulVerifications = 0;
        let totalScans = 0;
        const allVerifications = []; // for trend tracking

        allProducts.forEach(p => {
            totalAuthorizedCentres += (p.authorizedCenters || []).length;
            totalScans += (p.scanCount || 0);

            (p.verificationHistory || []).forEach(history => {
                allVerifications.push(history);
                if (history.status === 'Unauthorized Location') {
                    unauthorizedAttempts++;
                } else if (history.status === 'Authorized Center Verified' || history.status === 'Authorized Centre Verified' || history.status === 'Admin Approved') {
                    successfulVerifications++;
                }
            });
        });

        // Top Verified Products
        const topVerifiedProducts = await Product.find({ createdByAdmin }, 'productId name scanCount')
            .sort({ scanCount: -1 })
            .limit(5);

        // Top Manufacturers count rollup
        const manufacturerCounts = {};
        allProducts.forEach(p => {
            manufacturerCounts[p.manufacturerName] = (manufacturerCounts[p.manufacturerName] || 0) + 1;
        });
        const topManufacturers = Object.keys(manufacturerCounts).map(name => ({
            name,
            count: manufacturerCounts[name]
        })).sort((a, b) => b.count - a.count).slice(0, 5);

        // Monthly registers
        const monthlyProducts = {};
        allProducts.forEach(p => {
            const date = new Date(p.createdAt);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyProducts[key] = (monthlyProducts[key] || 0) + 1;
        });

        // Recent scanning activity timeline (lat/lng/date)
        allVerifications.sort((a, b) => new Date(b.verifiedAt) - new Date(a.verifiedAt));
        const recentActivity = allVerifications.slice(0, 10);

        // Access Requests list
        const latestRequestsList = await AccessRequest.find({ productId: { $in: productIds } }).sort({ createdAt: -1 }).limit(10);
        const enhancedRequests = [];
        for (const r of latestRequestsList) {
            const prod = await Product.findOne({ productId: r.productId }, 'name');
            enhancedRequests.push({
                _id: r._id,
                productId: r.productId,
                productName: prod ? prod.name : "Unknown Product",
                requestedLocation: r.requestedLocation,
                latitude: r.latitude,
                longitude: r.longitude,
                status: r.status,
                createdAt: r.createdAt
            });
        }

        const totalDistributors = await Distributor.countDocuments();

        res.json({
            success: true,
            summary: {
                totalProducts,
                verifiedProducts: verifiedProductsCount,
                unauthorizedAttempts,
                successfulVerifications,
                pendingRequests,
                approvedRequests,
                rejectedRequests,
                activeWarranties,
                expiredWarranties,
                productsNearWarrantyExpiry: nearExpiryWarranties,
                totalAuthorizedCentres,
                totalRecalled,
                activeRecalls,
                completedRecalls,
                totalDistributors
            },
            charts: {
                monthlyProducts,
                topVerifiedProducts,
                topManufacturers,
                authVsUnauth: {
                    authorized: successfulVerifications,
                    unauthorized: unauthorizedAttempts
                },
                warrantyStatus: {
                    active: activeWarranties,
                    expired: expiredWarranties,
                    inactive: await Product.countDocuments({ createdByAdmin, warrantyActivated: false })
                }
            },
            recentActivity,
            latestRequests: enhancedRequests
        });
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ success: false, message: "Error calculating dashboard parameters.", error: error.message });
    }
});

// ============================================
// FEATURE 5: PRODUCT RECALL MANAGER
// ============================================
app.post('/api/admin/recall-product', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { productId, reason, severity, instructions, refundAvailable, nearestCentre } = req.body;
        if (!productId || !reason) {
            return res.status(400).json({ success: false, message: "Product ID and recall reason are required." });
        }

        const product = await Product.findOne({ productId });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        if (product.createdByAdmin && product.createdByAdmin !== req.user.username) {
            return res.status(403).json({ success: false, message: "Access Denied: You do not own this product." });
        }

        product.isRecalled = true;
        product.recallReason = reason;
        product.recallDate = new Date();
        product.recallSeverity = severity || "Medium";
        product.recallInstructions = instructions || "";
        product.recallRefundAvailable = refundAvailable === true || refundAvailable === 'true';
        product.recallNearestCentre = nearestCentre || "";

        // Add to supply chain timeline as a recall event log
        product.supplyChainJourney.push({
            stage: 'Manufacturer',
            entityId: 'ManufacturerRecall',
            name: product.manufacturerName,
            action: 'Product Recalled',
            timestamp: new Date(),
            location: reason,
            verified: false
        });

        await product.save();
        res.json({ success: true, message: `Product "${productId}" has been recalled successfully.`, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error recalling product.", error: error.message });
    }
});

app.post('/api/admin/recall-batch', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { batchNumber, reason, severity, instructions, refundAvailable, nearestCentre } = req.body;
        if (!batchNumber || !reason) {
            return res.status(400).json({ success: false, message: "Batch number and recall reason are required." });
        }

        const result = await Product.updateMany(
            { batchNumber, createdByAdmin: req.user.username },
            {
                $set: {
                    isRecalled: true,
                    recallReason: reason,
                    recallDate: new Date(),
                    recallSeverity: severity || "Medium",
                    recallInstructions: instructions || "",
                    recallRefundAvailable: refundAvailable === true || refundAvailable === 'true',
                    recallNearestCentre: nearestCentre || ""
                }
            }
        );

        res.json({
            success: true,
            message: `Recall issued for batch "${batchNumber}". Total products affected: ${result.modifiedCount}.`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error issuing batch recall.", error: error.message });
    }
});

app.post('/api/admin/cancel-recall', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { productId, batchNumber } = req.body;
        if (!productId && !batchNumber) {
            return res.status(400).json({ success: false, message: "Either product ID or batch number is required to cancel recall." });
        }

        if (productId) {
            const product = await Product.findOne({ productId });
            if (!product) return res.status(404).json({ success: false, message: "Product not found." });

            if (product.createdByAdmin && product.createdByAdmin !== req.user.username) {
                return res.status(403).json({ success: false, message: "Access Denied: You do not own this product." });
            }
            product.isRecalled = false;
            product.recallReason = "";
            product.recallInstructions = "";
            product.isReturnedForRecall = false;
            product.returnedByRole = "";
            product.returnedByUsername = "";
            await product.save();
            return res.json({ success: true, message: `Recall cleared for product "${productId}".` });
        } else {
            const result = await Product.updateMany(
                { batchNumber, createdByAdmin: req.user.username },
                {
                    $set: {
                        isRecalled: false,
                        recallReason: "",
                        recallInstructions: "",
                        isReturnedForRecall: false,
                        returnedByRole: "",
                        returnedByUsername: ""
                    }
                }
            );
            return res.json({ success: true, message: `Recall cleared for batch "${batchNumber}". Affected: ${result.modifiedCount}.` });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Error clearing recall.", error: error.message });
    }
});

// Admin repairs a returned product and re-releases it into the supply chain
app.post('/api/admin/product/:productId/repair', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { productId } = req.params;
        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        if (product.createdByAdmin && product.createdByAdmin !== req.user.username) {
            return res.status(403).json({ success: false, message: "Access Denied: You do not own this product." });
        }

        product.isReturnedForRecall = false;
        product.isRecalled = false;
        product.recallReason = "";

        // Push repair event to supply chain journey
        product.supplyChainJourney.push({
            stage: 'Admin',
            entityId: 'ADMIN',
            name: 'Manufacturer Admin',
            action: 'Repaired & Re-released',
            timestamp: new Date(),
            location: product.manufacturerAddress || 'Manufacturer Headquarters',
            verified: true
        });

        await product.save();

        // Event 5: Product Updated & Event 22: Order Updated
        const patchUser = await User.findOne({ username: product.targetCustomer });
        const patchCustEmail = patchUser ? patchUser.email : `${product.targetCustomer}@cryoledger.com`;

        EmailService.sendProductUpdatedEmail(patchCustEmail, {
            username: product.targetCustomer,
            productId: product.productId,
            name: product.name,
            updateDetails: `Product marked as Repaired and Re-released into active supply chain custody.`
        }).catch(err => console.error("[EmailServiceError] Repair update email failed:", err.message));

        EmailService.sendOrderUpdatedEmail(patchCustEmail, {
            username: product.targetCustomer,
            orderId: product.productId,
            updateDetails: `Status updated to Repaired & Re-released.`
        }).catch(err => console.error("[EmailServiceError] Repair order update email failed:", err.message));

        res.json({ success: true, message: `Product "${productId}" has been repaired and re-released into custody successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin aggregates customer rating statistics
app.get('/api/admin/rating-stats', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const products = await Product.find({ createdByAdmin: req.user.username });
        let totalRating = 0;
        let count = 0;
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const productBreakdown = [];

        products.forEach(p => {
            let productTotal = 0;
            let productCount = 0;

            if (p.verificationHistory && Array.isArray(p.verificationHistory)) {
                p.verificationHistory.forEach(h => {
                    if (h.verifierLocation && h.verifierLocation.startsWith("Star Rating:")) {
                        const parts = h.verifierLocation.split(' ');
                        const ratingVal = parseInt(parts[2], 10);
                        if (!isNaN(ratingVal) && ratingVal >= 1 && ratingVal <= 5) {
                            distribution[ratingVal]++;
                            totalRating += ratingVal;
                            count++;
                            productTotal += ratingVal;
                            productCount++;
                        }
                    }
                });
            }

            if (productCount > 0) {
                productBreakdown.push({
                    productId: p.productId,
                    name: p.name,
                    averageRating: parseFloat((productTotal / productCount).toFixed(2)),
                    count: productCount
                });
            }
        });

        res.json({
            success: true,
            data: {
                averageRating: count > 0 ? parseFloat((totalRating / count).toFixed(2)) : 0,
                totalCount: count,
                distribution,
                productBreakdown
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// FEATURE 6: LOGISTICS CRUD & TRACKING APIS
// ============================================

// Distributors CRUD
app.get('/api/admin/distributors', authenticateJWT, requireAnyRole(['admin', 'distributor']), async (req, res) => {
    try {
        const list = await Distributor.find({});
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/distributor', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { distributorId, name, address, latitude, longitude, contact, email } = req.body;
        if (!distributorId || !name || latitude == null || longitude == null) {
            return res.status(400).json({ success: false, message: "Required distributor details are missing." });
        }
        const existing = await Distributor.findOne({ distributorId });
        if (existing) return res.status(400).json({ success: false, message: "Distributor ID already registered." });

        const d = new Distributor({ distributorId, name, address, latitude, longitude, contact });
        await d.save();

        // Also automatically create a User credential for this distributor if they do not yet exist
        const defaultPassword = "@Distributor123";
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        await User.create({
            username: distributorId.toLowerCase(),
            password: hashedPassword,
            role: 'distributor',
            email: email || ""
        });

        res.status(201).json({ success: true, message: "Distributor registered successfully.", data: d });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/distributor/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const d = await Distributor.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, message: "Distributor updated.", data: d });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/distributor/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const dist = await Distributor.findById(req.params.id);
        if (dist) {
            // Remove associated User login credentials
            await User.deleteOne({ username: dist.distributorId.toLowerCase() });
            await dist.deleteOne();
        }
        res.json({ success: true, message: "Distributor removed." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Distributor self profile update
app.post('/api/distributor/profile', authenticateJWT, requireRole('distributor'), async (req, res) => {
    try {
        const { name, address, latitude, longitude, contact } = req.body;
        if (!name || !address || latitude == null || longitude == null) {
            return res.status(400).json({ success: false, message: "Required name, address, and coordinates details are missing." });
        }
        const username = req.user.username.toUpperCase();
        let dist = await Distributor.findOne({ distributorId: username });
        if (dist) {
            dist.name = name;
            dist.address = address;
            dist.latitude = latitude;
            dist.longitude = longitude;
            dist.contact = contact || "";
            await dist.save();
        } else {
            dist = new Distributor({
                distributorId: username,
                name,
                address,
                latitude,
                longitude,
                contact: contact || "",
                status: 'Active'
            });
            await dist.save();
        }
        res.json({ success: true, message: "Distributor profile saved successfully.", data: dist });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed saving profile.", error: error.message });
    }
});

// Retailers CRUD
app.get('/api/admin/retailers', authenticateJWT, requireAnyRole(['admin', 'retailer', 'distributor']), async (req, res) => {
    try {
        const list = await Retailer.find({});
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/retailer', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { retailerId, name, address, latitude, longitude, contact, email } = req.body;
        if (!retailerId || !name || latitude == null || longitude == null) {
            return res.status(400).json({ success: false, message: "Required retailer details are missing." });
        }
        const existing = await Retailer.findOne({ retailerId });
        if (existing) return res.status(400).json({ success: false, message: "Retailer ID already registered." });

        const r = new Retailer({ retailerId, name, address, latitude, longitude, contact });
        await r.save();

        // Also automatically create a User credential for this retailer
        const defaultPassword = "@Retailer123";
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        await User.create({
            username: retailerId.toLowerCase(),
            password: hashedPassword,
            role: 'retailer',
            email: email || ""
        });

        res.status(201).json({ success: true, message: "Retailer registered successfully.", data: r });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/retailer/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const r = await Retailer.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, message: "Retailer updated.", data: r });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/retailer/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const ret = await Retailer.findById(req.params.id);
        if (ret) {
            await User.deleteOne({ username: ret.retailerId.toLowerCase() });
            await ret.deleteOne();
        }
        res.json({ success: true, message: "Retailer removed." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Retailer self profile update
app.post('/api/retailer/profile', authenticateJWT, requireRole('retailer'), async (req, res) => {
    try {
        const { name, address, latitude, longitude, contact } = req.body;
        if (!name || !address || latitude == null || longitude == null) {
            return res.status(400).json({ success: false, message: "Required name, address, and coordinates details are missing." });
        }
        const username = req.user.username.toUpperCase();
        let ret = await Retailer.findOne({ retailerId: username });
        if (ret) {
            ret.name = name;
            ret.address = address;
            ret.latitude = latitude;
            ret.longitude = longitude;
            ret.contact = contact || "";
            await ret.save();
        } else {
            ret = new Retailer({
                retailerId: username,
                name,
                address,
                latitude,
                longitude,
                contact: contact || "",
                status: 'Active'
            });
            await ret.save();
        }
        res.json({ success: true, message: "Retailer profile saved successfully.", data: ret });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed saving profile.", error: error.message });
    }
});

// Manufacturer assigns Distributor
app.post('/api/admin/product/:productId/assign-distributor', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { distributorId, targetCustomer } = req.body;
        const { productId } = req.params;

        if (!distributorId || !targetCustomer) {
            return res.status(400).json({ success: false, message: "Both distributorId and targetCustomer are required." });
        }

        const customerUser = await User.findOne({ username: targetCustomer.toLowerCase(), role: 'user' });
        if (!customerUser) {
            return res.status(400).json({ success: false, message: `Designated target customer "${targetCustomer}" is not a registered customer user.` });
        }

        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        if (product.createdByAdmin && product.createdByAdmin !== req.user.username) {
            return res.status(403).json({ success: false, message: "Access Denied: You do not own this product." });
        }

        const dist = await Distributor.findOne({ distributorId });
        if (!dist) return res.status(404).json({ success: false, message: "Distributor not found." });

        const distUser = await User.findOne({ username: distributorId.toLowerCase(), role: 'distributor' });

        product.distributorId = distributorId;
        product.distributorStatus = 'Assigned';
        product.targetCustomer = targetCustomer.toLowerCase();

        // Auto-register distributor location under authorized centers if not already present
        const alreadyRegistered = (product.authorizedCenters || []).some(c =>
            isNearLocation(c.latitude, c.longitude, dist.latitude, dist.longitude, 10)
        );
        if (!alreadyRegistered) {
            product.authorizedCenters.push({
                name: dist.name,
                address: dist.address,
                latitude: dist.latitude,
                longitude: dist.longitude
            });
        }

        // Log entry in supply chain timeline
        product.supplyChainJourney.push({
            stage: 'Distributor',
            entityId: distributorId,
            name: dist.name,
            action: 'Assigned',
            timestamp: new Date(),
            location: dist.address,
            verified: true
        });

        await product.save();

        // 1. Create System Notifications
        await Notification.create([
            {
                recipient: 'admin',
                recipientRole: 'admin',
                title: '📌 Product Assigned to Distributor',
                message: `You assigned Distributor "${dist.name}" to deliver product "${product.name}" to Customer "${targetCustomer}".`
            },
            {
                recipient: distributorId.toLowerCase(),
                recipientRole: 'distributor',
                title: '📦 New Delivery Assigned',
                message: `You are assigned by Manufacturer "${product.manufacturerName}" to deliver product "${product.name}" to Customer "${targetCustomer}".`
            },
            {
                recipient: targetCustomer.toLowerCase(),
                recipientRole: 'user',
                title: '🚚 Courier Assigned to Product',
                message: `Your product "${product.name}" from Manufacturer "${product.manufacturerName}" has been assigned to Distributor "${dist.name}" for delivery.`
            }
        ]);

        // 2. Dispatch Email Alerts
        const adminEmail = req.user.email || "admin@cryoledger.com";
        const distEmail = (distUser && distUser.email) ? distUser.email : `${distributorId}@cryoledger.com`;
        const custEmail = customerUser.email || `${targetCustomer}@cryoledger.com`;

        // Legacy / Admin Email
        await sendAssignEmail({
            to: adminEmail,
            subject: `[CryoLedger] Assignment Successful - Product: ${product.name}`,
            text: `Hello Administrator,

You have successfully assigned product "${product.name}" (ID: ${productId}) to Distributor "${dist.name}" targeting customer "${targetCustomer}".`
        });

        // Trigger Event 7: Manager Assigned Product to Distributor / Customer
        EmailService.sendProductAssignedEmail(distEmail, {
            assignmentId: `ASSIGN-DIST-${productId}`,
            productName: product.name,
            quantity: '1 Unit',
            customerName: targetCustomer,
            address: dist.address,
            priority: 'High',
            expectedDate: 'Within 24 Hours',
            managerName: req.user.username
        }).catch(err => console.error("[EmailServiceError] Dist assignment email failed:", err.message));

        EmailService.sendProductAssignedEmail(custEmail, {
            assignmentId: `ASSIGN-DIST-${productId}`,
            productName: product.name,
            quantity: '1 Unit',
            customerName: targetCustomer,
            address: dist.address,
            priority: 'High',
            expectedDate: 'Within 24 Hours',
            managerName: req.user.username
        }).catch(err => console.error("[EmailServiceError] Cust assignment notification email failed:", err.message));

        res.json({ success: true, message: `Product assigned to Distributor "${dist.name}" for Customer "${targetCustomer}" successfully.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Manufacturer assigns Retailer
app.post('/api/admin/product/:productId/assign-retailer', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { retailerId, targetCustomer } = req.body;
        const { productId } = req.params;

        if (!retailerId || !targetCustomer) {
            return res.status(400).json({ success: false, message: "Both retailerId and targetCustomer are required." });
        }

        const customerUser = await User.findOne({ username: targetCustomer.toLowerCase(), role: 'user' });
        if (!customerUser) {
            return res.status(400).json({ success: false, message: `Designated target customer "${targetCustomer}" is not a registered customer user.` });
        }

        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        if (product.createdByAdmin && product.createdByAdmin !== req.user.username) {
            return res.status(403).json({ success: false, message: "Access Denied: You do not own this product." });
        }

        const ret = await Retailer.findOne({ retailerId });
        if (!ret) return res.status(404).json({ success: false, message: "Retailer not found." });

        const retUser = await User.findOne({ username: retailerId.toLowerCase(), role: 'retailer' });

        product.retailerId = retailerId;
        product.retailerStatus = 'Assigned';
        product.targetCustomer = targetCustomer.toLowerCase();

        // Auto-register retailer location under authorized centers if not already present
        const alreadyRegistered = (product.authorizedCenters || []).some(c =>
            isNearLocation(c.latitude, c.longitude, ret.latitude, ret.longitude, 10)
        );
        if (!alreadyRegistered) {
            product.authorizedCenters.push({
                name: ret.name,
                address: ret.address,
                latitude: ret.latitude,
                longitude: ret.longitude
            });
        }

        // Log entry in supply chain timeline
        product.supplyChainJourney.push({
            stage: 'Retailer',
            entityId: retailerId,
            name: ret.name,
            action: 'Assigned',
            timestamp: new Date(),
            location: ret.address,
            verified: true
        });

        await product.save();

        // 1. Create System Notifications
        await Notification.create([
            {
                recipient: 'admin',
                recipientRole: 'admin',
                title: '📌 Product Assigned to Retailer',
                message: `You assigned Retailer "${ret.name}" to deliver product "${product.name}" to Customer "${targetCustomer}".`
            },
            {
                recipient: retailerId.toLowerCase(),
                recipientRole: 'retailer',
                title: '📦 New Retail Handover Assigned',
                message: `You are assigned by Manufacturer "${product.manufacturerName}" to deliver product "${product.name}" to Customer "${targetCustomer}".`
            },
            {
                recipient: targetCustomer.toLowerCase(),
                recipientRole: 'user',
                title: '🛍️ Retail Store Assigned to Product',
                message: `Your product "${product.name}" from Manufacturer "${product.manufacturerName}" has been assigned to Retailer "${ret.name}" for delivery handover.`
            }
        ]);

        // 2. Dispatch Email Alerts
        const adminEmail = req.user.email || "admin@cryoledger.com";
        const retEmail = (retUser && retUser.email) ? retUser.email : `${retailerId}@cryoledger.com`;
        const custEmail = customerUser.email || `${targetCustomer}@cryoledger.com`;

        // Resolve carrier details
        const distOfProduct = await Distributor.findOne({ distributorId: product.distributorId });
        const distName = distOfProduct ? distOfProduct.name : "Pre-assigned Carrier";

        // Admin Notification Email
        await sendAssignEmail({
            to: adminEmail,
            subject: `[CryoLedger] Assignment Successful - Product: ${product.name}`,
            text: `Hello Administrator,

You have successfully assigned product "${product.name}" (ID: ${productId}) to Retailer "${ret.name}" targeting customer "${targetCustomer}".`
        });

        // Email to Retailer
        EmailService.sendRetailerAssignmentEmail(retEmail, {
            productId,
            productName: product.name,
            managerName: product.manufacturerName,
            distributorName: distName,
            expectedArrival: 'Within 24 Hours'
        }).catch(err => console.error("[EmailServiceError] Retailer assign email failed:", err));

        // Email to Customer
        EmailService.sendCustomerAssignmentEmail(custEmail, {
            productId,
            productName: product.name,
            distributorName: distName,
            currentStatus: 'Ready for Retail Handover',
            expectedDelivery: 'Within 24 Hours'
        }).catch(err => console.error("[EmailServiceError] Customer assign retailer email failed:", err));

        res.json({ success: true, message: `Product assigned to Retailer "${ret.name}" for Customer "${targetCustomer}" successfully.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Distributor records Receipt
app.post('/api/distributor/receive', authenticateJWT, requireRole('distributor'), async (req, res) => {
    try {
        const { productId, lat, lng } = req.body;
        if (!productId || lat == null || lng == null) {
            return res.status(400).json({ success: false, message: "Missing receipt parameters." });
        }

        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        if (product.distributorId !== req.user.username.toUpperCase()) {
            return res.status(403).json({ success: false, message: "You are not the assigned distributor for this product." });
        }

        const dist = await Distributor.findOne({ distributorId: req.user.username.toUpperCase() });
        if (!dist) return res.status(404).json({ success: false, message: "Distributor profile config missing." });

        // Coordinates check
        const nearCoord = isNearLocation(lat, lng, dist.latitude, dist.longitude, 500); // 500 meters tolerance for depots
        if (!nearCoord) {
            return res.status(400).json({ success: false, message: "Geography check failed. Scanning coordinates must match the distributor depot registered coordinates." });
        }

        product.distributorStatus = 'Received';
        product.distributorReceivedAt = new Date();

        product.supplyChainJourney.push({
            stage: 'Distributor',
            entityId: dist.distributorId,
            name: dist.name,
            action: 'Received',
            timestamp: new Date(),
            location: dist.address,
            verified: true
        });

        await product.save();

        // Send Email to Manager
        const admins = await User.find({ role: 'admin' });
        const managerEmail = (admins.length > 0 && admins[0].email) ? admins[0].email : "admin@cryoledger.com";
        EmailService.sendDistributorAcceptEmail(managerEmail, {
            productId,
            productName: product.name,
            distributorName: dist.name,
            acceptanceTime: new Date().toLocaleString()
        }).catch(err => console.error("[EmailServiceError] Distributor accept email failed:", err));

        res.json({ success: true, message: "Receipt confirmation logged.", data: product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Distributor declines/rejects assignment
app.post('/api/distributor/reject', authenticateJWT, requireRole('distributor'), async (req, res) => {
    try {
        const { productId, reason } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required." });
        }
        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        if (product.distributorId !== req.user.username.toUpperCase()) {
            return res.status(403).json({ success: false, message: "You are not the assigned distributor." });
        }

        product.distributorStatus = 'Pending';
        product.supplyChainJourney.push({
            stage: 'Distributor',
            entityId: req.user.username.toUpperCase(),
            name: req.user.username.toUpperCase(),
            action: 'Rejected',
            timestamp: new Date(),
            location: 'Declined Assignment',
            verified: true
        });
        await product.save();

        // Send decline email to Manager
        const admins = await User.find({ role: 'admin' });
        const managerEmail = (admins.length > 0 && admins[0].email) ? admins[0].email : "admin@cryoledger.com";
        EmailService.sendDistributorRejectEmail(managerEmail, {
            productId,
            productName: product.name,
            distributorName: req.user.username.toUpperCase(),
            reason: reason || 'Distributor declined logistics responsibility.'
        }).catch(err => console.error("[EmailServiceError] Distributor reject email failed:", err));

        res.json({ success: true, message: "Assignment decline logged successfully." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Distributor transfers item to Retailer (Dispatch)
app.post('/api/distributor/transfer', authenticateJWT, requireRole('distributor'), async (req, res) => {
    try {
        const { productId } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required." });
        }

        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        if (product.distributorId !== req.user.username.toUpperCase()) {
            return res.status(403).json({ success: false, message: "You are not the assigned distributor." });
        }

        // Verify retailer pre-assigned by manufacturer (admin)
        if (!product.retailerId) {
            return res.status(400).json({ success: false, message: "No retailer has been pre-assigned to this product by the manufacturer. Please contact the administrator." });
        }

        const retailerId = product.retailerId;
        const ret = await Retailer.findOne({ retailerId });
        if (!ret) return res.status(404).json({ success: false, message: "Assigned retailer profile details not found in system." });

        product.retailerStatus = 'Assigned';
        product.distributorStatus = 'Dispatched';

        product.supplyChainJourney.push({
            stage: 'Distributor',
            entityId: req.user.username.toUpperCase(),
            name: req.user.username.toUpperCase(),
            action: 'Dispatched',
            timestamp: new Date(),
            location: 'Authorized Depot',
            verified: true
        });

        // Add Retailer Assigned stage log if not present already to confirm handover routing
        product.supplyChainJourney.push({
            stage: 'Retailer',
            entityId: retailerId,
            name: ret.name,
            action: 'Assigned',
            timestamp: new Date(),
            location: ret.address,
            verified: true
        });

        await product.save();

        // Notification to Retailer that cargo has been dispatched
        await Notification.create({
            recipient: retailerId.toLowerCase(),
            recipientRole: 'retailer',
            title: '🚚 Cargo Dispatched by Distributor',
            message: `Distributor "${product.distributorId}" has dispatched product "${product.name}" (ID: ${productId}). It is now routing to your storefront location.`
        });

        const admins = await User.find({ role: 'admin' });
        const managerEmail = (admins.length > 0 && admins[0].email) ? admins[0].email : "admin@cryoledger.com";
        const retUser = await User.findOne({ username: retailerId.toLowerCase(), role: 'retailer' });
        const retUserEmail = retUser ? retUser.email : `${retailerId}@cryoledger.com`;
        const custUser = await User.findOne({ username: product.targetCustomer.toLowerCase(), role: 'user' });
        const custUserEmail = custUser ? custUser.email : `${product.targetCustomer}@cryoledger.com`;

        // Event 10: Distributor Started Processing
        EmailService.sendDistributorProcessingEmail(
            { managerEmail, retailerEmail: retUserEmail, customerEmail: custUserEmail },
            {
                managerName: product.manufacturerName,
                retailerName: ret.name,
                customerName: product.targetCustomer,
                productId,
                productName: product.name
            }
        ).catch(err => console.error("[EmailServiceError] processing email failed:", err.message));

        // Event 11: Distributor Prepared Shipment
        EmailService.sendDistributorPreparedEmail(
            { managerEmail, retailerEmail: retUserEmail, customerEmail: custUserEmail },
            {
                managerName: product.manufacturerName,
                retailerName: ret.name,
                customerName: product.targetCustomer,
                productId,
                productName: product.name
            }
        ).catch(err => console.error("[EmailServiceError] prepared email failed:", err.message));

        // Event 12: Distributor Packed Product
        EmailService.sendDistributorPackedEmail(
            { managerEmail, retailerEmail: retUserEmail },
            {
                managerName: product.manufacturerName,
                retailerName: ret.name,
                productId,
                productName: product.name
            }
        ).catch(err => console.error("[EmailServiceError] packed email failed:", err.message));

        // Event 13: Distributor Dispatched Product
        EmailService.sendDistributorDispatchedEmail(
            { retailerEmail: retUserEmail, customerEmail: custUserEmail, managerEmail },
            {
                retailerName: ret.name,
                customerName: product.targetCustomer,
                managerName: product.manufacturerName,
                productId,
                productName: product.name
            }
        ).catch(err => console.error("[EmailServiceError] Product dispatched email failed:", err));

        res.json({ success: true, message: `Product dispatched successfully to pre-assigned Retailer "${ret.name}".` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Retailer records Receipt
app.post('/api/retailer/receive', authenticateJWT, requireRole('retailer'), async (req, res) => {
    try {
        const { productId, lat, lng } = req.body;
        if (!productId || lat == null || lng == null) {
            return res.status(400).json({ success: false, message: "Missing receipt parameters." });
        }

        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        if (product.retailerId !== req.user.username.toUpperCase()) {
            return res.status(403).json({ success: false, message: "You are not the assigned retailer for this product." });
        }

        const ret = await Retailer.findOne({ retailerId: req.user.username.toUpperCase() });
        if (!ret) return res.status(404).json({ success: false, message: "Retailer profile details not found." });

        const nearCoord = isNearLocation(lat, lng, ret.latitude, ret.longitude, 200); // 200 meters tolerance for shops
        if (!nearCoord) {
            return res.status(400).json({ success: false, message: "Geography check failed. Scanning coordinates must match the retailer outlet registered coordinates." });
        }

        product.retailerStatus = 'Received';
        product.retailerReceivedAt = new Date();

        product.supplyChainJourney.push({
            stage: 'Retailer',
            entityId: ret.retailerId,
            name: ret.name,
            action: 'Received',
            timestamp: new Date(),
            location: ret.address,
            verified: true
        });

        await product.save();

        // Send Email to Manager & Distributor
        const admins = await User.find({ role: 'admin' });
        const managerEmail = (admins.length > 0 && admins[0].email) ? admins[0].email : "admin@cryoledger.com";
        const distUser = await User.findOne({ username: product.distributorId.toLowerCase(), role: 'distributor' });
        const distributorEmail = distUser ? distUser.email : `${product.distributorId}@cryoledger.com`;

        EmailService.sendRetailerReceivedEmail(
            { managerEmail, distributorEmail },
            {
                productId,
                productName: product.name,
                receivedTime: new Date().toLocaleString(),
                confirmation: `Store Checked In: ${ret.name}`
            }
        ).catch(err => console.error("[EmailServiceError] Retailer receive email failed:", err));

        res.json({ success: true, message: "Retailer receipt confirmation logged successfully.", data: product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Retailer records Dispatch/Handover to Customer
app.post('/api/retailer/dispatch', authenticateJWT, requireRole('retailer'), async (req, res) => {
    try {
        const { productId } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required." });
        }

        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        if (product.retailerId !== req.user.username.toUpperCase()) {
            return res.status(403).json({ success: false, message: "You are not the assigned retailer." });
        }

        if (product.retailerStatus !== 'Received') {
            return res.status(400).json({ success: false, message: "Product must be received before it can be dispatched." });
        }

        product.retailerStatus = 'Dispatched';

        product.supplyChainJourney.push({
            stage: 'Retailer',
            entityId: req.user.username.toUpperCase(),
            name: req.user.username.toUpperCase(),
            action: 'Dispatched',
            timestamp: new Date(),
            location: 'Authorized Storefront Outlet',
            verified: true
        });

        await product.save();

        // Send Email to Customer & Manager
        const custUser = await User.findOne({ username: product.targetCustomer.toLowerCase(), role: 'user' });
        const customerEmail = custUser ? custUser.email : `${product.targetCustomer}@cryoledger.com`;
        const admins = await User.find({ role: 'admin' });
        const managerEmail = (admins.length > 0 && admins[0].email) ? admins[0].email : "admin@cryoledger.com";

        // Event 15: Retailer Started Delivery
        EmailService.sendRetailerStartedDeliveryEmail(
            { customerEmail, managerEmail },
            {
                customerName: product.targetCustomer,
                managerName: product.manufacturerName,
                productId,
                productName: product.name
            }
        ).catch(err => console.error("[EmailServiceError] Started delivery email failed:", err.message));

        EmailService.sendProductDeliveredEmail(
            { customerEmail, managerEmail },
            {
                productId,
                productName: product.name,
                deliveryTime: new Date().toLocaleString(),
                deliveryConfirmation: `Handover finalized by storefront Retailer: ${req.user.username.toUpperCase()}`
            }
        ).catch(err => console.error("[EmailServiceError] Product delivered email failed:", err));

        res.json({ success: true, message: "Retailer handover/dispatch logged successfully.", data: product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Distributor products list
app.get('/api/distributor/assigned-products', authenticateJWT, requireRole('distributor'), async (req, res) => {
    try {
        const products = await Product.find({
            distributorId: req.user.username.toUpperCase(),
            isReturnedForRecall: { $ne: true }
        });
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Retailer products list
app.get('/api/retailer/assigned-products', authenticateJWT, requireRole('retailer'), async (req, res) => {
    try {
        const products = await Product.find({
            retailerId: req.user.username.toUpperCase(),
            isReturnedForRecall: { $ne: true },
            $or: [
                { distributorId: "" },
                { distributorStatus: "Dispatched" },
                { retailerStatus: { $in: ["Received", "Dispatched"] } }
            ]
        });
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET notifications for the authenticated user
app.get('/api/notifications', authenticateJWT, async (req, res) => {
    try {
        const username = req.user.username.toLowerCase();
        const notifications = await Notification.find({ recipient: username }).sort({ createdAt: -1 });
        res.json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST to mark notifications as read
app.post('/api/notifications/read', authenticateJWT, async (req, res) => {
    try {
        const username = req.user.username.toLowerCase();
        const { notificationIds } = req.body;
        if (!notificationIds || !Array.isArray(notificationIds)) {
            return res.status(400).json({ success: false, message: "notificationIds list is required." });
        }
        await Notification.updateMany(
            { _id: { $in: notificationIds }, recipient: username },
            { $set: { read: true } }
        );
        res.json({ success: true, message: "Notifications marked as read." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET profile details of the logged in user
app.get('/api/user/profile', authenticateJWT, async (req, res) => {
    try {
        const username = req.user.username.toLowerCase();
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        res.json({
            success: true,
            data: {
                username: user.username,
                role: user.role,
                email: user.email || ""
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST to update user profile (email and/or password)
app.post('/api/user/profile', authenticateJWT, async (req, res) => {
    try {
        const username = req.user.username.toLowerCase();
        const { email, currentPassword, newPassword, confirmPassword } = req.body;

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        let updated = false;

        // 1. Update email if provided
        if (email !== undefined) {
            user.email = email.trim();
            updated = true;
        }

        // 2. Update password if requested
        if (currentPassword || newPassword || confirmPassword) {
            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({ success: false, message: "Current password, new password, and retyped confirm password are all required to edit password." });
            }

            // Verify current password
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: "Current password is incorrect." });
            }

            // Verify matches confirmation
            if (newPassword !== confirmPassword) {
                return res.status(400).json({ success: false, message: "New password and confirmation retype do not match." });
            }

            // Hash and update
            user.password = await bcrypt.hash(newPassword, 10);
            updated = true;
        }

        if (updated) {
            await user.save();

            // Event 27: Email Changed Email
            if (email !== undefined && email.trim().toLowerCase() !== user.email) {
                EmailService.sendEmailChangedEmail(user.email, {
                    username: user.username,
                    oldEmail: user.email,
                    newEmail: email.trim()
                }).catch(err => console.error("[EmailServiceError] Email changed email failed:", err.message));
            }

            // Event 26: Profile Updated Email
            const updatedFields = [];
            if (email !== undefined) updatedFields.push("Email Address");
            if (currentPassword || newPassword || confirmPassword) updatedFields.push("Password Configuration");
            EmailService.sendProfileUpdatedEmail(user.email, {
                username: user.username,
                updatedDetails: `Updated fields: ${updatedFields.join(", ")}`
            }).catch(err => console.error("[EmailServiceError] Profile updated email failed:", err.message));

            // Event 28: Role Changed Email (if requested/provided)
            if (req.body.role && req.body.role !== user.role) {
                const oldRole = user.role;
                user.role = req.body.role;
                await user.save();
                EmailService.sendRoleChangedEmail(user.email, {
                    username: user.username,
                    oldRole,
                    newRole: user.role
                }).catch(err => console.error("[EmailServiceError] Role update email failed:", err.message));
            }

            // If password was edited/updated, dispatch secure change notification code
            if ((currentPassword || newPassword || confirmPassword) && user.email) {
                EmailService.sendPasswordChangedEmail(user.email, { username: user.username })
                    .catch(err => console.error("[EmailServiceError] Profile password changed email failed:", err));
            }

            res.json({ success: true, message: "Profile updated successfully." });
        } else {
            res.status(400).json({ success: false, message: "No changes or valid update fields provided." });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// Customer submits Star Rating Feedback which dynamically updates product overallHealth status
app.post('/api/product/feedback', async (req, res) => {
    try {
        const { productId, rating } = req.body;
        if (!productId || rating == null) {
            return res.status(400).json({ success: false, message: "Product ID and rating are required." });
        }

        const ratingNum = parseInt(rating, 10);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ success: false, message: "Rating must be an integer between 1 and 5." });
        }

        const product = await Product.findOne({ productId });
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });

        // Map stars to health statuses
        let calculatedHealth = "Optimal";
        if (ratingNum === 5) calculatedHealth = "Optimal";
        else if (ratingNum === 4) calculatedHealth = "Healthy";
        else if (ratingNum === 3) calculatedHealth = "Fair / Notice";
        else if (ratingNum === 2) calculatedHealth = "Suspicious / Warning";
        else calculatedHealth = "Compromised / Critical";

        // Log this feedback to verification history for transparent audit
        product.verificationHistory.push({
            timestamp: new Date(),
            verifierLocation: `Star Rating: ${ratingNum} Stars`,
            latitude: 0,
            longitude: 0,
            matchedCenter: `Star Rating: ${ratingNum} Stars`,
            status: `Customer Feedback: ${calculatedHealth}`,
            neglected: false
        });

        await product.save();

        res.json({
            success: true,
            message: `Feedback registered! Product health is now evaluated as "${calculatedHealth}".`,
            overallHealth: calculatedHealth
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Return Product for Manufacturer Recall with Credential Verification
app.post('/api/product/return-recall', authenticateJWT, async (req, res) => {
    try {
        const { productId, password } = req.body;
        if (!productId || !password) {
            return res.status(400).json({ success: false, message: "Product ID and password are required." });
        }

        const product = await Product.findOne({ productId });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Validate user password using bcrypt
        const userObj = await User.findOne({ username: req.user.username });
        if (!userObj) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const isMatch = await bcrypt.compare(password, userObj.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Incorrect authorization password." });
        }

        if (product.isReturnedForRecall) {
            return res.status(400).json({ success: false, message: "Product has already been returned." });
        }

        // Mark product returned
        product.isReturnedForRecall = true;
        product.returnedByRole = req.user.role;
        product.returnedByUsername = req.user.username;

        // Push surrender event log to supplyChainJourney
        product.supplyChainJourney.push({
            stage: req.user.role === 'distributor' ? 'Distributor' : (req.user.role === 'retailer' ? 'Retailer' : 'Customer'),
            entityId: req.user.username,
            name: req.user.username.toUpperCase(),
            action: 'Returned for Recall',
            location: 'Logistics Custody Surrendered',
            verified: true,
            timestamp: new Date()
        });

        await product.save();

        res.json({ success: true, message: "Product custody surrendered successfully for recall." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CASCADE DELETION API
// ============================================
app.delete('/api/admin/product/:productId', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
        const { productId } = req.params;

        const product = await Product.findOne({ productId });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        if (product.createdByAdmin && product.createdByAdmin !== req.user.username) {
            return res.status(403).json({ success: false, message: "Access Denied: You do not own this product." });
        }

        // 1. Delete QR image from filesystem
        if (product.qrCodePath) {
            const fileName = path.basename(product.qrCodePath);
            const filePath = path.join(qrCodesDir, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // 2. Delete Access Requests associated
        await AccessRequest.deleteMany({ productId });

        // Event 6: Product Deleted & Event 21: Order Cancelled
        const custUser = await User.findOne({ username: product.targetCustomer.toLowerCase(), role: 'user' });
        const customerEmail = custUser ? custUser.email : `${product.targetCustomer}@cryoledger.com`;

        const distUserObj = await User.findOne({ username: product.distributorId?.toLowerCase(), role: 'distributor' });
        const distUserEmail = distUserObj ? distUserObj.email : `${product.distributorId}@cryoledger.com`;

        const retUserObj = await User.findOne({ username: product.retailerId?.toLowerCase(), role: 'retailer' });
        const retUserEmail = retUserObj ? retUserObj.email : `${product.retailerId}@cryoledger.com`;

        const adminEmail = req.user.email || "admin@cryoledger.com";

        // Event 6: Product Deleted
        EmailService.sendProductDeletedEmail(
            { managerEmail: adminEmail, distributorEmail: distUserEmail, retailerEmail: retUserEmail, customerEmail },
            { productId, productName: product.name }
        ).catch(err => console.error("[EmailServiceError] Product deleted email failed:", err.message));

        // Event 21: Order Cancelled
        EmailService.sendOrderCancelledEmail(
            { customerEmail, managerEmail: adminEmail, distributorEmail: distUserEmail, retailerEmail: retUserEmail },
            { orderId: productId, reason: "Product deleted/cancelled from the supply chain registry." }
        ).catch(err => console.error("[EmailServiceError] Order cancelled email failed:", err.message));

        // 3. Delete Product record itself (history and recalls cascade as they are subdocuments)
        await Product.deleteOne({ productId });

        res.json({ success: true, message: `Product "${productId}" and all associated logs deleted successfully.` });
    } catch (error) {
        console.error("Deletion error:", error);
        res.status(500).json({ success: false, message: "Error deleting product record.", error: error.message });
    }
});


// Test Email Route
app.post('/api/email/test', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required for testing." });
        }
        await EmailService.sendWelcomeEmail(email, { username: "TestUser", role: "user" });
        res.json({ success: true, message: `Test email dispatched successfully to ${email}. Check sent_emails.txt or inbox.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to dispatch test email.", error: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
