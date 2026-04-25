#!/usr/bin/env node

/**
 * Bundle Analysis Script
 * 
 * Analyzes the production build and generates a detailed report
 * of bundle sizes, chunk distribution, and optimization opportunities.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, '..', 'dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');

// Budget thresholds (in KB)
const BUDGETS = {
  initialBundle: 200,
  totalBundle: 500,
  script: 200,
  stylesheet: 50,
  image: 200,
  font: 100,
};

function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / 1024; // Convert to KB
}

function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function analyzeBundle() {
  console.log('🔍 Analyzing bundle...\n');

  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ Build directory not found. Run "npm run build" first.');
    process.exit(1);
  }

  const allFiles = getAllFiles(DIST_DIR);
  
  const analysis = {
    scripts: [],
    stylesheets: [],
    images: [],
    fonts: [],
    other: [],
  };

  let totalSize = 0;

  allFiles.forEach(file => {
    const size = getFileSize(file);
    const relativePath = path.relative(DIST_DIR, file);
    const ext = path.extname(file).toLowerCase();

    totalSize += size;

    const fileInfo = {
      path: relativePath,
      size: size.toFixed(2),
      sizeKB: size,
    };

    if (ext === '.js' || ext === '.mjs') {
      analysis.scripts.push(fileInfo);
    } else if (ext === '.css') {
      analysis.stylesheets.push(fileInfo);
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
      analysis.images.push(fileInfo);
    } else if (['.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
      analysis.fonts.push(fileInfo);
    } else {
      analysis.other.push(fileInfo);
    }
  });

  // Sort by size (largest first)
  Object.keys(analysis).forEach(key => {
    analysis[key].sort((a, b) => b.sizeKB - a.sizeKB);
  });

  // Calculate totals
  const totals = {
    scripts: analysis.scripts.reduce((sum, f) => sum + f.sizeKB, 0),
    stylesheets: analysis.stylesheets.reduce((sum, f) => sum + f.sizeKB, 0),
    images: analysis.images.reduce((sum, f) => sum + f.sizeKB, 0),
    fonts: analysis.fonts.reduce((sum, f) => sum + f.sizeKB, 0),
    other: analysis.other.reduce((sum, f) => sum + f.sizeKB, 0),
  };

  // Print report
  console.log('📊 Bundle Analysis Report\n');
  console.log('═'.repeat(60));
  
  console.log('\n📦 Total Bundle Size');
  console.log(`   ${totalSize.toFixed(2)} KB`);
  console.log(`   Budget: ${BUDGETS.totalBundle} KB`);
  console.log(`   Status: ${totalSize <= BUDGETS.totalBundle ? '✅ PASS' : '❌ FAIL'}`);

  console.log('\n📜 JavaScript Files');
  console.log(`   Total: ${totals.scripts.toFixed(2)} KB`);
  console.log(`   Budget: ${BUDGETS.script} KB`);
  console.log(`   Status: ${totals.scripts <= BUDGETS.script ? '✅ PASS' : '⚠️  WARN'}`);
  console.log(`   Files: ${analysis.scripts.length}`);
  
  if (analysis.scripts.length > 0) {
    console.log('\n   Largest files:');
    analysis.scripts.slice(0, 5).forEach(file => {
      console.log(`   - ${file.path}: ${file.size} KB`);
    });
  }

  console.log('\n🎨 CSS Files');
  console.log(`   Total: ${totals.stylesheets.toFixed(2)} KB`);
  console.log(`   Budget: ${BUDGETS.stylesheet} KB`);
  console.log(`   Status: ${totals.stylesheets <= BUDGETS.stylesheet ? '✅ PASS' : '⚠️  WARN'}`);
  console.log(`   Files: ${analysis.stylesheets.length}`);

  if (analysis.stylesheets.length > 0) {
    console.log('\n   Files:');
    analysis.stylesheets.forEach(file => {
      console.log(`   - ${file.path}: ${file.size} KB`);
    });
  }

  console.log('\n🖼️  Images');
  console.log(`   Total: ${totals.images.toFixed(2)} KB`);
  console.log(`   Budget: ${BUDGETS.image} KB`);
  console.log(`   Status: ${totals.images <= BUDGETS.image ? '✅ PASS' : '⚠️  WARN'}`);
  console.log(`   Files: ${analysis.images.length}`);

  console.log('\n🔤 Fonts');
  console.log(`   Total: ${totals.fonts.toFixed(2)} KB`);
  console.log(`   Budget: ${BUDGETS.font} KB`);
  console.log(`   Status: ${totals.fonts <= BUDGETS.font ? '✅ PASS' : '⚠️  WARN'}`);
  console.log(`   Files: ${analysis.fonts.length}`);

  console.log('\n═'.repeat(60));

  // Check for optimization opportunities
  console.log('\n💡 Optimization Opportunities\n');

  const opportunities = [];

  if (totals.scripts > BUDGETS.script) {
    opportunities.push('- Consider code splitting or lazy loading for JavaScript');
  }

  if (totals.stylesheets > BUDGETS.stylesheet) {
    opportunities.push('- Consider removing unused CSS or splitting stylesheets');
  }

  if (analysis.images.some(img => img.sizeKB > 100)) {
    opportunities.push('- Some images are large (>100KB). Consider compression or WebP format');
  }

  if (analysis.scripts.length > 10) {
    opportunities.push('- Many script files detected. Consider bundling or reducing chunks');
  }

  if (opportunities.length === 0) {
    console.log('✅ No major optimization opportunities detected!');
  } else {
    opportunities.forEach(opp => console.log(opp));
  }

  console.log('\n═'.repeat(60));

  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    totalSize: totalSize.toFixed(2),
    totals,
    budgets: BUDGETS,
    analysis,
    opportunities,
  };

  const reportPath = path.join(__dirname, '..', 'bundle-analysis.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}\n`);

  // Exit with error if budget exceeded
  if (totalSize > BUDGETS.totalBundle) {
    console.error('❌ Bundle size exceeds budget!');
    process.exit(1);
  }
}

analyzeBundle();
