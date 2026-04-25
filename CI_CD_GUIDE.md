# CI/CD Guide

This guide covers the local development hooks and CI pipeline for Nova Launch.

## Pre-Commit Hooks

Pre-commit hooks run fast, targeted checks on staged files before each commit to catch issues early.

### Setup

```bash
git config core.hooksPath .githooks
```

That's it. The hook runs automatically on every `git commit`.

### What the Hook Checks

Checks are scoped to staged files only, so they stay fast.

| Check | Trigger | Fix |
|-------|---------|-----|
| Conventional commit message | Always | See format below |
| Secret detection | Any staged file | Remove secrets; use env vars |
| Rust formatting | Staged `.rs` files | `cd contracts/token-factory && cargo fmt` |
| Frontend lint | Staged `frontend/**/*.{ts,tsx,js,jsx}` | `cd frontend && npm run lint -- --fix` |
| Frontend type-check | Staged `frontend/**/*.{ts,tsx,js,jsx}` | `cd frontend && npm run type-check` |
| Backend formatting (Prettier) | Staged `backend/**/*.{ts,js,json}` | `cd backend && npm run format` |
| Backend type-check | Staged `backend/**/*.{ts,tsx,js,jsx}` | `cd backend && npm run type-check` |

### Commit Message Format

Follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Types:** `feat` | `fix` | `docs` | `style` | `refactor` | `test` | `chore` | `perf` | `ci` | `build` | `revert` | `infra`

**Examples:**
```
feat(frontend): add token burn UI
fix(contracts): handle zero-amount burn edge case
infra(git): add pre-commit hooks for code quality enforcement
docs: update deployment guide
```

### Bypassing Hooks

Only bypass when absolutely necessary (e.g., WIP commits to a personal branch):

```bash
git commit --no-verify
```

## Local CI Validation

Before pushing, run the full CI suite locally:

```bash
./scripts/ci-check.sh
```

This mirrors what runs in GitHub Actions and covers:
- Rust fmt, clippy, tests, WASM build
- Frontend lint, type-check, tests, build
- Backend migration compatibility tests
- Spec file validation
- Contract ABI completeness

## GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `backend-ci.yml` | Push / PR | Backend lint, type-check, tests |
| `comprehensive-tests.yml` | Push / PR | Full test suite |
| `security-tests.yml` | Push / PR | Security audit |
| `coverage-gates.yml` | Push / PR | Enforce >80% coverage |
| `property-tests.yml` | Push / PR | Property-based contract tests |
| `performance.yml` | Push / PR | Lighthouse + bundle budgets |
| `fuzz-testing.yml` | Schedule | Stateful contract fuzzing |
| `production-readiness-gate.yml` | Manual | Pre-release gate |

## Running Checks Manually

```bash
# Rust
cd contracts/token-factory
cargo fmt --check
cargo clippy --lib -- -D warnings
cargo test --lib

# Frontend
cd frontend
npm run lint
npm run type-check
npm test -- --run

# Backend
cd backend
npm run format:check
npm run type-check
npm test -- --run
```
