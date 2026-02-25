/**
 * Accessibility Testing Utilities
 * 
 * This file provides common utilities for accessibility testing across the application.
 * It includes helpers for axe-core configuration, keyboard navigation testing, 
 * and screen reader compatibility checks.
 */

import { axe, toHaveNoViolations } from 'jest-axe';
import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Axe configuration for WCAG 2.1 AA compliance
export const axeConfig = {
  rules: {
    // Enable all WCAG 2.1 AA rules
    level: 'AA',
    // Tag specific rules for different testing contexts
    tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
    
    // Configure specific rules
    'color-contrast': { enabled: true },
    'keyboard-navigation': { enabled: true },
    'aria-labels': { enabled: true },
    'focus-management': { enabled: true },
    
    // Temporarily disable rules that may need separate handling
    'bypass': { enabled: false }, // Skip links will be tested separately
    'page-has-heading-one': { enabled: false }, // Heading structure tested separately
  },
};

// Custom render function that includes accessibility testing
export const renderWithA11y = async (
  ui: ReactElement,
  options?: RenderOptions
) => {
  const view = render(ui, options);
  
  // Run axe accessibility checks
  const results = await axe(view.container, axeConfig);
  
  return {
    ...view,
    axeResults: results,
  };
};

// Helper to check for accessibility violations
export const checkAccessibility = async (container: HTMLElement) => {
  const results = await axe(container, axeConfig);
  return results;
};

// Keyboard navigation utilities
export class KeyboardNavigationTester {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // Simulate tab key press
  pressTab(): HTMLElement {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    this.container.dispatchEvent(event);
    return document.activeElement as HTMLElement;
  }

  // Simulate shift+tab key press
  pressShiftTab(): HTMLElement {
    const event = new KeyboardEvent('keydown', { 
      key: 'Tab', 
      shiftKey: true, 
      bubbles: true 
    });
    this.container.dispatchEvent(event);
    return document.activeElement as HTMLElement;
  }

  // Simulate enter key press
  pressEnter(): HTMLElement {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    this.container.dispatchEvent(event);
    return document.activeElement as HTMLElement;
  }

  // Simulate space key press
  pressSpace(): HTMLElement {
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    this.container.dispatchEvent(event);
    return document.activeElement as HTMLElement;
  }

  // Simulate escape key press
  pressEscape(): HTMLElement {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    this.container.dispatchEvent(event);
    return document.activeElement as HTMLElement;
  }

  // Simulate arrow key press
  pressArrowKey(direction: 'up' | 'down' | 'left' | 'right'): HTMLElement {
    const event = new KeyboardEvent('keydown', { 
      key: `Arrow${direction.charAt(0).toUpperCase() + direction.slice(1)}`, 
      bubbles: true 
    });
    this.container.dispatchEvent(event);
    return document.activeElement as HTMLElement;
  }

  // Get all focusable elements
  getFocusableElements(): HTMLElement[] {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ];

    return Array.from(this.container.querySelectorAll(focusableSelectors.join(', ')))
      .filter(el => {
        // Filter out hidden elements
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }) as HTMLElement[];
  }

  // Check tab order
  checkTabOrder(): string[] {
    const focusableElements = this.getFocusableElements();
    const tabOrder: string[] = [];

    focusableElements.forEach(element => {
      element.focus();
      tabOrder.push(element.tagName + (element.id ? `#${element.id}` : '') + 
                     (element.className ? `.${element.className.split(' ').join('.')}` : ''));
    });

    return tabOrder;
  }
}

// Focus management utilities
export class FocusManagementTester {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // Check if focus is trapped within a container (for modals)
  checkFocusTrap(): boolean {
    const activeElement = document.activeElement;
    return this.container.contains(activeElement);
  }

  // Get current focused element
  getFocusedElement(): HTMLElement | null {
    return document.activeElement as HTMLElement;
  }

  // Check if element has visible focus indicator
  hasVisibleFocus(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const computedStyles = [
      style.outline,
      style.outlineWidth,
      style.boxShadow,
      style.border,
    ];

    return computedStyles.some(prop => 
      prop && prop !== 'none' && prop !== '0px' && prop !== ''
    );
  }
}

