/**
 * Contract Event Fixtures
 * 
 * Mock Stellar contract events for testing backend event handlers
 * Ensures backend remains compatible as contract events evolve
 */

export interface ContractEventFixture {
  type: string;
  ledger: number;
  ledger_close_time: string;
  contract_id: string;
  id: string;
  paging_token: string;
  topic: string[];
  value: any;
  in_successful_contract_call: boolean;
  transaction_hash: string;
}

const MOCK_CONTRACT_ID = "CDUMMYCONTRACTID123456789ABCDEFGHIJKLMNOPQRS";
const MOCK_TOKEN_ADDRESS = "CDUMMYTOKENADDR123456789ABCDEFGHIJKLMNOPQRST";
const MOCK_ADMIN = "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MOCK_CREATOR = "GCREATOR123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Token Created Event (tok_reg)
 * Emitted when a new token is deployed
 */
export const tokenCreatedEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1000,
  ledger_close_time: "2026-03-03T08:00:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-1",
  paging_token: "0001-1",
  topic: ["tok_reg", MOCK_TOKEN_ADDRESS],
  value: {
    creator: MOCK_CREATOR,
    name: "Mock Token",
    symbol: "MCK",
    decimals: 7,
    initial_supply: "1000000000000",
  },
  in_successful_contract_call: true,
  transaction_hash: "abc123def456",
};

/**
 * Admin Transfer Event (adm_xfer)
 * Emitted when admin rights are transferred
 */
export const adminTransferEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1001,
  ledger_close_time: "2026-03-03T08:01:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-2",
  paging_token: "0001-2",
  topic: ["adm_xfer"],
  value: {
    old_admin: MOCK_ADMIN,
    new_admin: "GNEWADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  },
  in_successful_contract_call: true,
  transaction_hash: "def456ghi789",
};

/**
 * Admin Proposed Event (adm_prop)
 * Emitted when admin proposes a new admin (two-step transfer)
 */
export const adminProposedEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1002,
  ledger_close_time: "2026-03-03T08:02:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-3",
  paging_token: "0001-3",
  topic: ["adm_prop"],
  value: {
    current_admin: MOCK_ADMIN,
    proposed_admin: "GPROPOSED123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  },
  in_successful_contract_call: true,
  transaction_hash: "ghi789jkl012",
};

/**
 * Admin Burn Event (adm_burn)
 * Emitted when admin burns tokens from a holder
 */
export const adminBurnEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1003,
  ledger_close_time: "2026-03-03T08:03:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-4",
  paging_token: "0001-4",
  topic: ["adm_burn", MOCK_TOKEN_ADDRESS],
  value: {
    admin: MOCK_ADMIN,
    from: "GHOLDER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    amount: "1000000000", // 100 tokens with 7 decimals
  },
  in_successful_contract_call: true,
  transaction_hash: "jkl012mno345",
};

/**
 * Token Burned Event (tok_burn)
 * Emitted when tokens are burned (self-burn)
 */
export const tokenBurnedEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1004,
  ledger_close_time: "2026-03-03T08:04:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-5",
  paging_token: "0001-5",
  topic: ["tok_burn", MOCK_TOKEN_ADDRESS],
  value: {
    from: "GHOLDER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    burner: "GHOLDER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    amount: "500000000", // 50 tokens with 7 decimals
  },
  in_successful_contract_call: true,
  transaction_hash: "mno345pqr678",
};

/**
 * Initialized Event (init)
 * Emitted when factory is initialized
 */
export const initializedEvent: ContractEventFixture = {
  type: "contract",
  ledger: 999,
  ledger_close_time: "2026-03-03T07:59:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-0",
  paging_token: "0001-0",
  topic: ["init"],
  value: {
    admin: MOCK_ADMIN,
    treasury: "GTREASURY123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    base_fee: "70000000", // 7 XLM
    metadata_fee: "30000000", // 3 XLM
  },
  in_successful_contract_call: true,
  transaction_hash: "xyz789abc012",
};

/**
 * Fees Updated Event (fee_upd)
 * Emitted when fees are updated
 */
export const feesUpdatedEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1005,
  ledger_close_time: "2026-03-03T08:05:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-6",
  paging_token: "0001-6",
  topic: ["fee_upd"],
  value: {
    base_fee: "80000000", // 8 XLM
    metadata_fee: "40000000", // 4 XLM
  },
  in_successful_contract_call: true,
  transaction_hash: "pqr678stu901",
};

/**
 * Pause Event (pause)
 * Emitted when contract is paused
 */
export const pauseEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1006,
  ledger_close_time: "2026-03-03T08:06:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-7",
  paging_token: "0001-7",
  topic: ["pause"],
  value: {
    admin: MOCK_ADMIN,
  },
  in_successful_contract_call: true,
  transaction_hash: "stu901vwx234",
};

/**
 * Unpause Event (unpause)
 * Emitted when contract is unpaused
 */
export const unpauseEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1007,
  ledger_close_time: "2026-03-03T08:07:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-8",
  paging_token: "0001-8",
  topic: ["unpause"],
  value: {
    admin: MOCK_ADMIN,
  },
  in_successful_contract_call: true,
  transaction_hash: "vwx234yza567",
};

/**
 * Clawback Toggled Event (clawback)
 * Emitted when clawback is enabled/disabled
 */
export const clawbackToggledEvent: ContractEventFixture = {
  type: "contract",
  ledger: 1008,
  ledger_close_time: "2026-03-03T08:08:00Z",
  contract_id: MOCK_CONTRACT_ID,
  id: "0001-9",
  paging_token: "0001-9",
  topic: ["clawback", MOCK_TOKEN_ADDRESS],
  value: {
    admin: MOCK_ADMIN,
    enabled: true,
  },
  in_successful_contract_call: true,
  transaction_hash: "yza567bcd890",
};

/**
 * All event fixtures for comprehensive testing
 */
export const allEventFixtures = [
  initializedEvent,
  tokenCreatedEvent,
  adminTransferEvent,
  adminProposedEvent,
  adminBurnEvent,
  tokenBurnedEvent,
  feesUpdatedEvent,
  pauseEvent,
  unpauseEvent,
  clawbackToggledEvent,
];

/**
 * Event fixtures by type for targeted testing
 */
export const eventFixturesByType = {
  init: initializedEvent,
  tok_reg: tokenCreatedEvent,
  adm_xfer: adminTransferEvent,
  adm_prop: adminProposedEvent,
  adm_burn: adminBurnEvent,
  tok_burn: tokenBurnedEvent,
  fee_upd: feesUpdatedEvent,
  pause: pauseEvent,
  unpause: unpauseEvent,
  clawback: clawbackToggledEvent,
};

/**
 * Realistic token lifecycle replay sequence:
 * create → self-burn → admin-burn
 * Ordered by ledger for deterministic replay.
 */
export const tokenLifecycleReplaySequence: ContractEventFixture[] = [
  tokenCreatedEvent,   // ledger 1000
  adminBurnEvent,      // ledger 1003
  tokenBurnedEvent,    // ledger 1004
];
