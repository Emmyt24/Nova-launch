import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export enum BurnType {
  SELF = "self",
  ADMIN = "admin",
}

@Entity("burn_events")
@Index(["tokenAddress", "burnedAt"])
@Index(["tokenAddress", "burner"])
export class BurnEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "token_address" })
  @Index()
  tokenAddress: string;

  @Column({ name: "burner_address" })
  burner: string;

  @Column({ type: "numeric", precision: 78, scale: 0, name: "amount" })
  amount: string;

  @Column({
    type: "enum",
    enum: BurnType,
    default: BurnType.SELF,
    name: "burn_type",
  })
  burnType: BurnType;

  @Column({ name: "transaction_hash", nullable: true })
  txHash: string;

  @Column({ name: "block_number", type: "bigint", nullable: true })
  blockNumber: string;

  @CreateDateColumn({ name: "burned_at" })
  burnedAt: Date;
}
