import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBurnEvents1700000000000 implements MigrationInterface {
  name = 'CreateBurnEvents1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."burn_events_burn_type_enum" AS ENUM('self', 'admin')
    `);

    await queryRunner.query(`
      CREATE TABLE "burn_events" (
        "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
        "token_address"    VARCHAR      NOT NULL,
        "burner_address"   VARCHAR      NOT NULL,
        "amount"           NUMERIC(78,0) NOT NULL,
        "burn_type"        "public"."burn_events_burn_type_enum" NOT NULL DEFAULT 'self',
        "transaction_hash" VARCHAR,
        "block_number"     BIGINT,
        "burned_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_burn_events" PRIMARY KEY ("id")
      )
    `);

    // Composite index for most analytic queries
    await queryRunner.query(`
      CREATE INDEX "IDX_burn_events_token_burned_at"
        ON "burn_events" ("token_address", "burned_at" DESC)
    `);

    // Index for unique-burner aggregation
    await queryRunner.query(`
      CREATE INDEX "IDX_burn_events_token_burner"
        ON "burn_events" ("token_address", "burner_address")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_burn_events_token_burner"`);
    await queryRunner.query(`DROP INDEX "IDX_burn_events_token_burned_at"`);
    await queryRunner.query(`DROP TABLE "burn_events"`);
    await queryRunner.query(`DROP TYPE "public"."burn_events_burn_type_enum"`);
  }
}
