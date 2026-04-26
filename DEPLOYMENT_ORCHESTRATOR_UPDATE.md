# Deployment Orchestrator Update

## Added to Nova Launch

A new TypeScript deployment orchestrator has been added to the project at `scripts/deployment/`. This provides:

- Secure, scriptable deployment with environment variable configuration
- Comprehensive WASM hash verification
- Robust error handling and rollback capabilities
- >90% test coverage with mocked network responses
- Seamless integration with existing bash scripts

## Usage

```bash
cd scripts/deployment
npm install
npm run deploy
npm run verify
```

## Documentation

See `scripts/deployment/README.md` for complete documentation.

## Integration

The orchestrator integrates with existing deployment workflows and can be used alongside or instead of the bash scripts in the `scripts/` directory.