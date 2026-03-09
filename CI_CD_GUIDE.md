# CI/CD Guide

This document explains the CI/CD setup for the Nova-launch project.

## Overview

The project uses GitHub Actions for continuous integration and deployment. All checks must pass before code can be merged.

## CI Pipeline

The CI pipeline runs on every push and pull request to `main` and `develop` branches.

### Jobs

1. **Rust Contract Tests** (`rust-tests`)
   - Checks code formatting with `cargo fmt`
   - Runs linter with `cargo clippy` (warnings treated as errors)
   - Executes all unit and property-based tests
   - Builds the contract for wasm32 target

2. **Frontend Tests** (`frontend-tests`)
   - Installs dependencies
   - Runs ESLint
   - Executes all tests (unit, integration, property-based)
   - Builds the production bundle

3. **Security Audit** (`security-audit`)
   - Runs `cargo audit` to check for known vulnerabilities in dependencies

4. **Spec Validation** (`spec-validation`)
   - Validates that all spec directories contain required files:
     - `requirements.md`
     - `design.md`
     - `tasks.md`

5. **All Checks** (`all-checks`)
   - Final job that depends on all others
   - Only passes if all previous jobs succeed

## Running Checks Locally

Before pushing code, run the local CI validation script:

```bash
./scripts/ci-check.sh
```

This script runs all the same checks that CI will run, helping you catch issues early.

### Manual Checks

You can also run individual checks:

#### Rust Checks

```bash
cd contracts/token-factory

# Format check
cargo fmt --check

# Linting
cargo clippy --lib -- -D warnings

# Tests
cargo test --lib

# Build for wasm
cargo build --release --target wasm32-unknown-unknown
```

#### Frontend Checks

```bash
cd frontend

# Install dependencies
npm ci

# Linting
npm run lint

# Tests
npm test -- --run

# Build
npm run build
```

## Fixing Common Issues

### Rust Formatting Issues

If `cargo fmt --check` fails:

```bash
cd contracts/token-factory
cargo fmt
```

### Rust Clippy Warnings

If `cargo clippy` reports warnings:

1. Review the warnings carefully
2. Fix the issues in your code
3. For unused variables, prefix with `_` (e.g., `_unused_var`)
4. For unused imports, remove them

### Frontend Linting Issues

If ESLint fails:

```bash
cd frontend
npm run lint -- --fix
```

### Test Failures

If tests fail:

1. Run tests locally to see the full output
2. Fix the failing tests
3. Ensure all property-based tests pass
4. Check that test coverage hasn't decreased

## Caching

The CI pipeline uses caching to speed up builds:

- Cargo registry and build artifacts
- npm dependencies

Caches are invalidated when `Cargo.lock` or `package-lock.json` change.

## Branch Protection

The `main` branch should be protected with the following rules:

- Require status checks to pass before merging
- Require all CI jobs to pass
- Require pull request reviews
- Require branches to be up to date before merging

## Deployment

Currently, deployment is manual. After CI passes:

1. **Smart Contracts**: Deploy to Stellar testnet/mainnet using Soroban CLI
2. **Frontend**: Deploy to hosting platform (Vercel, Netlify, etc.)

## Troubleshooting

### CI Passes Locally But Fails on GitHub

- Ensure you've committed all changes
- Check that dependencies are locked (`Cargo.lock`, `package-lock.json`)
- Verify environment-specific issues (paths, OS differences)

### Slow CI Builds

- Check cache hit rates
- Consider splitting jobs further
- Review test execution time

### Security Audit Failures

If `cargo audit` reports vulnerabilities:

1. Review the vulnerability details
2. Update affected dependencies
3. If no fix is available, consider alternatives or accept the risk with documentation

## Adding New Checks

To add new CI checks:

1. Edit `.github/workflows/ci.yml`
2. Add your check as a new step or job
3. Update `scripts/ci-check.sh` to include the same check
4. Test locally before pushing

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cargo Documentation](https://doc.rust-lang.org/cargo/)
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Vitest Documentation](https://vitest.dev/)
