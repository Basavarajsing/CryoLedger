const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Read credentials from .env
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const emailFromName = process.env.EMAIL_FROM_NAME || 'CryptoLedger Team';

// Centralised transport configuration
let transporter = null;
if (emailUser && emailPass) {
    transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // TLS
        auth: {
            user: emailUser,
            pass: emailPass
        }
    });
} else {
    console.warn('[EmailService] EMAIL_USER and EMAIL_PASS are not configured. Emails will be logged locally only.');
}

// In-Memory cache for duplicate email prevention (30-second window)
const deduplicationCache = new Map();
const DEDUPLICATION_WINDOW_MS = 30000; // 30 seconds

function isDuplicate(to, subject) {
    const key = `${to.toLowerCase()}:${subject}`;
    const lastSent = deduplicationCache.get(key);
    const now = Date.now();
    if (lastSent && (now - lastSent < DEDUPLICATION_WINDOW_MS)) {
        return true;
    }
    deduplicationCache.set(key, now);
    return false;
}

// Beautiful Green + White CryptoLedger layout template
function buildHtmlTemplate({ logoText, title, greeting, bodyContent, infoCards = [], actionButton = null }) {
    const currentYear = new Date().getFullYear();

    // Render info cards if provided
    let infoCardsHtml = '';
    if (infoCards.length > 0) {
        infoCardsHtml = `
            <div style="background-color: #f8fafc; border-left: 4px solid #2ecc71; padding: 16px; border-radius: 8px; margin: 24px 0;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    ${infoCards.map(card => `
                        <tr>
                            <td style="padding: 6px 0; font-family: 'Inter', sans-serif; font-size: 14px; color: #64748b; font-weight: 500; width: 45%; vertical-align: top;">
                                ${card.label}
                            </td>
                            <td style="padding: 6px 0; font-family: 'Inter', sans-serif; font-size: 14px; color: #0f172a; font-weight: 600; vertical-align: top;">
                                ${card.value}
                            </td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    }

    // Render action button if provided
    let actionButtonHtml = '';
    if (actionButton) {
        actionButtonHtml = `
            <div style="text-align: center; margin: 28px 0;">
                <a href="${actionButton.url}" target="_blank" style="background-color: #2ecc71; color: #ffffff; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(46, 204, 113, 0.2), 0 2px 4px -1px rgba(46, 204, 113, 0.06); transition: background-color 0.2s;">
                    ${actionButton.text}
                </a>
            </div>
        `;
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body {
                margin: 0;
                padding: 0;
                background-color: #f1f5f9;
                font-family: 'Inter', sans-serif;
                -webkit-font-smoothing: antialiased;
            }
            .email-wrapper {
                width: 100%;
                background-color: #f1f5f9;
                padding: 32px 0;
            }
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
            .header-banner {
                background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                padding: 32px 24px;
                text-align: center;
                border-bottom: 4px solid #2ecc71;
            }
            .logo-text {
                color: #ffffff;
                font-size: 24px;
                font-weight: 700;
                letter-spacing: -0.5px;
                margin: 0;
            }
            .logo-dot {
                color: #2ecc71;
            }
            .content-area {
                padding: 40px 32px;
            }
            .greeting {
                font-size: 18px;
                font-weight: 700;
                color: #0f172a;
                margin-top: 0;
                margin-bottom: 16px;
            }
            .body-text {
                font-size: 15px;
                line-height: 1.6;
                color: #334155;
                margin-top: 0;
                margin-bottom: 24px;
            }
            .divider {
                height: 1px;
                background-color: #e2e8f0;
                margin: 32px 0;
            }
            .footer-area {
                background-color: #f8fafc;
                padding: 24px 32px;
                border-top: 1px solid #e2e8f0;
                text-align: center;
            }
            .footer-text {
                font-size: 12px;
                color: #64748b;
                line-height: 1.5;
                margin: 4px 0;
            }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <div class="email-container">
                <div class="header-banner">
                    <h1 class="logo-text">Crypto<span class="logo-dot">Ledger</span></h1>
                </div>
                <div class="content-area">
                    <div class="greeting">${greeting}</div>
                    <div class="body-text">${bodyContent}</div>
                    ${infoCardsHtml}
                    ${actionButtonHtml}
                </div>
                <div class="footer-area">
                    <p class="footer-text">This is an automated email.</p>
                    <p class="footer-text">Please do not reply.</p>
                    <p class="footer-text"><strong>CryptoLedger Team</strong></p>
                    <p class="footer-text">&copy; ${currentYear} CryptoLedger. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

// Plain text fallback template
function buildPlainTextTemplate({ title, greeting, bodyContent, infoCards = [], actionButton = null }) {
    const currentYear = new Date().getFullYear();
    let text = `=== ${title.toUpperCase()} ===\n\n`;
    text += `${greeting},\n\n`;
    text += `${bodyContent}\n\n`;

    if (infoCards.length > 0) {
        text += `--- DETAILS ---\n`;
        infoCards.forEach(card => {
            text += `${card.label}: ${card.value}\n`;
        });
        text += `---------------\n\n`;
    }

    if (actionButton) {
        text += `Please perform the action by visiting: ${actionButton.text} -> ${actionButton.url}\n\n`;
    }

    text += `This is an automated email.\n`;
    text += `Please do not reply.\n\n`;
    text += `CryptoLedger Team\n`;
    text += `(c) ${currentYear} CryptoLedger.`;
    return text;
}

// Sending wrapper with logging, validation, retry, and no-crash protection
async function sendRawEmail({ to, subject, html, text, retries = 2 }) {
    if (!to || to.trim() === '') {
        console.warn('[EmailService] Skipping send: Empty recipient address.');
        return { success: false, reason: 'Empty recipient.' };
    }

    const logRecord = `
==============================================
[EMAIL DISPATCH] - ${new Date().toISOString()}
To: ${to}
Subject: ${subject}
----------------------------------------------
${text}
==============================================\n`;

    // Always log to sent_emails.txt for transparency/auditing
    const logPath = path.join(__dirname, '..', 'sent_emails.txt');
    try {
        fs.appendFileSync(logPath, logRecord, 'utf8');
        console.log(`[EmailService] Logged email dispatch to ${logPath}`);
    } catch (err) {
        console.error('[EmailService] Failed to append to sent_emails.txt:', err.message);
    }

    if (!transporter) {
        console.log(`[EmailService] [SIMULATED SUCCESS] Dispatched mock email to ${to} (Subject: ${subject})`);
        return { success: true, status: 'simulated' };
    }

    const mailOptions = {
        from: `"${emailFromName}" <${emailUser}>`,
        to,
        subject,
        html,
        text
    };

    let attempt = 0;
    while (attempt <= retries) {
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`[EmailService] [GMAIL SUCCESS] Dispatched to ${to} (Message ID: ${info.messageId})`);
            return { success: true, status: 'sent', messageId: info.messageId };
        } catch (err) {
            attempt++;
            console.error(`[EmailService] SMTP connection error (Attempt ${attempt}/${retries + 1}):`, err.message);
            if (attempt <= retries) {
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            } else {
                console.error(`[EmailService] Failed to dispatch email to ${to} after ${retries + 1} attempts.`);
                // Prevent crash, return failure instead
                return { success: false, reason: err.message };
            }
        }
    }
}

