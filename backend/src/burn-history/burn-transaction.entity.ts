import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export enum BurnTransactionType {
  SELF = "self",
  ADMIN = "admin",
}

@Entity("burn_transactions")
@Index(["tokenAddress", "timestamp"])
@Index(["tokenAddress", "type"])
export class BurnTransaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "token_address", length: 100 })
  @Index()
  tokenAddress: string;

  @Column({ type: "decimal", precision: 36, scale: 18 })
  amount: string;

  @Column({ name: "from_address", length: 100 })
  from: string;

  @Column({
    type: "enum",
    enum: BurnTransactionType,
    default: BurnTransactionType.SELF,
  })
  type: BurnTransactionType;

  @Column({ name: "transaction_hash", length: 100, unique: true })
  transactionHash: string;

  @Column({ name: "block_number", type: "bigint", nullable: true })
  blockNumber: string | null;

  @Column({ type: "timestamp with time zone" })
  @Index()
  timestamp: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
