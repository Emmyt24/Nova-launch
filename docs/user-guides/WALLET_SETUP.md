# Wallet Setup Guide

This guide will help you set up a Stellar wallet and connect it to Nova Launch.

## Why You Need a Wallet

A wallet is required to:
- Store your XLM for deployment fees
- Receive your newly created tokens
- Sign transactions securely
- Manage your token assets

**Important**: Nova Launch is non-custodial. We never have access to your wallet or funds.

---

## Recommended Wallet: Freighter

Freighter is the most popular Stellar wallet and works seamlessly with Nova Launch.

### Features
- ✅ Browser extension (Chrome, Firefox, Brave)
- ✅ Easy to use
- ✅ Secure key storage
- ✅ Testnet and Mainnet support
- ✅ Free and open source

---

## Installing Freighter Wallet

### Step 1: Download the Extension

1. Visit [freighter.app](https://www.freighter.app/)
2. Click **"Add to Chrome"** (or your browser)
3. Click **"Add Extension"** in the popup
4. The Freighter icon will appear in your browser toolbar

**Supported Browsers**: Chrome, Firefox, Brave, Edge

### Step 2: Pin the Extension (Optional)

1. Click the puzzle icon in your browser toolbar
2. Find "Freighter" in the list
3. Click the pin icon to keep it visible

---

## Creating a New Wallet

### Step 1: Open Freighter

Click the Freighter icon in your browser toolbar.

### Step 2: Choose "Create New Wallet"

1. Click **"Get Started"**
2. Select **"Create new wallet"**
3. Read and accept the terms of service

### Step 3: Create a Password

1. Enter a strong password (at least 10 characters)
2. Confirm your password
3. Click **"Continue"**

**Security Tip**: Use a unique password you don't use elsewhere. Consider using a password manager.

### Step 4: Save Your Recovery Phrase

**CRITICAL**: Your recovery phrase is the ONLY way to restore your wallet if you lose access.

1. Write down all 12 words in order
2. Store them in a safe place (NOT on your computer)
3. Never share your recovery phrase with anyone
4. Click **"I've written it down"**

**Warning**: Anyone with your recovery phrase can access your funds. Keep it secret and secure!

### Step 5: Verify Your Recovery Phrase

1. Enter the requested words from your recovery phrase
2. Click **"Confirm"**
3. Your wallet is now created!

### Step 6: Copy Your Wallet Address

1. Click on your account name
2. Click the copy icon next to your address
3. Your address starts with "G" and is 56 characters long

**Example**: `GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

---

## Importing an Existing Wallet

If you already have a Stellar wallet, you can import it into Freighter.

### Option 1: Import with Recovery Phrase

1. Open Freighter
2. Click **"Get Started"**
3. Select **"Import wallet"**
4. Choose **"Import with recovery phrase"**
5. Enter your 12-word recovery phrase
6. Create a new password
7. Click **"Import"**

### Option 2: Import with Secret Key

1. Open Freighter
2. Click **"Get Started"**
3. Select **"Import wallet"**
4. Choose **"Import with secret key"**
5. Enter your secret key (starts with "S")
6. Create a new password
7. Click **"Import"**

**Security Note**: Never share your secret key. It provides full access to your wallet.

---

## Funding Your Wallet with XLM

You need XLM to pay for token deployment fees.

### How Much XLM Do You Need?

- **Minimum account balance**: 1 XLM (Stellar network requirement)
- **Basic token deployment**: 7 XLM
- **With metadata**: 10 XLM
- **Recommended starting amount**: 15-20 XLM

### Where to Get XLM

#### Option 1: Buy on Exchanges
Popular exchanges that support XLM:
- Coinbase
- Kraken
- Binance
- Bitfinex
- KuCoin

**Steps**:
1. Create an account on an exchange
2. Complete identity verification (KYC)
3. Buy XLM with fiat currency or crypto
4. Withdraw to your Freighter wallet address

#### Option 2: Use On-Ramps
Direct fiat-to-crypto services:
- MoonPay
- Ramp
- Transak

**Steps**:
1. Visit the on-ramp website
2. Enter your Freighter wallet address
3. Choose amount and payment method
4. Complete the purchase

#### Option 3: Receive from Another Wallet
If you have XLM in another wallet:
1. Copy your Freighter wallet address
2. Send XLM from your other wallet
3. Wait for confirmation (usually 5 seconds)

#### Option 4: Testnet Funding (For Testing Only)
For Testnet XLM (not real money):
1. Visit [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
2. Paste your wallet address
3. Click **"Fund with Friendbot"**
4. Receive 10,000 test XLM instantly

**Note**: Testnet XLM has no real value and only works on Testnet.

---

## Connecting to Nova Launch

### Step 1: Visit Nova Launch

Go to [nova-launch.app](https://nova-launch.app)

### Step 2: Click "Connect Wallet"

Look for the **"Connect Wallet"** button in the top right corner.

### Step 3: Approve the Connection

1. A Freighter popup will appear
2. Review the permissions requested
3. Click **"Approve"** to connect

**What Nova Launch Can Do**:
- ✅ Read your wallet address
- ✅ Request transaction signatures
- ✅ Check your XLM balance

**What Nova Launch Cannot Do**:
- ❌ Access your private keys
- ❌ Move funds without your approval
- ❌ See your recovery phrase

### Step 4: Select Your Network

Choose between:
- **Testnet**: For testing (free test XLM, no real value)
- **Mainnet**: For production (real XLM, real tokens)

**Recommendation**: Start with Testnet to practice!

### Step 5: Verify Connection

Once connected, you'll see:
- Your wallet address (truncated) in the header
- Your XLM balance
- Network indicator (Testnet/Mainnet)

---

## Network Selection

### Testnet vs Mainnet

| Feature | Testnet | Mainnet |
|---------|---------|---------|
| **Purpose** | Testing | Production |
| **XLM Cost** | Free (Friendbot) | Real money |
| **Token Value** | No value | Real value |
| **Use Case** | Practice, development | Live deployments |
| **Reset** | Can be reset | Permanent |

### Switching Networks

1. Click the network indicator in the header
2. Select **"Testnet"** or **"Mainnet"**
3. Confirm the switch in Freighter
4. Your wallet address stays the same, but balances differ

**Important**: Tokens deployed on Testnet don't exist on Mainnet and vice versa.

---

## Wallet Security Best Practices

### Do's ✅
- ✅ Write down your recovery phrase on paper
- ✅ Store recovery phrase in a safe place
- ✅ Use a strong, unique password
- ✅ Lock your wallet when not in use
- ✅ Verify transaction details before signing
- ✅ Keep your browser and extensions updated
- ✅ Use a hardware wallet for large amounts

### Don'ts ❌
- ❌ Share your recovery phrase with anyone
- ❌ Store recovery phrase digitally (screenshots, cloud, email)
- ❌ Use the same password as other accounts
- ❌ Approve transactions you don't understand
- ❌ Install wallet extensions from unofficial sources
- ❌ Leave your wallet unlocked on shared computers

### Warning Signs of Scams
- 🚨 Someone asks for your recovery phrase
- 🚨 Unexpected transaction approval requests
- 🚨 Emails asking you to "verify" your wallet
- 🚨 Promises of free XLM or tokens
- 🚨 Fake wallet extensions

**Remember**: Nova Launch will NEVER ask for your recovery phrase or secret key!

---

## Troubleshooting

### Freighter Won't Install
- Try a different browser
- Disable other wallet extensions temporarily
- Clear browser cache and try again
- Download from official site only

### Can't See My Balance
- Make sure you're on the correct network
- Wait a few seconds for sync
- Refresh the page
- Check Stellar Explorer to verify balance

### Connection Failed
- Make sure Freighter is unlocked
- Refresh the Nova Launch page
- Try disconnecting and reconnecting
- Check if Freighter needs an update

### Lost Access to Wallet
- Use your recovery phrase to restore
- Import into Freighter on a new device
- If you lost your recovery phrase, funds cannot be recovered

For more help, see our [Troubleshooting Guide](TROUBLESHOOTING.md).

---

## Other Supported Wallets (Coming Soon)

Nova Launch will soon support:
- **Albedo**: Web-based wallet
- **xBull**: Mobile and desktop wallet
- **Ledger**: Hardware wallet support

---

## Next Steps

Now that your wallet is set up:
1. Fund it with XLM
2. Connect to Nova Launch
3. Follow the [Token Deployment Tutorial](TOKEN_DEPLOYMENT.md)
4. Deploy your first token!

---

**Need help?** Check the [FAQ](FAQ.md) or [Troubleshooting Guide](TROUBLESHOOTING.md).
