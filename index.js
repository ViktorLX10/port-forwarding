/**
 * Node.js Remote HTTP Proxy Server for SSH Tunnel (external.domain.com)
 * * * This script is designed to run on a service like Render.com, which provides 
 * * automatic HTTPS termination and sets the listening port via the environment variable PORT.
 * * The workflow is:
 * 1. Public traffic (HTTPS 443) hits Render's load balancer.
 * 2. Render decrypts the traffic and forwards it as standard HTTP to this Node.js server (listening on process.env.PORT).
 * 3. This script proxies the HTTP traffic to the SSH tunnel listener on the loopback interface (TUNNEL_HOST:TUNNEL_PORT).
 * * * PREREQUISITES:
 * 1. SSH is running and accepting the remote forward on your remote server (Render instance or a helper VM).
 * 2. Run the SSH command on your local machine: 
 * ssh -R 8081:localhost:3000 external.domain.com
 */

const http = require('http');

// --- Configuration ---
// Render will set this environment variable for the listener port.
const LISTEN_PORT = process.env.PORT || 8080;

// This MUST match the port used in your SSH -R command (e.g., 8081 from -R 8081:localhost:3000)
const TUNNEL_PORT = 8081; 
const TUNNEL_HOST = '127.0.0.1'; // SSH tunnels listen on the loopback interface by default

/**
 * Handles the reverse proxying logic from the incoming HTTP request to the SSH Tunnel.
 * @param {http.IncomingMessage} clientRequest - The incoming public request (now HTTP from Render).
 * @param {http.ServerResponse} proxyResponse - The response to send back to the public client.
 */
function handleProxyRequest(clientRequest, proxyResponse) {
    // Forward relevant headers and connection details
    const options = {
        hostname: TUNNEL_HOST,
        port: TUNNEL_PORT,
        path: clientRequest.url,
        method: clientRequest.method,
        // Forwarding the original headers
        headers: clientRequest.headers,
    };

    // Log the forwarding action
    console.log(`[HTTP Proxy] Forwarding ${clientRequest.method} ${clientRequest.url} to ${TUNNEL_HOST}:${TUNNEL_PORT}`);

    // Create the request to the target (the SSH tunnel listener)
    const targetRequest = http.request(options, (targetResponse) => {
        // Set headers received from the local app (via tunnel)
        proxyResponse.writeHead(targetResponse.statusCode, targetResponse.headers);
        // Pipe the response body back to the public client
        targetResponse.pipe(proxyResponse, { end: true });
    });

    // Handle errors if the tunnel or local app is down
    targetRequest.on('error', (e) => {
        console.error(`[Error] SSH Tunnel/Local App Unreachable: ${e.message}`);
        proxyResponse.writeHead(503, { 'Content-Type': 'text/plain' });
        proxyResponse.end('Service Unavailable: The remote tunnel connection is closed or the local application is down.');
    });

    // Pipe the request body (e.g., POST data) from the client into the target request
    clientRequest.pipe(targetRequest, { end: true });
}

// --- Main Server Setup ---
// Create the HTTP server
const server = http.createServer(handleProxyRequest);

// Start the server
server.listen(LISTEN_PORT, () => {
    console.log(`\n--- Node.js HTTP Tunnel Proxy Started ---`);
    console.log(`1. Server listening for Render's HTTP traffic on port: ${LISTEN_PORT}`);
    console.log(`2. All traffic will be proxied to SSH Tunnel on: ${TUNNEL_HOST}:${TUNNEL_PORT}`);
    console.log('3. Ensure your local SSH command is running: ssh -R 8081:localhost:3000 external.domain.com\n');
});

server.on('error', (err) => {
    console.error(`\n[FATAL ERROR] Server encountered an error: ${err.message}`);
    process.exit(1);
});
