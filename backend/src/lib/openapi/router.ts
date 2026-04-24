/**
 * OpenAPI router — serves:
 *   GET /api/docs        → Swagger UI
 *   GET /api/docs/json   → Raw OpenAPI JSON spec
 */

import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./spec";

const router = Router();

// Serve raw JSON spec
router.get("/json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(openApiSpec);
});

// Serve Swagger UI
router.use("/", swaggerUi.serve);
router.get("/", swaggerUi.setup(openApiSpec, {
  customSiteTitle: "Nova Launch API Docs",
  swaggerOptions: { persistAuthorization: true },
}));

export default router;
