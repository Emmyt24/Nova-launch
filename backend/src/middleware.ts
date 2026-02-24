import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { healthService } from "./lib/health";

export function middleware(request: NextRequest) {
  // Track request metrics for health monitoring
  healthService.incrementRequestCount();

  const response = NextResponse.next();

  // Track errors based on response status
  response.headers.get("x-middleware-status");

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
