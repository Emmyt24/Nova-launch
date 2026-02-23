import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateBurnTransactions1700000000000 implements MigrationInterface {
  name = 'CreateBurnTransactions1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "burn_transactions_type_enum" AS ENUM ('self', 'admin')
    `);

    await queryRunner.createTable(
      new Table({
        name: 'burn_transactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'token_address',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 36,
            scale: 18,
          },
          {
            name: 'from',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['self', 'admin'],
            default: "'self'",
          },
          {
            name: 'transaction_hash',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'block_number',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'timestamp',
            type: 'timestamp with time zone',
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'burn_transactions',
      new TableIndex({
        name: 'IDX_BURN_TOKEN_TIMESTAMP',
        columnNames: ['token_address', 'timestamp'],
      }),
    );

    await queryRunner.createIndex(
      'burn_transactions',
      new TableIndex({
        name: 'IDX_BURN_TOKEN_TYPE',
        columnNames: ['token_address', 'type'],
      }),
    );

    await queryRunner.createIndex(
      'burn_transactions',
      new TableIndex({
        name: 'IDX_BURN_TIMESTAMP',
        columnNames: ['timestamp'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('burn_transactions', 'IDX_BURN_TOKEN_TIMESTAMP');
    await queryRunner.dropIndex('burn_transactions', 'IDX_BURN_TOKEN_TYPE');
    await queryRunner.dropIndex('burn_transactions', 'IDX_BURN_TIMESTAMP');
    await queryRunner.dropTable('burn_transactions');
    await queryRunner.query(`DROP TYPE "burn_transactions_type_enum"`);
  }
}
