#!/usr/bin/env node

/**
 * Performance Monitoring Script
 * 
 * Tracks performance metrics over time and generates trend reports.
 * Stores historical data for comparison and regression detection.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_FILE = path.join(__dirname, '..', 'performance-history.json');
const MAX_HISTORY_ENTRIES = 100;

function loadHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return { entries: [] };
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function addEntry(metrics) {
  const history = loadHistory();
  
  const entry = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || 'local',
    branch: process.env.GITHUB_REF_NAME || 'local',
    ...metrics,
  };
  
  history.entries.unshift(entry);
  
  // Keep only the last MAX_HISTORY_ENTRIES
  if (history.entries.length > MAX_HISTORY_ENTRIES) {
    history.entries = history.entries.slice(0, MAX_HISTORY_ENTRIES);
  }
  
  saveHistory(history);
  
  return entry;
}

function analyzeBundle() {
  const bundleAnalysisPath = path.join(__dirname, '..', 'bundle-analysis.json');
  
  if (!fs.existsSync(bundleAnalysisPath)) {
    console.warn('⚠️  Bundle analysis not found. Run analyze-bundle.js first.');
    return null;
  }
  
  const analysis = JSON.parse(fs.readFileSync(bundleAnalysisPath, 'utf-8'));
  
  return {
    totalSize: parseFloat(analysis.totalSize),
    scriptSize: analysis.totals.scripts,
    styleSize: analysis.totals.stylesheets,
    imageSize: analysis.totals.images,
    fontSize: analysis.totals.fonts,
  };
}

function analyzeLighthouse() {
  const lighthouseDir = path.join(__dirname, '..', '.lighthouseci');
  
  if (!fs.existsSync(lighthouseDir)) {
    console.warn('⚠️  Lighthouse results not found. Run Lighthouse CI first.');
    return null;
  }
  
  // Find the most recent lighthouse report
  const files = fs.readdirSync(lighthouseDir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(lighthouseDir, f),
      time: fs.statSync(path.join(lighthouseDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);
  
  if (files.length === 0) {
    return null;
  }
  
  const report = JSON.parse(fs.readFileSync(files[0].path, 'utf-8'));
  const audits = report.audits;
  
  return {
    performanceScore: report.categories.performance.score * 100,
    fcp: audits['first-contentful-paint'].numericValue,
    lcp: audits['largest-contentful-paint'].numericValue,
    tti: audits.interactive.numericValue,
    tbt: audits['total-blocking-time'].numericValue,
    cls: audits['cumulative-layout-shift'].numericValue,
    speedIndex: audits['speed-index'].numericValue,
  };
}

function detectRegressions(current, previous) {
  if (!previous) {
    return [];
  }
  
  const regressions = [];
  const THRESHOLD = 0.1; // 10% regression threshold
  
  const checks = [
    { key: 'totalSize', name: 'Total Bundle Size', unit: 'KB' },
    { key: 'fcp', name: 'First Contentful Paint', unit: 'ms' },
    { key: 'lcp', name: 'Largest Contentful Paint', unit: 'ms' },
    { key: 'tti', name: 'Time to Interactive', unit: 'ms' },
    { key: 'tbt', name: 'Total Blocking Time', unit: 'ms' },
    { key: 'cls', name: 'Cumulative Layout Shift', unit: '' },
  ];
  
  checks.forEach(check => {
    if (current[check.key] && previous[check.key]) {
      const change = (current[check.key] - previous[check.key]) / previous[check.key];
      
      if (change > THRESHOLD) {
        regressions.push({
          metric: check.name,
          previous: previous[check.key],
          current: current[check.key],
          change: (change * 100).toFixed(1) + '%',
          unit: check.unit,
        });
      }
    }
  });
  
  return regressions;
}

function generateReport() {
  console.log('📊 Performance Monitoring Report\n');
  console.log('═'.repeat(60));
  
  const bundleMetrics = analyzeBundle();
  const lighthouseMetrics = analyzeLighthouse();
  
  const metrics = {
    ...bundleMetrics,
    ...lighthouseMetrics,
  };
  
  // Add to history
  const entry = addEntry(metrics);
  
  // Load history for comparison
  const history = loadHistory();
  const previous = history.entries[1]; // Previous entry
  
  // Print current metrics
  console.log('\n📈 Current Metrics\n');
  
  if (bundleMetrics) {
    console.log('Bundle Sizes:');
    console.log(`  Total: ${bundleMetrics.totalSize.toFixed(2)} KB`);
    console.log(`  Scripts: ${bundleMetrics.scriptSize.toFixed(2)} KB`);
    console.log(`  Styles: ${bundleMetrics.styleSize.toFixed(2)} KB`);
  }
  
  if (lighthouseMetrics) {
    console.log('\nCore Web Vitals:');
    console.log(`  Performance Score: ${lighthouseMetrics.performanceScore.toFixed(0)}/100`);
    console.log(`  FCP: ${lighthouseMetrics.fcp.toFixed(0)}ms`);
    console.log(`  LCP: ${lighthouseMetrics.lcp.toFixed(0)}ms`);
    console.log(`  TTI: ${lighthouseMetrics.tti.toFixed(0)}ms`);
    console.log(`  TBT: ${lighthouseMetrics.tbt.toFixed(0)}ms`);
    console.log(`  CLS: ${lighthouseMetrics.cls.toFixed(3)}`);
  }
  
  // Check for regressions
  const regressions = detectRegressions(metrics, previous);
  
  if (regressions.length > 0) {
    console.log('\n⚠️  Performance Regressions Detected\n');
    regressions.forEach(reg => {
      console.log(`  ${reg.metric}:`);
      console.log(`    Previous: ${reg.previous}${reg.unit}`);
      console.log(`    Current: ${reg.current}${reg.unit}`);
      console.log(`    Change: +${reg.change}`);
    });
  } else {
    console.log('\n✅ No performance regressions detected');
  }
  
  // Show trend
  if (history.entries.length >= 5) {
    console.log('\n📉 Recent Trend (last 5 builds)\n');
    
    const recent = history.entries.slice(0, 5).reverse();
    
    if (recent.every(e => e.totalSize)) {
      console.log('Bundle Size Trend:');
      recent.forEach((e, i) => {
        const date = new Date(e.timestamp).toLocaleDateString();
        console.log(`  ${i + 1}. ${date}: ${e.totalSize.toFixed(2)} KB`);
      });
    }
    
    if (recent.every(e => e.performanceScore)) {
      console.log('\nPerformance Score Trend:');
      recent.forEach((e, i) => {
        const date = new Date(e.timestamp).toLocaleDateString();
        console.log(`  ${i + 1}. ${date}: ${e.performanceScore.toFixed(0)}/100`);
      });
    }
  }
  
  console.log('\n═'.repeat(60));
  console.log(`\n📄 History saved to: ${HISTORY_FILE}`);
  console.log(`   Total entries: ${history.entries.length}\n`);
  
  // Exit with error if regressions detected
  if (regressions.length > 0) {
    console.error('❌ Performance regressions detected!');
    process.exit(1);
  }
}

generateReport();
