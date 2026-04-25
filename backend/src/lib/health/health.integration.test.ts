/**
 * Integration tests for dependency health checks.
 * Uses the HealthService directly — no HTTP server required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal stubs so the module can be imported without a real DB / network
// ---------------------------------------------------------------------------
vi.mock('../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '1': 1 }]),
  },
}));

vi.mock('../../config/env', () => ({
  validateEnv: () => ({
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    STELLAR_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
    PORT: 3001,
  }),
}));

// We control fetch globally so we can simulate up/down states
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { HealthService } from '../../lib/health/health.service';

function okResponse() {
  return Promise.resolve({ ok: true, status: 200 } as Response);
}
function failResponse(status = 503) {
  return Promise.resolve({ ok: false, status } as Response);
}
function networkError() {
  return Promise.reject(new Error('ECONNREFUSED'));
}

describe('HealthService dependency probes', () => {
  let service: HealthService;

  beforeEach(() => {
    // Reset singleton between tests
    // @ts-expect-error — accessing private static for test isolation
    HealthService.instance = undefined;
    service = HealthService.getInstance();
    mockFetch.mockReset();
  });

  it('reports healthy when all dependencies are up', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
    const result = await service.checkHealth({ timeout: 3000 });

    expect(result.status).toBe('healthy');
    expect(result.services.database.status).toBe('up');
    expect(result.services.stellarHorizon.status).toBe('up');
    expect(result.services.stellarSoroban.status).toBe('up');
    expect(result.services.ipfs.status).toBe('up');
  });

  it('reports unhealthy when database is down', async () => {
    const { prisma } = await import('../../lib/prisma');
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('DB connection refused'));
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

    const result = await service.checkHealth({ timeout: 3000 });
    expect(result.status).toBe('unhealthy');
    expect(result.services.database.status).toBe('down');
  });

  it('reports degraded when Soroban RPC returns non-2xx', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)  // Horizon
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response) // Soroban
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response); // IPFS

    const result = await service.checkHealth({ timeout: 3000 });
    expect(['degraded', 'unhealthy']).toContain(result.status);
    expect(result.services.stellarSoroban.status).not.toBe('up');
  });

  it('reports degraded when Horizon is unreachable', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED')) // Horizon
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)  // Soroban
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response); // IPFS

    const result = await service.checkHealth({ timeout: 3000 });
    expect(['degraded', 'unhealthy']).toContain(result.status);
    expect(result.services.stellarHorizon.status).toBe('down');
  });

  it('includes IPFS probe in the result', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
    const result = await service.checkHealth({ timeout: 3000 });
    expect(result.services.ipfs).toBeDefined();
    expect(['up', 'down', 'degraded']).toContain(result.services.ipfs.status);
  });

  it('result includes timestamp, uptime, and version fields', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
    const result = await service.checkHealth({ timeout: 3000 });
    expect(result.timestamp).toBeTruthy();
    expect(typeof result.uptime).toBe('number');
    expect(typeof result.version).toBe('string');
  });
});
