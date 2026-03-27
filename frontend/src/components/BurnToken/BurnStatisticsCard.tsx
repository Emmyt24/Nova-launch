import React, { useEffect, useState } from 'react';
import styles from './BurnStatisticsCard.module.css';

type Props = {
  initialSupply: number;
  totalBurned: number;
  burnCount: number;
  symbol?: string;
  loading?: boolean;
  className?: string;
};

export function calculateBurnStats(initialSupply: number, totalBurned: number) {
  const safeInitial = Number(initialSupply) || 0;
  const safeBurned = Math.max(0, Number(totalBurned) || 0);
  const percentBurned = safeInitial > 0 ? Math.min(100, (safeBurned / safeInitial) * 100) : 0;
  const currentSupply = Math.max(0, safeInitial - safeBurned);
  return { percentBurned, currentSupply };
}

function formatNumber(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

const IconFire = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M12 2s4 4 4 8-2 6-4 8c0 0-1-1-1-3s-3 2-3 2 2-3 2-6-3-5-2-8c0 0 1 1 2 1s1-3 2-2z" fill="#FF8A3D" />
  </svg>
);

const IconHash = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M4 9h16M4 15h16M10 3v18M14 3v18" stroke="#6B8CFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPercent = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M19 5L5 19M7 7h.01M17 17h.01" stroke="#9B6CFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconTrendingDown = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M3 6l6 6 4-4 8 8" stroke="#94A3B8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function BurnStatisticsCard({ initialSupply, totalBurned, burnCount, symbol = 'TKN', loading = false, className = '' }: Props) {
  const { percentBurned, currentSupply } = calculateBurnStats(initialSupply, totalBurned);
  const [fill, setFill] = useState(0);

  useEffect(() => {
    // animate progress fill
    const id = setTimeout(() => setFill(Math.round(percentBurned * 100) / 100), 60);
    return () => clearTimeout(id);
  }, [percentBurned]);

  if (loading) {
    return (
      <div className={`${styles.card} ${className}`} role="region" aria-label="Burn statistics (loading)">
        <div className={styles.grid}>
          <div className={`${styles.stat} ${styles.skeleton}`} style={{ height: 60 }} />
          <div className={`${styles.stat} ${styles.skeleton}`} style={{ height: 60 }} />
          <div className={`${styles.stat} ${styles.skeleton}`} style={{ height: 60 }} />
          <div className={`${styles.stat} ${styles.skeleton}`} style={{ height: 60 }} />
        </div>
        <div className={styles.progressWrap} style={{ marginTop: 12 }}>
          <div className={styles.progressBar} style={{ height: 10 }}>
            <div className={styles.progressFill} style={{ width: '0%' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${className}`} role="region" aria-label="Burn statistics">
      <div className={styles.grid}>
        <div className={styles.stat} title="Total burned">
          <div className={styles.iconWrap} aria-hidden>
            <IconFire />
          </div>
          <div className={styles.statContent}>
            <div className={styles.label}>Total Burned</div>
            <div className={styles.value}>{formatNumber(totalBurned)} <span className={styles.suffix}>{symbol}</span></div>
          </div>
        </div>

        <div className={styles.stat} title="Burn count">
          <div className={styles.iconWrap} aria-hidden>
            <IconHash />
          </div>
          <div className={styles.statContent}>
            <div className={styles.label}>Burn Count</div>
            <div className={styles.value}>{formatNumber(burnCount)}</div>
          </div>
        </div>

        <div className={styles.stat} title="Percent burned">
          <div className={styles.iconWrap} aria-hidden>
            <IconPercent />
          </div>
          <div className={styles.statContent}>
            <div className={styles.label}>Percent Burned</div>
            <div className={styles.value}>{formatNumber(percentBurned)}<span className={styles.suffix}>%</span></div>
          </div>
        </div>

        <div className={styles.stat} title="Current supply">
          <div className={styles.iconWrap} aria-hidden>
            <IconTrendingDown />
          </div>
          <div className={styles.statContent}>
            <div className={styles.label}>Current Supply</div>
            <div className={`${styles.value} ${styles.muted}`}>{formatNumber(currentSupply)} <span className={styles.suffix}>{symbol}</span></div>
          </div>
        </div>
      </div>

      <div className={styles.progressWrap}>
        <div className={styles.progressBar} aria-hidden>
          <div data-testid="progress-fill" className={styles.progressFill} style={{ width: `${fill}%` }} />
        </div>
      </div>
    </div>
  );
}
