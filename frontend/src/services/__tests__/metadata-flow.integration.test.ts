/**
 * Metadata flow integration tests
 * Covers: IPFS upload → URI validation → contract submission → retrieval
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPFSService, isValidIpfsUri, _clearMetadataCache } from '../IPFSService';
import { getDeploymentFeeBreakdown } from '../../utils/feeCalculation';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../../config/ipfs', () => ({
  IPFS_CONFIG: {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    pinataApiUrl: 'https://api.pinata.cloud',
    pinataGateway: 'https://gateway.pinata.cloud/ipfs',
  },
}));

function makeFile(): File {
  return new File([new Uint8Array(1024)], 'img.png', { type: 'image/png' });
}
const pinataOk = (hash: string) => ({ ok: true, json: async () => ({ IpfsHash: hash }) });
const gatewayOk = (meta: object) => ({ ok: true, json: async () => meta });

// ── isValidIpfsUri ────────────────────────────────────────────────────────────

describe('isValidIpfsUri', () => {
  it('accepts valid ipfs:// URI', () => {
    expect(isValidIpfsUri('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
  });
  it('rejects http:// URI', () => {
    expect(isValidIpfsUri('https://example.com/meta.json')).toBe(false);
  });
  it('rejects empty string', () => {
    expect(isValidIpfsUri('')).toBe(false);
  });
  it('rejects ipfs:// with short hash', () => {
    expect(isValidIpfsUri('ipfs://abc')).toBe(false);
  });
});

// ── IPFSService.uploadMetadata ────────────────────────────────────────────────

describe('IPFSService.uploadMetadata', () => {
  let svc: IPFSService;
  beforeEach(() => { svc = new IPFSService(); mockFetch.mockReset(); });

  it('uploads image then metadata and returns ipfs:// URI', async () => {
    mockFetch
      .mockResolvedValueOnce(pinataOk('QmImageHash123456789'))
      .mockResolvedValueOnce(pinataOk('QmMetaHash123456789'));
    const uri = await svc.uploadMetadata(makeFile(), 'A test token', 'TestToken');
    expect(uri).toBe('ipfs://QmMetaHash123456789');
    expect(isValidIpfsUri(uri)).toBe(true);
  });

  it('throws when credentials are missing', async () => {
    const noCredSvc = new IPFSService();
    (noCredSvc as any).apiKey = '';
    await expect(noCredSvc.uploadMetadata(makeFile(), 'desc', 'Token')).rejects.toThrow('credentials');
  });

  it('throws when Pinata returns non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Unauthorized' });
    await expect(svc.uploadMetadata(makeFile(), 'desc', 'Token')).rejects.toThrow('IPFS upload failed');
  });
});

// ── IPFSService.getMetadata ───────────────────────────────────────────────────

describe('IPFSService.getMetadata', () => {
  let svc: IPFSService;
  beforeEach(() => { svc = new IPFSService(); mockFetch.mockReset(); _clearMetadataCache(); });

  it('fetches and returns valid metadata', async () => {
    const meta = { name: 'TestToken', description: 'A token', image: 'ipfs://QmImg' };
    mockFetch.mockResolvedValueOnce(gatewayOk(meta));
    const result = await svc.getMetadata('ipfs://QmMetaHash123456789');
    expect(result).toMatchObject(meta);
  });

  it('tries next gateway on failure', async () => {
    const meta = { name: 'T', description: 'D', image: 'ipfs://QmImg' };
    mockFetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(gatewayOk(meta));
    const result = await svc.getMetadata('ipfs://QmMetaHash123456789');
    expect(result.name).toBe('T');
  });

  it('throws when all gateways fail', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    await expect(svc.getMetadata('ipfs://QmMetaHash123456789')).rejects.toThrow('all gateways');
  });
});

// ── Fee isolation ─────────────────────────────────────────────────────────────

describe('tokens without metadata do not pay metadata fee', () => {
  it('metadataFee is 0 when hasMetadata=false', () => {
    const b = getDeploymentFeeBreakdown(false, 7, 3);
    expect(b.metadataFee).toBe(0);
    expect(b.totalFee).toBe(7);
  });

  it('metadataFee is included when hasMetadata=true', () => {
    const b = getDeploymentFeeBreakdown(true, 7, 3);
    expect(b.metadataFee).toBe(3);
    expect(b.totalFee).toBe(10);
  });
});
