import { describe, it, expect } from 'vitest';
import {
    formatXLM,
    formatNumber,
    truncateAddress,
    formatDate,
    stroopsToXLM,
    xlmToStroops,
} from '../formatting';
import { formatFileSize } from '../validation';

describe('formatting utilities', () => {
    describe('formatXLM', () => {
        it('should format XLM amounts correctly', () => {
            expect(formatXLM(10)).toBe('10.00');
            expect(formatXLM(10.123456789)).toBe('10.1234568');
            expect(formatXLM('5.5')).toBe('5.50');
        });
    });

    describe('formatNumber', () => {
        it('should format numbers with commas', () => {
            expect(formatNumber(1000)).toBe('1,000');
            expect(formatNumber(1000000)).toBe('1,000,000');
            expect(formatNumber('5000')).toBe('5,000');
        });
    });

    describe('truncateAddress', () => {
        it('should truncate long addresses', () => {
            const address = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
            expect(truncateAddress(address)).toBe('GXXXXX...XXXX');
            expect(truncateAddress(address, 4, 4)).toBe('GXXX...XXXX');
        });

        it('should not truncate short addresses', () => {
            const address = 'GXXXXX';
            expect(truncateAddress(address)).toBe('GXXXXX');
        });
    });

    describe('formatDate', () => {
        it('should format timestamps to readable dates', () => {
            const timestamp = new Date('2024-01-15T10:30:00').getTime();
            const formatted = formatDate(timestamp);
            expect(formatted).toContain('Jan');
            expect(formatted).toContain('15');
            expect(formatted).toContain('2024');
        });
    });

    describe('stroopsToXLM', () => {
        it('should convert stroops to XLM', () => {
            expect(stroopsToXLM(10_000_000)).toBe(1);
            expect(stroopsToXLM(70_000_000)).toBe(7);
            expect(stroopsToXLM('50000000')).toBe(5);
        });
    });

    describe('xlmToStroops', () => {
        it('should convert XLM to stroops', () => {
            expect(xlmToStroops(1)).toBe(10_000_000);
            expect(xlmToStroops(7)).toBe(70_000_000);
            expect(xlmToStroops('5')).toBe(50_000_000);
        });
    });

    describe('formatFileSize', () => {
        it('should format file sizes correctly', () => {
            expect(formatFileSize(500)).toBe('500 Bytes');
            expect(formatFileSize(1024)).toBe('1 KB');
            expect(formatFileSize(1024 * 1024)).toBe('1 MB');
            expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
        });
    });
});
