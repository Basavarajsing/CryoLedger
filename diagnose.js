require('dotenv').config({ override: true });
const mongoose = require('mongoose');
const Product = require('./models/Product');
const AccessRequest = require('./models/AccessRequest');
const Distributor = require('./models/Distributor');

const MONGO_URI = process.env.MONGODB_URI;

async function run() {
    try {
        console.log("Connecting to:", MONGO_URI);
        await mongoose.connect(MONGO_URI, { dbName: 'cryoledger' });
        console.log("Connected successfully!");

        console.log("Testing aggregate queries...");
        const totalProducts = await Product.countDocuments();
        const verifiedProductsCount = await Product.countDocuments({ scanCount: { $gt: 0 } });
        const pendingRequests = await AccessRequest.countDocuments({ status: 'Pending' });
        const approvedRequests = await AccessRequest.countDocuments({ status: 'Approved' });
        const rejectedRequests = await AccessRequest.countDocuments({ status: 'Rejected' });
        const activeWarranties = await Product.countDocuments({ warrantyActivated: true, warrantyStatus: 'Active' });
        const expiredWarranties = await Product.countDocuments({ warrantyActivated: true, warrantyStatus: 'Expired' });

        console.log("Counts loaded successfully. Running loops...");
        const products = await Product.find({ warrantyActivated: true, warrantyStatus: 'Active' });
        const now = new Date();
        let nearExpiryWarranties = 0;
        for (const p of products) {
            if (p.warrantyEndDate) {
                const diffTime = Math.abs(p.warrantyEndDate - now);
                const remaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (remaining <= 30) nearExpiryWarranties++;
            }
        }
        console.log("Near expiry check success.");

        const totalRecalled = await Product.countDocuments({ isRecalled: true });
        const activeRecalls = await Product.countDocuments({ isRecalled: true });
        const completedRecalls = await Product.countDocuments({ isRecalled: false, recallDate: { $ne: null } });

        const allProducts = await Product.find({});
        let totalAuthorizedCentres = 0;
        let unauthorizedAttempts = 0;
        let successfulVerifications = 0;
        let totalScans = 0;
        const allVerifications = [];

        allProducts.forEach((p, idx) => {
            try {
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
            } catch (err) {
                console.error(`Error on product index ${idx} ID ${p.productId}:`, err.message);
                throw err;
            }
        });
        console.log("Verification history loops success.");

        const topVerifiedProducts = await Product.find({}, 'productId name scanCount')
            .sort({ scanCount: -1 })
            .limit(5);

        const manufacturerCounts = {};
        allProducts.forEach(p => {
            if (p.manufacturerName) {
                manufacturerCounts[p.manufacturerName] = (manufacturerCounts[p.manufacturerName] || 0) + 1;
            }
        });
        const topManufacturers = Object.keys(manufacturerCounts).map(name => ({
            name,
            count: manufacturerCounts[name]
        })).sort((a, b) => b.count - a.count).slice(0, 5);

        const monthlyProducts = {};
        allProducts.forEach(p => {
            const date = new Date(p.createdAt || new Date());
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyProducts[key] = (monthlyProducts[key] || 0) + 1;
        });

        console.log("Sorting verifications...");
        allVerifications.sort((a, b) => new Date(b.verifiedAt) - new Date(a.verifiedAt));
        const recentActivity = allVerifications.slice(0, 10);

        console.log("Loading latest requests...");
        const latestRequestsList = await AccessRequest.find().sort({ createdAt: -1 }).limit(10);
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
        console.log("DIAGNOSTICS SUCCESS! No errors thrown.");
        process.exit(0);
    } catch (error) {
        console.error("DIAGNOSTICS FAILED:", error);
        process.exit(1);
    }
}

run();
