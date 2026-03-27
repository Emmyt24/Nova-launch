# Frequently Asked Questions (FAQ)

## General Questions

### What is Nova Launch?

Nova Launch is a no-code platform that lets you create custom tokens on the Stellar blockchain. You don't need any programming knowledge - just fill out a simple form and deploy your token in minutes.

### What is a token?

A token is a digital asset that lives on a blockchain. Tokens can represent anything: rewards points, membership access, currency, voting rights, or ownership. With Nova Launch, you can create your own token for your community, business, or project.

### Do I need coding skills?

No! Nova Launch is designed for non-technical users. If you can fill out a web form, you can deploy a token.

### How much does it cost?

- **Basic token deployment**: 7 XLM (~$0.70 USD)
- **With metadata (logo + description)**: 10 XLM (~$1.00 USD)

These fees go to the platform treasury and cover Stellar network costs.

### Is it safe?

Yes! Nova Launch is:
- **Non-custodial**: We never have access to your wallet or funds
- **Open source**: Our code is publicly auditable
- **Audited**: Smart contracts are tested and reviewed
- **Decentralized**: Tokens are deployed directly to Stellar blockchain

You maintain full control of your wallet and tokens at all times.

### What wallets are supported?

Currently supported:
- **Freighter** (recommended) - Browser extension

Coming soon:
- Albedo
- xBull
- Ledger hardware wallet

### Can I edit my token after deployment?

Some things can be changed, others cannot:

**Cannot be changed**:
- ❌ Token name
- ❌ Token symbol
- ❌ Decimals
- ❌ Contract address

**Can be changed** (by token admin):
- ✅ Mint additional tokens
- ✅ Add/update metadata
- ✅ Burn tokens

### What is IPFS metadata?

IPFS (InterPlanetary File System) is decentralized storage for your token's logo and description. When you add metadata:
- Your logo is uploaded to IPFS
- A permanent link is created
- The link is stored in your token contract
- Anyone can view your token's logo and description

This costs an additional 3 XLM.

### How long does deployment take?

Token deployment is very fast:
- **With metadata**: 10-20 seconds (includes IPFS upload)
- **Without metadata**: 5-10 seconds

Stellar's blockchain confirms transactions in about 5 seconds.

### What happens to my tokens after deployment?

After deployment:
1. Your token contract is created on Stellar
2. The initial supply is minted to your wallet
3. You receive the token contract address
4. You can transfer, mint more, or burn tokens
5. Others can add your token to their wallets using the contract address

---

## Technical Questions

### What blockchain does Nova Launch use?

Nova Launch uses the **Stellar blockchain** with **Soroban smart contracts**. Stellar is known for:
- Ultra-low fees (~$0.0001 per transaction)
- Fast confirmations (3-5 seconds)
- Built-in token support
- Energy efficiency

### What is Soroban?

Soroban is Stellar's smart contract platform. It allows developers to create programmable tokens and applications on Stellar. Nova Launch uses Soroban to deploy your tokens.

### What are decimals?

Decimals determine how divisible your token is. Examples:
- **0 decimals**: Only whole numbers (1, 2, 3...)
- **2 decimals**: Like dollars (1.00, 1.50, 2.99)
- **7 decimals**: Stellar standard (0.0000001 minimum)
- **18 decimals**: Maximum divisibility

Most tokens use 7 decimals (Stellar standard).

### How do I calculate initial supply with decimals?

The formula is: **Actual Supply = (Your Input) × 10^(Decimals)**

Examples with 7 decimals:
- Input `10000000` = 1 token
- Input `100000000` = 10 tokens
- Input `10000000000000` = 1,000,000 tokens

**Tip**: Use our calculator in the deployment form!

### What is XLM?

XLM (Lumens) is the native cryptocurrency of the Stellar network. You need XLM to:
- Pay transaction fees
- Meet minimum account balance (1 XLM)
- Deploy tokens on Nova Launch

### Can I deploy on testnet first?

Yes! We highly recommend testing on Stellar's testnet before deploying to mainnet:
- Get free test XLM from Friendbot
- Practice the deployment process
- Test your token parameters
- No real money required

Switch to mainnet when you're ready for production.

### What's the difference between testnet and mainnet?

| Feature | Testnet | Mainnet |
|---------|---------|---------|
| **Purpose** | Testing | Production |
| **XLM** | Free (no value) | Real money |
| **Tokens** | Test only | Real value |
| **Permanence** | Can be reset | Permanent |

