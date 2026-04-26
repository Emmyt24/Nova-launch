# Automated Contract Deployment Orchestrator

The Nova Launch deployment orchestrator provides secure, scriptable deployment of Soroban smart contracts with comprehensive verification and error handling.

## Features

- **🔒 Secure**: Environment variable-based configuration, no hardcoded credentials
- **🔍 Verification**: Automatic WASM hash verification and contract state validation
- **📝 Logging**: Comprehensive deployment logs and error reporting
- **🔄 Error Handling**: Graceful failure handling with detailed error information
- **📊 Testing**: >90% test coverage with mocked network responses
- **🔧 Integration**: Seamlessly integrates with existing bash deployment scripts

## Quick Start

### Installation

```bash
cd scripts/deployment
npm install
```

### Basic Usage

```bash
# Deploy to testnet (default)
npm run deploy

# Deploy to mainnet
npm run deploy -- --network mainnet

# Verify deployment
npm run verify
```

## Configuration

### Environment Variables

Create `.env` file in `scripts/deployment/`:

```env
# Network Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Key Management
ADMIN_KEY_NAME=admin
TREASURY_KEY_NAME=treasury

# Fee Configuration (in stroops, 1 XLM = 10,000,000 stroops)
BASE_FEE=70000000
METADATA_FEE=30000000

# Paths
WASM_PATH=../../contracts/token-factory/target/wasm32-unknown-unknown/release/token_factory.wasm
ENV_FILE=../../.env.testnet
```

### Command Line Options

#### Deploy Command

```bash
npm run deploy -- [options]

Options:
  --network <testnet|mainnet>  Target network (default: testnet)
  --admin-key <name>           Admin key name (default: admin)
  --treasury-key <name>        Treasury key name (default: treasury)
  --base-fee <amount>          Base fee in stroops (default: 70000000)
  --metadata-fee <amount>      Metadata fee in stroops (default: 30000000)
  --wasm-path <path>           Path to WASM file
  --env-file <path>            Environment file path
  --help, -h                   Show help message
```

#### Verify Command

```bash
npm run verify -- [options]

Options:
  --contract-id <id>           Contract ID to verify (auto-detected if not provided)
  --network <testnet|mainnet>  Target network (default: testnet)
  --help, -h                   Show help message
```

## Advanced Usage

### Custom Fee Configuration

```bash
npm run deploy -- \
  --network testnet \
  --base-fee 50000000 \
  --metadata-fee 20000000
```

### Custom Key Names

```bash
npm run deploy -- \
  --admin-key my-admin \
  --treasury-key my-treasury
```

### Mainnet Deployment

```bash
npm run deploy -- --network mainnet
```

### Verify Specific Contract

```bash
npm run verify -- \
  --contract-id CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
  --network testnet
```

## Deployment Process

The orchestrator follows these steps:

1. **Environment Validation**
   - Verify Soroban CLI is installed
   - Check WASM file exists
   - Validate admin identity exists
   - Create treasury identity if needed

2. **WASM Hash Calculation**
   - Calculate SHA-256 hash of WASM file for verification

3. **Contract Deployment**
   - Deploy WASM to Stellar network
   - Capture contract ID

4. **Contract Initialization**
   - Initialize contract with admin, treasury, and fee configuration
   - Capture transaction hash

5. **Verification**
   - Verify contract state is valid
   - Compare deployed WASM hash with source
   - Validate all initialization parameters

6. **File Updates**
   - Save deployment info to `deployments.json`
   - Update environment files
   - Maintain backward compatibility with legacy files

## Error Handling

The orchestrator handles common deployment errors:

### Network Issues
- **Timeout**: Automatic retry with exponential backoff
- **Connection Failed**: Clear error message with troubleshooting steps
- **Rate Limiting**: Intelligent retry with proper delays

### Stellar-Specific Errors
- **Insufficient Funds**: Clear balance requirements and funding instructions
- **Sequence Mismatch**: Automatic sequence number recovery
- **Gas Limit Exceeded**: Optimization suggestions and retry options

### Configuration Errors
- **Missing Keys**: Step-by-step key generation instructions
- **Invalid Parameters**: Validation with suggested corrections
- **File Permissions**: Clear permission requirements and fixes

### Example Error Output

