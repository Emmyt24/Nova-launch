import { NextResponse } from "next/server";
import { healthService } from "@/lib/health";

/**
 * GET /api/health/detailed
 * Detailed health check endpoint with metrics
 * Returns comprehensive health information including system metrics
 */
export async function GET() {
  try {
    const health = await healthService.checkDetailedHealth({ timeout: 5000 });

    const statusCode =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
          ? 200
          : 503;

    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: healthService.getUptime(),
        version: healthService.getVersion(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
