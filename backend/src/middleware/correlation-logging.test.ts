import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { CorrelationLogger } from './correlation-logging';

describe('CorrelationLogger', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      method: 'GET',
      path: '/api/test',
    };
    mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      send: vi.fn(),
    };
    mockNext = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should generate correlation ID', () => {
    const id = CorrelationLogger.generateCorrelationId();
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should extract existing correlation ID from headers', () => {
    const existingId = 'existing-id-123';
    mockReq.headers = { 'x-correlation-id': existingId };

    const id = CorrelationLogger.extractCorrelationId(mockReq as Request);
    expect(id).toBe(existingId);
  });

  it('should generate new correlation ID if not in headers', () => {
    const id = CorrelationLogger.extractCorrelationId(mockReq as Request);
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('should log structured messages', () => {
    const correlationId = 'test-id-123';
    const message = 'Test message';
    const metadata = { userId: 'user123' };

    CorrelationLogger.log(correlationId, 'info', message, metadata);

    expect(console.log).toHaveBeenCalled();
    const logCall = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.correlationId).toBe(correlationId);
    expect(parsed.message).toBe(message);
    expect(parsed.level).toBe('info');
    expect(parsed.metadata).toEqual(metadata);
  });

  it('should attach correlation ID to request', () => {
    const middleware = CorrelationLogger.middleware();
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.correlationId).toBeDefined();
    expect(mockNext).toHaveBeenCalled();
  });

  it('should set correlation ID header in response', () => {
    const middleware = CorrelationLogger.middleware();
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      expect.any(String)
    );
  });

  it('should log request with duration', (done) => {
    const middleware = CorrelationLogger.middleware();
    const originalSend = mockRes.send;

    middleware(mockReq as Request, mockRes as Response, mockNext);

    setTimeout(() => {
      (mockRes.send as any)('response data');

      const logCall = (console.log as any).mock.calls[0][0];
      const parsed = JSON.parse(logCall);

      expect(parsed.duration).toBeGreaterThanOrEqual(0);
      expect(parsed.method).toBe('GET');
      expect(parsed.path).toBe('/api/test');
      done();
    }, 10);
  });

  it('should set error level for 4xx/5xx responses', () => {
    mockRes.statusCode = 500;
    const middleware = CorrelationLogger.middleware();

    middleware(mockReq as Request, mockRes as Response, mockNext);
    (mockRes.send as any)('error');

    const logCall = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.level).toBe('error');
    expect(parsed.statusCode).toBe(500);
  });

  it('should preserve correlation ID across requests', () => {
    const correlationId = 'preserved-id-123';
    mockReq.headers = { 'x-correlation-id': correlationId };

    const middleware = CorrelationLogger.middleware();
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.correlationId).toBe(correlationId);
  });
});
