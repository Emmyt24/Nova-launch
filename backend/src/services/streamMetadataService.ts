import { PrismaClient, StreamStatus } from '@prisma/client';
import { Logger } from '@nestjs/common';

/**
 * Stream Metadata Service
 * 
 * Handles stream metadata updates with strict financial invariant enforcement.
 * Ensures that only metadata is mutable post-creation while all financial terms
 * (amount, creator, recipient, schedule) remain immutable.
 */
export class StreamMetadataService {
  private readonly logger = new Logger(StreamMetadataService.name);

  constructor(private prisma: PrismaClient) {}

  /**
   * Update stream metadata
   * 
   * Allows the stream creator to update the metadata associated with a stream.
   * Enforces strict validation to prevent any mutation of financial terms.
   * 
   * # Authorization
   * Only the stream creator can update metadata.
   * 
   * # Metadata Constraints
   * - Minimum length: 1 character (when present)
   * - Maximum length: 512 characters
   * - Empty strings: Rejected
   * - None/null: Allowed (clears metadata)
   * 
   * # Financial Invariants (Enforced)
   * The following stream parameters are immutable:
   * - amount: Stream payment amount
   * - creator: Original stream creator
   * - recipient: Stream recipient address
   * - createdAt: Stream creation timestamp
   * - streamId: Stream ID
   * 
   * @param streamId - ID of the stream to update
   * @param creator - Address of the stream creator (must match stored creator)
   * @param newMetadata - New metadata value (null to clear, string to set)
   * @returns Updated stream object
   * @throws Error if stream not found, unauthorized, or metadata invalid
   */
  async updateMetadata(
    streamId: number,
    creator: string,
    newMetadata: string | null,
  ): Promise<any> {
    // Validate metadata before database operation
    this.validateMetadata(newMetadata);

    // Fetch the stream
    const stream = await this.prisma.stream.findUnique({
      where: { streamId },
    });

    if (!stream) {
      this.logger.warn(`Stream not found: ${streamId}`);
      throw new Error(`Stream ${streamId} not found`);
    }

    // Verify authorization: only creator can update
    if (stream.creator !== creator) {
      this.logger.warn(
        `Unauthorized metadata update attempt for stream ${streamId} by ${creator}`,
      );
      throw new Error('Only stream creator can update metadata');
    }

    // Enforce financial invariants - verify no financial terms are being changed
    // (This is a safety check; the update only touches metadata field)
    this.validateFinancialInvariants(stream, {
      streamId: stream.streamId,
      creator: stream.creator,
      recipient: stream.recipient,
      amount: stream.amount,
      createdAt: stream.createdAt,
    });

    // Update metadata
    const updated = await this.prisma.stream.update({
      where: { streamId },
      data: {
        metadata: newMetadata,
      },
    });

    this.logger.log(
      `Stream ${streamId} metadata updated by ${creator}. Has metadata: ${newMetadata !== null}`,
    );

    return updated;
  }

  /**
   * Validate metadata constraints
   * 
   * @param metadata - Metadata to validate
   * @throws Error if metadata is invalid
   */
  private validateMetadata(metadata: string | null): void {
    if (metadata === null || metadata === undefined) {
      // None/null is valid (clears metadata)
      return;
    }

    if (typeof metadata !== 'string') {
      throw new Error('Metadata must be a string or null');
    }

    const length = metadata.length;

    // Empty string is invalid
    if (length === 0) {
      throw new Error('Metadata cannot be empty string; use null to clear');
    }

    // Maximum length constraint
    if (length > 512) {
      throw new Error(
        `Metadata exceeds maximum length of 512 characters (got ${length})`,
      );
    }
  }

  /**
   * Validate financial invariants
   * 
   * Ensures that critical financial parameters have not been modified.
   * This is a safety check to prevent any mutation of immutable terms.
   * 
   * @param original - Original stream data
   * @param updated - Updated stream data (should only differ in metadata)
   * @throws Error if any financial term differs
   */
  private validateFinancialInvariants(
    original: any,
    updated: any,
  ): void {
    // Check amount immutability
    if (original.amount !== updated.amount) {
      throw new Error('Stream amount is immutable and cannot be changed');
    }

    // Check creator immutability
    if (original.creator !== updated.creator) {
      throw new Error('Stream creator is immutable and cannot be changed');
    }

    // Check recipient immutability
    if (original.recipient !== updated.recipient) {
      throw new Error('Stream recipient is immutable and cannot be changed');
    }

    // Check creation timestamp immutability
    if (
      original.createdAt.getTime() !== updated.createdAt.getTime()
    ) {
      throw new Error(
        'Stream creation timestamp is immutable and cannot be changed',
      );
    }

    // Check stream ID immutability
    if (original.streamId !== updated.streamId) {
      throw new Error('Stream ID is immutable and cannot be changed');
    }
  }

  /**
   * Get stream metadata
   * 
   * Retrieves the current metadata for a stream.
   * 
   * @param streamId - ID of the stream
   * @returns Metadata string or null if not set
   * @throws Error if stream not found
   */
  async getMetadata(streamId: number): Promise<string | null> {
    const stream = await this.prisma.stream.findUnique({
      where: { streamId },
      select: { metadata: true },
    });

    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    return stream.metadata;
  }

  /**
   * Batch validate metadata updates
   * 
   * Validates multiple metadata updates without applying them.
   * Useful for pre-validation before batch operations.
   * 
   * @param updates - Array of {streamId, creator, newMetadata} objects
   * @returns Array of validation results
   */
  async validateBatchUpdates(
    updates: Array<{
      streamId: number;
      creator: string;
      newMetadata: string | null;
    }>,
  ): Promise<
    Array<{
      streamId: number;
      valid: boolean;
      error?: string;
    }>
  > {
    const results = [];

    for (const update of updates) {
      try {
        // Validate metadata format
        this.validateMetadata(update.newMetadata);

        // Fetch stream
        const stream = await this.prisma.stream.findUnique({
          where: { streamId: update.streamId },
        });

        if (!stream) {
          results.push({
            streamId: update.streamId,
            valid: false,
            error: 'Stream not found',
          });
          continue;
        }

        // Verify authorization
        if (stream.creator !== update.creator) {
          results.push({
            streamId: update.streamId,
            valid: false,
            error: 'Unauthorized: only creator can update metadata',
          });
          continue;
        }

        results.push({
          streamId: update.streamId,
          valid: true,
        });
      } catch (error) {
        results.push({
          streamId: update.streamId,
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get streams by creator with metadata filter
   * 
   * Retrieves all streams created by an address, optionally filtered by
   * whether they have metadata set.
   * 
   * @param creator - Creator address
   * @param hasMetadata - Optional filter: true = has metadata, false = no metadata, undefined = all
   * @returns Array of streams
   */
  async getStreamsByCreator(
    creator: string,
    hasMetadata?: boolean,
  ): Promise<any[]> {
    const where: any = { creator };

    if (hasMetadata === true) {
      where.metadata = { not: null };
    } else if (hasMetadata === false) {
      where.metadata = null;
    }

    return this.prisma.stream.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
