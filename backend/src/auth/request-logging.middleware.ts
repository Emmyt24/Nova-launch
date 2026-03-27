import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Attach requestId for downstream use
    (req as any).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const { method, originalUrl, ip } = req;

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;
      const user = (req as any).user;
      const walletAddress = user?.walletAddress ?? "anonymous";

      const logLevel =
        statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "log";

      this.logger[logLevel](
        `[${requestId}] ${method} ${originalUrl} ${statusCode} ${duration}ms - ${walletAddress} (${ip})`
      );
    });

    next();
  }
}
