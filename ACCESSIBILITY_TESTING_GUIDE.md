# Accessibility Testing Guide

## Overview

This guide covers the comprehensive accessibility testing suite implemented for the Nova Launch project. The testing suite ensures the platform is usable by people with disabilities and meets WCAG 2.1 AA standards.

## 🎯 Objectives

- Ensure WCAG 2.1 AA compliance across all components
- Test keyboard navigation and focus management
- Validate screen reader compatibility
- Check color contrast and visual accessibility
- Verify ARIA attributes and semantic markup
- Generate comprehensive accessibility reports
- Integrate testing into CI/CD pipeline

## 🛠️ Tools and Dependencies

### Core Testing Tools
- **axe-core**: Automated accessibility testing engine
- **jest-axe**: Jest integration for axe-core
- **pa11y**: Command-line accessibility testing
- **@testing-library/react**: Component testing utilities
- **@testing-library/user-event**: User interaction simulation

### E2E Testing
- **Playwright**: End-to-end testing framework
- **Lighthouse CI**: Performance and accessibility audits

## 📁 Project Structure

```
frontend/src/test/accessibility/
├── unit/                           # Unit accessibility tests
│   └── accessibility.basic.test.ts
├── integration/                    # Integration tests
│   ├── accessibility.integration.test.ts
│   └── accessibility.integration.basic.test.ts
├── e2e/                           # End-to-end tests
│   └── accessibility.e2e.test.ts
├── utils/                         # Testing utilities
│   ├── accessibility-test-utils.ts
│   ├── accessibility-config.ts
│   └── accessibility-reporter.ts
└── fixtures/                      # Test fixtures and mocks
```

## 🚀 Getting Started

### 1. Installation

Dependencies are already installed in the project:
```bash
cd frontend
npm install
```

### 2. Running Tests

#### Unit Tests
```bash
npm run test:a11y
```

#### Integration Tests with Coverage
```bash
npm run test:a11y:coverage
```

#### Watch Mode
```bash
npm run test:a11y:watch
```

#### CI/CD Format
```bash
npm run test:a11y:ci
```

### 3. Generate Reports

```bash
npm run test:a11y:report
```

This generates:
- HTML report (`test-results/accessibility/accessibility-report.html`)
- JSON report (`test-results/accessibility/accessibility-report.json`)
- JUnit XML (`test-results/accessibility/junit-a11y.xml`)

## 🧪 Test Categories

### 1. Unit Tests
Focus on individual components and their accessibility properties.

