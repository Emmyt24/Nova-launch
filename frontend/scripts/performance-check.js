#!/usr/bin/env node

/**
 * Performance Check Script
 * Validates bundle sizes and performance metrics
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_PATH = join(__dirname, '..', 'dist');
const BUDGETS_PATH = join(__dirname, '..', 'performance-budgets.json');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  try {
    const files = readdirSync(dirPath);
    
    files.forEach(file => {
      const filePath = join(dirPath, file);
      if (statSync(filePath).isDirectory()) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      } else {
        arrayOfFiles.push(filePath);
      }
    });
    
    return arrayOfFiles;
  } catch (error) {
    return arrayOfFiles;
  }
}

function checkBundleSizes() {
  log('\n📦 Checking Bundle Sizes...', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  try {
    const budgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf-8'));
    const files = getAllFiles(join(DIST_PATH, 'assets'));
    
    const jsFiles = files.filter(f => f.endsWith('.js'));
    const cssFiles = files.filter(f => f.endsWith('.css'));
    const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|svg|webp)$/.test(f));
    const fontFiles = files.filter(f => /\.(woff|woff2|ttf|eot)$/.test(f));
    
    let passed = true;
    
    // Check script budget
    const totalJsSize = jsFiles.reduce((sum, file) => sum + statSync(file).size, 0);
    const scriptBudget = budgets.budgets[0].resourceSizes.find(r => r.resourceType === 'script');
    const scriptBudgetBytes = scriptBudget.budget * 1024;
    
    log(`\nJavaScript Bundle:`, 'blue');
    log(`  Total: ${formatSize(totalJsSize)}`);
    log(`  Budget: ${formatSize(scriptBudgetBytes)}`);
    
    if (totalJsSize > scriptBudgetBytes) {
      log(`  ❌ FAILED: Exceeds budget by ${formatSize(totalJsSize - scriptBudgetBytes)}`, 'red');
      passed = false;
    } else {
      log(`  ✅ PASSED: ${formatSize(scriptBudgetBytes - totalJsSize)} under budget`, 'green');
    }
    
    // Check CSS budget
    const totalCssSize = cssFiles.reduce((sum, file) => sum + statSync(file).size, 0);
    const cssBudget = budgets.budgets[0].resourceSizes.find(r => r.resourceType === 'stylesheet');
    const cssBudgetBytes = cssBudget.budget * 1024;
    
    log(`\nCSS Bundle:`, 'blue');
    log(`  Total: ${formatSize(totalCssSize)}`);
    log(`  Budget: ${formatSize(cssBudgetBytes)}`);
    
    if (totalCssSize > cssBudgetBytes) {
      log(`  ❌ FAILED: Exceeds budget by ${formatSize(totalCssSize - cssBudgetBytes)}`, 'red');
      passed = false;
    } else {
      log(`  ✅ PASSED: ${formatSize(cssBudgetBytes - totalCssSize)} under budget`, 'green');
    }
    
    // Check total budget
    const totalSize = totalJsSize + totalCssSize;
    const totalBudget = budgets.budgets[0].resourceSizes.find(r => r.resourceType === 'total');
    const totalBudgetBytes = totalBudget.budget * 1024;
    
    log(`\nTotal Bundle:`, 'blue');
    log(`  Total: ${formatSize(totalSize)}`);
    log(`  Budget: ${formatSize(totalBudgetBytes)}`);
    
    if (totalSize > totalBudgetBytes) {
      log(`  ❌ FAILED: Exceeds budget by ${formatSize(totalSize - totalBudgetBytes)}`, 'red');
      passed = false;
    } else {
      log(`  ✅ PASSED: ${formatSize(totalBudgetBytes - totalSize)} under budget`, 'green');
    }
    
    // List all files
    log(`\n📄 File Breakdown:`, 'blue');
    jsFiles.forEach(file => {
      const size = statSync(file).size;
      const name = file.split('/').pop() || file.split('\\').pop();
      log(`  ${name}: ${formatSize(size)}`);
    });
    
    if (cssFiles.length > 0) {
      log(`\n  CSS Files:`);
      cssFiles.forEach(file => {
        const size = statSync(file).size;
        const name = file.split('/').pop() || file.split('\\').pop();
        log(`  ${name}: ${formatSize(size)}`);
      });
    }
    
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    
    if (passed) {
      log('✅ All bundle size checks passed!', 'green');
      return 0;
    } else {
      log('❌ Some bundle size checks failed!', 'red');
      return 1;
    }
    
  } catch (error) {
    log(`\n❌ Error checking bundle sizes: ${error.message}`, 'red');
    log('Make sure to run "npm run build" first.', 'yellow');
    return 1;
  }
}

function checkPerformanceMetrics() {
  log('\n⚡ Performance Metrics Budgets:', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  
  try {
    const budgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf-8'));
    
    budgets.timings.forEach(timing => {
      const name = timing.metric.replace(/-/g, ' ').toUpperCase();
      const budget = timing.budget < 1 ? `${timing.budget}` : `${timing.budget}ms`;
      log(`  ${name}: ${budget}`, 'blue');
    });
    
    log('\n💡 Run Lighthouse CI to measure these metrics:', 'yellow');
    log('   npm run lighthouse', 'yellow');
    
  } catch (error) {
    log(`\n❌ Error reading performance budgets: ${error.message}`, 'red');
  }
}

// Main execution
log('\n🚀 Performance Check', 'cyan');
const exitCode = checkBundleSizes();
checkPerformanceMetrics();

process.exit(exitCode);
