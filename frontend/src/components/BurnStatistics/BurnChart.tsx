import React, { useState } from 'react';
import { Card } from '../UI/Card';
import { aggregateBurnData } from './utils';
import type { BurnRecord } from '../../types';

type ChartType = 'bar' | 'line' | 'area';
type Interval = 'day' | 'week' | 'month';

interface BurnChartProps {
  records: BurnRecord[];
  decimals?: number;
  symbol?: string;
  className?: string;
}

export function BurnChart({
  records,
  decimals = 0,
  symbol = '',
  className = '',
}: BurnChartProps) {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [interval, setInterval] = useState<Interval>('day');
  const [showCumulative, setShowCumulative] = useState(false);

  const { labels, values, cumulative } = aggregateBurnData(records, interval);
  
  // Convert values to display format
  const displayValues = values.map((v) => v / Math.pow(10, decimals));
  const displayCumulative = cumulative.map((v) => v / Math.pow(10, decimals));
  
  const maxValue = Math.max(...(showCumulative ? displayCumulative : displayValues), 1);

  if (records.length === 0) {
    return (
      <Card className={`burn-chart ${className}`}>
        <div className="text-center py-12 text-gray-500">
          No burn data available to display
        </div>
      </Card>
    );
  }

  return (
    <Card className={`burn-chart ${className}`}>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Burn History</h3>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Chart Type Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['bar', 'line', 'area'] as ChartType[]).map((type) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  chartType === type
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Interval Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['day', 'week', 'month'] as Interval[]).map((int) => (
              <button
                key={int}
                onClick={() => setInterval(int)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  interval === int
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {int.charAt(0).toUpperCase() + int.slice(1)}
              </button>
            ))}
          </div>

          {/* Cumulative Toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showCumulative}
              onChange={(e) => setShowCumulative(e.target.checked)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Cumulative
          </label>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-64">
        <ChartSVG
          type={chartType}
          labels={labels}
          values={showCumulative ? displayCumulative : displayValues}
          maxValue={maxValue}
          color={showCumulative ? '#8b5cf6' : '#f97316'}
        />
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded"
            style={{ backgroundColor: showCumulative ? '#8b5cf6' : '#f97316' }}
          />
          <span>
            {showCumulative ? 'Cumulative Burns' : 'Burns per Period'} ({symbol})
          </span>
        </div>
      </div>
    </Card>
  );
}

interface ChartSVGProps {
  type: ChartType;
  labels: string[];
  values: number[];
  maxValue: number;
  color: string;
}

function ChartSVG({
  type,
  labels,
  values,
  maxValue,
  color,
}: ChartSVGProps) {
  const width = 100;
  const height = 100;
  const padding = { top: 5, right: 5, bottom: 15, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const barWidth = chartWidth / values.length;
  const points = values.map((v, i) => ({
    x: padding.left + (i + 0.5) * barWidth,
    y: padding.top + chartHeight - (v / maxValue) * chartHeight,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-full"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={ratio}
          x1={padding.left}
          y1={padding.top + chartHeight * (1 - ratio)}
          x2={width - padding.right}
          y2={padding.top + chartHeight * (1 - ratio)}
          stroke="#e5e7eb"
          strokeWidth="0.5"
        />
      ))}

      {/* Chart content */}
      {type === 'bar' && (
        <g>
          {values.map((v, i) => (
            <rect
              key={i}
              x={padding.left + i * barWidth + barWidth * 0.1}
              y={padding.top + chartHeight - (v / maxValue) * chartHeight}
              width={barWidth * 0.8}
              height={(v / maxValue) * chartHeight}
              fill={color}
              opacity={0.8}
              rx="1"
            />
          ))}
        </g>
      )}

      {type === 'line' && (
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {type === 'area' && (
        <>
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#areaGradient)" />
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {/* X-axis labels (show every nth label to avoid crowding) */}
      {labels.map((label, i) => {
        const showLabel = labels.length <= 10 || i % Math.ceil(labels.length / 10) === 0;
        return (
          showLabel && (
            <text
              key={i}
              x={padding.left + (i + 0.5) * barWidth}
              y={height - 2}
              textAnchor="middle"
              fontSize="3"
              fill="#9ca3af"
            >
              {label.slice(5)}
            </text>
          )
        );
      })}

      {/* Y-axis labels */}
      {[0, 0.5, 1].map((ratio) => (
        <text
          key={ratio}
          x={padding.left - 1}
          y={padding.top + chartHeight * (1 - ratio) + 1}
          textAnchor="end"
          fontSize="3"
          fill="#9ca3af"
        >
          {formatNumber(maxValue * ratio)}
        </text>
      ))}
    </svg>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

export function BurnChartSkeleton({ className = '' }: { className?: string }) {
  return (
    <Card className={`burn-chart ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="h-6 bg-gray-200 rounded animate-pulse w-32" />
        <div className="flex gap-2">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-24" />
          <div className="h-8 bg-gray-200 rounded animate-pulse w-24" />
        </div>
      </div>
      <div className="h-64 bg-gray-100 rounded animate-pulse" />
    </Card>
  );
}