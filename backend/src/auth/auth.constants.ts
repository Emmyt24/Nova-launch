export const AUTH_CONSTANTS = {
  JWT_ACCESS_EXPIRY: "15m",
  JWT_REFRESH_EXPIRY: "7d",
  NONCE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  RATE_LIMIT_AUTH_MAX: 10, // stricter limit for auth endpoints
  STELLAR_MESSAGE_PREFIX:
    "Sign this message to authenticate with the platform:\n",
};

export const DECORATORS = {
  IS_PUBLIC: "isPublic",
  ROLES: "roles",
  API_KEY: "apiKey",
  RATE_LIMIT: "rateLimit",
};
