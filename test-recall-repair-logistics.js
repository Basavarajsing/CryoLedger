const http = require('http');

function requestJSON(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const headers = {};
        let bodyText = '';
        if (data) {
            bodyText = JSON.stringify(data);
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(bodyText);
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5000,
            path: path,
            method: method,
            headers: headers
        }, (res) => {
            let respData = '';
            res.on('data', chunk => respData += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(respData) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: respData });
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(bodyText);
        }
        req.end();
    });
}

const post = (path, data, token) => requestJSON('POST', path, data, token);
const get = (path, token) => requestJSON('GET', path, null, token);
const del = (path, token) => requestJSON('DELETE', path, null, token);

async function run() {
    console.log("=== CRYOLEDGER E2E WORKFLOW VERIFICATION ===");
    try {
        const timestamp = Date.now();
        const adminUser = `admin_${timestamp}`;
        const distributorId = `DIST_${timestamp}`;
        const retailerId = `RET_${timestamp}`;
        const customerUser = `cust_${timestamp}`;
        const productId = `PROD-TEST-${timestamp}`;

        // 1. Register Admin
        console.log("Registering Admin...");
        const regAdmin = await post('/api/auth/register', { username: adminUser, password: "AdminPassword123", role: "admin", email: `admin_${timestamp}@cryoledger.com` });
        if (regAdmin.status !== 201 && regAdmin.status !== 200) {
            throw new Error(`Admin registration failed: ${JSON.stringify(regAdmin)}`);
        }
        console.log("Admin registered successfully.");

        // Login Admin
        console.log("Logging in Admin...");
        const loginAdmin = await post('/api/auth/login', { username: adminUser, password: "AdminPassword123", role: "admin" });
        const adminToken = loginAdmin.body.token;
        if (!adminToken) throw new Error(`Admin login failed: ${JSON.stringify(loginAdmin.body)}`);
        console.log("Admin logged in successfully.");

        // Register Target Customer User
        console.log(`Registering Target Customer "${customerUser}"...`);
        const regCust = await post('/api/auth/register', { username: customerUser, password: "CustPassword123", role: "user", email: `customer_${timestamp}@cryoledger.com` });
        if (regCust.status !== 201 && regCust.status !== 200) {
            throw new Error(`Customer registration failed: ${JSON.stringify(regCust)}`);
        }
        console.log("Customer registered successfully.");

        // 2. Admin Registers Distributor
        console.log(`Registering Distributor "${distributorId}"...`);
        const regDist = await post('/api/admin/distributor', {
            distributorId: distributorId,
            name: "Test Distributor Depot",
            address: "123 Bangalore Logistics Center",
            latitude: 12.9716,
            longitude: 77.5946,
            contact: "+91 9999988888",
            email: `distributor_${timestamp}@cryoledger.com`
        }, adminToken);
        if (regDist.status !== 201) throw new Error(`Distributor registration failed: ${JSON.stringify(regDist)}`);

        // 3. Admin Registers Retailer
        console.log(`Registering Retailer "${retailerId}"...`);
        const regRet = await post('/api/admin/retailer', {
            retailerId: retailerId,
            name: "Test Retailer Outlet",
            address: "456 Mumbai Retail Plaza",
            latitude: 19.0760,
            longitude: 72.8777,
            contact: "+91 8888877777",
            email: `retailer_${timestamp}@cryoledger.com`
        }, adminToken);
        if (regRet.status !== 201) throw new Error(`Retailer registration failed: ${JSON.stringify(regRet)}`);

        // Login Distributor
        console.log("Logging in Distributor...");
        const loginDist = await post('/api/auth/login', { username: distributorId.toLowerCase(), password: "@Distributor123", role: "distributor" });
        const distToken = loginDist.body.token;
        if (!distToken) throw new Error(`Distributor login failed: ${JSON.stringify(loginDist.body)}`);

        // Login Retailer
        console.log("Logging in Retailer...");
        const loginRet = await post('/api/auth/login', { username: retailerId.toLowerCase(), password: "@Retailer123", role: "retailer" });
        const retToken = loginRet.body.token;
        if (!retToken) throw new Error(`Retailer login failed: ${JSON.stringify(loginRet.body)}`);

        // 4. Admin Registers Product
        console.log(`Registering Product "${productId}"...`);
        const regProd = await post('/add-product', {
            productId,
            name: "Cryogenic Vault Safe V1",
            manufacturerName: "CryoLabs Inc",
            manufacturerAddress: "Bangalore HQ",
            manufacturerLocation: {
                address: "Bangalore HQ",
                latitude: 12.9716,
                longitude: 77.5946
            },
            authorizedCenters: [
                { name: "Mfr HQ", address: "Bangalore HQ", latitude: 12.9716, longitude: 77.5946 },
                { name: "Dist Depot", address: "123 Bangalore Logistics Center", latitude: 12.9716, longitude: 77.5946 },
                { name: "Ret Outlet", address: "456 Mumbai Retail Plaza", latitude: 19.0760, longitude: 72.8777 }
            ],
            brand: "CryoSafe",
            category: "Storage",
            modelNumber: "CS-V1",
            batchNumber: `BATCH-${timestamp}`,
            warrantyAvailable: "Yes",
            warrantyPeriod: 12,
            warrantyType: "Replacement",
            warrantyTerms: "Standard usage warranty term."
        }, adminToken);
        if (regProd.status !== 201 && regProd.status !== 200) {
            throw new Error(`Product registration failed: ${JSON.stringify(regProd)}`);
        }
        console.log("Product registered successfully.");

        // 5. Admin Assigns Distributor & Retailer
        console.log("Assigning Product to Distributor...");
        const assignDist = await post(`/api/admin/product/${productId}/assign-distributor`, {
            distributorId: distributorId.toUpperCase(),
            targetCustomer: customerUser
        }, adminToken);
        if (assignDist.body.success !== true) throw new Error(`Assign Distributor failed: ${JSON.stringify(assignDist.body)}`);

        console.log("Assigning Product to Retailer...");
        const assignRet = await post(`/api/admin/product/${productId}/assign-retailer`, {
            retailerId: retailerId.toUpperCase(),
            targetCustomer: customerUser
        }, adminToken);
        if (assignRet.body.success !== true) throw new Error(`Assign Retailer failed: ${JSON.stringify(assignRet.body)}`);
        console.log("Product pre-assignments completed.");

        // 6. Verification: Distributor List has product, Retailer list does NOT
        console.log("Verifying Distributor visibility...");
        const distAssigned = await get('/api/distributor/assigned-products', distToken);
        const distHasProd = distAssigned.body.data.some(p => p.productId === productId);
        if (!distHasProd) throw new Error("Product not in distributor list!");

        console.log("Verifying Retailer eligibility (should not show before distributor dispatches)...");
        const retAssignedBefore = await get('/api/retailer/assigned-products', retToken);
        const retHasProdBefore = retAssignedBefore.body.data.some(p => p.productId === productId);
        if (retHasProdBefore) throw new Error("Product displayed in retailer list prematurely!");
        console.log("Visibility validation passed.");

        // 7. Distributor Check-in / Receive (Ingestion)
        console.log("Distributor receiving product...");
        const distReceive = await post('/api/distributor/receive', {
            productId,
            lat: 12.9716,
            lng: 77.5946
        }, distToken);
        if (distReceive.body.success !== true) throw new Error(`Distributor receipt failed: ${JSON.stringify(distReceive.body)}`);

        // 8. Distributor Dispatch (transfer - restricted to productId in body, preassigned retailer)
        console.log("Distributor dispatching product (restricted transfer)...");
        const distTransfer = await post('/api/distributor/transfer', { productId }, distToken);
        if (distTransfer.body.success !== true) throw new Error(`Distributor transfer failed: ${JSON.stringify(distTransfer.body)}`);
        console.log("Distributor dispatch successfully forwarded consignment to pre-assigned retailer without body request input.");

        // 9. Verification: Retailer List now HAS product
        console.log("Verifying Retailer visibility after distributor dispatch...");
        const retAssignedAfter = await get('/api/retailer/assigned-products', retToken);
        const retHasProdAfter = retAssignedAfter.body.data.some(p => p.productId === productId);
        if (!retHasProdAfter) throw new Error("Product not visible in retailer list post-dispatch!");

        // 10. Retailer Ingests / Receives (Geocheck)
        console.log("Retailer receiving product...");
        const retReceive = await post('/api/retailer/receive', {
            productId,
            lat: 19.0760,
            lng: 72.8777
        }, retToken);
        if (retReceive.body.success !== true) throw new Error(`Retailer receipt failed: ${JSON.stringify(retReceive.body)}`);

        // 11. Retailer Dispatches/Handovers to customer
        console.log("Retailer dispatching/handing over to customer...");
        const retDispatch = await post('/api/retailer/dispatch', { productId }, retToken);
        if (retDispatch.body.success !== true) throw new Error(`Retailer handover failed: ${JSON.stringify(retDispatch.body)}`);

        // Login target customer
        console.log("Logging in Customer...");
        const loginCust = await post('/api/auth/login', { username: customerUser, password: "CustPassword123", role: "user" });
        const usrToken = loginCust.body.token;
        if (!usrToken) throw new Error(`Customer login failed: ${JSON.stringify(loginCust.body)}`);

        // Test customer scans product check-in at UNAUTHORIZED coordinates showing geofence warning
        console.log("Customer scanning product check-in at UNAUTHORIZED coordinates...");
        const scanRes = await get(`/verify/${productId}?lat=10.0&lng=10.0&locationText=InvalidCoordsLoc`, usrToken);
        if (scanRes.body.success === true) {
            throw new Error(`Expected geocheck failure, but was successful: ${JSON.stringify(scanRes.body)}`);
        }
        if (scanRes.body.message !== "Warning: Product custody handover not completed. Details are protected.") {
            throw new Error(`Expected specific warning message for customer handover. Got: "${scanRes.body.message}"`);
        }
        console.log("Customer geofence handover block warning check passed!");

        // 11b. Verify public user-locations endpoint
        console.log("Verifying public user locations API...");
        const locationsRes = await get('/api/public/user-locations');
        if (locationsRes.body.success !== true) {
            throw new Error(`User locations API error: ${JSON.stringify(locationsRes.body)}`);
        }
        console.log(`Successfully retrieved ${locationsRes.body.count} user locations.`);
        if (locationsRes.body.data.length > 0) {
            const sample = locationsRes.body.data[0];
            if (!sample.name || !sample.role || typeof sample.lat !== 'number' || typeof sample.lng !== 'number') {
                throw new Error(`Invalid location entry schema: ${JSON.stringify(sample)}`);
            }
        }
        console.log("Public user locations validation passed!");

        // 12. Customer submits feedback rating
        console.log("Customer registering feedback with 5-star rating...");
        const fbRes = await post('/api/product/feedback', { productId, rating: 5 }, usrToken);
        if (fbRes.body.success !== true) throw new Error(`Feedback submission failed: ${JSON.stringify(fbRes.body)}`);
        console.log("Customer feedback logged.");

        // 13. Admin checks rating-stats
        console.log("Admin checking dashboard rating stats...");
        const statsRes = await get('/api/admin/rating-stats', adminToken);
        const productStats = statsRes.body.data.productBreakdown.find(p => p.productId === productId);
        if (!productStats) throw new Error("Product not in admin ratingStats list.");
        if (productStats.averageRating !== 5) throw new Error(`Incorrect rating aggregation. Got ${productStats.averageRating}, expected 5`);
        console.log("Rating statistics correctly aggregated.");

        // 14. Admin issues product Recall
        console.log("Admin issuing recall on product...");
        const recallRes = await post('/api/admin/recall-product', {
            productId,
            reason: "Faulty internal battery sensor.",
            severity: "High",
            refundAvailable: true
        }, adminToken);
        if (recallRes.body.success !== true) throw new Error(`Admin recall failed: ${JSON.stringify(recallRes.body)}`);

        // 15. Surrender Custody / Return Recall
        console.log("Retailer surrendering custody back for recall (verifying admin credentials via password confirmation)...");
        const surrenderRes = await post('/api/product/return-recall', {
            productId,
            password: "@Retailer123"
        }, retToken);
        if (surrenderRes.body.success !== true) throw new Error(`Custody return surrender failed: ${JSON.stringify(surrenderRes.body)}`);
        console.log("Returned for recall status logged.");

        // 16. Verification: Returned product is hidden from distributor/retailer lists
        console.log("Checking if returned product is hidden from distributor assignments...");
        const distAssignedRecall = await get('/api/distributor/assigned-products', distToken);
        const hasProdDistRecall = distAssignedRecall.body.data.some(p => p.productId === productId);
        if (hasProdDistRecall) throw new Error("Recalled returned product should be hidden from distributor dashboard list!");

        console.log("Checking if returned product is hidden from retailer assignments...");
        const retAssignedRecall = await get('/api/retailer/assigned-products', retToken);
        const hasProdRetRecall = retAssignedRecall.body.data.some(p => p.productId === productId);
        if (hasProdRetRecall) throw new Error("Recalled returned product should be hidden from retailer dashboard list!");
        console.log("Hiding filters validation passed.");

        // 17. Admin Repairs and Re-releases Product
        console.log("Admin performing product repair & re-release...");
        const repairRes = await post(`/api/admin/product/${productId}/repair`, null, adminToken);
        if (repairRes.body.success !== true) throw new Error(`Admin repair failed: ${JSON.stringify(repairRes.body)}`);

        // Check if flags are reset
        const viewDetails = await get(`/product/${productId}`, adminToken);
        if (viewDetails.body.data.isRecalled === true || viewDetails.body.data.isReturnedForRecall === true) {
            throw new Error(`Recall flags were not cleared after repair: ${JSON.stringify(viewDetails.body.data)}`);
        }
        console.log("Admin product repair reset database state correctly.");

        // 18. Admin Cascade Deletion Verification
        console.log("Testing Admin product cascade deletion...");
        const deleteRes = await del(`/api/admin/product/${productId}`, adminToken);
        if (deleteRes.body.success !== true) throw new Error(`Cascade deletion failed: ${JSON.stringify(deleteRes.body)}`);
        console.log("Product records and cascade logs deleted successfully.");

        // Clean up distributor, retailer & customer items added
        console.log("Cleaning up registered distributor, retailer and customer...");
        const deleteDist = await del(`/api/admin/distributor/${regDist.body.data._id}`, adminToken);
        if (deleteDist.status !== 200) console.warn("Could not clean up distributor.");
        const deleteRet = await del(`/api/admin/retailer/${regRet.body.data._id}`, adminToken);
        if (deleteRet.status !== 200) console.warn("Could not clean up retailer.");
        // Admin deletes the custom customer user credential
        const deleteCust = await del(`/api/admin/user/${customerUser}`, adminToken);
        // Note: is there a delete user endpoint? If not, we don't worry about it because it's a test DB.
        console.log("E2E tests clean up completed.");

        console.log("\n>>> ALL WORKFLOW TESTS PASSED SUCCESSFULLY! <<<");

    } catch (e) {
        console.error("\n>>> WORKFLOW VERIFICATION FAILED! <<<");
        console.error(e.message);
        process.exit(1);
    }
}

run();
