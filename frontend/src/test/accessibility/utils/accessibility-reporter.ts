/**
 * Accessibility Reporter
 * 
 * Generates comprehensive accessibility reports from test results
 * and provides actionable recommendations for fixing violations.
 */

import { AxeResults, Result } from 'axe-core';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface AccessibilityReport {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    violations: number;
    incomplete: number;
    timestamp: string;
    wcagLevel: string;
  };
  violations: ViolationReport[];
  passes: PassReport[];
  incomplete: IncompleteReport[];
  recommendations: Recommendation[];
  impact: ImpactSummary;
}

export interface ViolationReport {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  nodes: ViolationNode[];
  wcagLevel: string;
  category: string;
  priority: number;
}

export interface ViolationNode {
  html: string;
  target: string[];
  failureSummary: string;
  any: ViolationCheck[];
  all: ViolationCheck[];
  none: ViolationCheck[];
  impact: string;
  xpath?: string;
}

export interface ViolationCheck {
  id: string;
  impact?: string;
  message: string;
  data?: Record<string, any>;
}

export interface PassReport {
  id: string;
  description: string;
  help: string;
  helpUrl: string;
  nodes: PassNode[];
  category: string;
}

export interface PassNode {
  html: string;
  target: string[];
  xpath?: string;
}

export interface IncompleteReport {
  id: string;
  description: string;
  help: string;
  helpUrl: string;
  nodes: IncompleteNode[];
  category: string;
  reason: string;
}

export interface IncompleteNode {
  html: string;
  target: string[];
  xpath?: string;
  reason: string;
}

export interface Recommendation {
  type: 'fix' | 'improve' | 'review';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  examples: string[];
  resources: string[];
  affectedComponents: string[];
  estimatedEffort: 'quick' | 'moderate' | 'extensive';
}

export interface ImpactSummary {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  total: number;
  score: number; // Weighted accessibility score
}

export class AccessibilityReporter {
  private results: AxeResults;
  private reportData: AccessibilityReport;

  constructor(results: AxeResults) {
    this.results = results;
    this.reportData = this.generateReport();
  }

  /**
   * Generate comprehensive accessibility report
   */
  private generateReport(): AccessibilityReport {
    const violations = this.processViolations();
    const passes = this.processPasses();
    const incomplete = this.processIncomplete();
    const recommendations = this.generateRecommendations(violations);
    const impact = this.calculateImpact(violations);

    return {
      summary: {
        totalTests: violations.length + passes.length + incomplete.length,
        passed: passes.length,
        failed: violations.length,
        violations: violations.length,
        incomplete: incomplete.length,
        timestamp: new Date().toISOString(),
        wcagLevel: this.getWCAGLevel()
      },
      violations,
      passes,
      incomplete,
      recommendations,
      impact
    };
  }

  /**
   * Process violations from axe results
   */
  private processViolations(): ViolationReport[] {
    return this.results.violations.map((violation: Result) => ({
      id: violation.id,
      impact: violation.impact as any,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map(node => ({
        html: node.html,
        target: node.target,
        failureSummary: node.failureSummary,
        any: node.any,
        all: node.all,
        none: node.none,
        impact: node.impact || '',
        xpath: node.xpath
      })),
      wcagLevel: this.getWCAGLevelForRule(violation.id),
      category: this.getCategoryForRule(violation.id),
      priority: this.getPriorityForImpact(violation.impact as any)
    }));
  }

  /**
   * Process passes from axe results
   */
  private processPasses(): PassReport[] {
    return this.results.passes.map((pass: Result) => ({
      id: pass.id,
      description: pass.description,
      help: pass.help,
      helpUrl: pass.helpUrl,
      nodes: pass.nodes.map(node => ({
        html: node.html,
        target: node.target,
        xpath: node.xpath
      })),
      category: this.getCategoryForRule(pass.id)
    }));
  }

