# Token Deployment Tutorial

This step-by-step guide will walk you through deploying your first token on Nova Launch.

## Before You Begin

Make sure you have:
- ✅ Freighter wallet installed and funded with at least 10 XLM
- ✅ Connected your wallet to Nova Launch
- ✅ Selected the correct network (Testnet for testing, Mainnet for production)

**Tip**: Start with Testnet to practice before deploying on Mainnet!

---

## Step 1: Connect Your Wallet

1. Click the **"Connect Wallet"** button in the top right corner
2. A popup will appear asking for permission
3. Click **"Approve"** to connect your Freighter wallet
4. Your wallet address will appear in the header once connected

**Troubleshooting**: If the wallet doesn't connect, see our [Troubleshooting Guide](TROUBLESHOOTING.md#wallet-wont-connect).

---

## Step 2: Enter Token Details

Fill out the token deployment form with your token information:

### Token Name
- **What it is**: The full name of your token (e.g., "My Awesome Token")
- **Requirements**: 3-32 characters
- **Example**: "Community Rewards Token"

### Token Symbol
- **What it is**: A short ticker symbol (e.g., "MAT")
- **Requirements**: 3-12 characters, uppercase recommended
- **Example**: "REWARD"
- **Tip**: Choose something memorable and unique

### Decimals
- **What it is**: How divisible your token is
- **Range**: 0-18
- **Common values**:
  - `0` - Whole numbers only (like tickets or NFTs)
  - `2` - Like dollars and cents
  - `7` - Stellar standard (like XLM)
  - `18` - Maximum divisibility
- **Example**: Use `7` if you're unsure

### Initial Supply
- **What it is**: How many tokens to create initially
- **Requirements**: Must be greater than 0
- **Example**: `1000000` (1 million tokens)
- **Important**: Consider your decimals! With 7 decimals, entering `1000000` creates 0.1 tokens. Enter `10000000000000` for 1 million tokens with 7 decimals.

**Formula**: Actual supply = (Your number) × 10^(decimals)

---

## Step 3: Upload Metadata (Optional)

Add a logo and description to make your token more professional.

### Token Logo
- **Supported formats**: PNG, JPG, GIF, SVG
- **Max size**: 5 MB
- **Recommended**: 512x512 pixels, square
- **Tip**: Use a transparent background PNG for best results

### Token Description
- **What it is**: A brief description of your token's purpose
- **Max length**: 500 characters
- **Example**: "Community rewards token for our platform users. Earn tokens by participating and redeem for exclusive benefits."

### Metadata Fee
- **Cost**: Additional 3 XLM
- **What you get**: Your logo and description stored on IPFS (permanent, decentralized storage)
- **Skip it?**: Yes, you can deploy without metadata and add it later

---

## Step 4: Review and Confirm

Before deploying, review all details carefully:

### Fee Breakdown
- **Base deployment fee**: 7 XLM
- **Metadata fee** (if applicable): 3 XLM
- **Total**: 7-10 XLM depending on options

### Review Checklist
- ✅ Token name is correct
- ✅ Symbol is unique and memorable
- ✅ Decimals match your use case
- ✅ Initial supply is correct (accounting for decimals!)
- ✅ Metadata looks good (if added)
- ✅ You're on the right network (Testnet vs Mainnet)

**Warning**: Token details cannot be changed after deployment! Double-check everything.

---

## Step 5: Deploy Your Token

1. Click the **"Deploy Token"** button
2. Review the transaction in the Freighter popup
3. Click **"Approve"** to sign the transaction
4. Wait for confirmation (usually 5-10 seconds)

### What's Happening?
1. Your metadata is uploaded to IPFS (if included)
2. A smart contract is deployed to Stellar
3. Your initial supply is minted to your wallet
4. The transaction is recorded on the blockchain

### Progress Indicators
- 🔄 **Uploading metadata...** (if applicable)
- 🔄 **Building transaction...**
- 🔄 **Waiting for signature...**
- 🔄 **Submitting to network...**
- ✅ **Token deployed successfully!**

---

## Step 6: Success! What's Next?

### Your Token Information
After successful deployment, you'll see:

- **Token Address**: Your token's unique contract address (save this!)
- **Transaction Hash**: Link to view on Stellar Explorer
- **Initial Supply**: Confirmed in your wallet
- **Metadata URI**: Link to your IPFS metadata (if added)

### Copy Your Token Address
Click the copy icon next to your token address. You'll need this to:
- Share your token with others
- Add liquidity on DEXs
- List on token directories
- Integrate with other platforms

### View on Stellar Explorer
Click the transaction hash to see your deployment on the blockchain:
- Transaction details
- Token contract information
- All operations performed

### Check Your Wallet
Open Freighter to see your newly minted tokens! You may need to:
1. Click "Add Asset"
2. Paste your token contract address
3. Confirm to add the token to your wallet view

---

## After Deployment

### What You Can Do
- **Transfer tokens**: Send to other Stellar addresses
- **Mint more tokens**: Use the admin mint function (requires additional fees)
- **Add metadata**: If you skipped it initially
- **Burn tokens**: Permanently remove tokens from circulation

### What You Cannot Change
- Token name
- Token symbol
- Decimals
- Contract address

### Share Your Token
Share your token address with:
- Community members
- Exchange listing teams
- Integration partners
- Token tracking sites

---

## Example Walkthrough

Let's deploy a community rewards token:

1. **Token Name**: "Community Points"
2. **Symbol**: "CPOINT"
3. **Decimals**: 7 (standard)
4. **Initial Supply**: 10000000000000 (1 million tokens with 7 decimals)
5. **Logo**: Upload a 512x512 PNG
6. **Description**: "Reward token for active community members"
7. **Review**: Total cost 10 XLM
8. **Deploy**: Approve transaction
9. **Success**: Token address received, 1M tokens in wallet

---

## Tips for Success

### Before Deploying
- Test on Testnet first
- Calculate your supply correctly with decimals
- Choose a unique, memorable symbol
- Prepare your logo in advance (512x512 PNG)
- Have extra XLM for future operations

### Common Mistakes to Avoid
- ❌ Wrong decimal calculation (off by powers of 10)
- ❌ Deploying on wrong network
- ❌ Typos in token name or symbol
- ❌ Insufficient XLM balance
- ❌ Not saving the token address

### Best Practices
- ✅ Start with Testnet
- ✅ Use 7 decimals (Stellar standard)
- ✅ Keep symbol short (3-5 characters)
- ✅ Add metadata for professionalism
- ✅ Save all deployment information
- ✅ Test transfers before distributing

---

## Need Help?

- **Wallet issues**: See [Wallet Setup Guide](WALLET_SETUP.md)
- **Errors**: Check [Troubleshooting Guide](TROUBLESHOOTING.md)
- **Questions**: Read the [FAQ](FAQ.md)
- **Terms**: Check the [Glossary](GLOSSARY.md)

---

**Ready to deploy?** Head to [Nova Launch](https://nova-launch.app) and follow these steps!
