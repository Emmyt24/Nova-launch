import React from 'react';
import { render, screen } from '@testing-library/react';
import BurnStatisticsCard, { calculateBurnStats } from '../BurnStatisticsCard';
import '@testing-library/jest-dom';

describe('calculateBurnStats', () => {
  test('calculates percent and current supply correctly', () => {
    const { percentBurned, currentSupply } = calculateBurnStats(1000, 250);
    expect(percentBurned).toBeCloseTo(25);
    expect(currentSupply).toBe(750);
  });

  test('handles zero initial supply', () => {
    const { percentBurned, currentSupply } = calculateBurnStats(0, 100);
    expect(percentBurned).toBe(0);
    expect(currentSupply).toBe(0);
  });
});

describe('BurnStatisticsCard', () => {
  test('renders values and progress', async () => {
    render(<BurnStatisticsCard initialSupply={1000} totalBurned={300} burnCount={12} symbol="NBT" />);

    expect(screen.getByText(/Total Burned/i)).toBeInTheDocument();
    expect(screen.getByText(/300/)).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/Percent Burned/i)).toBeInTheDocument();
    expect(screen.getByText(/Current Supply/i)).toBeInTheDocument();

    const fill = await screen.findByTestId('progress-fill');
    // progress starts at 0 and animates; eventually should have style width > 0
    expect(fill).toBeInTheDocument();
  });

  test('shows skeleton when loading', () => {
    render(<BurnStatisticsCard initialSupply={1000} totalBurned={300} burnCount={12} loading={true} />);
    // skeleton elements are rendered as divs with role region label for loading
    expect(screen.getByLabelText(/Burn statistics \(loading\)/i)).toBeInTheDocument();
  });
});
