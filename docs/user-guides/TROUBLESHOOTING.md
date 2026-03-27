# Troubleshooting Guide

This guide helps you resolve common issues when using Nova Launch.

## Quick Diagnostics

Before diving into specific issues, check these basics:

- ✅ Freighter wallet is installed and unlocked
- ✅ You're connected to the correct network (Testnet/Mainnet)
- ✅ You have sufficient XLM balance
- ✅ Your internet connection is stable
- ✅ You're using a supported browser (Chrome, Firefox, Brave)

---

## Wallet Connection Issues

### Wallet Won't Connect

**Symptoms**: "Connect Wallet" button doesn't work, no popup appears, or connection fails.

**Solutions**:

1. **Check if Freighter is installed**
   - Look for the Freighter icon in your browser toolbar
   - Visit [freighter.app](https://www.freighter.app/) to install if missing

2. **Unlock your wallet**
   - Click the Freighter icon
   - Enter your password
   - Try connecting again

3. **Refresh the page**
   - Press `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac)
   - Click "Connect Wallet" again

4. **Clear browser cache**
   - Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (Mac)
   - Select "Cached images and files"
   - Clear and restart browser

5. **Disable other wallet extensions**
   - Other crypto wallets may conflict
   - Temporarily disable them in browser settings
   - Try connecting again

6. **Try a different browser**
   - Download Chrome, Firefox, or Brave
   - Install Freighter
   - Import your wallet and try again

7. **Update Freighter**
   - Check for extension updates in your browser
   - Update to the latest version

**Still not working?** Contact support with:
- Browser name and version
- Freighter version
- Error messages (if any)
- Screenshot of the issue

---

### Wallet Disconnects Automatically

**Symptoms**: Wallet connection drops during use.

**Solutions**:

1. **Keep Freighter unlocked**
   - Freighter auto-locks after inactivity
   - Unlock and reconnect

2. **Check browser settings**
   - Ensure extensions aren't being disabled
   - Check if browser is clearing data on close

3. **Disable aggressive privacy extensions**
   - Some privacy tools block wallet connections
   - Whitelist Nova Launch

---

### Wrong Network Selected

**Symptoms**: Can't see your balance, tokens, or transactions.

**Solutions**:

1. **Check current network**
   - Look at the network indicator in Nova Launch header
   - Should show "Testnet" or "Mainnet"

2. **Switch networks**
   - Click the network indicator
   - Select the correct network
   - Confirm in Freighter popup

3. **Verify in Freighter**
   - Open Freighter
   - Check network setting matches Nova Launch

**Remember**: Testnet and Mainnet are separate. Tokens on one don't exist on the other!

---

## Transaction Issues

### Transaction Failed

**Symptoms**: "Transaction failed" error after signing.

**Common Causes & Solutions**:

#### 1. Insufficient Balance

**Error**: "Insufficient balance" or "Not enough XLM"

**Solution**:
- Check your XLM balance in Freighter
- You need: deployment fee + 1 XLM minimum balance + network fees
- For basic deployment: at least 8-9 XLM
- For deployment with metadata: at least 11-12 XLM
- Fund your wallet and try again

#### 2. Invalid Token Parameters

**Error**: "Invalid parameters" or "Validation failed"

**Solution**:
- Check token name (3-32 characters)
- Check symbol (3-12 characters)
- Check decimals (0-18)
- Check initial supply (must be > 0)
- Review all fields for typos

#### 3. Network Congestion

**Error**: "Transaction timeout" or "Network error"

**Solution**:
- Wait 30 seconds and try again
- Check [Stellar Status](https://status.stellar.org/)
- Try during off-peak hours

#### 4. Transaction Rejected in Wallet

**Error**: "User rejected transaction"

**Solution**:
- You clicked "Reject" in Freighter
- Click "Deploy Token" again
- Click "Approve" in Freighter popup

#### 5. Duplicate Transaction

**Error**: "Transaction already exists"

**Solution**:
- Your previous transaction may have succeeded
- Check transaction history
- Refresh the page
- Don't submit the same transaction twice

---

### Transaction Stuck/Pending

**Symptoms**: Transaction shows "pending" for a long time.

**Solutions**:

1. **Wait a bit longer**
   - Stellar usually confirms in 5-10 seconds
   - During high load, may take up to 1 minute

2. **Check Stellar Explorer**
   - Copy your transaction hash
   - Visit [Stellar Expert](https://stellar.expert/)
   - Search for your transaction
   - Check status

3. **Refresh the page**
   - If confirmed on blockchain but UI shows pending
   - Refresh to update status

4. **Check network status**
   - Visit [Stellar Status](https://status.stellar.org/)
   - Look for ongoing issues

---

### Can't Sign Transaction

**Symptoms**: Freighter popup doesn't appear or won't sign.

**Solutions**:

1. **Check for popup blockers**
   - Disable popup blockers for Nova Launch
   - Look for blocked popup icon in address bar

2. **Unlock Freighter**
   - Wallet may have auto-locked
   - Unlock and try again

3. **Restart browser**
   - Close all browser windows
   - Reopen and try again

---

## Metadata Upload Issues

### Metadata Upload Failed

**Symptoms**: "Failed to upload metadata" or "IPFS error"

**Solutions**:

#### 1. Image Too Large

**Error**: "File too large"

**Solution**:
- Maximum size: 5 MB
- Compress your image using:
  - [TinyPNG](https://tinypng.com/)
  - [Squoosh](https://squoosh.app/)
  - Image editing software
- Try uploading again

#### 2. Unsupported Format

**Error**: "Invalid file type"

**Solution**:
- Supported formats: PNG, JPG, GIF, SVG
- Convert your image if needed
- Ensure file extension is correct

#### 3. Network Issues

**Error**: "Upload timeout" or "Network error"

**Solution**:
- Check your internet connection
- Try again with a stable connection
- Use a wired connection if possible

#### 4. IPFS Service Down

**Error**: "IPFS unavailable"

**Solution**:
- Check [Pinata Status](https://status.pinata.cloud/)
- Wait and try again later
- Or deploy without metadata and add it later

---

### Metadata Not Showing

**Symptoms**: Token deployed but logo/description not visible.

**Solutions**:

1. **Wait for IPFS propagation**
   - IPFS can take 1-2 minutes to propagate
   - Refresh after a few minutes

2. **Check metadata URI**
   - Copy your metadata URI from deployment details
   - Visit it directly in browser
   - Should show your metadata JSON

3. **Clear cache**
   - Browser may be caching old data
   - Hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`

---

## Balance and Display Issues

### Can't See My Tokens

**Symptoms**: Tokens deployed but not visible in wallet.

**Solutions**:

1. **Add token to Freighter**
   - Open Freighter
   - Click "Manage Assets"
   - Click "Add Asset"
   - Select "Add manually"
   - Paste your token contract address
   - Click "Add"

2. **Check correct network**
   - Ensure Freighter is on the same network as deployment
   - Testnet tokens won't show on Mainnet

3. **Verify on blockchain**
   - Visit [Stellar Expert](https://stellar.expert/)
   - Search for your wallet address
   - Check if tokens are there

---

### Balance Shows Zero

**Symptoms**: Token added but balance shows 0.

**Solutions**:

1. **Wait for sync**
   - Freighter may need a moment to sync
   - Wait 30 seconds and refresh

2. **Check transaction status**
   - Verify deployment transaction succeeded
   - Check transaction hash on Stellar Explorer

3. **Verify initial supply**
   - Check if you entered initial supply correctly
   - Remember to account for decimals!

---

### Wrong Token Balance

**Symptoms**: Balance doesn't match expected amount.

**Solutions**:

1. **Check decimals**
   - Balance display depends on decimals
   - With 7 decimals: 10000000 = 1 token
   - Use our calculator to verify

2. **Check all transactions**
   - Review transaction history
   - Look for transfers or burns

---

## Browser and Compatibility Issues

### Page Won't Load

**Symptoms**: Nova Launch doesn't load or shows errors.

**Solutions**:

1. **Check internet connection**
   - Verify you're online
   - Try loading other websites

2. **Clear browser cache**
   - `Ctrl+Shift+Delete` or `Cmd+Shift+Delete`
   - Clear cached files
   - Restart browser

3. **Disable browser extensions**
   - Ad blockers may interfere
   - Privacy extensions may block features
   - Disable temporarily and test

4. **Try incognito/private mode**
   - Opens without extensions
   - Tests if extensions are causing issues

5. **Update your browser**
   - Use the latest version
   - Chrome, Firefox, or Brave recommended

---

### Features Not Working

**Symptoms**: Buttons don't work, forms don't submit, etc.

**Solutions**:

1. **Enable JavaScript**
   - Nova Launch requires JavaScript
   - Check browser settings
   - Ensure JavaScript is enabled

2. **Disable strict privacy settings**
   - Some privacy settings break functionality
   - Whitelist Nova Launch

3. **Check console for errors**
   - Press `F12` to open developer tools
   - Look at Console tab
   - Share errors with support

---

### Mobile Issues

**Symptoms**: Problems on mobile devices.

**Solutions**:

1. **Use mobile browser**
   - Chrome or Firefox on mobile
   - Safari may have limited support

2. **Install Freighter mobile**
   - Available for mobile browsers
   - Follow mobile wallet setup

3. **Use desktop for best experience**
   - Mobile support is improving
   - Desktop recommended for now

---

## Error Messages

### "Insufficient Fee"

**Meaning**: Fee payment is below minimum required.

**Solution**:
- Ensure you're paying at least 7 XLM for basic deployment
- Add 3 XLM if including metadata
- Check your balance

---

### "Unauthorized"

**Meaning**: You're not authorized for this action.

**Solution**:
- Only token admin can mint or burn
- Ensure you're using the correct wallet
- Check if you're the token creator

---

### "Invalid Parameters"

**Meaning**: Token parameters don't meet requirements.

**Solution**:
- Name: 3-32 characters
- Symbol: 3-12 characters
- Decimals: 0-18
- Initial supply: > 0
- Check for special characters

---

### "Token Not Found"

**Meaning**: Token doesn't exist in registry.

**Solution**:
- Verify token address is correct
- Check if deployment succeeded
- Ensure you're on correct network

---

### "Already Initialized"

**Meaning**: Contract already initialized (admin only).

**Solution**:
- This is an admin function
- Contract can only be initialized once
- Not a user-facing issue

---

## Network-Specific Issues

### Testnet Issues

**Problem**: Can't get test XLM from Friendbot.

**Solution**:
1. Visit [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
2. Paste your wallet address
3. Click "Get test network lumens"
4. Wait a few seconds
5. Check balance in Freighter

**Problem**: Testnet is slow or unresponsive.

**Solution**:
- Testnet can be unstable
- Wait and try again
- Check [Stellar Status](https://status.stellar.org/)

---

### Mainnet Issues

**Problem**: Real XLM not showing up.

**Solution**:
1. Check transaction on exchange/sender
2. Verify you sent to correct address
3. Ensure minimum 1 XLM for account activation
4. Wait for confirmations (usually instant)

---

## Getting Additional Help

### Before Contacting Support

Gather this information:
- Wallet address (public, safe to share)
- Transaction hash (if available)
- Network (Testnet or Mainnet)
- Browser and version
- Freighter version
- Screenshots of errors
- Steps to reproduce the issue

### Contact Channels

1. **Documentation** (you're here!)
   - Check [FAQ](FAQ.md)
   - Review [Getting Started](GETTING_STARTED.md)
   - Read [Glossary](GLOSSARY.md)

2. **Discord Community**
   - Join: [discord.gg/nova-launch](https://discord.gg/nova-launch)
   - Ask in #support channel
   - Community members can help

3. **Email Support**
   - Email: support@nova-launch.app
   - Include all diagnostic info
   - Response within 24-48 hours

4. **GitHub Issues**
   - For bugs: [github.com/Emmyt24/Nova-launch/issues](https://github.com/Emmyt24/Nova-launch/issues)
   - Include reproduction steps
   - Check existing issues first

---

## Prevention Tips

### Before Deploying

- ✅ Test on Testnet first
- ✅ Double-check all parameters
- ✅ Ensure sufficient balance (12+ XLM recommended)
- ✅ Prepare metadata in advance
- ✅ Use supported image formats
- ✅ Save your token details

### During Deployment

- ✅ Review transaction details carefully
- ✅ Don't refresh during deployment
- ✅ Wait for confirmation
- ✅ Save transaction hash
- ✅ Copy token address immediately

### After Deployment

- ✅ Verify on Stellar Explorer
- ✅ Add token to wallet
- ✅ Test a small transfer
- ✅ Save all deployment info
- ✅ Back up important details

---

## Still Having Issues?

If this guide didn't solve your problem:

1. Search our [FAQ](FAQ.md)
2. Ask in [Discord](https://discord.gg/nova-launch)
3. Email support@nova-launch.app
4. Report bugs on [GitHub](https://github.com/Emmyt24/Nova-launch/issues)

We're here to help! 🚀
