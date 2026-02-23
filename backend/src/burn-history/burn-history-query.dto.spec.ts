import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BurnHistoryQueryDto, BurnType, SortBy, SortOrder } from './dto/burn-history-query.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(BurnHistoryQueryDto, plain);
  return validate(dto);
}

describe('BurnHistoryQueryDto', () => {
  it('should pass validation with no params (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid tokenAddress', async () => {
    const errors = await validateDto({ tokenAddress: '0xabc123' });
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid type values', async () => {
    for (const type of [BurnType.ALL, BurnType.SELF, BurnType.ADMIN]) {
      const errors = await validateDto({ type });
      expect(errors).toHaveLength(0);
    }
  });

  it('should fail with invalid type', async () => {
    const errors = await validateDto({ type: 'invalid' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('should pass with valid ISO date strings', async () => {
    const errors = await validateDto({
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-12-31T23:59:59Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('should fail with invalid date format', async () => {
    const errors = await validateDto({ startDate: 'not-a-date' });
    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('should pass with valid page and limit', async () => {
    const errors = await validateDto({ page: '2', limit: '20' });
    expect(errors).toHaveLength(0);
  });

  it('should fail with page < 1', async () => {
    const errors = await validateDto({ page: '0' });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('should fail with limit > 100', async () => {
    const errors = await validateDto({ limit: '101' });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('should fail with limit < 1', async () => {
    const errors = await validateDto({ limit: '0' });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('should pass with valid sortBy values', async () => {
    for (const sortBy of [SortBy.TIMESTAMP, SortBy.AMOUNT, SortBy.FROM]) {
      const errors = await validateDto({ sortBy });
      expect(errors).toHaveLength(0);
    }
  });

  it('should fail with invalid sortBy', async () => {
    const errors = await validateDto({ sortBy: 'invalid' });
    expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
  });

  it('should pass with valid sortOrder values', async () => {
    for (const sortOrder of [SortOrder.ASC, SortOrder.DESC]) {
      const errors = await validateDto({ sortOrder });
      expect(errors).toHaveLength(0);
    }
  });

  it('should fail with invalid sortOrder', async () => {
    const errors = await validateDto({ sortOrder: 'random' });
    expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
  });

  it('should transform page and limit to numbers via @Type', async () => {
    const dto = plainToInstance(BurnHistoryQueryDto, { page: '3', limit: '25' });
    expect(typeof dto.page).toBe('number');
    expect(typeof dto.limit).toBe('number');
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(25);
  });

  it('should pass full valid query', async () => {
    const errors = await validateDto({
      tokenAddress: '0xAbcDef1234567890',
      type: BurnType.ADMIN,
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-06-30T23:59:59.999Z',
      page: '1',
      limit: '50',
      sortBy: SortBy.AMOUNT,
      sortOrder: SortOrder.ASC,
    });
    expect(errors).toHaveLength(0);
  });
});
