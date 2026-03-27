import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, StreamStatus } from '@prisma/client';
import { StreamEventParser } from '../services/streamEventParser';
import { streamEventFixtures } from './fixtures/streamEvents';

const prisma = new PrismaClient();
const parser = new StreamEventParser(prisma);

describe('StreamEventParser', () => {
  beforeEach(async () => {
    await prisma.stream.deleteMany();
  });

  afterEach(async () => {
    await prisma.stream.deleteMany();
  });

  describe('parseCreatedEvent', () => {
    it('should parse and store stream created event with metadata', async () => {
      await parser.parseCreatedEvent(streamEventFixtures.created);

      const stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });

      expect(stream).toBeDefined();
      expect(stream?.streamId).toBe(streamEventFixtures.created.streamId);
      expect(stream?.creator).toBe(streamEventFixtures.created.creator);
      expect(stream?.recipient).toBe(streamEventFixtures.created.recipient);
      expect(stream?.amount).toBe(BigInt(streamEventFixtures.created.amount));
      expect(stream?.metadata).toBe(streamEventFixtures.created.metadata);
      expect(stream?.status).toBe(StreamStatus.CREATED);
      expect(stream?.txHash).toBe(streamEventFixtures.created.txHash);
    });

    it('should parse and store stream created event without metadata', async () => {
      await parser.parseCreatedEvent(streamEventFixtures.createdWithoutMetadata);

      const stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.createdWithoutMetadata.streamId },
      });

      expect(stream).toBeDefined();
      expect(stream?.metadata).toBeNull();
      expect(stream?.status).toBe(StreamStatus.CREATED);
    });
  });

  describe('parseClaimedEvent', () => {
    it('should update stream status to CLAIMED', async () => {
      // First create a stream
      await parser.parseCreatedEvent(streamEventFixtures.created);

      // Then claim it
      await parser.parseClaimedEvent(streamEventFixtures.claimed);

      const stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.claimed.streamId },
      });

      expect(stream?.status).toBe(StreamStatus.CLAIMED);
      expect(stream?.claimedAt).toBeDefined();
    });
  });

  describe('parseCancelledEvent', () => {
    it('should update stream status to CANCELLED', async () => {
      // First create a stream
      await parser.parseCreatedEvent(streamEventFixtures.createdWithoutMetadata);

      // Then cancel it
      await parser.parseCancelledEvent(streamEventFixtures.cancelled);

      const stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.cancelled.streamId },
      });

      expect(stream?.status).toBe(StreamStatus.CANCELLED);
      expect(stream?.cancelledAt).toBeDefined();
    });
  });

  describe('parseMetadataUpdatedEvent', () => {
    it('should update stream metadata while preserving financial terms', async () => {
      // First create a stream with initial metadata
      await parser.parseCreatedEvent(streamEventFixtures.created);

      const originalStream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });

      expect(originalStream?.metadata).toBe(streamEventFixtures.created.metadata);

      // Update metadata
      const metadataUpdateEvent = {
        type: 'metadata_updated' as const,
        streamId: streamEventFixtures.created.streamId,
        updater: streamEventFixtures.created.creator,
        hasMetadata: true,
        metadata: 'ipfs://QmUpdatedMetadata',
        txHash: '0xnewtxhash',
        timestamp: new Date(),
      };

      await parser.parseMetadataUpdatedEvent(metadataUpdateEvent);

      const updatedStream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });

      // Verify metadata was updated
      expect(updatedStream?.metadata).toBe('ipfs://QmUpdatedMetadata');

      // Verify financial terms remain unchanged
      expect(updatedStream?.creator).toBe(originalStream?.creator);
      expect(updatedStream?.recipient).toBe(originalStream?.recipient);
      expect(updatedStream?.amount).toBe(originalStream?.amount);
      expect(updatedStream?.status).toBe(originalStream?.status);
    });

    it('should clear metadata when updated to None', async () => {
      // First create a stream with metadata
      await parser.parseCreatedEvent(streamEventFixtures.created);

      // Update metadata to None (clear it)
      const metadataUpdateEvent = {
        type: 'metadata_updated' as const,
        streamId: streamEventFixtures.created.streamId,
        updater: streamEventFixtures.created.creator,
        hasMetadata: false,
        txHash: '0xnewtxhash',
        timestamp: new Date(),
      };

      await parser.parseMetadataUpdatedEvent(metadataUpdateEvent);

      const updatedStream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });

      // Verify metadata was cleared
      expect(updatedStream?.metadata).toBeNull();

      // Verify financial terms remain unchanged
      expect(updatedStream?.creator).toBe(streamEventFixtures.created.creator);
      expect(updatedStream?.recipient).toBe(streamEventFixtures.created.recipient);
      expect(updatedStream?.amount).toBe(BigInt(streamEventFixtures.created.amount));
    });

    it('should not allow mutation of financial terms through metadata update', async () => {
      // First create a stream
      await parser.parseCreatedEvent(streamEventFixtures.created);

      const originalStream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });

      // Attempt to update metadata (should only update metadata, not financial terms)
      const metadataUpdateEvent = {
        type: 'metadata_updated' as const,
        streamId: streamEventFixtures.created.streamId,
        updater: streamEventFixtures.created.creator,
        hasMetadata: true,
        metadata: 'New metadata',
        txHash: '0xnewtxhash',
        timestamp: new Date(),
      };

      await parser.parseMetadataUpdatedEvent(metadataUpdateEvent);

      const updatedStream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });

      // Verify only metadata changed
      expect(updatedStream?.metadata).toBe('New metadata');
      expect(updatedStream?.creator).toBe(originalStream?.creator);
      expect(updatedStream?.recipient).toBe(originalStream?.recipient);
      expect(updatedStream?.amount).toBe(originalStream?.amount);
      expect(updatedStream?.status).toBe(originalStream?.status);
    });
  });

  describe('parseEvent', () => {
    it('should route to correct parser based on event type', async () => {
      // Test created event routing
      await parser.parseEvent(streamEventFixtures.created);
      let stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });
      expect(stream?.status).toBe(StreamStatus.CREATED);

      // Test metadata update event routing
      const metadataUpdateEvent = {
        type: 'metadata_updated' as const,
        streamId: streamEventFixtures.created.streamId,
        updater: streamEventFixtures.created.creator,
        hasMetadata: true,
        metadata: 'Updated via parseEvent',
        txHash: '0xnewtxhash',
        timestamp: new Date(),
      };

      await parser.parseEvent(metadataUpdateEvent);
      stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });
      expect(stream?.metadata).toBe('Updated via parseEvent');
    });
  });

  describe('parseEvent - full lifecycle', () => {
    it('should handle complete stream lifecycle: created -> claimed', async () => {
      await parser.parseEvent(streamEventFixtures.created);
      await parser.parseEvent(streamEventFixtures.claimed);

      const stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.created.streamId },
      });

      expect(stream?.status).toBe(StreamStatus.CLAIMED);
      expect(stream?.createdAt).toEqual(streamEventFixtures.created.timestamp);
      expect(stream?.claimedAt).toEqual(streamEventFixtures.claimed.timestamp);
      expect(stream?.cancelledAt).toBeNull();
    });

    it('should handle complete stream lifecycle: created -> cancelled', async () => {
      await parser.parseEvent(streamEventFixtures.createdWithoutMetadata);
      await parser.parseEvent(streamEventFixtures.cancelled);

      const stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.createdWithoutMetadata.streamId },
      });

      expect(stream?.status).toBe(StreamStatus.CANCELLED);
      expect(stream?.createdAt).toEqual(streamEventFixtures.createdWithoutMetadata.timestamp);
      expect(stream?.cancelledAt).toEqual(streamEventFixtures.cancelled.timestamp);
      expect(stream?.claimedAt).toBeNull();
    });
  });

  describe('event-to-database mapping validation', () => {
    it('should correctly map all created event fields to database', async () => {
      const event = streamEventFixtures.created;
      await parser.parseCreatedEvent(event);

      const stream = await prisma.stream.findUnique({
        where: { streamId: event.streamId },
      });

      expect(stream).toMatchObject({
        streamId: event.streamId,
        creator: event.creator,
        recipient: event.recipient,
        amount: BigInt(event.amount),
        metadata: event.metadata,
        status: StreamStatus.CREATED,
        txHash: event.txHash,
        createdAt: event.timestamp,
        claimedAt: null,
        cancelledAt: null,
      });
    });

    it('should correctly map claimed event state transition', async () => {
      await parser.parseCreatedEvent(streamEventFixtures.created);
      await parser.parseClaimedEvent(streamEventFixtures.claimed);

      const stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.claimed.streamId },
      });

      expect(stream?.status).toBe(StreamStatus.CLAIMED);
      expect(stream?.claimedAt).toEqual(streamEventFixtures.claimed.timestamp);
      expect(stream?.cancelledAt).toBeNull();
    });

    it('should correctly map cancelled event state transition', async () => {
      await parser.parseCreatedEvent(streamEventFixtures.createdWithoutMetadata);
      await parser.parseCancelledEvent(streamEventFixtures.cancelled);

      const stream = await prisma.stream.findUnique({
        where: { streamId: streamEventFixtures.cancelled.streamId },
      });

      expect(stream?.status).toBe(StreamStatus.CANCELLED);
      expect(stream?.cancelledAt).toEqual(streamEventFixtures.cancelled.timestamp);
      expect(stream?.claimedAt).toBeNull();
    });
  });
});
