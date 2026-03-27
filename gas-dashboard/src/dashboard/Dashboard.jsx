import React, { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { format } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    fetchMetrics();
  }, [timeRange]);

  const fetchMetrics = async () => {
    const response = await fetch(`/api/metrics?range=${timeRange}`);
    const data = await response.json();
    setMetrics(data);
  };

  if (!metrics) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Gas Optimization Dashboard</h1>
        <div className="time-selector">
          <button onClick={() => setTimeRange('7d')} className={timeRange === '7d' ? 'active' : ''}>7 Days</button>
          <button onClick={() => setTimeRange('30d')} className={timeRange === '30d' ? 'active' : ''}>30 Days</button>
          <button onClick={() => setTimeRange('90d')} className={timeRange === '90d' ? 'active' : ''}>90 Days</button>
        </div>
      </header>

      <section className="key-metrics">
        <MetricCard title="Avg Gas/Tx" value={metrics.avgGas} change={metrics.avgGasChange} unit="instructions" />
        <MetricCard title="Total Savings" value={metrics.totalSavings} change={metrics.savingsChange} unit="%" />
        <MetricCard title="Efficiency Score" value={metrics.efficiency} change={metrics.efficiencyChange} unit="%" />
        <MetricCard title="Monthly Cost" value={metrics.monthlyCost} change={metrics.costChange} unit="XLM" />
      </section>

      <section className="charts">
        <div className="chart-container">
          <h2>Gas Cost Trend</h2>
          <Line data={metrics.trendData} options={trendOptions} />
        </div>

        <div className="chart-container">
          <h2>Function Breakdown</h2>
          <Bar data={metrics.functionData} options={barOptions} />
        </div>
      </section>

      <section className="optimizations">
        <h2>Recent Optimizations</h2>
        <OptimizationList items={metrics.optimizations} />
      </section>

      <section className="alerts">
        <h2>Active Alerts</h2>
        <AlertList items={metrics.alerts} />
      </section>
    </div>
  );
}

function MetricCard({ title, value, change, unit }) {
  const isPositive = change >= 0;
  return (
    <div className="metric-card">
      <h3>{title}</h3>
      <div className="metric-value">{value.toLocaleString()} <span className="unit">{unit}</span></div>
      <div className={`metric-change ${isPositive ? 'positive' : 'negative'}`}>
        {isPositive ? '↑' : '↓'} {Math.abs(change)}%
      </div>
    </div>
  );
}

function OptimizationList({ items }) {
  return (
    <div className="optimization-list">
      {items.map((opt, i) => (
        <div key={i} className="optimization-item">
          <div className="opt-header">
            <span className="opt-name">{opt.name}</span>
            <span className="opt-date">{format(new Date(opt.date), 'MMM dd, yyyy')}</span>
          </div>
          <div className="opt-details">
            <span className="opt-function">{opt.function}</span>
            <span className="opt-savings">-{opt.savings}%</span>
            <span className={`opt-status ${opt.status}`}>{opt.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertList({ items }) {
  if (items.length === 0) return <div className="no-alerts">No active alerts</div>;
  
  return (
    <div className="alert-list">
      {items.map((alert, i) => (
        <div key={i} className={`alert-item ${alert.severity}`}>
          <span className="alert-icon">{alert.severity === 'critical' ? '🔴' : '⚠️'}</span>
          <span className="alert-message">{alert.message}</span>
          <span className="alert-time">{format(new Date(alert.timestamp), 'HH:mm')}</span>
        </div>
      ))}
    </div>
  );
}

const trendOptions = {
  responsive: true,
  plugins: {
    legend: { position: 'top' },
    title: { display: false }
  },
  scales: {
    y: { beginAtZero: false }
  }
};

const barOptions = {
  responsive: true,
  plugins: {
    legend: { display: false },
    title: { display: false }
  }
};