// Unified dispatcher helper
async function dispatchEmail({ to, subject, title, greeting, bodyContent, infoCards = [], actionButton = null }) {
    if (!to) return { success: false, reason: "No recipients defined" };

    if (Array.isArray(to)) {
        const results = await Promise.all(to.map(t => dispatchEmail({ to: t, subject, title, greeting, bodyContent, infoCards, actionButton })));
        return results[0];
    }

    if (typeof to === 'object') {
        const emails = Object.values(to).filter(val => typeof val === 'string' && val.length > 0);
        if (emails.length > 0) {
            const results = await Promise.all(emails.map(t => dispatchEmail({ to: t, subject, title, greeting, bodyContent, infoCards, actionButton })));
            return results[0];
        }
    }

    if (isDuplicate(to, subject)) {
        console.log(`[EmailService] [DEDUPLICATED] Intercepted duplicate trigger to: ${to} (Subject: ${subject})`);
        return { success: true, status: 'deduplicated' };
    }

    const html = buildHtmlTemplate({ title, greeting, bodyContent, infoCards, actionButton });
    const text = buildPlainTextTemplate({ title, greeting, bodyContent, infoCards, actionButton });

    // Run asynchronously
    return sendRawEmail({ to, subject, html, text });
}

// Export the 28 required email triggering event helpers
const EmailService = {
    // 1. User Registered
    async sendWelcomeEmail(to, { username, role }) {
        return dispatchEmail({
            to,
            subject: 'Welcome to CryptoLedger',
            title: 'Welcome to CryptoLedger',
            greeting: `Hello ${username}`,
            bodyContent: `Your registration on the CryptoLedger platform has been completed successfully! Below are your registered portal account details and login instructions. Verify your identity with authorized centers for seamless logistics auditing.`,
            infoCards: [
                { label: 'Username', value: username },
                { label: 'Portal Access Role', value: role.toUpperCase() },
                { label: 'Registration Status', value: 'Successful' },
                { label: 'Login Instructions', value: 'Visit the login page, enter your registered handle, and select your Portal role.' }
            ]
        });
    },

    // 2. Account Approved
    async sendAccountApprovedEmail(to, { username, role, approvalMessage }) {
        return dispatchEmail({
            to,
            subject: 'CryptoLedger Bypass coordinates Access Request Approved',
            title: 'Access Request Approved',
            greeting: `Hello ${username}`,
            bodyContent: `Your geographical coordinates bypass request has been approved by the administrator. ${approvalMessage}`,
            infoCards: [
                { label: 'User Handle', value: username },
                { label: 'Portal Access Role', value: role.toUpperCase() },
                { label: 'Bypass Approval Status', value: 'APPROVED' }
            ]
        });
    },

    // 3. Account Rejected
    async sendAccountRejectedEmail(to, { username, reason }) {
        return dispatchEmail({
            to,
            subject: 'CryptoLedger Coordinates Request Rejected',
            title: 'Access Request Rejected',
            greeting: `Hello ${username}`,
            bodyContent: `Your geographical bypass coordinates request has been rejected by the administrator.`,
            infoCards: [
                { label: 'User Handle', value: username },
                { label: 'Rejection Status', value: 'REJECTED' },
                { label: 'Reason provided', value: reason || 'Coordinates fall outside authorized center buffer zones.' }
            ]
        });
    },

    // 4. Manufacturer Added Product
    async sendProductAddedEmail(to, { managerName, manufacturerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Product Registered Successfully - ${productName}`,
            title: 'Product Registration Completed',
            greeting: `Hello ${managerName}`,
            bodyContent: `A new product has been successfully registered on the blockchain Ledger by manufacturer "${manufacturerName}".`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Manufacturer Name', value: manufacturerName },
                { label: 'Blockchain Status', value: 'Pending / Initialized' }
            ]
        });
    },

    // 5. Product Updated
    async sendProductUpdatedEmail(to, { managerName, manufacturerName, productId, productName, updateDetails }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Product Information Updated - ${productName}`,
            title: 'Product Update Registered',
            greeting: `Hello ${managerName}`,
            bodyContent: `The records for product "${productName}" (ID: ${productId}) have been updated on the Ledger by manufacturer "${manufacturerName}".`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Manufacturer', value: manufacturerName },
                { label: 'Modification Details', value: updateDetails || 'Information fields corrected' }
            ]
        });
    },

    // 6. Product Deleted
    async sendProductDeletedEmail(to, { managerName, manufacturerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Product Removed from Registry - ${productName}`,
            title: 'Product Deletion Warning',
            greeting: `Hello ${managerName}`,
            bodyContent: `The product "${productName}" with Product ID "${productId}" has been permanently deleted from the database and cascade records by "${manufacturerName}".`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Authorizer', value: manufacturerName },
                { label: 'Database Status', value: 'Cascade Deletion Logged' }
            ]
        });
    },

    // 7. Manager Assigned Product
    async sendAssignmentEmail(to, { assignmentId, productName, quantity, customerName, address, priority, expectedDate, managerName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Consignment Assignment Notice - ${productName}`,
            title: 'Consignment Assignment Notice',
            greeting: 'Hello Logistics Team Member',
            bodyContent: `A new product shipment assignment has been initiated by administrator "${managerName}". Please review the assigned consignment specifications:`,
            infoCards: [
                { label: 'Assignment ID', value: assignmentId },
                { label: 'Product Name', value: productName },
                { label: 'Quantity', value: quantity || '1 Unit' },
                { label: 'Target Customer', value: customerName },
                { label: 'Destination Address', value: address || 'Customer Delivery Destination' },
                { label: 'Assignment Priority', value: priority || 'Medium' },
                { label: 'Expected Date', value: expectedDate || '48 Hours' },
                { label: 'Issuing Manager', value: managerName }
            ]
        });
    },

    // 8. Distributor Accepted Assignment
    async sendDistributorAcceptEmail(to, { managerName, productId, productName, distributorName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Assignment Accepted by Distributor - ID: ${productId}`,
            title: 'Distributor Acceptance Notification',
            greeting: `Hello ${managerName}`,
            bodyContent: `Distributor "${distributorName}" has formally accepted the product consignment assignment and has taken physical possession.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Distributor ID', value: distributorName },
                { label: 'Custody Status', value: 'Received & Accepted' }
            ]
        });
    },

    // 9. Distributor Rejected Assignment
    async sendDistributorRejectEmail(to, { managerName, productId, productName, distributorName, reason }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Assignment Rejected by Distributor - ID: ${productId}`,
            title: 'Distributor Rejection Alert',
            greeting: `Hello ${managerName}`,
            bodyContent: `Distributor "${distributorName}" has rejected the product consignment assignment.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Distributor ID', value: distributorName },
                { label: 'Rejection Reason', value: reason || 'Product details incorrect or coordinates discrepancy.' }
            ]
        });
    },

    // 10. Distributor Started Processing
    async sendDistributorProcessingEmail(to, { managerName, retailerName, customerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Consignment Processing Started - ID: ${productId}`,
            title: 'Logistics Processing Started',
            greeting: 'Hello Logistics Stakeholder',
            bodyContent: `The custody holder has moved the consignment into active processing state inside the depot hub.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Associated Retailer', value: retailerName },
                { label: 'Associated Customer', value: customerName },
                { label: 'Current Phase', value: 'Processing Stage Started' }
            ]
        });
    },

    // 11. Distributor Prepared Shipment
    async sendDistributorPreparedEmail(to, { managerName, retailerName, customerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Shipment Prepared for Route - ID: ${productId}`,
            title: 'Consignment Prepared',
            greeting: 'Hello Logistics Stakeholder',
            bodyContent: `The shipment has been successfully prepared, logs compiled, and added to the outbound transit queue.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Associated Retailer', value: retailerName },
                { label: 'Associated Customer', value: customerName },
                { label: 'Current Phase', value: 'Shipment Route Prepared' }
            ]
        });
    },

    // 12. Distributor Packed Product
    async sendDistributorPackedEmail(to, { managerName, retailerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Consignment Sealed & Packed - ID: ${productId}`,
            title: 'Consignment Packed & Sealed',
            greeting: 'Hello Logistics Stakeholder',
            bodyContent: `The product has been verified, scanned, securely packed, and sealed in temperature-controlled transport bags.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Associated Retailer', value: retailerName },
                { label: 'Package Status', value: 'Sealed & Packed' }
            ]
        });
    },

    // 13. Distributor Dispatched Product
    async sendDistributorDispatchedEmail(to, { retailerName, customerName, managerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Consignment Dispatched from Depot - ID: ${productId}`,
            title: 'Consignment Dispatched',
            greeting: 'Hello Logistics Stakeholder',
            bodyContent: `The consignment has departed from the distributor depot hub and is currently in transit to the retail center.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Retail Center', value: retailerName },
                { label: 'Target Customer', value: customerName },
                { label: 'Transit Status', value: 'Outbound Transit Active' }
            ]
        });
    },

    // 14. Retailer Received Product
    async sendRetailerReceivedEmail(to, { distributorName, managerName, productId, productName, retailerName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Retailer Received Inventory - ID: ${productId}`,
            title: 'Inventory Received by Retailer',
            greeting: 'Hello Logistics Stakeholder',
            bodyContent: `Retailer outlet "${retailerName}" has verified the arrival of the product and accepted physical custody from Distributor "${distributorName}".`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Distributor ID', value: distributorName },
                { label: 'Retailer ID', value: retailerName },
                { label: 'Custody Status', value: 'Received & Stored in Retailer Depot' }
            ]
        });
    },

    // 15. Retailer Started Delivery
    async sendRetailerStartedDeliveryEmail(to, { customerName, managerName, productId, productName, retailerName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Out for Delivery - ID: ${productId}`,
            title: 'Outbound Delivery Started',
            greeting: `Hello ${customerName}`,
            bodyContent: `Retailer "${retailerName}" has scanned the QR code coordinates and dispatched the product out for delivery matching your geographical coordinates.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Retailer Name', value: retailerName },
                { label: 'Recipient Name', value: customerName },
                { label: 'Delivery Status', value: 'Out For Delivery' }
            ]
        });
    },

    // 16. Retailer Delivered Product
    async sendRetailerDeliveredEmail(to, { customerName, managerName, distributorName, productId, productName, retailerName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Delivery Arrived at Location - ID: ${productId}`,
            title: 'Consignment Arrived at Destination',
            greeting: `Hello ${customerName}`,
            bodyContent: `Your product "${productName}" has arrived at your destination location and is ready for customer custody audit check-in.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Retailer ID', value: retailerName },
                { label: 'Delivery Handover', value: 'Pending End-User Verification Scan' }
            ]
        });
    },

    // 17. Delivery Completed
    async sendDeliveryCompletedEmail(to, { customerName, managerName, manufacturerName, distributorName, retailerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Delivery Completed (Full Custody Verified) - ID: ${productId}`,
            title: 'Custody Handover Completed',
            greeting: `Hello ${customerName}`,
            bodyContent: `The supply chain journey is complete! You have successfully verified and accepted ownership check-in for your genuine product.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Manufacturer', value: manufacturerName },
                { label: 'Distributor', value: distributorName },
                { label: 'Retailer', value: retailerName },
                { label: 'Final Owner', value: customerName },
                { label: 'Journey Status', value: 'Completed & Secured on Blockchain' }
            ]
        });
    },

    // 18. Product Verification Successful
    async sendVerificationSuccessEmail(to, { productName, verificationTime, blockchainStatus, transactionHash }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Product Authentified Successfully`,
            title: 'Authenticity Verification Successful',
            greeting: 'Hello Customer',
            bodyContent: `The verification scan of your product "${productName}" has been successfully verified inside an authorized geofence region. Product authenticity is guaranteed!`,
            infoCards: [
                { label: 'Product Name', value: productName },
                { label: 'Audit Scan Time', value: verificationTime || new Date().toLocaleString() },
                { label: 'Blockchain Status', value: blockchainStatus || 'Success' },
                { label: 'Transaction Hash', value: transactionHash || 'Verified on Ganache Local node' }
            ]
        });
    },

    // 19. Product Verification Failed
    async sendVerificationFailedEmail(to, { productName, verificationTime, reason }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] WARNING: Product Verification Failed`,
            title: 'Verification Warning Alert',
            greeting: 'Hello Customer',
            bodyContent: `A scan coordinate mismatch occurred during the authentication process for "${productName}". The details have been protected due to geofence bounds.`,
            infoCards: [
                { label: 'Product Name', value: productName },
                { label: 'Failed Scan Time', value: verificationTime || new Date().toLocaleString() },
                { label: 'Reason', value: reason || 'Location was outside authorized boundaries. Verification request created.' }
            ]
        });
    },

    // 20. Product Ownership Changed
    async sendOwnershipChangedEmail(to, { oldOwner, newOwner, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Product Ownership Transferred - ID: ${productId}`,
            title: 'Ownership Handover Registered',
            greeting: 'Hello Stakeholder',
            bodyContent: `The custody/ownership of product "${productName}" (ID: ${productId}) has been officially transferred on the ledger.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Former Custody', value: oldOwner },
                { label: 'Current Custody', value: newOwner }
            ]
        });
    },

    // 21. Order Cancelled
    async sendOrderCancelledEmail(to, { customerName, managerName, distributorName, retailerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Order Cancelled Notice - ID: ${productId}`,
            title: 'Order Cancelled Notice',
            greeting: 'Hello Stakeholder',
            bodyContent: `The order associated with product "${productName}" (ID: ${productId}) has been officially cancelled.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Customer Name', value: customerName },
                { label: 'Current Status', value: 'Cancelled' }
            ]
        });
    },

    // 22. Order Updated
    async sendOrderUpdatedEmail(to, { customerName, managerName, productId, productName }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Order Specifications Modified - ID: ${productId}`,
            title: 'Order Specifications Modified',
            greeting: `Hello ${customerName}`,
            bodyContent: `The parameters, quantity, or shipping instructions for product order "${productName}" have been modified.`,
            infoCards: [
                { label: 'Product ID', value: productId },
                { label: 'Product Name', value: productName },
                { label: 'Manager Name', value: managerName },
                { label: 'Order Status', value: 'Updated' }
            ]
        });
    },

    // 23. New Device Login
    async sendNewDeviceLoginEmail(to, { username, browser, os, ip, time }) {
        return dispatchEmail({
            to,
            subject: 'CryptoLedger Security Alert: New Device Login Detector',
            title: 'Security Telemetry Alert',
            greeting: `Hello ${username}`,
            bodyContent: `We noticed a new device login to your CryptoLedger account. If this was you, no action is required. If this was unauthorized, please reset your password immediately.`,
            infoCards: [
                { label: 'User Handle', value: username },
                { label: 'Browser Client', value: browser || 'Unknown Browser' },
                { label: 'Operating System', value: os || 'Unknown OS' },
                { label: 'IP Address', value: ip || '127.0.0.1' },
                { label: 'Connection Time', value: time || new Date().toLocaleString() }
            ]
        });
    },

    // 24. Password Reset Requested
    async sendPasswordResetEmail(to, { username, resetLink, expiryTime }) {
        return dispatchEmail({
            to,
            subject: 'CryptoLedger Secure Password Reset Instructions',
            title: 'Password Reset Request',
            greeting: `Hello ${username}`,
            bodyContent: `You are receiving this notification because you (or someone else) requested coordinates key updates for your account. Please click the button below to update your login password:`,
            actionButton: {
                text: '🔑 Reset My Password',
                url: resetLink
            },
            infoCards: [
                { label: 'User Handle', value: username },
                { label: 'Link Expiration Window', value: expiryTime || '15 Minutes' }
            ]
        });
    },

    // 25. Password Changed
    async sendPasswordChangedEmail(to, { username }) {
        return dispatchEmail({
            to,
            subject: 'CryptoLedger Security Alert: Password Updated Successfully',
            title: 'Password Updated Successfully',
            greeting: `Hello ${username}`,
            bodyContent: `Your CryptoLedger login credentials have been updated successfully. If you did not make this change, please report this immediately.`,
            infoCards: [
                { label: 'Account User', value: username },
                { label: 'Update Status', value: 'Credentials Changed' },
                { label: 'Timestamp', value: new Date().toLocaleString() }
            ]
        });
    },

    // 26. Profile Updated
    async sendProfileUpdatedEmail(to, { username, updatedDetails }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Profile Information Updated`,
            title: 'Profile Updated',
            greeting: `Hello ${username}`,
            bodyContent: `Your user profile details have been successfully modified on the server.`,
            infoCards: [
                { label: 'Account User', value: username },
                { label: 'Modified Fields', value: updatedDetails || 'General profile information updated' }
            ]
        });
    },

    // 27. Email Changed
    async sendEmailChangedEmail(to, { username, oldEmail, newEmail }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Email Address Updated`,
            title: 'Primary Account Email Changed',
            greeting: `Hello ${username}`,
            bodyContent: `The primary email associated with your CryptoLedger account has been updated tracking coordinates access.`,
            infoCards: [
                { label: 'Account User', value: username },
                { label: 'Former Email Address', value: oldEmail },
                { label: 'New Email Address', value: newEmail }
            ]
        });
    },

    // 28. Role Changed
    async sendRoleChangedEmail(to, { username, oldRole, newRole }) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Account Permission Level Modified`,
            title: 'Account Role Permissions Modified',
            greeting: `Hello ${username}`,
            bodyContent: `An administrator has updated the permissions or role mappings associated with your profile.`,
            infoCards: [
                { label: 'Account User', value: username },
                { label: 'Former Access Role', value: oldRole.toUpperCase() },
                { label: 'Assigned Access Role', value: newRole.toUpperCase() }
            ]
        });
    },

    // Alias wrapper helper methods
    sendManufacturerAddedProductEmail(to, data) {
        return this.sendProductAddedEmail(to, {
            managerName: data.username,
            manufacturerName: data.username,
            productId: data.productId,
            productName: data.productName
        });
    },

    sendProductAssignedEmail(to, data) {
        return this.sendAssignmentEmail(to, data);
    },

    async sendProductDeliveredEmail(to, data) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Order Handover Complete - ${data.productName}`,
            title: 'Product Delivery Handover Completed',
            greeting: `Hello Valued Customer / Manager`,
            bodyContent: `Consignment item "${data.productName}" has been successfully delivered and handed over.`,
            infoCards: [
                { label: 'Consignment ID', value: data.productId },
                { label: 'Product Delivered', value: data.productName },
                { label: 'Handover Time', value: data.deliveryTime || new Date().toLocaleString() },
                { label: 'Status Code', value: data.deliveryConfirmation || 'Handover Complete' }
            ]
        });
    },

    async sendRetailerAssignmentEmail(to, data) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Retail Inbound Notification - ${data.productName}`,
            title: 'New Retail Consignment Inbound',
            greeting: `Hello Retail Hub Manager`,
            bodyContent: `A product dispatch was assigned to your retail outlet by Manufacturer "${data.managerName}".`,
            infoCards: [
                { label: 'Product ID', value: data.productId },
                { label: 'Product Name', value: data.productName },
                { label: 'Carrier Distributor', value: data.distributorName },
                { label: 'Expected Inbound', value: data.expectedArrival || 'Within 24 Hours' }
            ]
        });
    },

    async sendCustomerAssignmentEmail(to, data) {
        return dispatchEmail({
            to,
            subject: `[CryptoLedger] Delivery Action Initiated - ${data.productName}`,
            title: 'Delivery Action Initiated',
            greeting: `Dear ${to}`,
            bodyContent: `Your product assignment order has been processed by the manufacturer.`,
            infoCards: [
                { label: 'Order ID', value: data.productId },
                { label: 'Product Purchased', value: data.productName },
                { label: 'Carrier Logistics', value: data.distributorName },
                { label: 'Current State', value: data.currentStatus || 'Assigned to Distributor' },
                { label: 'Est. Delivery', value: data.expectedDelivery || '48 Hours' }
            ]
        });
    }
};

module.exports = EmailService;
