require("dotenv").config({ override: true });
const EmailService = require('./services/emailService');

console.log("=== CRYTOLEDGER SMTP FALLBACK DIAGNOSTIC TEST ===");
console.log("Loading environment variables...");
console.log("SMTP_HOST:", process.env.SMTP_HOST || "(not set)");
console.log("SMTP_PORT:", process.env.SMTP_PORT || "(not set)");
console.log("SMTP_SECURE:", process.env.SMTP_SECURE || "(not set)");
console.log("SMTP_USER:", process.env.SMTP_USER || "(not set)");
console.log("SMTP_PASS:", process.env.SMTP_PASS ? "****" : "(not set)");

async function runSmtpTest() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn("\n[WARNING] SMTP environment variables are not fully configured in your .env yet.");
        console.log("Assuming bypass/local simulation test.\n");
    }

    const testRecipient = process.env.SMTP_USER || "basavarajsing2005@gmail.com";
    console.log(`Sending a test welcome email to: ${testRecipient}`);

    try {
        const res = await EmailService.sendWelcomeEmail(testRecipient, {
            username: "basavarajsing_test",
            role: "user"
        });
        console.log("\nDispatch results:", JSON.stringify(res, null, 2));
        console.log("Verification finished. Please check sent_emails.txt or your inbox.");
    } catch (err) {
        console.error("Test failed with error:", err);
    }
}

runSmtpTest().catch(console.error);
