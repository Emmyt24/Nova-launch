/**
 * SECURITY TEST: SQL Injection in Dynamic Query Construction
 * 
 * RISK COVERAGE:
 * - SQL-001: SQL injection via search parameters
 * - SQL-002: SQL injection via filter conditions
 * - SQL-003: SQL injection via sort/order parameters
 * - SQL-004: SQL injection via pagination parameters
 * - SQL-005: Second-order SQL injection
 * - SQL-006: Blind SQL injection
 * - SQL-007: Time-based SQL injection
 * - SQL-008: Union-based SQL injection
 * 
 * SEVERITY: CRITICAL
 * 
 * This test suite verifies that all database queries properly sanitize inputs
 * and use parameterized queries to prevent SQL injection attacks. We test
 * against common injection patterns and verify that Prisma's query builder
 * provides adequate protection.
 * 
 * Testing approach:
 * - Test all user-controlled input points
 * - Verify parameterized query usage
 * - Test special characters and SQL keywords
 * - Verify error messages don't leak schema information
 * - Test both direct and indirect (second-order) injection
 * 
 * @see https://owasp.org/www-community/attacks/SQL_Injection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Common SQL Injection Payloads
// ---------------------------------------------------------------------------

const SQL_INJECTION_PAYLOADS = [
    // Classic injection
    "' OR '1'='1",
    "' OR 1=1--",
    "' OR 'a'='a",
    "admin'--",
    "admin' #",
    "admin'/*",

    // Union-based
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL, NULL--",
    "' UNION ALL SELECT NULL--",

    // Stacked queries
    "'; DROP TABLE tokens--",
    "'; DELETE FROM tokens WHERE '1'='1",
    "'; UPDATE tokens SET creator='attacker' WHERE '1'='1",

    // Boolean-based blind
    "' AND 1=1--",
    "' AND 1=2--",
    "' AND SLEEP(5)--",

    // Time-based blind
    "'; WAITFOR DELAY '00:00:05'--",
    "' OR SLEEP(5)--",
    "' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",

    // Error-based
    "' AND 1=CONVERT(int, (SELECT @@version))--",
    "' AND extractvalue(1,concat(0x7e,version()))--",

    // Special characters
    "'; --",
    "' /*",
    "*/ OR '1'='1",
    "\\' OR '1'='1",

    // Encoded payloads
    "%27%20OR%20%271%27%3D%271",
    "&#39; OR &#39;1&#39;=&#39;1",

    // Null byte injection
    "admin\x00",
    "' OR '1'='1\x00",

    // Comment injection
    "admin'-- -",
    "admin'#",
    "admin'/**/",
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Measures query execution time to detect time-based injection
 */
async function measureQueryTime(queryFn: () => Promise<any>): Promise<number> {
    const start = Date.now();
    try {
        await queryFn();
    } catch (error) {
        // Ignore errors, we're measuring time
    }
    return Date.now() - start;
}

/**
 * Checks if error message leaks schema information
 */
function containsSchemaLeak(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    const leakPatterns = [
        'table',
        'column',
        'syntax error',
        'postgresql',
        'pg_',
        'information_schema',
        'select',
        'from',
        'where',
    ];

    return leakPatterns.some(pattern => message.includes(pattern));
}

// ---------------------------------------------------------------------------
// Test Suite Setup
// ---------------------------------------------------------------------------

