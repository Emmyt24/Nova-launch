/**
 * Basic Accessibility Tests
 * 
 * Simple accessibility tests that focus on core functionality
 * using basic HTML elements and axe-core.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import React from 'react';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

describe('Basic Accessibility Tests', () => {
  beforeEach(() => {
    cleanup();
  });

  it('should have no violations with simple button', async () => {
    const { container } = render(
      React.createElement('button', { onClick: () => {} }, 'Test Button')
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no violations with simple input', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('label', { 
          key: 'label',
          htmlFor: 'test-input' 
        }, 'Test Input'),
        React.createElement('input', { 
          key: 'input',
          id: 'test-input',
          type: 'text',
          required: true 
        })
      ])
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should handle error states accessibly', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('label', { 
          key: 'label',
          htmlFor: 'test-input' 
        }, 'Required Field'),
        React.createElement('input', { 
          key: 'input',
          id: 'test-input',
          type: 'text',
          'aria-invalid': 'true',
          'aria-describedby': 'error-msg',
          required: true 
        }),
        React.createElement('div', { 
          key: 'error',
          id: 'error-msg',
          role: 'alert' 
        }, 'This field is required')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check error announcement
    const errorElement = screen.getByRole('alert');
    expect(errorElement).toBeInTheDocument();
    
    // Check input error state
    const input = screen.getByLabelText('Required Field');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
  });

  it('should have proper heading structure', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('h1', { key: 'h1' }, 'Main Title'),
        React.createElement('h2', { key: 'h2' }, 'Section Title'),
        React.createElement('h3', { key: 'h3' }, 'Subsection Title')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check heading levels
    const headings = container.querySelectorAll('h1, h2, h3');
    expect(headings).toHaveLength(3);
    expect(headings[0].tagName).toBe('H1');
    expect(headings[1].tagName).toBe('H2');
    expect(headings[2].tagName).toBe('H3');
  });

  it('should have proper landmarks', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('header', { key: 'header', role: 'banner' }, 'Header'),
        React.createElement('nav', { key: 'nav', role: 'navigation' }, 'Navigation'),
        React.createElement('main', { key: 'main', role: 'main' }, 'Main content'),
        React.createElement('footer', { key: 'footer', role: 'contentinfo' }, 'Footer')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check landmarks
    const main = screen.getByRole('main');
    const nav = screen.getByRole('navigation');
    const header = screen.getByRole('banner');
    const footer = screen.getByRole('contentinfo');
    
    expect(main).toBeInTheDocument();
    expect(nav).toBeInTheDocument();
    expect(header).toBeInTheDocument();
    expect(footer).toBeInTheDocument();
  });

  it('should provide accessible names for interactive elements', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('button', { 
          key: 'btn1',
          'aria-label': 'Close dialog' 
        }, '×'),
        React.createElement('button', { 
          key: 'btn2' 
        }, 'Clear Label'),
        React.createElement('input', { 
          key: 'input',
          type: 'text',
          'aria-label': 'Search' 
        }),
        React.createElement('img', { 
          key: 'img',
          src: 'test.jpg',
          alt: 'Test image' 
        })
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check accessible names
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-label', 'Search');
    
    const img = screen.getByAltText('Test image');
    expect(img).toBeInTheDocument();
  });

  it('should handle form validation accessibly', async () => {
    const { container } = render(
      React.createElement('form', {}, [
        React.createElement('label', { 
          key: 'label',
          htmlFor: 'email' 
        }, 'Email Address'),
        React.createElement('input', { 
          key: 'input',
          id: 'email',
          type: 'email',
          'aria-invalid': 'true',
          'aria-describedby': 'error-msg',
          required: true 
        }),
        React.createElement('div', { 
          key: 'error',
          id: 'error-msg',
          role: 'alert' 
        }, 'Please enter a valid email'),
        React.createElement('button', { 
          key: 'submit',
          type: 'submit' 
        }, 'Submit')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check form structure
    const form = container.querySelector('form');
    expect(form).toBeInTheDocument();
    
    const input = screen.getByLabelText('Email Address');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    
    const error = screen.getByRole('alert');
    expect(error).toBeInTheDocument();
  });

  it('should support keyboard navigation', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('label', { 
          key: 'label',
          htmlFor: 'test-input' 
        }, 'Test Input'),
        React.createElement('input', { 
          key: 'input',
          id: 'test-input',
          type: 'text' 
        }),
        React.createElement('button', { key: 'btn1' }, 'Button 1'),
        React.createElement('button', { key: 'btn2' }, 'Button 2')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check focusable elements
    const focusableElements = container.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    expect(focusableElements.length).toBeGreaterThan(0);
  });

  it('should announce dynamic content', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('div', { 
          key: 'status',
          role: 'status',
          'aria-live': 'polite' 
        }, 'Status: Ready'),
        React.createElement('div', { 
          key: 'alert',
          role: 'alert',
          'aria-live': 'assertive' 
        }, 'Important message')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check live regions
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('should handle modal dialogs accessibly', async () => {
    const { container } = render(
      React.createElement('div', { 
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'modal-title'
      }, [
        React.createElement('h2', { 
          key: 'title',
          id: 'modal-title' 
        }, 'Modal Title'),
        React.createElement('p', { key: 'content' }, 'Modal content'),
        React.createElement('button', { 
          key: 'close',
          'aria-label': 'Close modal' 
        }, '×')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check modal attributes
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-labelledby', 'modal-title');
    
    const title = screen.getByText('Modal Title');
    expect(title).toBeInTheDocument();
  });

  it('should support table accessibility', async () => {
    const { container } = render(
      React.createElement('table', {}, [
        React.createElement('caption', { key: 'caption' }, 'User Data'),
        React.createElement('thead', { key: 'thead' }, 
          React.createElement('tr', {}, [
            React.createElement('th', { 
              key: 'th1',
              scope: 'col' 
            }, 'Name'),
            React.createElement('th', { 
              key: 'th2',
              scope: 'col' 
            }, 'Email')
          ])
        ),
        React.createElement('tbody', { key: 'tbody' }, 
          React.createElement('tr', {}, [
            React.createElement('td', { key: 'td1' }, 'John Doe'),
            React.createElement('td', { key: 'td2' }, 'john@example.com')
          ])
        )
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check table structure
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    
    const caption = table.querySelector('caption');
    expect(caption).toBeInTheDocument();
    
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    
    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(2);
  });

  it('should handle list accessibility', async () => {
    const { container } = render(
      React.createElement('ul', {}, [
        React.createElement('li', { key: 'li1' }, 'Item 1'),
        React.createElement('li', { key: 'li2' }, 'Item 2'),
        React.createElement('li', { key: 'li3' }, 'Item 3')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check list structure
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('should handle color contrast requirements', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('p', { 
          key: 'p1',
          style: { color: '#000000', backgroundColor: '#ffffff' } 
        }, 'Normal text'),
        React.createElement('button', { 
          key: 'btn',
          style: { color: '#ffffff', backgroundColor: '#3178c6' } 
        }, 'Button')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should handle skip links', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('a', { 
          key: 'skip',
          href: '#main',
          className: 'skip-link' 
        }, 'Skip to main content'),
        React.createElement('main', { 
          key: 'main',
          id: 'main' 
        }, 'Main content')
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check skip link
    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink).toHaveAttribute('href', '#main');
    
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
  });

  it('should handle ARIA expanded states', async () => {
    const { container } = render(
      React.createElement('div', {}, [
        React.createElement('button', { 
          key: 'btn',
          'aria-expanded': 'true',
          'aria-controls': 'menu' 
        }, 'Toggle Menu'),
        React.createElement('ul', { 
          key: 'menu',
          id: 'menu',
          role: 'menu' 
        }, [
          React.createElement('li', { 
            key: 'item1',
            role: 'menuitem' 
          }, 'Menu Item 1'),
          React.createElement('li', { 
            key: 'item2',
            role: 'menuitem' 
          }, 'Menu Item 2')
        ])
      ])
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check ARIA attributes
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'menu');
    
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('id', 'menu');
  });
});