// ARIA testing utilities
export class AriaTester {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // Check for proper ARIA labels
  checkAriaLabels(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for images without alt text
    const images = this.container.querySelectorAll('img:not([alt])');
    if (images.length > 0) {
      issues.push(`${images.length} image(s) missing alt attribute`);
    }

    // Check for form inputs without labels
    const inputs = this.container.querySelectorAll('input:not([aria-label]):not([aria-labelledby])');
    inputs.forEach(input => {
      const label = this.container.querySelector(`label[for="${input.id}"]`);
      if (!label) {
        issues.push(`Input ${input.id || 'without id'} missing associated label`);
      }
    });

    // Check for buttons without accessible names
    const buttons = this.container.querySelectorAll('button:not([aria-label]):not([aria-labelledby])');
    buttons.forEach(button => {
      if (!button.textContent?.trim()) {
        issues.push(`Button missing accessible name`);
      }
    });

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // Check heading hierarchy
  checkHeadingHierarchy(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const headings = Array.from(this.container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    
    if (headings.length === 0) {
      issues.push('No headings found');
      return { valid: false, issues };
    }

    let previousLevel = 0;
    headings.forEach((heading, index) => {
      const currentLevel = parseInt(heading.tagName.charAt(1));
      
      if (index === 0 && currentLevel !== 1) {
        issues.push('First heading should be h1');
      }
      
      if (currentLevel > previousLevel + 1) {
        issues.push(`Heading level skipped: h${previousLevel} to h${currentLevel}`);
      }
      
      previousLevel = currentLevel;
    });

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // Check for landmarks
  checkLandmarks(): { valid: boolean; foundLandmarks: string[] } {
    const landmarks = [
      'main',
      'nav', 
      'header',
      'footer',
      'aside',
      'section',
      '[role="main"]',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[role="complementary"]',
      '[role="region"]',
    ];

    const foundLandmarks: string[] = [];
    
    landmarks.forEach(landmark => {
      const elements = this.container.querySelectorAll(landmark);
      if (elements.length > 0) {
        foundLandmarks.push(landmark);
      }
    });

    return {
      valid: foundLandmarks.length > 0,
      foundLandmarks,
    };
  }
}

// Color contrast utilities
export class ColorContrastTester {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // Get computed color and background
  getElementColors(element: HTMLElement): { color: string; backgroundColor: string } {
    const style = window.getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
    };
  }

  // Simple contrast ratio calculation (simplified for testing)
  calculateContrastRatio(color1: string, color2: string): number {
    // This is a simplified version - in production, use a proper contrast calculation library
    const rgb1 = this.hexToRgb(color1);
    const rgb2 = this.hexToRgb(color2);
    
    if (!rgb1 || !rgb2) return 0;

    const luminance1 = (0.299 * rgb1.r + 0.587 * rgb1.g + 0.114 * rgb1.b) / 255;
    const luminance2 = (0.299 * rgb2.r + 0.587 * rgb2.g + 0.114 * rgb2.b) / 255;
    
    const brightest = Math.max(luminance1, luminance2);
    const darkest = Math.min(luminance1, luminance2);
    
    return (brightest + 0.05) / (darkest + 0.05);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  // Check WCAG AA compliance (4.5:1 for normal text, 3:1 for large text)
  checkWCAGCompliance(element: HTMLElement, isLargeText = false): boolean {
    const colors = this.getElementColors(element);
    const ratio = this.calculateContrastRatio(colors.color, colors.backgroundColor);
    const threshold = isLargeText ? 3.0 : 4.5;
    
    return ratio >= threshold;
  }
}

// Screen reader testing utilities
export class ScreenReaderTester {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // Get accessible name for an element
  getAccessibleName(element: HTMLElement): string {
    // Check for aria-label first
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label')!;
    }

    // Check for aria-labelledby
    if (element.getAttribute('aria-labelledby')) {
      const labelledById = element.getAttribute('aria-labelledby')!;
      const labelElement = document.getElementById(labelledById);
      if (labelElement) {
        return labelElement.textContent || '';
      }
    }

    // Check for alt text on images
    if (element.tagName === 'IMG' && element.getAttribute('alt')) {
      return element.getAttribute('alt')!;
    }

    // Check for text content
    if (element.textContent?.trim()) {
      return element.textContent.trim();
    }

    // Check for title attribute as fallback
    if (element.getAttribute('title')) {
      return element.getAttribute('title')!;
    }

    return '';
  }

  // Check if element is announced to screen readers
  isElementAnnounced(element: HTMLElement): boolean {
    const accessibleName = this.getAccessibleName(element);
    const isHidden = element.getAttribute('aria-hidden') === 'true';
    const isNotDisplayed = window.getComputedStyle(element).display === 'none';
    
    return !isHidden && !isNotDisplayed && accessibleName.length > 0;
  }

  // Check for live regions
  getLiveRegions(): HTMLElement[] {
    const liveRegionSelectors = [
      '[aria-live="polite"]',
      '[aria-live="assertive"]',
      '[aria-live="off"]',
      '[role="status"]',
      '[role="alert"]',
      '[role="marquee"]',
      '[role="timer"]',
      '[role="log"]',
    ];

    return Array.from(this.container.querySelectorAll(liveRegionSelectors.join(', '))) as HTMLElement[];
  }
}

// Export all testers for easy use
export {
  KeyboardNavigationTester,
  FocusManagementTester,
  AriaTester,
  ColorContrastTester,
  ScreenReaderTester,
};

// Type declarations for Jest
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveNoViolations(): R;
    }
  }
}
