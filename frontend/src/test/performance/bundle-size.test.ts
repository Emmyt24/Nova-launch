import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Bundle Size Tests
 * Ensures bundle sizes stay within performance budgets
 */

const DIST_PATH = join(process.cwd(), 'dist');
const BUDGETS = {
  initialBundle: 200 * 1024, // 200KB
  totalBundle: 500 * 1024,   // 500KB
  vendorChunk: 150 * 1024,   // 150KB
  cssBundle: 50 * 1024,      // 50KB
};

function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
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
  } catch {
    return arrayOfFiles;
  }
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

describe('Bundle Size Performance', () => {
  it('should have initial bundle under 200KB', () => {
    const files = getAllFiles(join(DIST_PATH, 'assets'));
    const jsFiles = files.filter(f => f.endsWith('.js') && !f.includes('vendor'));
    
    if (jsFiles.length === 0) {
      console.warn('⚠️  No JS files found. Run build first: npm run build');
      return;
    }
    
    const mainBundle = jsFiles.find(f => f.includes('index') || f.includes('main'));
    if (!mainBundle) {
      console.warn('⚠️  Main bundle not found');
      return;
    }
    
    const size = getFileSize(mainBundle);
    console.log(`📦 Initial bundle: ${formatSize(size)}`);
    
    expect(size).toBeLessThan(BUDGETS.initialBundle);
  });

  it('should have total bundle under 500KB', () => {
    const files = getAllFiles(join(DIST_PATH, 'assets'));
    const jsFiles = files.filter(f => f.endsWith('.js'));
    
    if (jsFiles.length === 0) {
      console.warn('⚠️  No JS files found. Run build first: npm run build');
      return;
    }
    
    const totalSize = jsFiles.reduce((sum, file) => sum + getFileSize(file), 0);
    console.log(`📦 Total bundle: ${formatSize(totalSize)}`);
    
    expect(totalSize).toBeLessThan(BUDGETS.totalBundle);
  });

  it('should have vendor chunk under 150KB', () => {
    const files = getAllFiles(join(DIST_PATH, 'assets'));
    const vendorFiles = files.filter(f => f.endsWith('.js') && f.includes('vendor'));
    
    if (vendorFiles.length === 0) {
      console.warn('⚠️  No vendor files found');
      return;
    }
    
    vendorFiles.forEach(file => {
      const size = getFileSize(file);
      console.log(`📦 Vendor chunk (${file.split('/').pop()}): ${formatSize(size)}`);
      expect(size).toBeLessThan(BUDGETS.vendorChunk);
    });
  });

  it('should have CSS bundle under 50KB', () => {
    const files = getAllFiles(join(DIST_PATH, 'assets'));
    const cssFiles = files.filter(f => f.endsWith('.css'));
    
    if (cssFiles.length === 0) {
      console.warn('⚠️  No CSS files found');
      return;
    }
    
    const totalCssSize = cssFiles.reduce((sum, file) => sum + getFileSize(file), 0);
    console.log(`📦 Total CSS: ${formatSize(totalCssSize)}`);
    
    expect(totalCssSize).toBeLessThan(BUDGETS.cssBundle);
  });

  it('should have effective code splitting', () => {
    const files = getAllFiles(join(DIST_PATH, 'assets'));
    const jsFiles = files.filter(f => f.endsWith('.js'));
    
    if (jsFiles.length === 0) {
      console.warn('⚠️  No JS files found');
      return;
    }
    
    console.log(`📦 Number of JS chunks: ${jsFiles.length}`);
    
    // Should have at least 3 chunks (main, vendor, and lazy-loaded)
    expect(jsFiles.length).toBeGreaterThanOrEqual(3);
  });

  it('should report all bundle sizes', () => {
    const files = getAllFiles(join(DIST_PATH, 'assets'));
    const jsFiles = files.filter(f => f.endsWith('.js'));
    const cssFiles = files.filter(f => f.endsWith('.css'));
    
    if (jsFiles.length === 0) {
      console.warn('⚠️  No files found. Run build first: npm run build');
      return;
    }
    
    console.log('\n📊 Bundle Size Report:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    jsFiles.forEach(file => {
      const size = getFileSize(file);
      const name = file.split('/').pop() || file;
      console.log(`  ${name}: ${formatSize(size)}`);
    });
    
    if (cssFiles.length > 0) {
      console.log('\n  CSS Files:');
      cssFiles.forEach(file => {
        const size = getFileSize(file);
        const name = file.split('/').pop() || file;
        console.log(`  ${name}: ${formatSize(size)}`);
      });
    }
    
    const totalJs = jsFiles.reduce((sum, file) => sum + getFileSize(file), 0);
    const totalCss = cssFiles.reduce((sum, file) => sum + getFileSize(file), 0);
    const total = totalJs + totalCss;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Total JS: ${formatSize(totalJs)}`);
    console.log(`  Total CSS: ${formatSize(totalCss)}`);
    console.log(`  Grand Total: ${formatSize(total)}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    expect(total).toBeLessThan(BUDGETS.totalBundle);
  });
});
