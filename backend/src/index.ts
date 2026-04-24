import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { corsOptions } from "./config/cors";
import { validateEnv } from "./config/env";
import { runStartupValidation } from "./config/startupValidation";
import adminRoutes from "./routes/admin";
import leaderboardRoutes from "./routes/leaderboard";
import tokenRoutes from "./routes/tokens";
import statsRoutes from "./routes/stats";
import governanceRoutes from "./routes/governance";
import campaignRoutes from "./routes/campaigns";
import streamRoutes from "./routes/streams";
import vaultRoutes from "./routes/vaults";
import versionRoutes from "./routes/version";
import searchRoutes from "./routes/search";
import graphqlRouter from "./graphql";
import { Database } from "./config/database";
import { successResponse, errorResponse } from "./utils/response";
import { requestLoggingMiddleware } from "./middleware/request-logging.middleware";
import stellarEventListener from "./services/stellarEventListener";
import websocketService from "./services/websocket";

dotenv.config();

// Validate required environment variables before starting the server.
// This will throw and exit if any required variable is missing or invalid.
const env = validateEnv();

const app = express();
const PORT = env.PORT;

// Request logging middleware (first to capture all requests)
app.use(requestLoggingMiddleware);

// Security middleware
app.use(helmet());
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

app.use("/api/admin", limiter);
app.use("/api/leaderboard", limiter);
app.use("/api/tokens", limiter);
app.use("/api/stats", limiter);
app.use("/api/governance", limiter);
app.use("/api/campaigns", limiter);
app.use("/api/streams", limiter);
app.use("/api/vaults", limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database
Database.initialize();

// Routes
app.use("/api/admin", adminRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/governance", governanceRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/streams", streamRoutes);
app.use("/api/vaults", vaultRoutes);
app.use("/api/version", versionRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/graphql", graphqlRouter);

import { healthService } from "./lib/health/health.service";

// Health check — liveness (is the process alive?)
app.get("/health/live", (_req, res) => {
  res.json(successResponse({ status: "ok", uptime: process.uptime() }));
});

// Health check — readiness (are all dependencies reachable?)
app.get("/health/ready", async (_req, res) => {
  const result = await healthService.checkHealth();
  const httpStatus = result.status === "healthy" ? 200 : result.status === "degraded" ? 207 : 503;
  res.status(httpStatus).json(successResponse(result));
});

// Legacy /health — kept for backwards compatibility, maps to readiness
app.get("/health", async (_req, res) => {
  const result = await healthService.checkHealth();
  const httpStatus = result.status === "healthy" ? 200 : result.status === "degraded" ? 207 : 503;
  res.status(httpStatus).json(successResponse(result));
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err);
    res.status(err.status || 500).json(
      errorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: err.message || "Internal server error",
        details:
          process.env.NODE_ENV === "development"
            ? { stack: err.stack }
            : undefined,
      })
    );
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json(
    errorResponse({
      code: "NOT_FOUND",
      message: "Route not found",
    })
  );
});

const server = app.listen(PORT, async () => {
  console.log(`🚀 Admin API server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);

  // Attach WebSocket server for live event streaming
  websocketService.attach(server);

  // Start event listener only after server (and DB) are ready
  if (process.env.ENABLE_EVENT_LISTENER === "true") {
    await stellarEventListener.start();
  }
});

export default app;
