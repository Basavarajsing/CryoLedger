const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

const routes = [];
lines.forEach((line, idx) => {
    const match = line.match(/app\.(post|get|put|delete)\(['"]([^'"]+)['"]/);
    if (match) {
        routes.push({ line: idx + 1, method: match[1].toUpperCase(), path: match[2] });
    }
});

fs.writeFileSync('routes_list.json', JSON.stringify(routes, null, 2), 'utf8');
console.log(`Found ${routes.length} routes.`);