```
❌ Deployment failed: Insufficient funds

Details:
  - Account: GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  - Required: 100 XLM
  - Available: 50 XLM
  
Solutions:
  1. Fund your account at https://laboratory.stellar.org/#account-creator?network=test
  2. Request testnet XLM from the friendbot
  3. Check your account balance with: soroban keys address admin
```

## Verification

The verification process includes:

### WASM Hash Verification
- Calculates SHA-256 hash of local WASM file
- Compares with deployed contract bytecode
- Ensures deployed contract matches source code

### Contract State Validation
- Verifies contract is properly initialized
- Checks admin and treasury addresses
- Validates fee configuration

### Network Consistency
- Confirms contract exists on specified network
- Validates contract ID format
- Checks contract accessibility

## Integration

### With Existing Scripts

The orchestrator integrates seamlessly with existing bash scripts:

```bash
# Use orchestrator for deployment
cd scripts/deployment
npm run deploy

# Use existing verification
cd ../..
./scripts/verify-deployment.sh
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy Contract
  run: |
    cd scripts/deployment
    npm install
    npm run deploy -- --network testnet
    npm run verify
```

### Docker Integration

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY scripts/deployment ./scripts/deployment
RUN cd scripts/deployment && npm install

CMD ["npm", "run", "deploy"]
```

## Testing

### Running Tests

```bash
cd scripts/deployment

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm test -- --watch
```

### Test Coverage

The test suite achieves >90% coverage and includes:

- **Unit Tests**: Individual function testing with mocked dependencies
- **Integration Tests**: End-to-end deployment simulation
- **Error Scenarios**: Network failures, permission errors, invalid configurations
- **Edge Cases**: Timeout handling, sequence mismatches, gas limit exceeded

### Mock Network Responses

Tests use comprehensive mocks for:
- Soroban CLI commands
- File system operations
- Network requests
- Stellar SDK interactions

## Troubleshooting

### Common Issues

#### "Soroban CLI not found"
```bash
# Install Soroban CLI
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --locked soroban-cli
```

#### "Admin identity not found"
```bash
# Generate admin identity
soroban keys generate --global admin
```

#### "WASM file not found"
```bash
# Build contract
cd contracts/token-factory
cargo build --target wasm32-unknown-unknown --release
```

#### "Permission denied"
```bash
# Fix file permissions
chmod +x scripts/deployment/deploy.ts
chmod +x scripts/deployment/verify.ts
```

### Debug Mode

Enable verbose logging:

```bash
DEBUG=1 npm run deploy
```

### Log Files

Deployment logs are saved to:
- `deployment.log` - Full deployment log
- `error.log` - Error details and stack traces
- `verification.log` - Verification results

## Security Considerations

### Key Management
- Never commit private keys to version control
- Use environment variables for sensitive configuration
- Rotate keys regularly for production deployments

### Network Security
- Use HTTPS endpoints for all network requests
- Validate all contract addresses and transaction hashes
- Implement proper error handling to prevent information leakage

### Access Control
- Limit deployment permissions to authorized users
- Use separate keys for different environments
- Implement proper audit logging

## API Reference

### DeploymentOrchestrator Class

```typescript
class DeploymentOrchestrator {
  constructor(config: DeploymentConfig)
  
  async deploy(): Promise<DeploymentResult>
  async verify(contractId: string): Promise<VerificationResult>
}
```

### Types

```typescript
interface DeploymentConfig {
  network: 'testnet' | 'mainnet';
  horizonUrl: string;
  sorobanRpcUrl: string;
  adminKeyName: string;
  treasuryKeyName: string;
  baseFee: number;
  metadataFee: number;
  wasmPath: string;
  envFile: string;
}

interface DeploymentResult {
  contractId: string;
  admin: string;
  treasury: string;
  network: string;
  deployedAt: string;
  transactionHash: string;
  wasmHash: string;
}

interface VerificationResult {
  contractId: string;
  isValid: boolean;
  wasmHashMatch: boolean;
  stateValid: boolean;
  errors: string[];
}
```

## Contributing

### Development Setup

```bash
cd scripts/deployment
npm install
npm run test
```

### Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Maintain >90% test coverage

### Pull Request Process

1. Create feature branch
2. Add tests for new functionality
3. Update documentation
4. Ensure all tests pass
5. Submit pull request

## License

This deployment orchestrator is part of the Nova Launch project and is licensed under the MIT License.