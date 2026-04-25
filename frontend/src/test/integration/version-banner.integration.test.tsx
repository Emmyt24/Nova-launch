import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntegrationVersionBanner } from '../../components/IntegrationVersionBanner';
import type { CompatibilityInfo } from '../../components/IntegrationVersionBanner';

describe('IntegrationVersionBanner', () => {
  it('renders nothing when status is ok', () => {
    const info: CompatibilityInfo = { status: 'ok', blockWrites: false };
    const { container } = render(<IntegrationVersionBanner info={info} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is loading', () => {
    const info: CompatibilityInfo = { status: 'loading', blockWrites: false };
    const { container } = render(<IntegrationVersionBanner info={info} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a warning banner for non-blocking mismatches', () => {
    const info: CompatibilityInfo = {
      status: 'warning',
      message: 'Contract ID mismatch: frontend uses "CABC…" but backend indexes "CXYZ…".',
      blockWrites: false,
    };
    render(<IntegrationVersionBanner info={info} />);
    const banner = screen.getByRole('alert');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Contract ID mismatch');
    expect(banner.className).toContain('bg-yellow-500');
  });

  it('renders a blocking red banner for dangerous mismatches', () => {
    const info: CompatibilityInfo = {
      status: 'error',
      message: 'Network mismatch: frontend is on "mainnet" but backend is on "testnet".',
      blockWrites: true,
    };
    render(<IntegrationVersionBanner info={info} />);
    const banner = screen.getByRole('alert');
    expect(banner.className).toContain('bg-red-600');
    expect(banner.textContent).toContain('Write operations are disabled');
  });

  it('shows default message when no message is provided', () => {
    const info: CompatibilityInfo = { status: 'warning', blockWrites: false };
    render(<IntegrationVersionBanner info={info} />);
    expect(screen.getByRole('alert').textContent).toContain('Version mismatch detected');
  });
});
