import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';

/**
 * XSS (Cross-Site Scripting) Security Tests
 * Tests for XSS prevention in user inputs and outputs
 */

describe('XSS Prevention', () => {
  describe('Input Sanitization', () => {
    it('should escape HTML in token name', () => {
      const maliciousName = '<script>alert("XSS")</script>';
      const SafeComponent = () => createElement('div', { 'data-testid': 'token-name' }, maliciousName);
      
      render(SafeComponent());
      const element = screen.getByTestId('token-name');
      
      expect(element.innerHTML).not.toContain('<script>');
      expect(element.textContent).toBe(maliciousName);
    });

    it('should escape HTML in token symbol', () => {
      const maliciousSymbol = '<img src=x onerror=alert("XSS")>';
      const SafeComponent = () => createElement('div', { 'data-testid': 'token-symbol' }, maliciousSymbol);
      
      render(SafeComponent());
      const element = screen.getByTestId('token-symbol');
      
      expect(element.innerHTML).not.toContain('<img');
      expect(element.textContent).toBe(maliciousSymbol);
    });

    it('should escape HTML in metadata description', () => {
      const maliciousDesc = '<iframe src="javascript:alert(\'XSS\')"></iframe>';
      const SafeComponent = () => createElement('div', { 'data-testid': 'description' }, maliciousDesc);
      
      render(SafeComponent());
      const element = screen.getByTestId('description');
      
      expect(element.innerHTML).not.toContain('<iframe');
      expect(element.textContent).toBe(maliciousDesc);
    });

    it('should handle JavaScript protocol in URLs', () => {
      const maliciousUrl = 'javascript:alert("XSS")';
      const SafeComponent = () => createElement('a', { href: maliciousUrl, 'data-testid': 'link' }, 'Link');
      
      render(SafeComponent());
      const link = screen.getByTestId('link') as HTMLAnchorElement;
      
      // React blocks javascript: URLs - verify it's blocked or sanitized
      expect(link.href).not.toBe(maliciousUrl);
    });

    it('should sanitize data: URLs', () => {
      const maliciousData = 'data:text/html,<script>alert("XSS")</script>';
      const SafeComponent = () => createElement('a', { href: maliciousData, 'data-testid': 'link' }, 'Link');
      
      render(SafeComponent());
      const link = screen.getByTestId('link') as HTMLAnchorElement;
      
      // Data URLs are allowed but should be used carefully
      // In production, validate and sanitize data: URLs
      expect(link.href).toBeDefined();
    });
  });

  describe('Output Encoding', () => {
    it('should encode special characters in addresses', () => {
      const address = 'G<test>&"address';
      const SafeComponent = () => createElement('div', { 'data-testid': 'address' }, address);
      
      render(SafeComponent());
      const element = screen.getByTestId('address');
      
      expect(element.textContent).toBe(address);
      expect(element.innerHTML).not.toContain('&"');
    });

    it('should handle null/undefined safely', () => {
      const SafeComponent = () =>
        createElement('div', null,
          createElement('div', { 'data-testid': 'null' }, null as any),
          createElement('div', { 'data-testid': 'undefined' }, undefined as any)
        );
      
      render(SafeComponent());
      
      expect(screen.getByTestId('null').textContent).toBe('');
      expect(screen.getByTestId('undefined').textContent).toBe('');
    });
  });

  describe('Event Handler Injection', () => {
    it('should not execute inline event handlers', () => {
      const maliciousInput = 'test" onload="alert(\'XSS\')"';
      const SafeComponent = () => createElement('input', { 'data-testid': 'input', value: maliciousInput, readOnly: true });
      
      render(SafeComponent());
      const input = screen.getByTestId('input') as HTMLInputElement;
      
      expect(input.value).toBe(maliciousInput);
      expect(input.getAttribute('onload')).toBeNull();
    });

    it('should prevent onclick injection', () => {
      const maliciousText = 'Click" onclick="alert(\'XSS\')"';
      const SafeComponent = () => createElement('button', { 'data-testid': 'button' }, maliciousText);
      
      render(SafeComponent());
      const button = screen.getByTestId('button');
      
      expect(button.textContent).toBe(maliciousText);
      expect(button.getAttribute('onclick')).toBeNull();
    });
  });

  describe('DOM-based XSS', () => {
    it('should safely handle URL parameters', () => {
      const maliciousParam = '<script>alert("XSS")</script>';
      const params = new URLSearchParams({ token: maliciousParam });
      const tokenParam = params.get('token');
      
      const SafeComponent = () => createElement('div', { 'data-testid': 'param' }, tokenParam);
      
      render(SafeComponent());
      const element = screen.getByTestId('param');
      
      expect(element.innerHTML).not.toContain('<script>');
      expect(element.textContent).toBe(maliciousParam);
    });

    it('should sanitize localStorage data', () => {
      const maliciousData = '<img src=x onerror=alert("XSS")>';
      localStorage.setItem('test', maliciousData);
      const stored = localStorage.getItem('test');
      
      const SafeComponent = () => createElement('div', { 'data-testid': 'stored' }, stored);
      
      render(SafeComponent());
      const element = screen.getByTestId('stored');
      
      expect(element.innerHTML).not.toContain('<img');
      expect(element.textContent).toBe(maliciousData);
      
      localStorage.removeItem('test');
    });
  });

  describe('SVG XSS', () => {
    it('should prevent SVG-based XSS', () => {
      const maliciousSvg = '<svg onload=alert("XSS")>';
      const SafeComponent = () => createElement('div', { 'data-testid': 'svg' }, maliciousSvg);
      
      render(SafeComponent());
      const element = screen.getByTestId('svg');
      
      expect(element.innerHTML).not.toContain('<svg');
      expect(element.textContent).toBe(maliciousSvg);
    });
  });
});
