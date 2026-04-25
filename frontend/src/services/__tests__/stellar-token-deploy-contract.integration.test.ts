/**
 * Regression: contract call shape for create_token
 * create_token(creator, name, symbol, decimals, initial_supply, metadata_uri, fee_payment)
 */
import { describe, it, expect, vi } from 'vitest';
import { nativeToScVal } from '@stellar/stellar-sdk';

vi.mock('../../config/stellar', () => ({
  STELLAR_CONFIG: { factoryContractId: '' },
  getNetworkConfig: () => ({
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }),
}));

import { StellarService } from '../stellar.service';

const CREATOR = 'GDI725MGXMBJR32NZX7FFR4FZVYNZQDBJW63KKWI2I2YU6XTVUPNSTB6';
const base = {
  name: 'MyToken', symbol: 'MTK', decimals: 7,
  initialSupply: '1000000000', creatorAddress: CREATOR, feePayment: BigInt(70_000_000),
};
const svc = new StellarService('testnet') as any;

describe('buildCreateTokenArgs — contract call shape', () => {
  it('produces 7 args', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, base, base.feePayment)).toHaveLength(7);
  });
  it('arg[0] creator address', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, base, base.feePayment)[0])
      .toEqual(nativeToScVal(CREATOR, { type: 'address' }));
  });
  it('arg[1] name', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, base, base.feePayment)[1])
      .toEqual(nativeToScVal('MyToken', { type: 'string' }));
  });
  it('arg[2] symbol', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, base, base.feePayment)[2])
      .toEqual(nativeToScVal('MTK', { type: 'string' }));
  });
  it('arg[3] decimals u32', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, base, base.feePayment)[3])
      .toEqual(nativeToScVal(7, { type: 'u32' }));
  });
  it('arg[4] initial_supply i128', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, base, base.feePayment)[4])
      .toEqual(nativeToScVal(BigInt('1000000000'), { type: 'i128' }));
  });
  it('arg[5] None when no metadataUri', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, base, base.feePayment)[5])
      .toEqual(nativeToScVal(null, { type: 'option' }));
  });
  it('arg[5] string when metadataUri provided', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, { ...base, metadataUri: 'ipfs://Qm123' }, base.feePayment)[5])
      .toEqual(nativeToScVal('ipfs://Qm123', { type: 'string' }));
  });
  it('arg[6] fee_payment i128', () => {
    expect(svc.buildCreateTokenArgs(CREATOR, base, base.feePayment)[6])
      .toEqual(nativeToScVal(BigInt(70_000_000), { type: 'i128' }));
  });
});
