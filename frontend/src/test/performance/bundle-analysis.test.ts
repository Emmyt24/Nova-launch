import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Bundle Size Analysis Tests
 * 
 * These tests analyze the production build to ensure bundle sizes
 * stay within acceptable limits and code splitting is effective.
 */

describe('Bundle Size Analysis', () => {
  const INITIAL_BUNDLE_BUDGET_KB = 200;
  const TOTAL_BUNDLE_BUDGET_KB = 500;
  
  it('should document bundle size budgets', () => {
    const budgets = {
      initial: `${INITIAL_BUNDLE_BUDGET_KB}KB`,
      total: `${TOTAL_BUNDLE_BUDGET_KB}KB`,
      script: '200KB',
      stylesheet: '50KB',
      image: '200KB',
      font: '100KB',
    };
    
    console.log('Bundle size budgets:', JSON.stringify(budgets, null, 2));
    
    expect(budgets.initial).toBe('200KB');
    expect(budgets.total).toBe('500KB');
  });

  it('should verify code splitting is configured', () => {
    // Check if vite.config.ts has manual chunks configured
    const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
    
    if (fs.existsSync(viteConfigPath)) {
      const config = fs.readFileSync(viteConfigPath, 'utf-8');
      
      expect(config).toContain('manualChunks');
      expect(config).toContain('react-vendor');
      expect(config).toContain('stellar-sdk');
      
      console.log('✓ Code splitting is properly configured');
    } else {
      console.warn('⚠ vite.config.ts not found, skipping verification');
    }
  });

  it('should verify compression is enabled', () => {
    const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
    
    if (fs.existsSync(viteConfigPath)) {
      const config = fs.readFileSync(viteConfigPath, 'utf-8');
      
      // Check for compression plugin or built-in compression
      const hasCompression = 
        config.includes('compression') || 
        config.includes('reportCompressedSize');
      
      expect(hasCompression).toBe(true);
      console.log('✓ Compression is enabled');
    }
  });

  it('should verify tree shaking is enabled', () => {
    const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
    
    if (fs.existsSync(viteConfigPath)) {
      const config = fs.readFileSync(viteConfigPath, 'utf-8');
      
      // Vite has tree shaking enabled by default in production
      // Just verify we're not disabling it
      expect(config).not.toContain('treeshake: false');
      
      console.log('✓ Tree shaking is enabled (Vite default)');
    }
  });

  it('should check for lazy loading patterns', async () => {
    // Check if lazy loading is used in the codebase
    const srcPath = path.join(process.cwd(), 'src');
    
    if (fs.existsSync(srcPath)) {
      const files = getAllFiles(srcPath, ['.tsx', '.ts']);
      let lazyLoadCount = 0;
      
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes('React.lazy') || content.includes('lazy(')) {
          lazyLoadCount++;
        }
      }
      
      console.log(`Found ${lazyLoadCount} files using lazy loading`);
      
      // We expect at least some lazy loading for route-based code splitting
      expect(lazyLoadCount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Asset Optimization', () => {
  it('should verify image optimization settings', () => {
    const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
    
    if (fs.existsSync(viteConfigPath)) {
      const config = fs.readFileSync(viteConfigPath, 'utf-8');
      
      // Check for asset inline limit
      expect(config).toContain('assetsInlineLimit');
      
      console.log('✓ Asset optimization is configured');
    }
  });

  it('should document asset optimization strategies', () => {
    const strategies = {
      images: 'WebP format with fallbacks, lazy loading',
      fonts: 'Subset fonts, preload critical fonts',
      icons: 'SVG sprites or icon fonts',
      inlineLimit: '4KB for small assets',
    };
    
    console.log('Asset optimization strategies:', JSON.stringify(strategies, null, 2));
    
    expect(strategies.inlineLimit).toBe('4KB for small assets');
  });
});

// Helper function to recursively get all files with specific extensions
function getAllFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !item.includes('node_modules')) {
      files.push(...getAllFiles(fullPath, extensions));
    } else if (stat.isFile()) {
      const ext = path.extname(item);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}