Tokens deployed on testnet don't exist on mainnet.

---

## Token Management

### Can I mint more tokens after deployment?

Yes! As the token admin, you can mint additional tokens at any time. This requires:
- Your admin signature
- A small fee payment
- Specifying recipient and amount

### Can I burn tokens?

Yes! Token burning permanently removes tokens from circulation. You can:
- **Self-burn**: Burn your own tokens
- **Admin burn**: Token admin can burn from any address (clawback)
- **Batch burn**: Burn from multiple addresses at once

### How do I transfer tokens?

After deployment, use your wallet to transfer tokens:
1. Open Freighter wallet
2. Select your token
3. Click "Send"
4. Enter recipient address and amount
5. Confirm transaction

### Can I add metadata later?

Yes! If you deployed without metadata, you can add it later using the `set_metadata` function. This costs 3 XLM.

### What if I make a mistake in my token details?

Unfortunately, token name, symbol, and decimals cannot be changed after deployment. Always:
- Double-check all details before deploying
- Test on testnet first
- Use the review screen carefully

If you make a mistake, you'll need to deploy a new token.

### Can I delete or cancel my token?

No. Once deployed to the blockchain, your token contract is permanent. However, you can:
- Burn all tokens to remove them from circulation
- Stop minting new tokens
- Abandon the contract (stop using it)

---

## Fees and Costs

### Why do I need to pay fees?

Fees cover:
- Stellar network transaction costs
- IPFS storage for metadata
- Platform maintenance and development
- Smart contract deployment costs

Nova Launch fees are minimal compared to other blockchains (Ethereum gas fees can be $50-$500).

### What are stroops?

Stroops are the smallest unit of XLM:
- 1 XLM = 10,000,000 stroops
- Like cents to dollars
- Used for precise fee calculations

### Can I get a refund if deployment fails?

If deployment fails:
- Network fees are not refundable (paid to Stellar)
- Platform fees are not charged if deployment fails
- Your XLM remains in your wallet

Always ensure you have sufficient balance before deploying.

### Are there ongoing costs?

No! After deployment, there are no recurring fees. You only pay:
- Initial deployment fee (one-time)
- Optional metadata fee (one-time)
- Future minting fees (only if you mint more tokens)
- Standard Stellar transaction fees for transfers (~$0.0001)

---

## Troubleshooting

### My wallet won't connect

Try these steps:
1. Make sure Freighter is installed and unlocked
2. Refresh the Nova Launch page
3. Clear browser cache
4. Try a different browser
5. Check if Freighter needs an update

