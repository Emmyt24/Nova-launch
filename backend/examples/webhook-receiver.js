/**
 * Example webhook receiver for Nova Launch burn events
 * 
 * This is a simple Express server that receives and verifies
 * webhook notifications from the Nova Launch backend.
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Your webhook secret (from subscription response)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-secret-here';

/**
 * Verify webhook signature with replay protection (v1)
 * 
 * Signature format: v1.<timestamp>.<signature>
 * Signed content: <timestamp>.<raw_body_string>
 */
function verifyWebhookSignature(payload, header, secret, toleranceSeconds = 300) {
  if (!header || !header.startsWith('v1.')) {
    return false;
  }

  const parts = header.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const timestamp = parseInt(parts[1], 10);
  const signature = parts[2];

  if (isNaN(timestamp)) {
    return false;
  }

  // 1. Prevent replay attacks by checking if the timestamp is too old
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    console.error(`Replay attack detected or clock drift: diff=${Math.abs(now - timestamp)}s`);
    return false;
  }

  // 2. Generate expected signature
  const message = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  // 3. Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Main webhook endpoint
 */
app.post('/webhook', (req, res) => {
  try {
    const signatureHeader = req.headers['x-webhook-signature'];
    const eventType = req.headers['x-webhook-event'];
    
    if (!signatureHeader) {
      return res.status(401).json({ error: 'Missing signature header' });
    }
    
    // Verify signature
    // Note: Use raw body for verification if your parser modifies req.body
    const payload = JSON.stringify(req.body);
    if (!verifyWebhookSignature(payload, signatureHeader, WEBHOOK_SECRET)) {
      console.error('Invalid signature or replay detected');
      return res.status(401).json({ error: 'Authentication failed' });
    }
    
    // Process event
    const { event, timestamp, data } = req.body;
    
    console.log(`\n📨 Received webhook: ${event}`);
    console.log(`⏰ Timestamp: ${timestamp}`);
    console.log(`📊 Data:`, JSON.stringify(data, null, 2));
    
    // Handle different event types
    switch (event) {
      case 'token.burn.self':
        handleBurnSelf(data);
        break;
      
      case 'token.burn.admin':
        handleBurnAdmin(data);
        break;
      
      case 'token.created':
        handleTokenCreated(data);
        break;
      
      case 'token.metadata.updated':
        handleMetadataUpdated(data);
        break;
      
      default:
        console.log(`Unknown event type: ${event}`);
    }
    
    // Respond quickly (within 5 seconds)
    res.json({ 
      received: true,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Handle token.burn.self event
 */
function handleBurnSelf(data) {
  console.log(`🔥 Self-burn detected:`);
  console.log(`   Token: ${data.tokenAddress}`);
  console.log(`   From: ${data.from}`);
  console.log(`   Amount: ${data.amount}`);
  console.log(`   TX: ${data.transactionHash}`);
  
  // Your custom logic here
  // - Send notification to user
  // - Update analytics
  // - Trigger other actions
}

/**
 * Handle token.burn.admin event
 */
function handleBurnAdmin(data) {
  console.log(`🔥 Admin burn detected:`);
  console.log(`   Token: ${data.tokenAddress}`);
  console.log(`   From: ${data.from}`);
  console.log(`   Amount: ${data.amount}`);
  console.log(`   Burner: ${data.burner}`);
  console.log(`   TX: ${data.transactionHash}`);
  
  // Your custom logic here
}

/**
 * Handle token.created event
 */
function handleTokenCreated(data) {
  console.log(`🎉 New token created:`);
  console.log(`   Token: ${data.tokenAddress}`);
  console.log(`   Name: ${data.name}`);
  console.log(`   Symbol: ${data.symbol}`);
  console.log(`   Creator: ${data.creator}`);
  console.log(`   Initial Supply: ${data.initialSupply}`);
  console.log(`   TX: ${data.transactionHash}`);
  
  // Your custom logic here
  // - Add to token registry
  // - Send welcome email
  // - Update dashboard
}

/**
 * Handle token.metadata.updated event
 */
function handleMetadataUpdated(data) {
  console.log(`📝 Metadata updated:`);
  console.log(`   Token: ${data.tokenAddress}`);
  console.log(`   Metadata URI: ${data.metadataUri}`);
  console.log(`   Updated By: ${data.updatedBy}`);
  console.log(`   TX: ${data.transactionHash}`);
  
  // Your custom logic here
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook receiver running on port ${PORT}`);
  console.log(`📡 Endpoint: http://localhost:${PORT}/webhook`);
  console.log(`🔐 Secret configured: ${WEBHOOK_SECRET ? 'Yes' : 'No'}`);
});
