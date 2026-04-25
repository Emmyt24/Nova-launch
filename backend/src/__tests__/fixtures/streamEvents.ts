import { StreamCreatedEvent, StreamClaimedEvent, StreamCancelledEvent } from '../../types/stream';

export const streamEventFixtures = {
  created: {
    type: 'created' as const,
    streamId: 1,
    creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
    recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
    amount: '1000000000',
    hasMetadata: true,
    metadata: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    timestamp: new Date('2026-03-04T10:00:00Z'),
  } as StreamCreatedEvent,

  createdWithoutMetadata: {
    type: 'created' as const,
    streamId: 2,
    creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
    recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
    amount: '500000000',
    hasMetadata: false,
    txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    timestamp: new Date('2026-03-04T11:00:00Z'),
  } as StreamCreatedEvent,

  claimed: {
    type: 'claimed' as const,
    streamId: 1,
    recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
    amount: '1000000000',
    txHash: '0x2345678901bcdef2345678901bcdef2345678901bcdef2345678901bcdef23',
    timestamp: new Date('2026-03-04T12:00:00Z'),
  } as StreamClaimedEvent,

  cancelled: {
    type: 'cancelled' as const,
    streamId: 2,
    creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
    refundAmount: '500000000',
    txHash: '0x3456789012cdef3456789012cdef3456789012cdef3456789012cdef345678',
    timestamp: new Date('2026-03-04T13:00:00Z'),
  } as StreamCancelledEvent,
};
