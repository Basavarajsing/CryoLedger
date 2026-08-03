const http = require('http');

// Let's sign a JWT token for 'admin' role to make authenticated requests
const jwt = require('jsonwebtoken');
require('dotenv').config({ override: true });
const JWT_SECRET = process.env.JWT_SECRET || 'cryoledger_jwt_secret_key_8492049';

const token = jwt.sign({ username: 'basavarajsing', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

function makeRequest(path, body) {
    const postData = JSON.stringify(body);
    const options = {
        hostname: 'localhost',
        port: 5000,
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Authorization': `Bearer ${token}`
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            console.log(`STATUS: ${res.statusCode}`);
            console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
            console.log(`BODY: ${data}`);
        });
    });

    req.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
    });

    req.write(postData);
    req.end();
}

// Case 1: Try registering with targetCustomer = ""
console.log("Sending case 1: Empty distributorId or targetCustomer...");
makeRequest('/api/admin/product/a1/assign-distributor', { distributorId: '', targetCustomer: '' });

// Case 2: Try registering with a targetCustomer that doesn't exist (e.g. non_existent_user)
setTimeout(() => {
    console.log("\nSending case 2: Non-existent targetCustomer...");
    makeRequest('/api/admin/product/a1/assign-distributor', { distributorId: 'basava', targetCustomer: 'non_existent_customer' });
}, 1000);

// Case 3: Try registering with a targetUser that DOES exist (e.g. "basavarajsing bapparagi")
setTimeout(() => {
    console.log("\nSending case 3: Valid targetCustomer...");
    makeRequest('/api/admin/product/a1/assign-distributor', { distributorId: 'basava', targetCustomer: 'basavarajsing bapparagi' });
}, 2000);