See [Troubleshooting Guide](TROUBLESHOOTING.md#wallet-wont-connect) for more help.

### Transaction failed

Common reasons:
- Insufficient XLM balance
- Network congestion (rare)
- Rejected transaction in wallet
- Invalid token parameters

Check your balance and try again. See [Troubleshooting Guide](TROUBLESHOOTING.md#transaction-failed).

### I don't see my tokens in my wallet

After deployment:
1. Open Freighter
2. Click "Add Asset"
3. Paste your token contract address
4. Confirm to add the token

Your tokens are on the blockchain even if not visible in wallet UI.

### Metadata upload failed

If IPFS upload fails:
- Check your internet connection
- Try a smaller image (under 5 MB)
- Use a supported format (PNG, JPG, GIF, SVG)
- Deploy without metadata and add it later

### I'm on the wrong network

To switch networks:
1. Click the network indicator in Nova Launch header
2. Select Testnet or Mainnet
3. Confirm in Freighter
4. Page will reload with correct network

**Warning**: Tokens on testnet don't exist on mainnet!

---

## Use Cases

### What can I use tokens for?

Common use cases:
- **Community rewards**: Reward active members
- **Loyalty points**: Customer rewards program
- **Membership access**: Token-gated content
- **Governance**: Voting rights for DAOs
- **Fundraising**: Sell tokens to raise funds
- **Gaming**: In-game currency or items
- **Events**: Tickets or access passes

### Can I sell my tokens?

Yes! After deployment, you can:
- Transfer tokens to buyers manually
- List on decentralized exchanges (DEXs)
- Create liquidity pools
- Integrate with payment systems

Nova Launch handles deployment; distribution is up to you.

### Can I use this for an ICO or token sale?

Nova Launch deploys the token, but doesn't handle sales. For token sales:
- Use a separate platform or smart contract
- Ensure compliance with local regulations
- Consider legal and tax implications
- Consult with legal professionals

**Disclaimer**: Nova Launch is not responsible for how you use your tokens.

---

## Security and Privacy

### Do you store my private keys?

No! Nova Launch is non-custodial. We never have access to:
- Your private keys
- Your recovery phrase
- Your wallet password
- Your funds

You maintain full control through your wallet.

### What data do you collect?

We collect minimal data:
- Wallet addresses (public information)
- Transaction hashes (public on blockchain)
- Token deployment details (public on blockchain)
- Basic usage analytics (anonymous)

We do NOT collect:
- Personal information
- Private keys
- Wallet passwords
- Financial data

### Is my token information public?

Yes. Blockchain data is public by design:
- Token contract address
- Token name and symbol
- Total supply and decimals
- All transactions
- Holder addresses and balances

This transparency is a feature of blockchain technology.

### Can someone steal my tokens?

Your tokens are safe if you:
- ✅ Keep your recovery phrase secure
- ✅ Never share your private keys
- ✅ Use a strong wallet password
- ✅ Verify transaction details before signing
- ✅ Only use official wallet extensions

See [Wallet Setup Guide](WALLET_SETUP.md#wallet-security-best-practices) for security tips.

---

## Support and Community

### How do I get help?

Multiple support channels:
- **Documentation**: Read our guides (you're here!)
- **Troubleshooting**: Check [Troubleshooting Guide](TROUBLESHOOTING.md)
- **Discord**: Join our community server
- **Email**: support@nova-launch.app
- **GitHub**: Report bugs or request features

### Can I contribute to Nova Launch?

Yes! Nova Launch is open source. You can:
- Report bugs on GitHub
- Suggest features
- Submit pull requests
- Improve documentation
- Help other users in Discord

See our [Contributing Guide](../../CONTRIBUTING.md).

### Where can I learn more about Stellar?

Resources:
- [Stellar.org](https://stellar.org) - Official website
- [Stellar Docs](https://developers.stellar.org) - Developer documentation
- [Soroban Docs](https://soroban.stellar.org) - Smart contract docs
- [Stellar Quest](https://quest.stellar.org) - Interactive tutorials

### Is there a mobile app?

Not yet, but it's on our roadmap! Currently, Nova Launch works on:
- Desktop browsers (Chrome, Firefox, Brave)
- Mobile browsers (with Freighter mobile)

Native iOS and Android apps are planned for 2027.

---

## Pricing and Business

### How does Nova Launch make money?

Nova Launch collects deployment fees:
- 7 XLM for basic deployment
- 3 XLM for metadata
- Future minting fees

These fees fund:
- Platform development
- Infrastructure costs
- Customer support
- New features

### Will prices increase?

Fees may be adjusted based on:
- XLM price changes
- Network costs
- Platform features

We'll always announce fee changes in advance. Early users benefit from current low prices!

### Is there a free tier?

Not for mainnet deployments. However:
- Testnet is completely free (use Friendbot for test XLM)
- No recurring costs after deployment
- Fees are already very low compared to alternatives

### Are there volume discounts?

Not currently, but we're considering:
- Batch deployment discounts
- Enterprise plans
- Partnership programs

Join our Discord to stay updated!

---

## Comparison

### How is Nova Launch different from other token platforms?

| Feature | Nova Launch | Ethereum | Other Platforms |
|---------|-------------|----------|-----------------|
| **Fees** | ~$1 | $50-$500 | $10-$100 |
| **Speed** | 5 seconds | 1-15 minutes | Varies |
| **Coding** | No code | Solidity required | Varies |
| **Blockchain** | Stellar | Ethereum | Various |
| **Ease of use** | Very easy | Complex | Moderate |

### Why choose Stellar over Ethereum?

Stellar advantages:
- ✅ 1000x lower fees
- ✅ 100x faster confirmations
- ✅ Built-in token support
- ✅ Energy efficient
- ✅ Designed for payments

Ethereum advantages:
- ✅ Larger ecosystem
- ✅ More DeFi options
- ✅ More developer tools

Choose based on your needs and budget!

---

## Still Have Questions?

- Check the [Troubleshooting Guide](TROUBLESHOOTING.md)
- Read the [Glossary](GLOSSARY.md) for term definitions
- Join our [Discord community](https://discord.gg/nova-launch)
- Email us: support@nova-launch.app

---

**Ready to deploy?** Head to [Nova Launch](https://nova-launch.app) and create your token!
