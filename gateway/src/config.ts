/**
 * Gateway environment configuration.
 * Validates required variables at startup.
 */

export interface GatewayEnv {
  PORT: number;
  BACKEND_URL: string;
  JWT_SECRET: string;
  REDIS_URL: string;
  ALLOWED_ORIGINS: string[];
  NODE_ENV: string;
}

export function validateGatewayEnv(): GatewayEnv {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";

  const jwtSecret = process.env.JWT_SECRET ?? (isProd ? "" : "dev-secret-key-change-me");
  if (isProd && !jwtSecret) throw new Error("JWT_SECRET is required in production.");

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    PORT: parseInt(process.env.GATEWAY_PORT ?? "4000", 10),
    BACKEND_URL: backendUrl,
    JWT_SECRET: jwtSecret,
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    ALLOWED_ORIGINS: allowedOrigins,
    NODE_ENV: nodeEnv,
  };
}