**Example:**
```typescript
it('should have no violations with simple button', async () => {
  const { container } = render(
    React.createElement('button', { onClick: () => {} }, 'Test Button')
  );
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### 2. Integration Tests
Test component interactions and user workflows.

**Example:**
```typescript
it('should handle form validation accessibly', async () => {
  const { container } = render(
    React.createElement('form', {}, [
      React.createElement('label', { htmlFor: 'email' }, 'Email Address'),
      React.createElement('input', { 
        id: 'email',
        type: 'email',
        'aria-invalid': 'true',
        'aria-describedby': 'error-msg',
        required: true 
      }),
      React.createElement('div', { 
        id: 'error-msg',
        role: 'alert' 
      }, 'Please enter a valid email')
    ])
  );
  
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### 3. E2E Tests
Test real user scenarios in a browser environment.

**Example:**
```typescript
it('should load main page without accessibility violations', async () => {
  await page.goto('http://localhost:5173');
  
  // Inject axe-core
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.11.1/axe.min.js'
  });
  
  // Run axe
  const results = await page.evaluate(() => {
    return (window as any).axe.run();
  });
  
  expect(results.violations).toHaveLength(0);
});
```

## 🔧 Testing Utilities

### Accessibility Test Utils

The `accessibility-test-utils.ts` file provides helper classes:

#### KeyboardNavigationTester
```typescript
const keyboardTester = new KeyboardNavigationTester(container);
const tabOrder = keyboardTester.checkTabOrder();
const focusableElements = keyboardTester.getFocusableElements();
```

#### AriaTester
```typescript
const ariaTester = new AriaTester(container);
const headingCheck = ariaTester.checkHeadingHierarchy();
const landmarkCheck = ariaTester.checkLandmarks();
```

#### ScreenReaderTester
```typescript
const screenReaderTester = new ScreenReaderTester(container);
const accessibleName = screenReaderTester.getAccessibleName(element);
const isAnnounced = screenReaderTester.isElementAnnounced(element);
```

### Configuration

The `accessibility-config.ts` file centralizes all testing configurations:

```typescript
export const ACCESSIBILITY_CONFIG = {
  wcagLevel: 'AA',
  axe: {
    rules: {
      'color-contrast': { enabled: true },
      'keyboard': { enabled: true },
      // ... other rules
    }
  },
  // ... other configurations
};
```

## 📊 Reporting

### Accessibility Reporter

The `AccessibilityReporter` class generates comprehensive reports:

```typescript
import AccessibilityReporter from './utils/accessibility-reporter';

const reporter = new AccessibilityReporter(axeResults);
const report = reporter.getReport();

// Check if meets threshold
if (reporter.meetsThreshold(80)) {
  console.log('✅ Accessibility score meets threshold');
}

// Get critical violations
const critical = reporter.getCriticalViolations();

// Save reports
reporter.saveReports();
```

### Report Contents

1. **Summary**
   - Total tests, passes, failures
   - Accessibility score (0-100)
   - Violation breakdown by impact

2. **Violations**
   - Detailed violation information
   - Affected elements
   - WCAG level and category

3. **Recommendations**
   - Actionable fixes
   - Priority levels
   - External resources

4. **Impact Analysis**
   - Weighted scoring
   - Critical issue tracking

## 🔄 CI/CD Integration

### GitHub Actions Workflow

The `.github/workflows/accessibility.yml` file includes:

1. **Unit & Integration Tests**
   - Runs on push and PR
   - Multiple Node.js versions
   - Coverage reporting

2. **Pa11y E2E Tests**
   - Builds and serves application
   - Runs accessibility audits
   - Screenshot capture

3. **Lighthouse Audits**
   - Performance and accessibility scores
   - Multiple page testing
   - Historical tracking

4. **Report Generation**
   - PR comments with results
   - Artifact uploads
   - Summary reporting

### Quality Gates

- **Accessibility Score**: Minimum 80/100
- **Critical Violations**: Zero allowed
- **Test Coverage**: Minimum requirements

## 🎯 Testing Areas

### 1. Keyboard Navigation

- **Tab Order**: Logical progression through interactive elements
- **Focus Management**: Proper focus trapping in modals
- **Keyboard Shortcuts**: Enter, Space, Escape, Arrow keys
- **Skip Links**: Quick navigation to main content

### 2. Screen Reader Compatibility

- **Semantic HTML**: Proper use of headings, landmarks, lists
- **ARIA Labels**: Descriptive labels for interactive elements
- **Live Regions**: Dynamic content announcements
- **Form Associations**: Labels linked to form controls

### 3. Visual Accessibility

- **Color Contrast**: WCAG AA compliance (4.5:1 normal, 3:1 large)
- **Focus Indicators**: Visible focus states
- **Text Resizing**: 200% zoom compatibility
- **Touch Targets**: Minimum 44x44px for interactive elements

### 4. ARIA Implementation

- **Roles**: Correct use of ARIA roles
- **States**: Dynamic state updates (expanded, selected, etc.)
- **Properties**: Proper ARIA attribute usage
- **Relationships**: aria-labelledby, aria-describedby

## 🐛 Common Issues and Fixes

### 1. Missing Form Labels

**Issue**: Form inputs without associated labels
```typescript
// ❌ Bad
<input type="text" placeholder="Enter name" />

// ✅ Good
<label htmlFor="name">Name</label>
<input id="name" type="text" />
```

### 2. Insufficient Color Contrast

**Issue**: Text and background colors don't meet contrast requirements
```css
/* ❌ Bad */
.text { color: #999; background: #fff; } /* 3.0:1 ratio */

/* ✅ Good */
.text { color: #333; background: #fff; } /* 12.6:1 ratio */
```

### 3. Missing Alt Text

**Issue**: Images without descriptive alt text
```html
<!-- ❌ Bad -->
<img src="logo.png" />

<!-- ✅ Good -->
<img src="logo.png" alt="Nova Launch Logo" />
```

### 4. Improper Heading Structure

**Issue**: Skipping heading levels
```html
<!-- ❌ Bad -->
<h1>Title</h1>
<h3>Subtitle</h3> <!-- Skipped h2 -->

<!-- ✅ Good -->
<h1>Title</h1>
<h2>Subtitle</h2>
```

## 📈 Best Practices

### 1. Test-Driven Development

- Write accessibility tests alongside component development
- Test keyboard navigation early
- Validate ARIA attributes in unit tests

### 2. Progressive Enhancement

- Ensure core functionality works without JavaScript
- Test with screen readers regularly
- Validate keyboard-only navigation

### 3. Continuous Monitoring

- Run accessibility tests in CI/CD
- Monitor accessibility score trends
- Address violations promptly

### 4. Documentation

- Document accessibility decisions
- Provide testing guidelines
- Share knowledge with team

## 🔍 Manual Testing Checklist

### Keyboard Navigation
- [ ] Can navigate entire interface with Tab
- [ ] Focus is visible on all interactive elements
- [ ] Modal dialogs trap focus appropriately
- [ ] Escape key closes modals/menus
- [ ] Enter/Space activate buttons
- [ ] Arrow keys work in lists/menus

### Screen Reader Testing
- [ ] All images have alt text
- [ ] Form fields have associated labels
- [ ] Page has proper heading structure
- [ ] Landmarks are properly defined
- [ ] Dynamic content is announced
- [ ] Error messages are announced

### Visual Testing
- [ ] Text contrast meets WCAG AA
- [ ] Focus indicators are visible
- [ ] Interface works at 200% zoom
- [ ] Touch targets are adequate size
- [ ] No information conveyed by color alone

## 📚 Resources

### Documentation
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core Documentation](https://www.deque.com/axe/)
- [Pa11y Documentation](https://pa11y.org/)

### Tools
- [axe DevTools Browser Extension](https://www.deque.com/axe/devtools/)
- [WAVE Web Accessibility Evaluation Tool](https://wave.webaim.org/)
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/)

### Testing Tools
- [NVDA Screen Reader](https://www.nvaccess.org/)
- [JAWS Screen Reader](https://www.freedomscientific.com/products/software/jaws/)
- [VoiceOver (macOS)](https://www.apple.com/accessibility/vision/voiceover/)

## 🚀 Next Steps

1. **Fix Current Violations**: Address the violations found in initial tests
2. **Expand Coverage**: Add tests for more components and workflows
3. **Performance Optimization**: Ensure accessibility tests run efficiently
4. **Team Training**: Conduct accessibility training for development team
5. **User Testing**: Include users with disabilities in testing process

## 📞 Support

For questions about accessibility testing:
- Review the test files in `src/test/accessibility/`
- Check the configuration in `accessibility-config.ts`
- Consult the axe-core documentation
- Reach out to the development team

---

*Last updated: February 2026*
