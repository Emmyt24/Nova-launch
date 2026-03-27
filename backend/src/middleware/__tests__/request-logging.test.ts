import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestLoggingMiddleware, formatDetailedLog } from '../request-logging.middleware';

describe('Request Logging Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let finishCallback: Function;

  beforeEach(() => {
    req = {
      method: 'GET',
      originalUrl: '/api/tokens',
      url: '/api/tokens',
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any
    };

    res = {
      statusCode: 200,
      setHeader: vi.fn(),
      on: vi.fn((event: string, callback: Function) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
      })
    } as any;

    next = vi.fn();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log successful requests', () => {
    requestLoggingMiddleware(req as Request, res as Response, next);
    finishCallback();

    expect(consoleLogSpy).toHaveBeenCalled();
    const logMessage = consoleLogSpy.mock.calls[0][0];
    expect(logMessage).toContain('GET');
    expect(logMessage).toContain('/api/tokens');
    expect(logMessage).toContain('200');
    expect(logMessage).toMatch(/\d+ms/);
  });

  it('should log warnings for 4xx status codes', () => {
    res.statusCode = 404;
    requestLoggingMiddleware(req as Request, res as Response, next);
    finishCallback();

    expect(consoleWarnSpy).toHaveBeenCalled();
    const logMessage = consoleWarnSpy.mock.calls[0][0];
    expect(logMessage).toContain('404');
  });

  it('should log errors for 5xx status codes', () => {
    res.statusCode = 500;
    requestLoggingMiddleware(req as Request, res as Response, next);
    finishCallback();

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logMessage = consoleErrorSpy.mock.calls[0][0];
    expect(logMessage).toContain('500');
  });

  it('should set X-Request-Id header', () => {
    requestLoggingMiddleware(req as Request, res as Response, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
  });

  it('should use existing request ID if provided', () => {
    req.headers = { 'x-request-id': 'existing-id' };
    requestLoggingMiddleware(req as Request, res as Response, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'existing-id');
  });

  it('should call next middleware', () => {
    requestLoggingMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it('should format timestamp correctly', () => {
    requestLoggingMiddleware(req as Request, res as Response, next);
    finishCallback();

    const logMessage = consoleLogSpy.mock.calls[0][0];
    expect(logMessage).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/);
  });

  it('should include user agent in detailed log', () => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: 'GET',
      path: '/api/tokens',
      statusCode: 200,
      responseTime: 45,
      userAgent: 'Mozilla/5.0',
      ip: '127.0.0.1',
      requestId: 'test-id'
    };

    const detailedLog = formatDetailedLog(logEntry);
    expect(detailedLog).toContain('Mozilla/5.0');
    expect(detailedLog).toContain('127.0.0.1');
  });
});
