import { Pool, PoolClient } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number.parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "nova_launch",
  user: process.env.DB_USER || "user",
  password: process.env.DB_PASSWORD || "password",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err: unknown) => {
  console.error("Unexpected database error:", toSafeErrorSummary(err));
});

function isPoolExhaustionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code as string)
      : "";

  return (
    code === "53300" ||
    message.includes("too many clients already") ||
    message.includes("remaining connection slots are reserved") ||
    message.includes("connection pool exhausted") ||
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("sorry, too many clients already")
  );
}

function toSafeErrorSummary(error: unknown): {
  message: string;
  code?: string;
} {
  if (error instanceof Error) {
    const summary: { message: string; code?: string } = {
      message: error.message,
    };

    const maybeCode = (error as Error & { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.length > 0) {
      summary.code = maybeCode;
    }

    return summary;
  }

  return {
    message: String(error),
  };
}

function normalizeDatabaseError(
  error: unknown,
  operation: "query" | "getClient"
): Error {
  if (isPoolExhaustionError(error)) {
    return new Error(`Database connection pool exhausted during ${operation}`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(`Database ${operation} failed`);
}

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log("Executed database query", {
      duration,
      rows: res.rowCount,
    });
    return res;
  } catch (error) {
    const safeError = normalizeDatabaseError(error, "query");
    console.error("Database query error:", toSafeErrorSummary(safeError));
    throw safeError;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  try {
    return await pool.connect();
  } catch (error) {
    const safeError = normalizeDatabaseError(error, "getClient");
    console.error(
      "Database client acquisition failed:",
      toSafeErrorSummary(safeError)
    );
    throw safeError;
  }
};

export const closePool = async () => {
  await pool.end();
};

export default { query, getClient, closePool };