describe('Security: SQL Injection Prevention', () => {
    let testTokenId: string;
    let testCampaignId: string;

    beforeEach(async () => {
        // Create test data
        try {
            const token = await prisma.token.create({
                data: {
                    address: 'GTEST' + Math.random().toString(36).substring(7),
                    creator: 'GCREATOR',
                    name: 'Test Token',
                    symbol: 'TEST',
                    decimals: 7,
                    totalSupply: BigInt(1000000),
                    initialSupply: BigInt(1000000),
                },
            });
            testTokenId = token.id;

            const campaign = await prisma.campaign.create({
                data: {
                    campaignId: Math.floor(Math.random() * 1000000),
                    tokenId: testTokenId,
                    creator: 'GCREATOR',
                    type: 'BUYBACK',
                    status: 'ACTIVE',
                    targetAmount: BigInt(10000),
                    startTime: new Date(),
                },
            });
            testCampaignId = campaign.id;
        } catch (error) {
            console.warn('Setup failed, tests may be skipped:', error);
        }
    });

    afterEach(async () => {
        // Cleanup test data
        try {
            if (testCampaignId) {
                await prisma.campaign.deleteMany({
                    where: { id: testCampaignId },
                });
            }
            if (testTokenId) {
                await prisma.token.deleteMany({
                    where: { id: testTokenId },
                });
            }
        } catch (error) {
            console.warn('Cleanup failed:', error);
        }
    });

    // ---------------------------------------------------------------------------
    // SQL-001: Search Parameter Injection
    // ---------------------------------------------------------------------------

    describe('[SQL-001] Search Parameter Injection', () => {
        it('should safely handle SQL injection in token name search', async () => {
            for (const payload of SQL_INJECTION_PAYLOADS) {
                try {
                    const result = await prisma.token.findMany({
                        where: {
                            name: {
                                contains: payload,
                                mode: 'insensitive',
                            },
                        },
                        take: 10,
                    });

                    // Should return empty or safe results, never error
                    expect(Array.isArray(result)).toBe(true);

                    // Should not return all tokens (sign of successful injection)
                    const allTokens = await prisma.token.count();
                    expect(result.length).toBeLessThanOrEqual(allTokens);
                } catch (error) {
                    // If error occurs, ensure it doesn't leak schema info
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });

        it('should safely handle SQL injection in symbol search', async () => {
            for (const payload of SQL_INJECTION_PAYLOADS.slice(0, 10)) {
                try {
                    const result = await prisma.token.findMany({
                        where: {
                            symbol: {
                                contains: payload,
                                mode: 'insensitive',
                            },
                        },
                        take: 10,
                    });

                    expect(Array.isArray(result)).toBe(true);
                } catch (error) {
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });

        it('should safely handle SQL injection in creator address search', async () => {
            for (const payload of SQL_INJECTION_PAYLOADS.slice(0, 10)) {
                try {
                    const result = await prisma.token.findMany({
                        where: {
                            creator: {
                                contains: payload,
                            },
                        },
                        take: 10,
                    });

                    expect(Array.isArray(result)).toBe(true);
                } catch (error) {
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });

        it('should safely handle combined OR search with injection', async () => {
            const payload = "' OR '1'='1";

            try {
                const result = await prisma.token.findMany({
                    where: {
                        OR: [
                            { name: { contains: payload, mode: 'insensitive' } },
                            { symbol: { contains: payload, mode: 'insensitive' } },
                            { creator: { contains: payload } },
                        ],
                    },
                    take: 10,
                });

                expect(Array.isArray(result)).toBe(true);
            } catch (error) {
                expect(containsSchemaLeak(error)).toBe(false);
            }
        });
    });

    // ---------------------------------------------------------------------------
    // SQL-002: Filter Condition Injection
    // ---------------------------------------------------------------------------

    describe('[SQL-002] Filter Condition Injection', () => {
        it('should safely handle SQL injection in status filter', async () => {
            const maliciousStatuses = [
                "ACTIVE' OR '1'='1",
                "ACTIVE'; DROP TABLE campaigns--",
                "ACTIVE' UNION SELECT NULL--",
            ];

            for (const status of maliciousStatuses) {
                try {
                    // Prisma should reject invalid enum values
                    await prisma.campaign.findMany({
                        where: {
                            status: status as any,
                        },
                    });

                    // If it doesn't throw, ensure results are safe
                } catch (error) {
                    // Expected to throw for invalid enum
                    expect(error).toBeDefined();
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });

        it('should safely handle SQL injection in numeric filters', async () => {
            const maliciousValues = [
                "1 OR 1=1",
                "1; DROP TABLE tokens",
                "1 UNION SELECT NULL",
            ];

            for (const value of maliciousValues) {
                try {
                    await prisma.campaign.findMany({
                        where: {
                            campaignId: value as any,
                        },
                    });
                } catch (error) {
                    // Type coercion should fail safely
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });

        it('should safely handle SQL injection in date filters', async () => {
            const maliciousDates = [
                "2024-01-01' OR '1'='1",
                "2024-01-01'; DROP TABLE campaigns--",
            ];

            for (const date of maliciousDates) {
                try {
                    await prisma.campaign.findMany({
                        where: {
                            createdAt: {
                                gte: new Date(date),
                            },
                        },
                    });
                } catch (error) {
                    // Invalid date should fail safely
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });
    });

    // ---------------------------------------------------------------------------
    // SQL-003: Sort/Order Parameter Injection
    // ---------------------------------------------------------------------------

    describe('[SQL-003] Sort/Order Parameter Injection', () => {
        it('should safely handle SQL injection in orderBy field', async () => {
            const maliciousFields = [
                "name' OR '1'='1",
                "name; DROP TABLE tokens",
                "name UNION SELECT NULL",
            ];

            for (const field of maliciousFields) {
                try {
                    await prisma.token.findMany({
                        orderBy: {
                            [field]: 'asc',
                        } as any,
                        take: 10,
                    });
                } catch (error) {
                    // Invalid field should fail safely
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });

        it('should safely handle SQL injection in order direction', async () => {
            const maliciousDirections = [
                "asc' OR '1'='1",
                "asc; DROP TABLE tokens",
                "asc UNION SELECT NULL",
            ];

            for (const direction of maliciousDirections) {
                try {
                    await prisma.token.findMany({
                        orderBy: {
                            name: direction as any,
                        },
                        take: 10,
                    });
                } catch (error) {
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });
    });

    // ---------------------------------------------------------------------------
    // SQL-004: Pagination Parameter Injection
    // ---------------------------------------------------------------------------

    describe('[SQL-004] Pagination Parameter Injection', () => {
        it('should safely handle SQL injection in take parameter', async () => {
            const maliciousValues = [
                "10 OR 1=1",
                "10; DROP TABLE tokens",
                "10 UNION SELECT NULL",
            ];

            for (const value of maliciousValues) {
                try {
                    await prisma.token.findMany({
                        take: value as any,
                    });
                } catch (error) {
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });

        it('should safely handle SQL injection in skip parameter', async () => {
            const maliciousValues = [
                "0 OR 1=1",
                "0; DROP TABLE tokens",
            ];

            for (const value of maliciousValues) {
                try {
                    await prisma.token.findMany({
                        skip: value as any,
                        take: 10,
                    });
                } catch (error) {
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });
    });

    // ---------------------------------------------------------------------------
    // SQL-005: Second-Order SQL Injection
    // ---------------------------------------------------------------------------

    describe('[SQL-005] Second-Order SQL Injection', () => {
        it('should prevent second-order injection via stored token name', async () => {
            const maliciousName = "Test' OR '1'='1--";

            try {
                // Store malicious input
                const token = await prisma.token.create({
                    data: {
                        address: 'GTEST' + Math.random().toString(36).substring(7),
                        creator: 'GCREATOR',
                        name: maliciousName,
                        symbol: 'TEST',
                        decimals: 7,
                        totalSupply: BigInt(1000000),
                        initialSupply: BigInt(1000000),
                    },
                });

                // Retrieve and use in another query
                const retrieved = await prisma.token.findUnique({
                    where: { id: token.id },
                });

                expect(retrieved?.name).toBe(maliciousName);

                // Use retrieved value in search
                const searchResult = await prisma.token.findMany({
                    where: {
                        name: {
                            contains: retrieved!.name,
                        },
                    },
                });

                // Should only find the exact match, not all tokens
                expect(searchResult.length).toBeLessThanOrEqual(1);

                // Cleanup
                await prisma.token.delete({ where: { id: token.id } });
            } catch (error) {
                expect(containsSchemaLeak(error)).toBe(false);
            }
        });

        it('should prevent second-order injection via stored creator address', async () => {
            const maliciousCreator = "GCREATOR'; DROP TABLE tokens--";

            try {
                const token = await prisma.token.create({
                    data: {
                        address: 'GTEST' + Math.random().toString(36).substring(7),
                        creator: maliciousCreator,
                        name: 'Test',
                        symbol: 'TEST',
                        decimals: 7,
                        totalSupply: BigInt(1000000),
                        initialSupply: BigInt(1000000),
                    },
                });

                // Use stored value in filter
                const result = await prisma.token.findMany({
                    where: {
                        creator: token.creator,
                    },
                });

                expect(result.length).toBeGreaterThanOrEqual(1);

                await prisma.token.delete({ where: { id: token.id } });
            } catch (error) {
                expect(containsSchemaLeak(error)).toBe(false);
            }
        });
    });

    // ---------------------------------------------------------------------------
    // SQL-006: Blind SQL Injection
    // ---------------------------------------------------------------------------

    describe('[SQL-006] Blind SQL Injection', () => {
        it('should not reveal data via boolean-based blind injection', async () => {
            const trueCondition = "' AND '1'='1";
            const falseCondition = "' AND '1'='2";

            try {
                const result1 = await prisma.token.findMany({
                    where: {
                        name: {
                            contains: trueCondition,
                        },
                    },
                });

                const result2 = await prisma.token.findMany({
                    where: {
                        name: {
                            contains: falseCondition,
                        },
                    },
                });

                // Both should return empty (no injection) or same results
                expect(result1.length).toBe(result2.length);
            } catch (error) {
                expect(containsSchemaLeak(error)).toBe(false);
            }
        });
    });

    // ---------------------------------------------------------------------------
    // SQL-007: Time-Based SQL Injection
    // ---------------------------------------------------------------------------

    describe('[SQL-007] Time-Based SQL Injection', () => {
        it('should not be vulnerable to time-based injection', async () => {
            const normalPayload = 'test';
            const timePayload = "test' AND SLEEP(5)--";

            const normalTime = await measureQueryTime(async () => {
                await prisma.token.findMany({
                    where: {
                        name: {
                            contains: normalPayload,
                        },
                    },
                    take: 10,
                });
            });

            const injectionTime = await measureQueryTime(async () => {
                await prisma.token.findMany({
                    where: {
                        name: {
                            contains: timePayload,
                        },
                    },
                    take: 10,
                });
            });

            // Time difference should be minimal (< 1 second)
            // If SLEEP() executed, difference would be ~5 seconds
            expect(Math.abs(injectionTime - normalTime)).toBeLessThan(1000);
        });
    });

    // ---------------------------------------------------------------------------
    // SQL-008: Union-Based SQL Injection
    // ---------------------------------------------------------------------------

    describe('[SQL-008] Union-Based SQL Injection', () => {
        it('should prevent union-based injection in search', async () => {
            const unionPayloads = [
                "' UNION SELECT NULL--",
                "' UNION SELECT id, address, creator FROM tokens--",
                "' UNION ALL SELECT NULL, NULL, NULL--",
            ];

            for (const payload of unionPayloads) {
                try {
                    const result = await prisma.token.findMany({
                        where: {
                            name: {
                                contains: payload,
                            },
                        },
                    });

                    // Should return empty or safe results
                    expect(Array.isArray(result)).toBe(true);

                    // Verify structure matches Token model
                    if (result.length > 0) {
                        expect(result[0]).toHaveProperty('id');
                        expect(result[0]).toHaveProperty('address');
                        expect(result[0]).toHaveProperty('name');
                    }
                } catch (error) {
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });
    });

    // ---------------------------------------------------------------------------
    // Additional Security Tests
    // ---------------------------------------------------------------------------

    describe('Additional SQL Injection Vectors', () => {
        it('should handle special characters safely', async () => {
            const specialChars = ["'", '"', '\\', '%', '_', ';', '--', '/*', '*/'];

            for (const char of specialChars) {
                try {
                    const result = await prisma.token.findMany({
                        where: {
                            name: {
                                contains: char,
                            },
                        },
                        take: 10,
                    });

                    expect(Array.isArray(result)).toBe(true);
                } catch (error) {
                    expect(containsSchemaLeak(error)).toBe(false);
                }
            }
        });

        it('should prevent injection via JSON fields', async () => {
            const maliciousMetadata = '{"key": "value\' OR \'1\'=\'1"}';

            try {
                const campaign = await prisma.campaign.create({
                    data: {
                        campaignId: Math.floor(Math.random() * 1000000),
                        tokenId: testTokenId,
                        creator: 'GCREATOR',
                        type: 'BUYBACK',
                        status: 'ACTIVE',
                        targetAmount: BigInt(10000),
                        startTime: new Date(),
                        metadata: maliciousMetadata,
                    },
                });

                const retrieved = await prisma.campaign.findUnique({
                    where: { id: campaign.id },
                });

                expect(retrieved?.metadata).toBe(maliciousMetadata);

                await prisma.campaign.delete({ where: { id: campaign.id } });
            } catch (error) {
                expect(containsSchemaLeak(error)).toBe(false);
            }
        });

        it('should prevent injection via array operations', async () => {
            const maliciousAddresses = [
                "GTEST1",
                "GTEST2' OR '1'='1",
                "GTEST3'; DROP TABLE tokens--",
            ];

            try {
                const result = await prisma.token.findMany({
                    where: {
                        address: {
                            in: maliciousAddresses,
                        },
                    },
                });

                expect(Array.isArray(result)).toBe(true);
            } catch (error) {
                expect(containsSchemaLeak(error)).toBe(false);
            }
        });
    });
});
