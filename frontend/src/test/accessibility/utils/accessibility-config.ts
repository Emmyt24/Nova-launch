/**
 * Accessibility Testing Configuration
 * 
 * Central configuration for all accessibility testing tools and rules.
 */

export const ACCESSIBILITY_CONFIG = {
  // WCAG compliance level
  wcagLevel: 'AA' as const,
  
  // Axe-core configuration
  axe: {
    // Rules to include/exclude
    rules: {
      // Core accessibility rules
      'aria-allowed-attr': { enabled: true },
      'aria-hidden-body': { enabled: true },
      'aria-hidden-focus': { enabled: true },
      'aria-input-field-name': { enabled: true },
      'aria-required-attr': { enabled: true },
      'aria-required-children': { enabled: true },
      'aria-required-parent': { enabled: true },
      'aria-roles': { enabled: true },
      'aria-valid-attr': { enabled: true },
      'aria-valid-attr-value': { enabled: true },
      
      // Keyboard navigation
      'keyboard': { enabled: true },
      'keyboard-navigation': { enabled: true },
      'focus-order-semantics': { enabled: true },
      'tabindex': { enabled: true },
      
      // Color and visual
      'color-contrast': { enabled: true },
      'color-contrast-enhanced': { enabled: false }, // AAA level, optional
      
      // Content and structure
      'bypass': { enabled: true },
      'document-title': { enabled: true },
      'heading-order': { enabled: true },
      'html-has-lang': { enabled: true },
      'landmark-one-main': { enabled: true },
      'landmark-no-duplicate-banner': { enabled: true },
      'landmark-no-duplicate-contentinfo': { enabled: true },
      'page-has-heading-one': { enabled: true },
      'region': { enabled: true },
      
      // Forms and inputs
      'form-field-multiple-labels': { enabled: true },
      'label-title-only': { enabled: true },
      'input-button-name': { enabled: true },
      'input-alt-text': { enabled: true },
      'input-image-alt': { enabled: true },
      
      // Tables
      'table-headers': { enabled: true },
      'th-has-data-cells': { enabled: true },
      'td-headers-attr': { enabled: true },
      
      // Lists
      'list': { enabled: true },
      'listitem': { enabled: true },
      'definition-list': { enabled: true },
      
      // Media
      'video-caption': { enabled: true },
      'audio-caption': { enabled: true },
      
      // Links and navigation
      'link-in-text-block': { enabled: true },
      'link-name': { enabled: true },
      'link-text-mismatch': { enabled: true },
      'meta-viewport': { enabled: true },
      'meta-viewport-large': { enabled: true },
      
      // Images
      'image-alt': { enabled: true },
      'image-redundant-alt': { enabled: true },
      'img-alt': { enabled: true },
      
      // Focus management
      'focus-trap': { enabled: true },
      'focus-management': { enabled: true },
      'focus-visible': { enabled: true },
      
      // Language and reading
      'html-lang-valid': { enabled: true },
      'lang': { enabled: true },
      
      // Frames and iframes
      'frame-title': { enabled: true },
      'frame-title-unique': { enabled: true },
      
      // Custom rules for our specific application
      'custom-button-labels': { enabled: true },
      'custom-form-validation': { enabled: true },
      'custom-loading-states': { enabled: true },
      'custom-error-messages': { enabled: true },
    },
    
    // Tags for different testing scenarios
    tags: {
      // Core WCAG 2.1 AA compliance
      wcag21aa: ['wcag2a', 'wcag2aa', 'wcag21aa'],
      
      // Enhanced WCAG 2.1 AAA compliance (optional)
      wcag21aaa: ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21aa', 'wcag21aaa'],
      
      // Best practices
      bestPractices: ['best-practice'],
      
      // Experimental rules
      experimental: ['experimental'],
      
      // Custom application rules
      custom: ['custom'],
    },
  },
  
  // Pa11y configuration
  pa11y: {
    // Actions to run before testing
    actions: [
      // Wait for page to load
      'wait for element body to be visible',
      
      // Wait for any dynamic content
      'wait for 2 seconds',
      
      // Remove any loading spinners
      'set field .loading to hidden',
    ],
    
    // Ignore specific elements
    ignore: [
      // Ignore development-only elements
      '.dev-only',
      '[data-dev]',
      
      // Ignore third-party widgets that may not be accessible
      '.third-party-widget',
      
      // Ignore elements that are intentionally hidden
      '[aria-hidden="true"]',
    ],
    
    // Pa11y rules configuration
    rules: ['wcag2aa', 'best-practice'],
    
    // Screen reader to simulate
    screenReader: 'axe',
    
    // Wait timeout
    timeout: 30000,
    
    // Viewport size for testing
    viewport: {
      width: 1280,
      height: 720,
    },
  },
  
  // Keyboard navigation testing
  keyboard: {
    // Elements that should be focusable
    focusableSelectors: [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="combobox"]',
      '[role="listbox"]',
      '[role="treeitem"]',
      '[role="tab"]',
    ],
    
    // Elements that should receive focus
    focusManagement: {
      // Modal focus trap
      modal: {
        containerSelector: '[role="dialog"]',
        initialFocusSelector: '[data-initial-focus]',
        closeSelectors: ['[data-close]', '[aria-label="close"]', '.modal-close'],
      },
      
      // Skip links
      skipLinks: {
        selector: '.skip-link',
        targetSelector: 'main, [role="main"]',
      },
      
      // Form validation
      formValidation: {
        errorSelector: '.error, [role="alert"]',
        fieldErrorSelector: '.field-error',
      },
    },
    
    // Tab order expectations
    tabOrder: {
      logical: true,
      visible: true,
      trapped: {
        modal: true,
        menu: true,
        combobox: true,
      },
    },
  },
  
  // Screen reader testing
  screenReader: {
    // Expected announcements
    announcements: {
      pageLoad: 'Nova Launch - Stellar Token Deployer',
      navigation: 'Main navigation',
      formErrors: 'Form validation errors',
      success: 'Operation completed successfully',
      loading: 'Loading content',
    },
    
    // Live regions to monitor
    liveRegions: [
      '[aria-live="polite"]',
      '[aria-live="assertive"]',
      '[role="status"]',
      '[role="alert"]',
      '[role="log"]',
    ],
    
    // Elements that should have accessible names
    accessibleNames: {
      buttons: true,
      links: true,
      inputs: true,
      images: true,
      landmarks: true,
    },
  },
  
  // Color contrast requirements
  colorContrast: {
    // WCAG AA ratios
    normalText: 4.5,
    largeText: 3.0,
    graphicalObjects: 3.0,
    
    // Font sizes considered "large"
    largeTextThreshold: {
      size: 18, // 18pt or 14pt bold
      weight: 'bold',
    },
    
    // Colors to test
    testColors: {
      primary: '#3178c6',
      secondary: '#61dafb',
      success: '#28a745',
      warning: '#ffc107',
      error: '#dc3545',
      background: '#ffffff',
      text: '#000000',
      textSecondary: '#6c757d',
      border: '#dee2e6',
    },
  },
  
  // ARIA requirements
  aria: {
    // Required roles for our application
    requiredRoles: [
      'main',
      'navigation',
      'banner',
      'contentinfo',
      'dialog',
      'alert',
      'status',
    ],
    
    // Roles that must have specific properties
    roleProperties: {
      button: {
        required: [],
        optional: ['aria-expanded', 'aria-pressed', 'aria-describedby'],
      },
      link: {
        required: [],
        optional: ['aria-describedby', 'aria-current'],
      },
      dialog: {
        required: ['aria-modal', 'aria-labelledby'],
        optional: ['aria-describedby'],
      },
      alert: {
        required: ['aria-live'],
        optional: ['aria-atomic'],
      },
      status: {
        required: ['aria-live'],
        optional: ['aria-atomic'],
      },
    },
    
    // States that must be managed
    dynamicStates: [
      'aria-expanded',
      'aria-pressed',
      'aria-selected',
      'aria-disabled',
      'aria-hidden',
      'aria-busy',
      'aria-invalid',
    ],
  },
  
  // Test thresholds and limits
  thresholds: {
    // Maximum number of violations allowed
    maxViolations: {
      critical: 0,
      serious: 0,
      moderate: 5,
      minor: 10,
    },
    
    // Performance thresholds
    maxTestTime: 30000, // 30 seconds
    maxTestSize: 1024 * 1024, // 1MB
    
    // Coverage requirements
    minAccessibilityCoverage: 0.8, // 80% of components tested
  },
  
  // Reporting configuration
  reporting: {
    // Report formats
    formats: ['json', 'junit', 'html'],
    
    // Report sections
    sections: [
      'summary',
      'violations',
      'passes',
      'incomplete',
      'impact',
      'recommendations',
    ],
    
    // Notification settings
    notifications: {
      critical: true,
      serious: true,
      moderate: false,
      minor: false,
    },
  },
};

// Export specific configurations for different testing scenarios
export const UNIT_TEST_CONFIG = {
  ...ACCESSIBILITY_CONFIG,
  axe: {
    ...ACCESSIBILITY_CONFIG.axe,
    rules: Object.keys(ACCESSIBILITY_CONFIG.axe.rules).reduce((acc, rule) => {
      acc[rule] = { enabled: true };
      return acc;
    }, {} as Record<string, { enabled: boolean }>),
  },
};

export const INTEGRATION_TEST_CONFIG = {
  ...ACCESSIBILITY_CONFIG,
  pa11y: {
    ...ACCESSIBILITY_CONFIG.pa11y,
    actions: [
      'wait for element body to be visible',
      'wait for 1 second',
    ],
  },
};

export const E2E_TEST_CONFIG = {
  ...ACCESSIBILITY_CONFIG,
  pa11y: {
    ...ACCESSIBILITY_CONFIG.pa11y,
    actions: [
      'wait for element body to be visible',
      'wait for 3 seconds',
      'click element .wallet-connect-button',
      'wait for 2 seconds',
    ],
    screenReader: 'chromevox',
  },
};

// Export default configuration
export default ACCESSIBILITY_CONFIG;
