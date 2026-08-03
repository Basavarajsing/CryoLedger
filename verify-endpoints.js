const http = require('http');

function postJSON(path, data, token = null) {
    return new Promise((resolve, reject) => {
        const bodyText = JSON.stringify(data);
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyText)
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5000,
            path: path,
            method: 'POST',
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        req.write(bodyText);
        req.end();
    });
}

function deleteRequest(path, token = null) {
    return new Promise((resolve, reject) => {
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5000,
            path: path,
            method: 'DELETE',
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function getJSON(path, token) {
    return new Promise((resolve, reject) => {
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5000,
            path: path,
            method: 'GET',
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    try {
        console.log("=== CRYOLEDGER PRODUCT ASSIGNMENT & RECALL TEST ===");

        // 1. Admin login/registration
        const adminCredentials = {
            username: "admin_test_" + Date.now(),
            password: "testpassword123",
            role: "admin",
            email: "admin_test_" + Date.now() + "@example.com"
        };
        console.log(`Registering test admin: ${adminCredentials.username}...`);
        await postJSON('/api/auth/register', adminCredentials);

        console.log("Logging in as admin...");
        const loginRes = await postJSON('/api/auth/login', adminCredentials);
        if (!loginRes.body || !loginRes.body.success) {
            console.error("Login failed!", loginRes.body);
            process.exit(1);
        }
        const token = loginRes.body.token;
        console.log("Admin logged in. Token acquired.");

        // 2. Register test distributor
        const distId = "DIST_TEST_" + Date.now();
        console.log(`Registering test distributor: ${distId}...`);
        const distRes = await postJSON('/api/admin/distributor', {
            distributorId: distId,
            name: "Distributor Test Corp",
            address: "123 Depot St, Cold City",
            latitude: 12.345678,
            longitude: 76.543210,
            contact: "+15550199"
        }, token);
        console.log("Distributor reg status:", distRes.status, distRes.body.success ? "Success" : "Failed");

        // 3. Register test retailer
        const retId = "RET_TEST_" + Date.now();
        console.log(`Registering test retailer: ${retId}...`);
        const retRes = await postJSON('/api/admin/retailer', {
            retailerId: retId,
            name: "Retailer Test Shop",
            address: "456 Retail Blvd, Commerce town",
            latitude: 12.355678,
            longitude: 76.553210,
            contact: "+15550188"
        }, token);
        console.log("Retailer reg status:", retRes.status, retRes.body.success ? "Success" : "Failed");

        // 4. Clean and Register test product
        const prodId = "TEST-PROD-999";
        console.log(`Checking/cleaning product ${prodId}...`);
        await deleteRequest(`/api/admin/product/${prodId}`, token);

        console.log("Registering product...");
        const prodRes = await postJSON('/add-product', {
            productId: prodId,
            name: "VaxShield Cold Vaccine",
            manufacturerName: "BioPharma Lab",
            manufacturerAddress: "777 Industry Rd",
            manufacturerLocation: {
                address: "777 Industry Rd, Sector 4",
                latitude: 12.333333,
                longitude: 76.533333
            },
            authorizedCenters: [
                {
                    name: "Central Pharmacy Hub",
                    address: "888 Central Way",
                    latitude: 12.333555,
                    longitude: 76.533555
                }
            ],
            brand: "VaxShield",
            category: "Vaccine",
            modelNumber: "VS-100",
            batchNumber: "B-2026",
            expiryDate: "2028-12-31",
            productImage: "",
            warrantyAvailable: "No",
            warrantyPeriod: 0,
            warrantyType: "",
            warrantyTerms: ""
        }, token);
        console.log("Product reg status:", prodRes.status, prodRes.body.success ? "Success" : "Failed");

        // 5. Test Register Customer User First
        const targetCustCreds = {
            username: "cust_target_" + Date.now(),
            password: "customerpass123",
            role: "user",
            email: "targetcustomer_" + Date.now() + "@example.com"
        };
        console.log(`Registering target customer: ${targetCustCreds.username}...`);
        await postJSON('/api/auth/register', targetCustCreds);

        console.log("Logging in target customer...");
        const custLogin = await postJSON('/api/auth/login', targetCustCreds);
        console.log("custLogin response:", custLogin.status, custLogin.body);
        const targetCustToken = custLogin.body ? custLogin.body.token : null;

        // 6. Test Distributor Assignment with targetCustomer
        console.log(`Assigning product ${prodId} to Distributor ${distId} for customer ${targetCustCreds.username}...`);
        const assignDistRes = await postJSON(`/api/admin/product/${prodId}/assign-distributor`, {
            distributorId: distId,
            targetCustomer: targetCustCreds.username
        }, token);
        if (assignDistRes.status !== 200 || !assignDistRes.body.success) {
            throw new Error(`Distributor assignment failed: ${JSON.stringify(assignDistRes.body)}`);
        }
        console.log("✔ Distributor assigned successfully!");

        // 7. Test Retailer Assignment with targetCustomer
        console.log(`Assigning product ${prodId} to Retailer ${retId} for customer ${targetCustCreds.username}...`);
        const assignRetRes = await postJSON(`/api/admin/product/${prodId}/assign-retailer`, {
            retailerId: retId,
            targetCustomer: targetCustCreds.username
        }, token);
        if (assignRetRes.status !== 200 || !assignRetRes.body.success) {
            throw new Error(`Retailer assignment failed: ${JSON.stringify(assignRetRes.body)}`);
        }
        console.log("✔ Retailer assigned successfully!");

        // 7.1 Verify System Notifications for Customer
        console.log("Fetching notifications for target customer...");
        const targetCustNotif = await getJSON('/api/notifications', targetCustToken);
        console.log("targetCustNotif status:", targetCustNotif.status, "body:", targetCustNotif.body, "raw:", targetCustNotif.raw);
        if (targetCustNotif.status !== 200 || !targetCustNotif.body || !targetCustNotif.body.success) {
            throw new Error(`Failed to fetch notifications: status ${targetCustNotif.status}, body ${JSON.stringify(targetCustNotif.body)}, raw ${targetCustNotif.raw}`);
        }
        console.log(`Found ${targetCustNotif.body.data.length} notifications. Title of first: "${targetCustNotif.body.data[0].title}"`);
        if (targetCustNotif.body.data.length < 2) {
            throw new Error(`Expected at least 2 notifications for customer, got: ${targetCustNotif.body.data.length}`);
        }
        console.log("✔ Customer notifications fetched successfully!");

        // 7.2 Verify Clearing/Marking Read
        const unreadIds = targetCustNotif.body.data.map(n => n._id);
        console.log("Marking all target customer notifications as read...");
        const markReadRes = await postJSON('/api/notifications/read', { notificationIds: unreadIds }, targetCustToken);
        if (markReadRes.status !== 200 || !markReadRes.body.success) {
            throw new Error(`Failed to mark notifications read: ${JSON.stringify(markReadRes.body)}`);
        }
        console.log("✔ Notifications marked read successfully!");

        // 8. Test Issue Product Recall
        console.log(`Issuing recall on product ${prodId}...`);
        const recallRes = await postJSON('/api/admin/recall-product', {
            productId: prodId,
            reason: "Temperature violation in storage",
            severity: "High",
            instructions: "Return units to nearest center immediately",
            refundAvailable: true,
            nearestCentre: "Central Pharmacy Hub"
        }, token);

        console.log("Recall status:", recallRes.status, recallRes.body.success ? "Success" : "Failed");
        if (recallRes.status !== 200 || !recallRes.body.success) {
            throw new Error(`Product recall issue failed: ${JSON.stringify(recallRes.body)}`);
        }

        // Fetch product as target customer (should succeed or get details since we are targetCustomer)
        const verifyRecalledRes = await getJSON(`/product/${prodId}`, targetCustToken);
        if (verifyRecalledRes.body.data.isRecalled !== true) {
            throw new Error("Product should have been marked as recalled, but isRecalled is false.");
        }
        if (verifyRecalledRes.body.data.recallReason !== "Temperature violation in storage") {
            throw new Error(`Incorrect recallReason: ${verifyRecalledRes.body.data.recallReason}`);
        }
        console.log("✔ Product marked as Recalled successfully!");

        // 9. Return recall verification tests
        const distUserCreds = {
            username: "dist_user_" + Date.now(),
            password: "distpassword123",
            role: "distributor",
            email: "dist_user_" + Date.now() + "@example.com"
        };
        console.log(`Registering test distributor user: ${distUserCreds.username}...`);
        await postJSON('/api/auth/register', distUserCreds);

        console.log("Logging in as distributor user...");
        const distLogin = await postJSON('/api/auth/login', distUserCreds);
        const distToken = distLogin.body.token;

        // Try returning with incorrect password
        console.log("Testing return recall with incorrect password...");
        const failReturn = await postJSON('/api/product/return-recall', {
            productId: prodId,
            password: "wrongpassword"
        }, distToken);
        if (failReturn.status === 200) {
            throw new Error("Return recall should have failed with incorrect password, but got 200.");
        }
        console.log(`✔ Failed as expected: status ${failReturn.status}`);

        // Try returning with correct password
        console.log("Testing return recall with correct password...");
        const successReturn = await postJSON('/api/product/return-recall', {
            productId: prodId,
            password: distUserCreds.password
        }, distToken);
        if (successReturn.status !== 200 || !successReturn.body.success) {
            throw new Error(`Return recall failed with correct password: ${JSON.stringify(successReturn.body)}`);
        }
        console.log("✔ Returned successfully!");

        // Assert cascading access block for consumer (user role)
        const customerCreds = {
            username: "customer_test_" + Date.now(),
            password: "customerpassword123",
            role: "user",
            email: "customer_test_" + Date.now() + "@example.com"
        };
        console.log(`Registering customer user: ${customerCreds.username}...`);
        await postJSON('/api/auth/register', customerCreds);

        console.log("Logging in as customer user...");
        const customerLogin = await postJSON('/api/auth/login', customerCreds);
        const customerToken = customerLogin.body.token;

        console.log("Verifying customer access block (expecting 403)...");
        const accessCheck = await getJSON(`/product/${prodId}`, customerToken);
        if (accessCheck.status !== 403) {
            throw new Error(`Cascading access block failed: customer got status ${accessCheck.status} instead of 403.`);
        }
        console.log("✔ Customer access blocked as expected (403 Forbidden).");

        // 8. Test Clear/Cancel Recall
        console.log(`Clearing recall on product ${prodId}...`);
        const cancelRes = await postJSON('/api/admin/cancel-recall', {
            productId: prodId
        }, token);

        console.log("Cancel recall status:", cancelRes.status, cancelRes.body.success ? "Success" : "Failed");
        if (cancelRes.status !== 200 || !cancelRes.body.success) {
            throw new Error(`Recall cancellation failed: ${JSON.stringify(cancelRes.body)}`);
        }

        // Fetch product and verify isRecalled is false
        const verifyClearedRes = await getJSON(`/product/${prodId}`, token);
        if (verifyClearedRes.body.data.isRecalled !== false) {
            throw new Error("Product should have been cleared, but isRecalled is true.");
        }
        console.log("✔ Product recall cleared successfully!");

        // 10. Test User Profile Retrieval and Update Settings
        console.log("Fetching profile for customer...");
        const initialProfile = await getJSON('/api/user/profile', customerToken);
        if (initialProfile.status !== 200 || !initialProfile.body.success) {
            throw new Error(`Profile fetch failed: ${JSON.stringify(initialProfile.body)}`);
        }
        console.log(`Profile fetched. Username: ${initialProfile.body.data.username}, Email: "${initialProfile.body.data.email}"`);

        console.log("Updating profile email...");
        const updateEmailRes = await postJSON('/api/user/profile', { email: "cust_changed@example.com" }, customerToken);
        if (updateEmailRes.status !== 200 || !updateEmailRes.body.success) {
            throw new Error(`Profile email update failed: ${JSON.stringify(updateEmailRes.body)}`);
        }
        console.log("✔ Email updated successfully!");

        console.log("Verifying updated email value...");
        const updatedProfile = await getJSON('/api/user/profile', customerToken);
        if (updatedProfile.body.data.email !== "cust_changed@example.com") {
            throw new Error(`Email verification failed. Expected cust_changed@example.com, got: ${updatedProfile.body.data.email}`);
        }
        console.log("✔ Email verified successfully!");

        console.log("Testing password change with incorrect current password...");
        const badPassRes = await postJSON('/api/user/profile', {
            currentPassword: "wrongpassword",
            newPassword: "newpassword123",
            confirmPassword: "newpassword123"
        }, customerToken);
        if (badPassRes.status === 200) {
            throw new Error("Password change should have failed due to incorrect current password, but got 200.");
        }
        console.log(`✔ Failed as expected: status ${badPassRes.status}, message: ${badPassRes.body.message}`);

        console.log("Testing password change with confirmation password mismatch...");
        const mismatchPassRes = await postJSON('/api/user/profile', {
            currentPassword: customerCreds.password,
            newPassword: "newpassword123",
            confirmPassword: "mismatchconf123"
        }, customerToken);
        if (mismatchPassRes.status === 200) {
            throw new Error("Password change should have failed due to confirmation mismatch, but got 200.");
        }
        console.log(`✔ Failed as expected: status ${mismatchPassRes.status}, message: ${mismatchPassRes.body.message}`);

        console.log("Testing successful password change...");
        const goodPassRes = await postJSON('/api/user/profile', {
            currentPassword: customerCreds.password,
            newPassword: "newpassword123",
            confirmPassword: "newpassword123"
        }, customerToken);
        if (goodPassRes.status !== 200 || !goodPassRes.body.success) {
            throw new Error(`Password change failed: ${JSON.stringify(goodPassRes.body)}`);
        }
        console.log("✔ Password changed successfully!");

        console.log("Testing auth login with the new password...");
        const newLoginRes = await postJSON('/api/auth/login', {
            username: customerCreds.username,
            password: "newpassword123",
            role: "user"
        });
        if (newLoginRes.status !== 200 || !newLoginRes.body.success) {
            throw new Error(`Login with new password failed: ${JSON.stringify(newLoginRes.body)}`);
        }
        console.log("✔ Logged in as customer user with new password successfully!");

        console.log("\n=============================================");
        console.log("🎉 SUCCESS: ALL ASSIGNMENT & RECALL TESTS PASSED!");
        console.log("=============================================");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ TEST FAILURE:", err.message || err);
        process.exit(1);
    }
}

run();
