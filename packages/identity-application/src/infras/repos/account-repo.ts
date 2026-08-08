import { nowVN, generateULID } from "@megawin/shared/utils";
import { ObjectId, type Document } from "mongodb";
import { AccountMapper } from "../mappers/account-mapper";
import { IdentityBaseRepo } from "./identity-base-repo";
import { AccountType, AccountStatus, AgentRole, PlayerRole } from "@megawin/identity/entities";
import type {
  AccountEntity,
  CompanyAccountEntity,
  AgentAccountEntity,
  PlayerAccountEntity,
  CompanyRole,
  MfaStatus,
} from "@megawin/identity/entities";

export class AccountRepository extends IdentityBaseRepo<AccountEntity, AccountMapper> {
  constructor() {
    super({
      collName: "accounts",
      dataMapper: new AccountMapper(),
    });
  }

  public async usernameExists(username: string): Promise<boolean> {
    return this.exists({ username });
  }

  public async findOrCreatePlayerAccount(
    username: string,
    displayName: string,
    tenantId: string,
    accountId: string,
    status: AccountStatus,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string,
  ): Promise<PlayerAccountEntity | null> {
    const now = nowVN();
    return (await this.findOneAndUpdate(
      { username },
      {
        $setOnInsert: {
          accountId,
          displayName,
          type: AccountType.Player,
          roles: [PlayerRole.Player],
          status,
          tenantId,
          cognitoPoolId,
          cognitoSub,
          cognitoUsername,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    )) as PlayerAccountEntity | null;
  }

  public async findOrCreateCompanyAccount(
    username: string,
    displayName: string,
    accountType: AccountType,
    roles: CompanyRole[],
    status: AccountStatus,
    accountId: string,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string,
  ): Promise<CompanyAccountEntity | null> {
    return (await this.findOneAndUpdate(
      { username },
      {
        $setOnInsert: {
          accountId: accountId,
          displayName: displayName,
          type: accountType,
          roles,
          status: status,
          cognitoPoolId,
          cognitoSub,
          cognitoUsername,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    )) as CompanyAccountEntity | null;
  }

  /**
   * Tìm account bất kỳ (Company/Agent/Player) theo username.
   *
   * Username lưu trong DB là lowercase → normalize input trước khi query.
   * Hỗ trợ `projection` để chỉ lấy field cần thiết, giảm payload.
   *
   * LƯU Ý: AccountMapper yêu cầu `_id` để map → khi truyền projection,
   * KHÔNG được loại `_id` (đừng set `_id: 0`).
   *
   * @param username - username cần tra cứu (không phân biệt hoa/thường)
   * @param options.projection - Mongo projection, vd `{ roles: 1, status: 1 }`
   * @returns AccountEntity hoặc null nếu không tồn tại
   */
  public async getAccountByUsername(
    username: string,
    options?: { projection?: Document },
  ): Promise<AccountEntity | null> {
    return this.findOne(
      { username: username.toLowerCase() },
      options?.projection ? { projection: options.projection } : undefined,
    );
  }

  public async listCompanyAccounts(): Promise<CompanyAccountEntity[]> {
    const docs = await this.findMany({ type: AccountType.Company });
    return docs as CompanyAccountEntity[];
  }

  public async listAgentAccounts(): Promise<AgentAccountEntity[]> {
    const docs = await this.findMany({ type: AccountType.Agent });
    return docs as AgentAccountEntity[];
  }

  /**
   * Liệt kê tài khoản người chơi thuộc một tenantId với phân trang.
   *
   * Sắp xếp theo createdAt giảm dần (mới nhất trước).
   * Dùng skip/limit — đủ hiệu quả khi total < vài chục ngàn.
   * Index: { type: 1, tenantId: 1, createdAt: -1 }
   *
   * @returns Danh sách players + total count để tính hasMore phía caller.
   */
  public async listPlayerAccounts(
    tenantId: string,
    options?: { skip?: number; limit?: number },
  ): Promise<{ accounts: PlayerAccountEntity[]; total: number }> {
    const filter = { type: AccountType.Player, tenantId };
    const skip = options?.skip ?? 0;
    const limit = options?.limit ?? 50;

    const [docs, total] = await Promise.all([
      this.findMany(filter, { sort: { createdAt: -1 }, skip, limit }),
      this.count(filter),
    ]);

    return {
      accounts: docs as PlayerAccountEntity[],
      total,
    };
  }

  /**
   * Tìm tài khoản người chơi theo keyword cross-tenant.
   *
   * Logic detect input:
   * - Dạng ULID (26 ký tự Crockford Base32): exact match `accountId` (uppercase) → 0 hoặc 1 kết quả
   * - Chứa `@` (dạng user@tenant): exact match `username` (lowercase) → 0 hoặc 1 kết quả
   * - Còn lại: prefix regex `^keyword` trên `username` (lowercase) → 0-N kết quả
   *
   * Username đã được lưu lowercase trong DB → lowercase input rồi dùng regex KHÔNG có flag `i`.
   * Prefix regex (`^abc`) sử dụng được index `{ type: 1, username: 1 }` hiệu quả.
   * Limit mặc định 20 — search là để tìm nhanh, không phải để duyệt.
   */
  public async searchPlayerAccounts(rawKeyword: string, options?: { limit?: number }): Promise<PlayerAccountEntity[]> {
    const keyword = rawKeyword.trim();
    const limit = options?.limit ?? 20;
    const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

    if (ULID_PATTERN.test(keyword)) {
      // Input là ULID → exact match trên accountId (uppercase)
      const doc = await this.findOne({
        type: AccountType.Player,
        accountId: keyword.toUpperCase(),
      });
      return doc ? [doc as PlayerAccountEntity] : [];
    }

    if (keyword.includes("@")) {
      // Input chứa @ → exact match trên username (lowercase)
      const doc = await this.findOne({
        type: AccountType.Player,
        username: keyword.toLowerCase(),
      });
      return doc ? [doc as PlayerAccountEntity] : [];
    }

    // Prefix search trên username — không dùng flag `i` vì data đã lowercase.
    // Regex `^keyword` sử dụng index { type: 1, username: 1 } hiệu quả.
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (await this.findMany(
      { type: AccountType.Player, username: { $regex: `^${escaped}` } },
      { limit, sort: { username: 1 } },
    )) as PlayerAccountEntity[];
  }

  /**
   * Liệt kê tài khoản người chơi theo tenantId với cursor-based pagination.
   *
   * Dùng `_id` (MongoDB ObjectId) làm cursor thay vì `accountId` (ULID).
   * ObjectId là primary key — index luôn có sẵn, không cần tạo thêm.
   * ObjectId monotonically increasing theo thời gian → sort mới nhất trước khi dùng `_id DESC`.
   *
   * Index dùng: { type: 1, tenantId: 1, _id: -1 } — hoặc primary key scan.
   *
   * @param afterId  - entity.id (hex ObjectId) của record cuối trang hiện tại → lấy trang tiếp
   * @param beforeId - entity.id (hex ObjectId) của record đầu trang hiện tại → lấy trang trước
   */
  public async listPlayerAccountsCursor(
    tenantId: string,
    options?: { afterId?: string; beforeId?: string; limit?: number },
  ): Promise<{ accounts: PlayerAccountEntity[]; hasNext: boolean; hasPrev: boolean }> {
    const limit = options?.limit ?? 50;
    const baseFilter = { type: AccountType.Player, tenantId };

    if (options?.beforeId) {
      // Trang trước: _id > beforeId (ObjectId comparison), sort ASC → reverse về DESC
      const docs = (await this.findMany(
        { ...baseFilter, _id: { $gt: new ObjectId(options.beforeId) } },
        { sort: { _id: 1 }, limit: limit + 1 },
      )) as PlayerAccountEntity[];

      // hasPrev = còn trang trước trang này nữa
      const hasPrev = docs.length > limit;
      const accounts = docs.slice(0, limit).reverse();

      // hasNext: luôn có vì beforeId tồn tại → trang hiện tại phía sau
      const hasNext = true;

      return { accounts, hasNext, hasPrev };
    }

    if (options?.afterId) {
      // Trang tiếp: _id < afterId (ObjectId comparison), sort DESC
      const docs = (await this.findMany(
        { ...baseFilter, _id: { $lt: new ObjectId(options.afterId) } },
        { sort: { _id: -1 }, limit: limit + 1 },
      )) as PlayerAccountEntity[];

      const hasNext = docs.length > limit;
      const accounts = docs.slice(0, limit);

      // hasPrev: luôn có vì afterId tồn tại → có trang trước đó
      const hasPrev = true;

      return { accounts, hasNext, hasPrev };
    }

    // Trang đầu tiên — không có cursor
    const docs = (await this.findMany(baseFilter, {
      sort: { _id: -1 },
      limit: limit + 1,
    })) as PlayerAccountEntity[];

    const hasNext = docs.length > limit;
    const accounts = docs.slice(0, limit);

    return { accounts, hasNext, hasPrev: false };
  }

  public async findAgentByTenantId(tenantId: string): Promise<AgentAccountEntity | null> {
    return (await this.findOne({
      type: AccountType.Agent,
      tenantId,
    })) as AgentAccountEntity | null;
  }

  /**
   * Find or create an agent account
   * @param username - username of the agent
   * @param displayName
   * @param roles - roles of the agent
   * @param tenantId - tenant id of the agent
   * @param cognitoPoolId - cognito pool id of the agent
   * @param cognitoSub - cognito sub of the agent
   * @param cognitoUsername - cognito username of the agent
   * @returns the agent account
   */
  public async findOrCreateAgentAccount(
    username: string,
    displayName: string,
    roles: AgentRole[],
    tenantId: string,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string,
  ): Promise<AgentAccountEntity | null> {
    return (await this.findOneAndUpdate(
      { username },
      {
        $setOnInsert: {
          accountId: generateULID(),
          displayName: displayName,
          type: AccountType.Agent,
          roles: roles,
          status: AccountStatus.Active,
          tenantId,
          cognitoPoolId,
          cognitoSub,
          cognitoUsername,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    )) as AgentAccountEntity | null;
  }

  public async updateMfaStatus(username: string, mfaStatus: MfaStatus): Promise<boolean> {
    return this.updateOne({ username }, { $set: { mfaStatus, updatedAt: new Date() } });
  }
}
