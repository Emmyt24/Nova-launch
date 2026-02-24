import { User, Token, AuditLog } from "../types";

// In-memory storage for demo (replace with actual database)
export class Database {
  private static users: Map<string, User> = new Map();
  private static tokens: Map<string, Token> = new Map();
  private static auditLogs: AuditLog[] = [];

  // User operations
  static async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  static async findUserByAddress(address: string): Promise<User | null> {
    return (
      Array.from(this.users.values()).find((u) => u.address === address) || null
    );
  }

  static async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  static async updateUser(
    id: string,
    updates: Partial<User>
  ): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  // Token operations
  static async findTokenById(id: string): Promise<Token | null> {
    return this.tokens.get(id) || null;
  }

  static async getAllTokens(includeDeleted = false): Promise<Token[]> {
    const tokens = Array.from(this.tokens.values());
    return includeDeleted ? tokens : tokens.filter((t) => !t.deleted);
  }

  static async updateToken(
    id: string,
    updates: Partial<Token>
  ): Promise<Token | null> {
    const token = this.tokens.get(id);
    if (!token) return null;
    const updated = { ...token, ...updates, updatedAt: new Date() };
    this.tokens.set(id, updated);
    return updated;
  }

  static async softDeleteToken(id: string): Promise<boolean> {
    const token = this.tokens.get(id);
    if (!token) return false;
    token.deleted = true;
    token.updatedAt = new Date();
    return true;
  }

  // Audit log operations
  static async createAuditLog(
    log: Omit<AuditLog, "id" | "timestamp">
  ): Promise<AuditLog> {
    const auditLog: AuditLog = {
      ...log,
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    this.auditLogs.push(auditLog);
    return auditLog;
  }

  static async getAuditLogs(filters?: {
    adminId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditLog[]> {
    let logs = [...this.auditLogs];

    if (filters?.adminId) {
      logs = logs.filter((l) => l.adminId === filters.adminId);
    }
    if (filters?.action) {
      logs = logs.filter((l) => l.action.includes(filters.action));
    }
    if (filters?.resource) {
      logs = logs.filter((l) => l.resource === filters.resource);
    }
    if (filters?.startDate) {
      logs = logs.filter((l) => l.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      logs = logs.filter((l) => l.timestamp <= filters.endDate!);
    }

    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Initialize with sample data
  static initialize() {
    // Add sample admin user
    const adminUser: User = {
      id: "admin_1",
      address: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      role: "super_admin",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(adminUser.id, adminUser);

    // Add sample tokens
    const sampleToken: Token = {
      id: "token_1",
      name: "Sample Token",
      symbol: "SMPL",
      contractAddress: "CTOKEN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      creatorAddress: "GCREATOR123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      totalSupply: "1000000",
      burned: "50000",
      flagged: false,
      deleted: false,
      metadata: { description: "A sample token" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tokens.set(sampleToken.id, sampleToken);
  }
}