  /**
   * Process incomplete results from axe results
   */
  private processIncomplete(): IncompleteReport[] {
    return this.results.incomplete.map((incomplete: Result) => ({
      id: incomplete.id,
      description: incomplete.description,
      help: incomplete.help,
      helpUrl: incomplete.helpUrl,
      nodes: incomplete.nodes.map(node => ({
        html: node.html,
        target: node.target,
        xpath: node.xpath,
        reason: node.reason || 'Manual testing required'
      })),
      category: this.getCategoryForRule(incomplete.id),
      reason: incomplete.description
    }));
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(violations: ViolationReport[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Group violations by category
    const violationsByCategory = violations.reduce((acc, violation) => {
      if (!acc[violation.category]) {
        acc[violation.category] = [];
      }
      acc[violation.category].push(violation);
      return acc;
    }, {} as Record<string, ViolationReport[]>);

    // Generate recommendations for each category
    Object.entries(violationsByCategory).forEach(([category, categoryViolations]) => {
      const criticalViolations = categoryViolations.filter(v => v.impact === 'critical');
      const seriousViolations = categoryViolations.filter(v => v.impact === 'serious');

      if (criticalViolations.length > 0) {
        recommendations.push(this.createCriticalRecommendation(category, criticalViolations));
      }

      if (seriousViolations.length > 0) {
        recommendations.push(this.createSeriousRecommendation(category, seriousViolations));
      }

      // Add general improvement recommendations
      recommendations.push(...this.createImprovementRecommendations(category, categoryViolations));
    });

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Create critical violation recommendations
   */
  private createCriticalRecommendation(category: string, violations: ViolationReport[]): Recommendation {
    const categoryRecommendations = {
      'keyboard': {
        title: 'Fix Keyboard Navigation Issues',
        description: 'Critical keyboard accessibility issues prevent users who cannot use a mouse from accessing your application.',
        examples: [
          'Add tabindex="0" to interactive elements',
          'Ensure all functionality is available via keyboard',
          'Implement proper focus management for modals and dynamic content'
        ],
        resources: [
          'https://www.w3.org/WAI/WCAG21/Understanding/keyboard',
          'https://web.dev/keyboard-accessibility/'
        ]
      },
      'aria': {
        title: 'Fix ARIA Implementation',
        description: 'ARIA attributes are incorrectly implemented, causing screen reader users to misunderstand your interface.',
        examples: [
          'Use appropriate ARIA roles for interactive elements',
          'Ensure ARIA states and properties are updated dynamically',
          'Provide proper labels for form controls and buttons'
        ],
        resources: [
          'https://www.w3.org/WAI/ARIA/apg/',
          'https://web.dev/accessible-forms/'
        ]
      },
      'color': {
        title: 'Fix Color Contrast Issues',
        description: 'Text and background colors do not meet WCAG contrast requirements, making content difficult to read.',
        examples: [
          'Increase text contrast to at least 4.5:1 for normal text',
          'Increase contrast to at least 3:1 for large text (18pt+)',
          'Ensure interactive elements have sufficient contrast'
        ],
        resources: [
          'https://web.dev/color-contrast/',
          'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html'
        ]
      },
      'focus': {
        title: 'Fix Focus Management',
        description: 'Focus indicators are missing or inadequate, making it difficult for keyboard users to navigate.',
        examples: [
          'Add visible focus indicators to all interactive elements',
          'Ensure focus is properly managed in modal dialogs',
          'Implement focus trapping for complex components'
        ],
        resources: [
          'https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html',
          'https://web.dev/focus/'
        ]
      }
    };

    const template = categoryRecommendations[category as keyof typeof categoryRecommendations] || {
      title: `Fix Critical ${category} Issues`,
      description: 'Critical accessibility issues need immediate attention.',
      examples: ['Review and fix all violations in this category'],
      resources: ['https://www.w3.org/WAI/WCAG21/quickref/']
    };

    return {
      type: 'fix',
      priority: 'high',
      ...template,
      affectedComponents: violations.map(v => v.nodes.map(n => n.target).flat()).flat(),
      estimatedEffort: violations.length > 5 ? 'extensive' : violations.length > 2 ? 'moderate' : 'quick'
    };
  }

  /**
   * Create serious violation recommendations
   */
  private createSeriousRecommendation(category: string, violations: ViolationReport[]): Recommendation {
    return {
      type: 'fix',
      priority: 'medium',
      title: `Address Serious ${category} Issues`,
      description: 'These issues significantly impact accessibility and should be addressed soon.',
      examples: [
        'Review the specific violations listed in the report',
        'Implement the suggested fixes from axe-core documentation',
        'Test with screen readers and keyboard navigation'
      ],
      resources: [
        'https://www.w3.org/WAI/WCAG21/quickref/',
        'https://dequeuniversity.com/rules/axe/'
      ],
      affectedComponents: violations.map(v => v.nodes.map(n => n.target).flat()).flat(),
      estimatedEffort: violations.length > 3 ? 'moderate' : 'quick'
    };
  }

  /**
   * Create improvement recommendations
   */
  private createImprovementRecommendations(category: string, violations: ViolationReport[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Add specific recommendations based on violation types
    violations.forEach(violation => {
      if (violation.id.includes('label')) {
        recommendations.push({
          type: 'improve',
          priority: 'medium',
          title: 'Improve Form Labels',
          description: 'Add proper labels to form controls to improve accessibility.',
          examples: [
            'Use <label> elements with for attributes',
            'Add aria-label attributes when visible labels are not appropriate',
            'Use aria-labelledby to associate multiple labels with a control'
          ],
          resources: [
            'https://www.w3.org/WAI/WCAG21/Understanding/label-in-name.html',
            'https://web.dev/accessible-forms/'
          ],
          affectedComponents: violation.nodes.map(n => n.target).flat(),
          estimatedEffort: 'quick'
        });
      }

      if (violation.id.includes('heading')) {
        recommendations.push({
          type: 'improve',
          priority: 'medium',
          title: 'Improve Heading Structure',
          description: 'Ensure proper heading hierarchy for better navigation.',
          examples: [
            'Use h1 for the main page title',
            'Follow proper heading order (h1, h2, h3, etc.)',
            'Do not skip heading levels'
          ],
          resources: [
            'https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels.html',
            'https://web.dev/heading-elements/'
          ],
          affectedComponents: violation.nodes.map(n => n.target).flat(),
          estimatedEffort: 'quick'
        });
      }
    });

    return recommendations;
  }

  /**
   * Calculate impact summary and accessibility score
   */
  private calculateImpact(violations: ViolationReport[]): ImpactSummary {
    const impact = violations.reduce((acc, violation) => {
      acc[violation.impact] = (acc[violation.impact] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const critical = impact.critical || 0;
    const serious = impact.serious || 0;
    const moderate = impact.moderate || 0;
    const minor = impact.minor || 0;
    const total = violations.length;

    // Calculate weighted accessibility score (0-100)
    // Critical: -20 points, Serious: -10 points, Moderate: -5 points, Minor: -2 points
    const score = Math.max(0, 100 - (critical * 20) - (serious * 10) - (moderate * 5) - (minor * 2));

    return {
      critical,
      serious,
      moderate,
      minor,
      total,
      score
    };
  }

  /**
   * Get WCAG level for overall results
   */
  private getWCAGLevel(): string {
    // This could be enhanced to detect the actual WCAG level tested
    return 'AA';
  }

  /**
   * Get WCAG level for specific rule
   */
  private getWCAGLevelForRule(ruleId: string): string {
    // Map specific rules to WCAG levels
    const wcagAA = [
      'color-contrast',
      'keyboard',
      'focus-order-semantics',
      'label-title-only',
      'link-in-text-block'
    ];

    const wcagAAA = [
      'color-contrast-enhanced',
      'target-size-minimum'
    ];

    if (wcagAAA.includes(ruleId)) return 'AAA';
    if (wcagAA.includes(ruleId)) return 'AA';
    return 'A';
  }

  /**
   * Get category for rule
   */
  private getCategoryForRule(ruleId: string): string {
    const categories = {
      // Keyboard navigation
      'keyboard': 'keyboard',
      'focus-order-semantics': 'keyboard',
      'tabindex': 'keyboard',
      'focus-trap': 'keyboard',
      
      // ARIA and semantic markup
      'aria-allowed-attr': 'aria',
      'aria-hidden-body': 'aria',
      'aria-hidden-focus': 'aria',
      'aria-input-field-name': 'aria',
      'aria-required-attr': 'aria',
      'aria-required-children': 'aria',
      'aria-required-parent': 'aria',
      'aria-roles': 'aria',
      'aria-valid-attr': 'aria',
      'aria-valid-attr-value': 'aria',
      
      // Color and visual
      'color-contrast': 'color',
      'color-contrast-enhanced': 'color',
      
      // Focus management
      'focus-visible': 'focus',
      'focus-management': 'focus',
      
      // Forms and inputs
      'label-title-only': 'forms',
      'input-button-name': 'forms',
      'input-alt-text': 'forms',
      'input-image-alt': 'forms',
      'form-field-multiple-labels': 'forms',
      
      // Content structure
      'heading-order': 'content',
      'page-has-heading-one': 'content',
      'landmark-one-main': 'content',
      'landmark-no-duplicate-banner': 'content',
      'landmark-no-duplicate-contentinfo': 'content',
      
      // Images and media
      'image-alt': 'media',
      'image-redundant-alt': 'media',
      'img-alt': 'media',
      'video-caption': 'media',
      'audio-caption': 'media',
      
      // Links and navigation
      'link-in-text-block': 'navigation',
      'link-name': 'navigation',
      'link-text-mismatch': 'navigation',
      'bypass': 'navigation',
      
      // Tables
      'table-headers': 'tables',
      'th-has-data-cells': 'tables',
      'td-headers-attr': 'tables',
      
      // Lists
      'list': 'content',
      'listitem': 'content',
      'definition-list': 'content',
      
      // Language and reading
      'html-has-lang': 'content',
      'html-lang-valid': 'content',
      'lang': 'content',
      
      // Frames and iframes
      'frame-title': 'content',
      'frame-title-unique': 'content'
    };

    return categories[ruleId as keyof typeof categories] || 'general';
  }

  /**
   * Get priority for impact level
   */
  private getPriorityForImpact(impact: string): number {
    const priorities = {
      critical: 4,
      serious: 3,
      moderate: 2,
      minor: 1
    };
    return priorities[impact as keyof typeof priorities] || 1;
  }

  /**
   * Generate HTML report
   */
  public generateHTMLReport(): string {
    const { summary, violations, recommendations, impact } = this.reportData;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accessibility Report - ${summary.timestamp}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .summary-card h3 { margin: 0 0 10px 0; color: #333; }
        .summary-card .value { font-size: 2em; font-weight: bold; margin: 10px 0; }
        .critical { color: #dc3545; }
        .serious { color: #fd7e14; }
        .moderate { color: #ffc107; }
        .minor { color: #28a745; }
        .score { color: #007bff; }
        .violations { margin-bottom: 30px; }
        .violation { background: white; margin-bottom: 15px; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #dc3545; }
        .violation.serious { border-left-color: #fd7e14; }
        .violation.moderate { border-left-color: #ffc107; }
        .violation.minor { border-left-color: #28a745; }
        .recommendations { margin-bottom: 30px; }
        .recommendation { background: white; margin-bottom: 15px; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .recommendation.high { border-left: 4px solid #dc3545; }
        .recommendation.medium { border-left: 4px solid #ffc107; }
        .recommendation.low { border-left: 4px solid #28a745; }
        .impact-critical { background: #dc3545; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
        .impact-serious { background: #fd7e14; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
        .impact-moderate { background: #ffc107; color: #212529; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
        .impact-minor { background: #28a745; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
        .code { background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: 'Monaco', 'Menlo', monospace; font-size: 0.9em; overflow-x: auto; }
        .examples { margin: 15px 0; }
        .examples ul { margin: 10px 0; padding-left: 20px; }
        .resources { margin: 15px 0; }
        .resources a { color: #007bff; text-decoration: none; }
        .resources a:hover { text-decoration: underline; }
        @media (max-width: 768px) {
            .summary { grid-template-columns: 1fr; }
            body { padding: 10px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Accessibility Report</h1>
        <p>Generated: ${new Date(summary.timestamp).toLocaleString()}</p>
        <p>WCAG Level: ${summary.wcagLevel}</p>
    </div>

    <div class="summary">
        <div class="summary-card">
            <h3>Accessibility Score</h3>
            <div class="value score">${impact.score}/100</div>
        </div>
        <div class="summary-card">
            <h3>Total Violations</h3>
            <div class="value">${summary.violations}</div>
        </div>
        <div class="summary-card">
            <h3>Critical Issues</h3>
            <div class="value critical">${impact.critical}</div>
        </div>
        <div class="summary-card">
            <h3>Serious Issues</h3>
            <div class="value serious">${impact.serious}</div>
        </div>
        <div class="summary-card">
            <h3>Moderate Issues</h3>
            <div class="value moderate">${impact.moderate}</div>
        </div>
        <div class="summary-card">
            <h3>Minor Issues</h3>
            <div class="value minor">${impact.minor}</div>
        </div>
    </div>

    <div class="recommendations">
        <h2>Recommendations</h2>
        ${recommendations.map(rec => `
            <div class="recommendation ${rec.priority}">
                <h3>${rec.title}</h3>
                <span class="impact-${rec.priority}">${rec.priority.toUpperCase()}</span>
                <p>${rec.description}</p>
                <div class="examples">
                    <h4>Examples:</h4>
                    <ul>
                        ${rec.examples.map(example => `<li>${example}</li>`).join('')}
                    </ul>
                </div>
                <div class="resources">
                    <h4>Resources:</h4>
                    <ul>
                        ${rec.resources.map(resource => `<li><a href="${resource}" target="_blank">${resource}</a></li>`).join('')}
                    </ul>
                </div>
            </div>
        `).join('')}
    </div>

    <div class="violations">
        <h2>Violations</h2>
        ${violations.map(violation => `
            <div class="violation ${violation.impact}">
                <h3>${violation.description}</h3>
                <span class="impact-${violation.impact}">${violation.impact.toUpperCase()}</span>
                <p><strong>Help:</strong> ${violation.help}</p>
                <p><a href="${violation.helpUrl}" target="_blank">Learn more</a></p>
                <div class="examples">
                    <h4>Affected Elements (${violation.nodes.length}):</h4>
                    ${violation.nodes.slice(0, 3).map(node => `
                        <div class="code">${node.html}</div>
                    `).join('')}
                    ${violation.nodes.length > 3 ? `<p>... and ${violation.nodes.length - 3} more</p>` : ''}
                </div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;
  }

  /**
   * Generate JSON report
   */
  public generateJSONReport(): string {
    return JSON.stringify(this.reportData, null, 2);
  }

  /**
   * Generate JUnit XML report for CI/CD integration
   */
  public generateJUnitReport(): string {
    const { violations, summary } = this.reportData;
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuites name="Accessibility Tests" tests="${summary.violations}" failures="${summary.violations}" time="0">\n`;
    xml += '  <testsuite name="Accessibility Violations" tests="' + summary.violations + '" failures="' + summary.violations + '" time="0">\n';

    violations.forEach((violation, index) => {
      const testName = violation.description.replace(/[^a-zA-Z0-9]/g, '_');
      xml += `    <testcase name="${testName}" classname="Accessibility">\n`;
      xml += `      <failure message="${violation.description}">\n`;
      xml += `        <![CDATA[\n`;
      xml += `Impact: ${violation.impact}\n`;
      xml += `Help: ${violation.help}\n`;
      xml += `URL: ${violation.helpUrl}\n`;
      xml += `Affected elements: ${violation.nodes.length}\n`;
      xml += `        ]]>\n`;
      xml += `      </failure>\n`;
      xml += `    </testcase>\n`;
    });

    xml += '  </testsuite>\n';
    xml += '</testsuites>\n';

    return xml;
  }

  /**
   * Save reports to files
   */
  public saveReports(outputDir: string = './test-results/accessibility'): void {
    try {
      mkdirSync(outputDir, { recursive: true });

      // Save HTML report
      const htmlReport = this.generateHTMLReport();
      writeFileSync(join(outputDir, 'accessibility-report.html'), htmlReport);

      // Save JSON report
      const jsonReport = this.generateJSONReport();
      writeFileSync(join(outputDir, 'accessibility-report.json'), jsonReport);

      // Save JUnit report
      const junitReport = this.generateJUnitReport();
      writeFileSync(join(outputDir, 'junit-a11y.xml'), junitReport);

      console.log(`Accessibility reports saved to ${outputDir}`);
    } catch (error) {
      console.error('Error saving accessibility reports:', error);
    }
  }

  /**
   * Get the full report data
   */
  public getReport(): AccessibilityReport {
    return this.reportData;
  }

  /**
   * Check if accessibility score meets minimum threshold
   */
  public meetsThreshold(threshold: number = 80): boolean {
    return this.reportData.impact.score >= threshold;
  }

  /**
   * Get critical violations that need immediate attention
   */
  public getCriticalViolations(): ViolationReport[] {
    return this.reportData.violations.filter(v => v.impact === 'critical');
  }

  /**
   * Get violations by category
   */
  public getViolationsByCategory(): Record<string, ViolationReport[]> {
    return this.reportData.violations.reduce((acc, violation) => {
      if (!acc[violation.category]) {
        acc[violation.category] = [];
      }
      acc[violation.category].push(violation);
      return acc;
    }, {} as Record<string, ViolationReport[]>);
  }
}

export default AccessibilityReporter;
