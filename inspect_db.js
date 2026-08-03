const mongoose = require('mongoose');
require("dotenv").config({ override: true });

const User = require('./models/User');
const Distributor = require('./models/Distributor');
const Retailer = require('./models/Retailer');
const Product = require('./models/Product');

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI, { dbName: 'cryoledger' });
        console.log("Connected.\n");

        console.log("=== USERS ===");
        const users = await User.find({});
        users.forEach(u => console.log(`Username: ${u.username}, Role: ${u.role}, Email: ${u.email}`));

        console.log("\n=== DISTRIBUTORS ===");
        const dists = await Distributor.find({});
        dists.forEach(d => console.log(`ID: ${d.distributorId}, Name: ${d.name}, Latitude: ${d.latitude}, Longitude: ${d.longitude}`));

        console.log("\n=== RETAILERS ===");
        const rets = await Retailer.find({});
        rets.forEach(r => console.log(`ID: ${r.retailerId}, Name: ${r.name}, Latitude: ${r.latitude}, Longitude: ${r.longitude}`));

        console.log("\n=== PRODUCTS ===");
        const prods = await Product.find({});
        prods.forEach(p => {
            console.log(`Product ID: ${p.productId}, Name: ${p.name}, Distributor: ${p.distributorId}, DistributorStatus: ${p.distributorStatus}, Retailer: ${p.retailerId}, RetailerStatus: ${p.retailerStatus}, TargetCust: ${p.targetCustomer}`);
        });

        console.log("\nDone.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
