# Glossary

A comprehensive guide to terms used in Nova Launch and the Stellar ecosystem.

---

## A

### Address
A unique identifier for a Stellar account, starting with "G" and 56 characters long. Example: `GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

Also called: Account address, wallet address, public key

### Admin
The creator and controller of a token. The admin can mint additional tokens, burn tokens, and update metadata.

### Asset
Another term for a token on the Stellar network. All tokens are assets, but not all assets are tokens (XLM is the native asset).

---

## B

### Balance
The amount of a specific token or XLM held in a wallet.

### Blockchain
A distributed, immutable ledger that records all transactions. Stellar is a blockchain network.

### Burn
The permanent removal of tokens from circulation. Burned tokens cannot be recovered or used again.

---

## C

### Clawback
The ability for a token admin to forcibly remove tokens from any holder's wallet. Also called "admin burn" in Nova Launch.

### Contract
A smart contract - programmable code deployed on the blockchain. Nova Launch deploys token contracts.

### Contract Address
The unique identifier for a deployed smart contract. Your token's contract address is how others can find and interact with it.

---

## D

### Decimals
The number of decimal places a token supports, determining its divisibility.

**Examples**:
- 0 decimals: Only whole numbers (1, 2, 3)
- 2 decimals: Like dollars (1.00, 1.50)
- 7 decimals: Stellar standard (0.0000001 minimum)
- 18 decimals: Maximum divisibility

### Decentralized
Not controlled by a single entity. Blockchain networks are decentralized - no single company or person controls them.

### Deployment
The process of creating and publishing a token contract to the blockchain.

### DEX (Decentralized Exchange)
A platform for trading tokens without a central authority. Examples: Stellar DEX, Uniswap.

---

## F

### Fee
Payment required to perform blockchain operations. Nova Launch fees:
- Base deployment: 7 XLM
- Metadata: 3 XLM
- Network fees: ~0.00001 XLM per transaction

### Freighter
A popular Stellar wallet browser extension. Recommended for use with Nova Launch.

### Friendbot
A service that provides free test XLM on Stellar's testnet for development and testing.

---

## G

### Gas
A term from Ethereum for transaction fees. Stellar uses much lower fees than Ethereum "gas."

---

## H

### Horizon
Stellar's API server for interacting with the blockchain. Used to query balances, submit transactions, and read blockchain data.

### Hash
A unique identifier for a transaction. Also called transaction hash or TX hash. Used to look up transactions on blockchain explorers.

---

## I

### Initial Supply
The number of tokens created when a token is first deployed. These tokens are minted to the creator's wallet.

### IPFS (InterPlanetary File System)
Decentralized storage network used for storing token metadata (logos and descriptions). Content on IPFS is permanent and distributed.

---

## L

### Ledger
1. A record of all transactions on a blockchain
2. A hardware wallet brand for secure key storage

### Liquidity
The availability of a token for trading. High liquidity means easy buying/selling.

### Lumens
See XLM.

---

## M

### Mainnet
The production Stellar network where real transactions occur with real value. Opposite of testnet.

### Metadata
Additional information about a token, including:
- Logo image
- Description
- Website
- Social links

Stored on IPFS and linked to the token contract.

### Mint
The creation of new tokens. Initial minting happens at deployment. Additional minting can be done by the token admin.

---

## N

### Network
The blockchain environment. Stellar has two main networks:
- **Testnet**: For testing (free, no real value)
- **Mainnet**: For production (real XLM, real value)

### Non-custodial
A system where users maintain control of their own funds and private keys. Nova Launch is non-custodial - we never have access to your wallet.

---

## P

### Private Key
A secret code that controls access to a wallet. Also called "secret key." Starts with "S" on Stellar. Never share your private key!

### Public Key
Your wallet address that others can see and send tokens to. Safe to share publicly. Starts with "G" on Stellar.

---

## R

### Recovery Phrase
A 12 or 24-word phrase that can restore access to your wallet. Also called:
- Seed phrase
- Mnemonic phrase
- Backup phrase

**Critical**: Write it down and keep it secure. Never share it!

---

## S

### Smart Contract
Programmable code that runs on a blockchain. Nova Launch uses smart contracts to deploy tokens.

### Soroban
Stellar's smart contract platform. Enables programmable tokens and applications on Stellar.

### Stellar
The blockchain network that Nova Launch uses. Known for fast, low-cost transactions.

### Stroops
The smallest unit of XLM. 1 XLM = 10,000,000 stroops. Like cents to dollars.

### Supply
The total number of tokens in existence. Can be:
- **Initial supply**: Created at deployment
- **Total supply**: All tokens ever created
- **Circulating supply**: Tokens available (excluding burned tokens)

### Symbol
A short ticker code for a token. Examples: BTC, ETH, XLM. Your token's symbol should be 3-12 characters.

---

## T

### Testnet
A test version of the Stellar network. Uses free test XLM with no real value. Perfect for practicing before mainnet deployment.

### Token
A digital asset created on a blockchain. Can represent anything: currency, points, access, ownership, etc.

### Transaction
An operation on the blockchain, such as:
- Deploying a token
- Transferring tokens
- Minting new tokens
- Burning tokens

### Treasury
The wallet address that receives platform fees. Controlled by Nova Launch.

---

## W

### Wallet
Software that stores your private keys and lets you interact with the blockchain. Examples: Freighter, Albedo, xBull.

### WASM (WebAssembly)
A binary format for smart contracts. Soroban contracts are compiled to WASM.

---

## X

### XLM (Lumens)
The native cryptocurrency of the Stellar network. Required for:
- Transaction fees
- Minimum account balance (1 XLM)
- Nova Launch deployment fees

Current price: ~$0.10 USD (varies)

### XDR (External Data Representation)
A format for encoding Stellar transactions. Used internally by wallets and tools.

---

## Common Abbreviations

| Abbreviation | Full Term | Meaning |
|--------------|-----------|---------|
| **DEX** | Decentralized Exchange | Trading platform without central control |
| **DApp** | Decentralized Application | Application running on blockchain |
| **DAO** | Decentralized Autonomous Organization | Community-governed organization |
| **KYC** | Know Your Customer | Identity verification process |
| **TX** | Transaction | Blockchain operation |
| **UI** | User Interface | Visual design of application |
| **UX** | User Experience | How users interact with application |
| **API** | Application Programming Interface | Software communication protocol |
| **SDK** | Software Development Kit | Tools for developers |

---

## Token-Related Terms

### Fungible Token
A token where each unit is identical and interchangeable. Like currency - one dollar equals any other dollar.

### Non-Fungible Token (NFT)
A unique token that cannot be exchanged 1:1 with another. Each NFT is distinct.

### Utility Token
A token that provides access to a product or service.

### Governance Token
A token that grants voting rights in a DAO or protocol.

### Security Token
A token that represents ownership or investment. May be subject to securities regulations.

---

## Technical Terms

### Gas Limit
Maximum fee willing to pay for a transaction. Not used on Stellar (fixed low fees).

### Nonce
A number used once to prevent transaction replay. Handled automatically by Stellar.

### Consensus
How blockchain nodes agree on transaction validity. Stellar uses Stellar Consensus Protocol (SCP).

### Node
A computer that participates in the blockchain network by validating and relaying transactions.

### Validator
A node that participates in consensus to validate transactions.

---

## Financial Terms

### Market Cap
Total value of all tokens: (Token Price) × (Circulating Supply)

### Liquidity Pool
A collection of tokens locked in a smart contract to enable trading.

### Slippage
The difference between expected and actual trade price due to market movement.

### APY (Annual Percentage Yield)
The yearly return on an investment, including compound interest.

---

## Security Terms

### Phishing
Fraudulent attempts to steal private keys or recovery phrases through fake websites or messages.

### Rug Pull
A scam where token creators abandon a project and steal funds.

### Audit
A security review of smart contract code to find vulnerabilities.

### Multi-sig
Multi-signature - requiring multiple approvals for transactions. Adds security.

---

## Need More Help?

- **Don't understand a term?** Ask in our [Discord](https://discord.gg/nova-launch)
- **Want to learn more?** Check our [FAQ](FAQ.md)
- **Need context?** Read the [Getting Started Guide](GETTING_STARTED.md)

---

## Contribute

Found a term we missed? Submit a pull request or suggest it in Discord!
