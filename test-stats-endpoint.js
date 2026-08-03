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
        console.log("Registering admin account...");
        const adminCredentials = {
            username: "admin_debug_" + Date.now(),
            password: "debugpassword123",
            role: "admin"
        };
        const regRes = await postJSON('/api/auth/register', adminCredentials);
        console.log("Register response:", regRes);

        console.log("Logging in...");
        const loginRes = await postJSON('/api/auth/login', adminCredentials);
        console.log("Login response:", loginRes);

        if (!loginRes.body || !loginRes.body.success) {
            console.error("Login failed! Cannot proceed.");
            process.exit(1);
        }

        const token = loginRes.body.token;
        console.log("Fetching dashboard-stats using JWT token...");
        const statsRes = await getJSON('/api/admin/dashboard-stats', token);
        console.log("Dashboard Stats Status:", statsRes.status);
        console.log("Dashboard Stats Response:", JSON.stringify(statsRes.body, null, 2));

        process.exit(0);
    } catch (err) {
        console.error("Execution failed:", err);
        process.exit(1);
    }
}

run();
