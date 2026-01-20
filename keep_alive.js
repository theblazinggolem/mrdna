const http = require("http");

function startServer() {
    const server = http
        .createServer((req, res) => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("OK");
        })
        .listen(8080, "0.0.0.0", () => {
            console.log(`Keepalive server running on port 8080`);
        });
}

module.exports = startServer;
