const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}).listen(8080, () => {
    console.log(`Keepalive server running on port 8080`);
});
