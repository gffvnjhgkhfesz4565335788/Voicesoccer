import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { createGeminiProxyServer, attachGeminiProxy } from "./lib/gemini-proxy";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

// Attach Gemini Live WebSocket proxy at /ws/gemini-live
const geminiProxy = createGeminiProxyServer();
attachGeminiProxy(httpServer, geminiProxy, "/ws/gemini-live");

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
