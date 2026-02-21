/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IPFS_API_KEY: string
  readonly VITE_IPFS_API_SECRET: string
  readonly VITE_NETWORK: 'testnet' | 'mainnet'
  readonly VITE_FACTORY_CONTRACT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
