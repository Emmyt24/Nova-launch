import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface StructuredLog {
  timestamp: string;
  correlationId: string;
  level: 'info' | 'error' | 'warn' | 'debug';
  message: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  userId?: string;
  metadata?: Record<string, any>;
}

export class CorrelationLogger {
  private static readonly CORRELATION_ID_HEADER = 'x-correlation-id';

  static generateCorrelationId(): string {
    return uuidv4();
  }

  static extractCorrelationId(req: Request): string {
    const existing = req.headers[this.CORRELATION_ID_HEADER];
    if (typeof existing === 'string') return existing;
    return this.generateCorrelationId();
  }

  static log(
    correlationId: string,
    level: 'info' | 'error' | 'warn' | 'debug',
    message: string,
    metadata?: Record<string, any>
  ): void {
    const log: StructuredLog = {
      timestamp: new Date().toISOString(),
      correlationId,
      level,
      message,
      metadata,
    };

    console.log(JSON.stringify(log));
  }

  static middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const correlationId = this.extractCorrelationId(req);
      const startTime = Date.now();

      req.correlationId = correlationId;
      res.setHeader(this.CORRELATION_ID_HEADER, correlationId);

      const originalSend = res.send;
      res.send = function (data: any) {
        const duration = Date.now() - startTime;
        const log: StructuredLog = {
          timestamp: new Date().toISOString(),
          correlationId,
          level: res.statusCode >= 400 ? 'error' : 'info',
          message: `${req.method} ${req.path}`,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userId: (req as any).userId,
        };

        console.log(JSON.stringify(log));
        return originalSend.call(this, data);
      };

      next();
    };
  }
}

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}
