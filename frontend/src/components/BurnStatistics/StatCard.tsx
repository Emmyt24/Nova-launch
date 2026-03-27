import React from 'react';
import { Card } from '../UI/Card';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({
  title,
  value,
  icon,
  subtitle,
  trend,
  className = '',
}: StatCardProps) {
  return (
    <Card className={`stat-card ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div
              className={`flex items-center mt-2 text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              <span>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-gray-400 ml-1">vs last period</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 p-3 bg-gradient-to-br from-orange-100 to-red-100 rounded-lg">
          <div className="text-orange-600">{icon}</div>
        </div>
      </div>
    </Card>
  );
}

interface StatCardSkeletonProps {
  className?: string;
}

export function StatCardSkeleton({ className = '' }: StatCardSkeletonProps) {
  return (
    <Card className={`stat-card ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-24 mb-2" />
          <div className="h-8 bg-gray-200 rounded animate-pulse w-32" />
        </div>
        <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    </Card>
  );
}