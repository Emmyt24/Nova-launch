import { Request, Response, NextFunction } from 'express';

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ip?: string;
  requestId?: string;
}

export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Attach request ID
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Capture response
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.socket.remoteAddress,
      requestId
    };

    // Format log message
    const logMessage = formatLogMessage(logEntry);
    
    // Log based on status code
    if (res.statusCode >= 500) {
      console.error(logMessage);
    } else if (res.statusCode >= 400) {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }
  });

  next();
};

function formatLogMessage(entry: LogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString().replace('T', ' ').substring(0, 19);
  return `[${timestamp}] ${entry.method} ${entry.path} ${entry.statusCode} ${entry.responseTime}ms`;
}

export function formatDetailedLog(entry: LogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString().replace('T', ' ').substring(0, 19);
  return `[${timestamp}] ${entry.method} ${entry.path} ${entry.statusCode} ${entry.responseTime}ms | IP: ${entry.ip} | UA: ${entry.userAgent?.substring(0, 50)}`;
}
