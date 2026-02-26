import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import cors from "cors";
import { corsOptions } from "../config/cors";

describe("CORS Configuration", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(cors(corsOptions));
    app.get("/test", (req, res) => {
      res.json({ message: "success" });
    });
  });

  it("should allow requests from allowed origins", async () => {
    const response = await request(app)
      .get("/test")
      .set("Origin", "http://localhost:5173");

    expect(response.status).toBe(200);
    expect(response.header["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
    expect(response.header["access-control-allow-credentials"]).toBe("true");
  });

  it("should block requests from disallowed origins", async () => {
    // In many CORS middlewares, if the origin is not allowed,
    // it either returns a 200 without CORS headers or an error.
    // Our implementation returns an error.
    const response = await request(app)
      .get("/test")
      .set("Origin", "http://malicious-site.com");

    // The cors middleware treats an error in the origin function as a 500 by default
    // unless handled otherwise.
    expect(response.status).toBe(500);
  });

  it("should handle preflight OPTIONS requests", async () => {
    const response = await request(app)
      .options("/test")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type, Authorization");

    expect(response.status).toBe(204);
    expect(response.header["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
    expect(response.header["access-control-allow-methods"]).toContain("POST");
    expect(response.header["access-control-allow-headers"]).toContain(
      "Content-Type"
    );
    expect(response.header["access-control-allow-headers"]).toContain(
      "Authorization"
    );
    expect(response.header["access-control-max-age"]).toBe("86400");
  });

  it("should allow requests with no origin (e.g., server-side or curl)", async () => {
    const response = await request(app).get("/test");

    expect(response.status).toBe(200);
    expect(response.header["access-control-allow-origin"]).toBeUndefined();
  });
});
