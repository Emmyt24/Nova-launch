export interface DomainEvent {
  id: string;
  aggregateId: string;
  type: string;
  timestamp: number;
  version: number;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface EventStore {
  append(event: DomainEvent): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getAllEvents(fromTimestamp?: number): Promise<DomainEvent[]>;
}

export interface AuditTrail {
  eventId: string;
  aggregateId: string;
  eventType: string;
  timestamp: string;
  actor?: string;
  changes: Record<string, any>;
}

export class InMemoryEventStore implements EventStore {
  private events: Map<string, DomainEvent[]> = new Map();
  private allEvents: DomainEvent[] = [];

  async append(event: DomainEvent): Promise<void> {
    if (!this.events.has(event.aggregateId)) {
      this.events.set(event.aggregateId, []);
    }

    this.events.get(event.aggregateId)!.push(event);
    this.allEvents.push(event);
  }

  async getEvents(
    aggregateId: string,
    fromVersion?: number
  ): Promise<DomainEvent[]> {
    const events = this.events.get(aggregateId) || [];
    if (!fromVersion) return events;
    return events.filter(e => e.version >= fromVersion);
  }

  async getAllEvents(fromTimestamp?: number): Promise<DomainEvent[]> {
    if (!fromTimestamp) return this.allEvents;
    return this.allEvents.filter(e => e.timestamp >= fromTimestamp);
  }
}

export class EventSourcingService {
  private eventStore: EventStore;
  private auditTrail: AuditTrail[] = [];
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(eventStore?: EventStore) {
    this.eventStore = eventStore || new InMemoryEventStore();
  }

  async publishEvent(
    aggregateId: string,
    eventType: string,
    data: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<void> {
    const event: DomainEvent = {
      id: this.generateEventId(),
      aggregateId,
      type: eventType,
      timestamp: Date.now(),
      version: await this.getNextVersion(aggregateId),
      data,
      metadata,
    };

    await this.eventStore.append(event);
    this.recordAuditTrail(event);
    await this.handleEvent(event);
  }

  async getAggregateHistory(aggregateId: string): Promise<DomainEvent[]> {
    return this.eventStore.getEvents(aggregateId);
  }

  async getAuditTrail(
    aggregateId?: string,
    fromTimestamp?: number
  ): Promise<AuditTrail[]> {
    let trail = this.auditTrail;

    if (aggregateId) {
      trail = trail.filter(t => t.aggregateId === aggregateId);
    }

    if (fromTimestamp) {
      trail = trail.filter(t => new Date(t.timestamp).getTime() >= fromTimestamp);
    }

    return trail;
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  private async handleEvent(event: DomainEvent): Promise<void> {
    const handlers = this.eventHandlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Error handling event ${event.type}:`, error);
      }
    }
  }

  private recordAuditTrail(event: DomainEvent): void {
    const trail: AuditTrail = {
      eventId: event.id,
      aggregateId: event.aggregateId,
      eventType: event.type,
      timestamp: new Date(event.timestamp).toISOString(),
      actor: event.metadata?.actor,
      changes: event.data,
    };
    this.auditTrail.push(trail);
  }

  private async getNextVersion(aggregateId: string): Promise<number> {
    const events = await this.eventStore.getEvents(aggregateId);
    return events.length + 1;
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  clearAuditTrail(): void {
    this.auditTrail = [];
  }
}
