import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { logger } from "./logger";

const GEMINI_V1BETA_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export function createGeminiProxyServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (clientWs: WebSocket) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.error("GEMINI_API_KEY not configured — rejecting proxy connection");
      clientWs.close(1011, "GEMINI_API_KEY not configured");
      return;
    }

    const geminiUrl = `${GEMINI_V1BETA_URL}?key=${apiKey}`;
    const geminiWs = new WebSocket(geminiUrl);

    logger.info("Opening Gemini proxy connection (v1beta)");

    // Buffer messages that arrive before Gemini is ready
    const pendingMessages: WebSocket.RawData[] = [];

    geminiWs.on("open", () => {
      logger.info({ buffered: pendingMessages.length }, "Gemini WS connected — flushing buffered messages");
      for (const msg of pendingMessages) {
        geminiWs.send(msg);
      }
      pendingMessages.length = 0;
    });

    // Gemini → Client
    geminiWs.on("message", (data: WebSocket.RawData) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    });

    // Client → Gemini
    clientWs.on("message", (data: WebSocket.RawData) => {
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(data);
      } else {
        // Buffer until Gemini connection is established
        pendingMessages.push(data);
      }
    });

    geminiWs.on("close", (code, reason) => {
      logger.info({ code, reason: reason.toString() }, "Gemini WS closed");
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(code, reason);
      }
    });

    clientWs.on("close", (code, reason) => {
      logger.info({ code, reason: reason.toString() }, "Client WS closed");
      if (
        geminiWs.readyState === WebSocket.OPEN ||
        geminiWs.readyState === WebSocket.CONNECTING
      ) {
        geminiWs.close(1000, "Client disconnected");
      }
    });

    geminiWs.on("error", (err) => {
      logger.error({ err }, "Gemini WS error");
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, "Gemini connection error");
      }
    });

    clientWs.on("error", (err) => {
      logger.error({ err }, "Client WS error");
      if (
        geminiWs.readyState === WebSocket.OPEN ||
        geminiWs.readyState === WebSocket.CONNECTING
      ) {
        geminiWs.close(1000, "Client error");
      }
    });
  });

  return wss;
}

export function attachGeminiProxy(
  server: import("http").Server,
  wss: WebSocketServer,
  path = "/ws/gemini-live",
): void {
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url === path) {
      wss.handleUpgrade(req, socket, head as Buffer, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });
}
