import { WebSocket } from "ws";
import { debugToFile } from "../index.js";
// Create a WebSocket connection
let socket;
let socketId;

function createWebSocketConnection() {
  socket = new WebSocket("wss://stage.rpc.buidlguidl.com:48544");

  // Connection opened
  socket.on("open", () => {
    // debugToFile(`Connected to WebSocket server. ID: ${JSON.stringify(socket)}`);
  });

  // Listen for messages from the server
  socket.on("message", async (data) => {
    const response = JSON.parse(data);
    debugToFile("Received response from server:", response);

    if (!socketId || socketId === null) {
      socketId = response.id;
      debugToFile(`Socket ID: ${socketId}`);
    } else {
      const targetUrl = "http://localhost:8545";

      try {
        const rpcResponse = await axios.post(targetUrl, {
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        });
        debugToFile("Current Block Number:", rpcResponse.data);

        // Send the response back to the WebSocket server
        socket.send(JSON.stringify(rpcResponse.data));
      } catch (error) {
        debugToFile("Error fetching block number:", error);

        // Send an error response back to the WebSocket server
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal error",
              data: error.message,
            },
            id: 1,
          })
        );
      }
    }
  });

  // Connection closed
  socket.on("close", () => {
    socketId = null;
    debugToFile("Disconnected from WebSocket server");
  });

  // Error handling
  socket.on("error", (error) => {
    debugToFile("WebSocket error:", error);
  });
}

createWebSocketConnection();

// Check WebSocket connection every 30 seconds
setInterval(() => {
  if (socket.readyState === WebSocket.CLOSED) {
    socketId = null;
    debugToFile("WebSocket disconnected. Attempting to reconnect...");
    createWebSocketConnection();
  }
}, 15000);

function getSocketId() {
  return socketId;
}
