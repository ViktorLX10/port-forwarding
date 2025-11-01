const http = require('http');

const LISTEN_PORT = process.env.PORT || 8080;

const TUNNEL_PORT = 8081; 
const TUNNEL_HOST = '127.0.0.1'; // SSH tunnels listen on the loopback interface by default

/**
 * Handles the reverse proxying logic from the incoming HTTP request to the SSH Tunnel.
 * @param {http.IncomingMessage} clientRequest - The incoming public request (now HTTP from Render).
 * @param {http.ServerResponse} proxyResponse - The response to send back to the public client.
 */
function handleProxyRequest(clientRequest, proxyResponse) {
    const options = {
        hostname: TUNNEL_HOST,
        port: TUNNEL_PORT,
        path: clientRequest.url,
        method: clientRequest.method,
        headers: clientRequest.headers,
    };

    const targetRequest = http.request(options, (targetResponse) => {
        proxyResponse.writeHead(targetResponse.statusCode, targetResponse.headers);
        targetResponse.pipe(proxyResponse, { end: true });
    });

    targetRequest.on('error', (e) => {
        console.error(`[Error] SSH Tunnel/Local App Unreachable: ${e.message}`);
        proxyResponse.writeHead(503, { 'Content-Type': 'text/plain' });
        proxyResponse.end('Service Unavailable: The remote tunnel connection is closed or the local application is down.');
    });

    clientRequest.pipe(targetRequest, { end: true });
}

const server = http.createServer(handleProxyRequest);

server.listen(LISTEN_PORT, () => {
    console.log(`\n--- Node.js HTTP Tunnel Proxy Started ---`);
    console.log('Ensure your local SSH command is running: ssh -R 8081:localhost:3000 external.domain.com\n'); // TODO: change domain
});

server.on('error', (err) => {
    console.error(`\n[FATAL ERROR] Server encountered an error: ${err.message}`);
    process.exit(1);
});
