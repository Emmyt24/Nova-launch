/**
 * Frontend environment validation.
 * Throws at module load time if required variables are missing in production.
 * In development, getBootErrors() returns a list of warnings without throwing.
 */

type Network = 'testnet' | 'mainnet';

interface FrontendEnv {
  NETWORK: Network;
  FACTORY_CONTRACT_ID: string;
  IPFS_API_KEY: string;
  IPFS_API_SECRET: string;
}

function getEnv(): FrontendEnv {
  const network = (import.meta.env.VITE_NETWORK || 'testnet') as Network;
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error(`VITE_NETWORK must be "testnet" or "mainnet", got "${network}"`);
  }

  const factoryContractId = import.meta.env.VITE_FACTORY_CONTRACT_ID || '';

  // In production, a missing contract ID is a hard failure.
  if (import.meta.env.PROD && !factoryContractId) {
    throw new Error(
      'VITE_FACTORY_CONTRACT_ID is required in production. ' +
      'Set it in your .env file after deploying the contract.'
    );
  }

  return {
    NETWORK: network,
    FACTORY_CONTRACT_ID: factoryContractId,
    IPFS_API_KEY: import.meta.env.VITE_IPFS_API_KEY || '',
    IPFS_API_SECRET: import.meta.env.VITE_IPFS_API_SECRET || '',
  };
}

export const ENV = getEnv();

/**
 * Returns a list of human-readable boot errors for the current environment.
 * Used by main.tsx to surface problems before rendering the app.
 */
export function getBootErrors(): string[] {
  const errors: string[] = [];

  if (!ENV.FACTORY_CONTRACT_ID) {
    errors.push('VITE_FACTORY_CONTRACT_ID is not set — token deployment will not work.');
  }

  if (!ENV.IPFS_API_KEY || !ENV.IPFS_API_SECRET) {
    // IPFS is optional; only warn, don't block.
    // Not included as a hard error — metadata upload is optional.
  }

  return errors;
}
