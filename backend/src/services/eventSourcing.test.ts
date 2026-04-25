import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventSourcingService,
  InMemoryEventStore,
  DomainEvent,
} from './eventSourcing';

describe('EventSourcingService', () => {
  let service: EventSourcingService;
  let eventStore: InMemoryEventStore;

  beforeEach(() => {
    eventStore = new InMemoryEventStore();
    service = new EventSourcingService(eventStore);
  });

  it('should publish events', async () => {
    await service.publishEvent('agg-1', 'UserCreated', {
      name: 'John',
      email: 'john@example.com',
    });

    const history = await service.getAggregateHistory('agg-1');
    expect(history).toHaveLength(1);
    expect(history[0].type).toBe('UserCreated');
  });

  it('should maintain event version', async () => {
    await service.publishEvent('agg-1', 'Event1', {});
    await service.publishEvent('agg-1', 'Event2', {});
    await service.publishEvent('agg-1', 'Event3', {});

    const history = await service.getAggregateHistory('agg-1');
    expect(history[0].version).toBe(1);
    expect(history[1].version).toBe(2);
    expect(history[2].version).toBe(3);
  });

  it('should record audit trail', async () => {
    await service.publishEvent('agg-1', 'UserCreated', { name: 'John' }, {
      actor: 'admin',
    });

    const trail = await service.getAuditTrail();
    expect(trail).toHaveLength(1);
    expect(trail[0].eventType).toBe('UserCreated');
    expect(trail[0].actor).toBe('admin');
  });

  it('should filter audit trail by aggregate', async () => {
    await service.publishEvent('agg-1', 'Event1', {});
    await service.publishEvent('agg-2', 'Event2', {});

    const trail = await service.getAuditTrail('agg-1');
    expect(trail).toHaveLength(1);
    expect(trail[0].aggregateId).toBe('agg-1');
  });

  it('should filter audit trail by timestamp', async () => {
    const before = Date.now();
    await service.publishEvent('agg-1', 'Event1', {});
    const after = Date.now();

    const trail = await service.getAuditTrail(undefined, before);
    expect(trail.length).toBeGreaterThan(0);
  });

  it('should handle event subscriptions', async () => {
    const handler = vi.fn();
    service.subscribe('UserCreated', handler);

    await service.publishEvent('agg-1', 'UserCreated', { name: 'John' });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UserCreated',
    }));
  });

  it('should handle multiple subscribers', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    service.subscribe('UserCreated', handler1);
    service.subscribe('UserCreated', handler2);

    await service.publishEvent('agg-1', 'UserCreated', {});

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('should handle subscriber errors gracefully', async () => {
    const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
    const successHandler = vi.fn();

    service.subscribe('Event', errorHandler);
    service.subscribe('Event', successHandler);

    await service.publishEvent('agg-1', 'Event', {});

    expect(errorHandler).toHaveBeenCalled();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should get aggregate history', async () => {
    await service.publishEvent('agg-1', 'Event1', { value: 1 });
    await service.publishEvent('agg-1', 'Event2', { value: 2 });

    const history = await service.getAggregateHistory('agg-1');
    expect(history).toHaveLength(2);
    expect(history[0].data.value).toBe(1);
    expect(history[1].data.value).toBe(2);
  });

  it('should clear audit trail', async () => {
    await service.publishEvent('agg-1', 'Event1', {});
    service.clearAuditTrail();

    const trail = await service.getAuditTrail();
    expect(trail).toHaveLength(0);
  });

  it('should include metadata in events', async () => {
    const metadata = { actor: 'user123', source: 'api' };
    await service.publishEvent('agg-1', 'Event', {}, metadata);

    const history = await service.getAggregateHistory('agg-1');
    expect(history[0].metadata).toEqual(metadata);
  });

  it('should handle concurrent events', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      service.publishEvent(`agg-${i}`, 'Event', { index: i })
    );

    await Promise.all(promises);

    for (let i = 0; i < 10; i++) {
      const history = await service.getAggregateHistory(`agg-${i}`);
      expect(history).toHaveLength(1);
    }
  });
});

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  it('should append events', async () => {
    const event: DomainEvent = {
      id: '1',
      aggregateId: 'agg-1',
      type: 'Test',
      timestamp: Date.now(),
      version: 1,
      data: {},
    };

    await store.append(event);
    const events = await store.getEvents('agg-1');

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('1');
  });

  it('should get events from version', async () => {
    for (let i = 1; i <= 5; i++) {
      await store.append({
        id: String(i),
        aggregateId: 'agg-1',
        type: 'Event',
        timestamp: Date.now(),
        version: i,
        data: {},
      });
    }

    const events = await store.getEvents('agg-1', 3);
    expect(events).toHaveLength(3);
    expect(events[0].version).toBe(3);
  });

  it('should get all events', async () => {
    await store.append({
      id: '1',
      aggregateId: 'agg-1',
      type: 'Event',
      timestamp: Date.now(),
      version: 1,
      data: {},
    });

    const events = await store.getAllEvents();
    expect(events.length).toBeGreaterThan(0);
  });
});
