import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import statsRoutes from "../stats";
import { Database } from "../../config/database";

const app = express();
app.use(express.json());
app.use("/api/stats", statsRoutes);

describe("Stats API", () => {
  beforeEach(() => {
    Database.initialize();
  });

  it("should return analytics data", async () => {
    const response = await request(app).get("/api/stats").expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty("totalTokens");
    expect(response.body.data).toHaveProperty("totalUsers");
    expect(response.body.data).toHaveProperty("totalBurned");
    expect(response.body.data).toHaveProperty("uptime");
    expect(response.body.data).toHaveProperty("lastUpdated");
  });

  it("should return correct data types", async () => {
    const response = await request(app).get("/api/stats").expect(200);

    const { data } = response.body;
    expect(typeof data.totalTokens).toBe("number");
    expect(typeof data.totalUsers).toBe("number");
    expect(typeof data.totalBurned).toBe("string");
    expect(typeof data.uptime).toBe("string");
    expect(typeof data.lastUpdated).toBe("string");
  });

  it("should cache results", async () => {
    const response1 = await request(app).get("/api/stats");
    const response2 = await request(app).get("/api/stats");

    expect(response1.body.data.lastUpdated).toBe(
      response2.body.data.lastUpdated
    );
  });

  it("should format uptime correctly", async () => {
    const response = await request(app).get("/api/stats").expect(200);

    expect(response.body.data.uptime).toMatch(/\d+ (day|hour)s?/);
  });

  it("should return ISO timestamp", async () => {
    const response = await request(app).get("/api/stats").expect(200);

    const timestamp = response.body.data.lastUpdated;
    expect(() => new Date(timestamp)).not.toThrow();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
