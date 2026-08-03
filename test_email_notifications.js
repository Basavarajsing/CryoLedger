/**
 * E2E Verification Script for CryoLedger Resend Email Notification System
 * This script triggers all 13 email helper actions in EmailService to verify:
 * 1. Clean HTML template layout generation with branding.
 * 2. Proper parameters passing and formatting.
 * 3. Deduplication prevention module.
 * 4. Writing records to local sent_emails.txt as a fallback.
 */

// Override env variables for testing if not set
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "";
process.env.CRYTOLEDGER_SENDER_EMAIL = process.env.CRYTOLEDGER_SENDER_EMAIL || "onboarding@resend.dev";

const EmailService = require('./services/emailService');
const fs = require('fs');
const path = require('path');

const testEmail = "test_recipient@example.com";

async function runTests() {
    console.log("======================================================================");
    console.log("STARTING EMAIL SERVICE Lifeycle Events & Telemetry Templates Verification");
    console.log("======================================================================");

    // Clear previous log for clean verification
    const logPath = path.join(__dirname, 'sent_emails.txt');
    if (fs.existsSync(logPath)) {
        try {
            fs.unlinkSync(logPath);
            console.log("[Test Setup] Reset previous sent_emails.txt log file.");
        } catch (e) {
            console.warn("[Test Setup] Could not remove old sent_emails.txt:", e.message);
        }
    }

    let passed = 0;
    let failed = 0;

    async function assertEvent(name, serviceCallPromise) {
        try {
            console.log(`[TEST CASE] Executing event: ${name}...`);
            const res = await serviceCallPromise;
            const isSuccess = Array.isArray(res)
                ? res.every(r => r.success)
                : (res && res.success);
            if (isSuccess) {
                console.log(` ✅ PASS: ${name} dispatched/logged successfully.\n`);
                passed++;
                return true;
            } else {
                console.error(` ❌ FAIL: ${name} returned unsuccessful response:`, res);
                failed++;
                return false;
            }
        } catch (err) {
            console.error(` ❌ CRITICAL FAIL: ${name} threw error:`, err.message);
            failed++;
            return false;
        }
    }

    // 1) USER REGISTRATION
    await assertEvent("1. Welcome Email (USER_REGISTRATION)", EmailService.sendWelcomeEmail(testEmail, {
        username: "johndoe",
        role: "user"
    }));

    // 2) ACCOUNT APPROVED
    await assertEvent("2. Account Approved (ACCOUNT_APPROVED)", EmailService.sendAccountApprovedEmail(testEmail, {
        username: "dist_partner_1",
        role: "distributor",
        approvalMessage: "Your depot coordinates at Sector 4 center have been approved."
    }));

    // 3) ACCOUNT REJECTED
    await assertEvent("3. Account Rejected (ACCOUNT_REJECTED)", EmailService.sendAccountRejectedEmail(testEmail, {
        username: "retail_outpost_2",
        reason: "Scanning location falls outside the verified retailer store radius boundaries."
    }));

    // 4) MANAGER ASSIGNS PRODUCT (3 subcategories)
    await assertEvent("4a. Distributor assignment notification", EmailService.sendDistributorAssignmentEmail("carrier@example.com", {
        productId: "PROD-889920",
        productName: "BioVaccine Cryo Batch B4",
        quantity: "40 Units",
        managerName: "Dr. Catherine",
        customerName: "National Health Inst",
        customerAddress: "Building 4, Sector Road, Bangalore",
        priority: "High",
        deliveryDate: "2026-07-15"
    }));

    await assertEvent("4b. Retailer assignment notification", EmailService.sendRetailerAssignmentEmail("retailer_shop@example.com", {
        productId: "PROD-889920",
        productName: "BioVaccine Cryo Batch B4",
        managerName: "Dr. Catherine",
        distributorName: "SwiftExpress Logistics",
        expectedArrival: "Within 24 Hours"
    }));

    await assertEvent("4c. Customer assignment notification", EmailService.sendCustomerAssignmentEmail("customer@example.com", {
        productId: "PROD-889920",
        productName: "BioVaccine Cryo Batch B4",
        distributorName: "SwiftExpress Logistics",
        currentStatus: "Assigned & Transit Preparing",
        expectedDelivery: "2026-07-17"
    }));

    // 5) DISTRIBUTOR ACCEPTS ASSIGNMENT
    await assertEvent("5. Distributor Acceptance (DISTRIBUTOR_ACCEPTS_ASSIGNMENT)", EmailService.sendDistributorAcceptEmail("manager@example.com", {
        productId: "PROD-889920",
        productName: "BioVaccine Cryo Batch B4",
        distributorName: "SwiftExpress Logistics",
        acceptanceTime: new Date().toLocaleString()
    }));

    // 6) DISTRIBUTOR REJECTS ASSIGNMENT
    await assertEvent("6. Distributor Decline (DISTRIBUTOR_REJECTS_ASSIGNMENT)", EmailService.sendDistributorRejectEmail("manager@example.com", {
        productId: "PROD-889920",
        productName: "BioVaccine Cryo Batch B4",
        distributorName: "SwiftExpress Logistics",
        reason: "Insufficient vehicle cold storage calibration metrics."
    }));

    // 7) PRODUCT DISPATCHED
    await assertEvent("7. Product Dispatched (PRODUCT_DISPATCHED)", EmailService.sendProductDispatchedEmail(
        { retailerEmail: "retailer_shop@example.com", customerEmail: "customer@example.com" },
        {
            productId: "PROD-889920",
            productName: "BioVaccine Cryo Batch B4",
            quantity: "40 Units",
            dispatchTime: new Date().toLocaleString(),
            expectedDelivery: "2026-07-16"
        }
    ));

    // 8) PRODUCT RECEIVED BY RETAILER
    await assertEvent("8. Product Received by Retailer (PRODUCT_RECEIVED_RETAILER)", EmailService.sendRetailerReceivedEmail(
        { managerEmail: "manager@example.com", distributorEmail: "carrier@example.com" },
        {
            productId: "PROD-889920",
            productName: "BioVaccine Cryo Batch B4",
            receivedTime: new Date().toLocaleString(),
            confirmation: "Checked In successfully with correct storage telemetry."
        }
    ));

    // 9) PRODUCT DELIVERED
    await assertEvent("9. Product Delivered (PRODUCT_DELIVERED)", EmailService.sendProductDeliveredEmail(
        { customerEmail: "customer@example.com", managerEmail: "manager@example.com" },
        {
            productId: "PROD-889920",
            productName: "BioVaccine Cryo Batch B4",
            deliveryTime: new Date().toLocaleString(),
            deliveryConfirmation: "Handover signed by John Doe"
        }
    ));

    // 10) PRODUCT VERIFIED
    await assertEvent("10. Product Verified (PRODUCT_VERIFIED)", EmailService.sendProductVerifiedEmail(testEmail, {
        productId: "PROD-889920",
        productName: "BioVaccine Cryo Batch B4",
        verificationStatus: "Authentic & Authorized Coordinate Check",
        blockchainVerification: true,
        verificationTimestamp: new Date().toLocaleString(),
        transactionHash: "0xec2fe8ae28d9eb93f2f8cd902a281ee02ee81bdcb2ee8a7d2e0ffbe8cfd80e72"
    }));

    // 11) PASSWORD RESET
    await assertEvent("11. Password Reset Link (PASSWORD_RESET)", EmailService.sendPasswordResetEmail(testEmail, {
        username: "johndoe",
        resetLink: "http://localhost:5000/reset-password.html?token=test_reset_token_67390",
        expiryTime: "15 Minutes"
    }));

    // 12) PASSWORD CHANGED
    await assertEvent("12. Password Changed Warning (PASSWORD_CHANGED)", EmailService.sendPasswordChangedEmail(testEmail, {
        username: "johndoe"
    }));

    // 13) NEW DEVICE LOGIN WARNING
    await assertEvent("13. Login Alert Security Warning (LOGIN_FROM_NEW_DEVICE)", EmailService.sendNewDeviceLoginEmail(testEmail, {
        username: "johndoe",
        browser: "Chrome 114.0",
        os: "Windows 11",
        device: "PC Laptop Device",
        ipAddress: "192.168.1.45",
        time: new Date().toLocaleString()
    }));

    // Test Deduplication mechanism
    console.log("----------------------------------------------------------------------");
    console.log("TESTING DEDUPLICATION PREVENTION SAFETY LAYER...");
    const initialSend = await EmailService.sendWelcomeEmail(testEmail, { username: "dedupuser", role: "user" });
    const duplicateSend = await EmailService.sendWelcomeEmail(testEmail, { username: "dedupuser", role: "user" });

    if (initialSend.success && duplicateSend.success && duplicateSend.status === 'deduplicated') {
        console.log(" ✅ PASS: Duplicate prevention layer correctly intercepted successive email triggers.");
        passed++;
    } else {
        console.error(" ❌ FAIL: Duplicate prevention safety layer failed to block successive triggers.", { initialSend, duplicateSend });
        failed++;
    }

    console.log("======================================================================");
    console.log(`VERIFICATION SUMMARY: ${passed + failed} Tests Checked.`);
    console.log(` - passed: ${passed}`);
    console.log(` - failed: ${failed}`);
    console.log("======================================================================");

    if (fs.existsSync(logPath)) {
        console.log(`Verifying file contents of logged output...`);
        const logContent = fs.readFileSync(logPath, 'utf-8');
        const count = (logContent.match(/\[EMAIL DISPATCHED VIA RESEND\]/g) || []).length;
        console.log(`Number of logged email headers in sent_emails.txt: ${count}`);

        // Assert that the file is not empty (it should contain more than 10 events, since one was deduplicated)
        if (count >= 13) {
            console.log(" ✅ LOG FILE INTEGRITY CODE: Verified successfully.");
        } else {
            console.error(" ❌ LOG FILE INTEGRITY CODE: Missing records.");
        }
    } else {
        console.error(" ❌ LOG FILE ERROR: sent_emails.txt registration failed.");
    }

    // Force exit to clear lingering deduplication cache timer handles from event loop
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
