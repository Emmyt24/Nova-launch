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

  // In production, a missing or malformed contract ID is a hard failure.
  if (import.meta.env.PROD) {
    if (!factoryContractId) {
      throw new Error(
        'VITE_FACTORY_CONTRACT_ID is empty. ' +
        'Set it to the deployed contract address for the active network.',
      );
    }
    if (!/^C[A-Z2-7]{55}$/.test(factoryContractId)) {
      throw new Error(
        `VITE_FACTORY_CONTRACT_ID is malformed: "${factoryContractId}". ` +
        'Expected a 56-character Soroban contract ID starting with "C".',
      );
    }
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
  } else if (!/^C[A-Z2-7]{55}$/.test(ENV.FACTORY_CONTRACT_ID)) {
    errors.push(
      `VITE_FACTORY_CONTRACT_ID is malformed: "${ENV.FACTORY_CONTRACT_ID}". ` +
      'Expected a 56-character Soroban contract ID starting with "C".',
    );
  }

  return errors;
}
