/**
 * Backend startup validation — checks live reachability of external dependencies.
 * Call runStartupValidation() after validateEnv() and before app.listen().
 * Throws with a clear message if any critical dependency is unreachable.
 */
import { BackendEnv } from './env';

interface CheckResult {
  name: string;
  ok: boolean;
  error?: string;
}

async function probe(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: true };
  } catch (err) {
    return { name, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkHorizon(url: string): Promise<void> {
  const res = await fetch(`${url}/`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function checkSoroban(url: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function checkDatabase(url: string): Promise<void> {
  // Validate URL format — actual connection is verified by Prisma on first query.
  // A malformed URL should fail fast here.
  const parsed = new URL(url);
  if (!parsed.protocol.startsWith('postgres') && !parsed.protocol.startsWith('mysql') && !parsed.protocol.startsWith('sqlite')) {
    throw new Error(`Unsupported database protocol: ${parsed.protocol}`);
  }
}

export async function runStartupValidation(env: BackendEnv): Promise<void> {
  const isProduction = env.NODE_ENV === 'production';

  const checks = await Promise.all([
    probe('Stellar Horizon', () => checkHorizon(env.STELLAR_HORIZON_URL)),
    probe('Stellar Soroban RPC', () => checkSoroban(env.STELLAR_SOROBAN_RPC_URL)),
    probe('Database URL', () => checkDatabase(env.DATABASE_URL)),
  ]);

  const failures = checks.filter((c) => !c.ok);

  if (failures.length === 0) {
    console.log('✅ Startup validation passed:', checks.map((c) => c.name).join(', '));
    return;
  }

  const report = failures
    .map((c) => `  • ${c.name}: ${c.error}`)
    .join('\n');

  const message = `Startup validation failed:\n${report}`;

  if (isProduction) {
    // Hard fail in production — a broken deployment should not serve traffic.
    throw new Error(message);
  } else {
    // Warn in development — external services may not be running locally.
    console.warn(`⚠️  ${message}`);
  }
}
