import { CorsOptions } from "cors";

/**
 * CORS configuration options for Nova Launch Backend
 */
export const corsOptions: CorsOptions = {
  /**
   * Allowed Origins
   * In production, this should be the exact URL of the frontend.
   * Multiple origins can be allowed by using an array.
   */
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || "http://localhost:5173",
      // Add other production URLs here
    ];

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },

  /**
   * Allowed HTTP methods
   */
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],

  /**
   * Allowed headers
   */
  allowedHeaders: ["Content-Type", "Authorization"],

  /**
   * Whether to allow credentials (cookies, authorization headers, etc.)
   */
  credentials: true,

  /**
   * How long the results of a preflight request can be cached (in seconds)
   * 86400 seconds = 24 hours
   */
  maxAge: 86400,

  /**
   * Preflight requests handling is done automatically by the cors middleware
   */
  preflightContinue: false,

  optionsSuccessStatus: 204,
};
