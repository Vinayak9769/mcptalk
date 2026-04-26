import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { Server as SocketIOServer } from "socket.io";
import { createApiRouter } from "./api/routes.js";
import { initializeDatabase } from "./db/schema.js";
import { registerMcpSseRoutes } from "./mcp/server.js";
import { registerSocketEvents } from "./socket/events.js";

const port = Number(process.env.PORT ?? 3000);

async function bootstrap(): Promise<void> {
  await initializeDatabase();

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use("/api", createApiRouter());
  registerMcpSseRoutes(app);

  const publicDir = resolve(process.cwd(), "public");
  app.use(express.static(publicDir));
  app.get("/", (req, res) => {
    res.sendFile(resolve(publicDir, "index.html"));
  });

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*"
    }
  });
  registerSocketEvents(io);

  httpServer.listen(port, () => {
    console.error(`Socket.IO listening on :${port}`);
    console.error(`MCP SSE endpoint: http://localhost:${port}/mcp/sse`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start agentroom:", error);
  process.exit(1);
});
