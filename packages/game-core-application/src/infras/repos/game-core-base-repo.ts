import { GameRepo, TenantRepo } from "@megawin/data/mongo";
import type { BaseEntity, MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/**
 * Base cho repo game-core truy cập DB game (`megawin-game`).
 *
 * Dùng cho counters/sequence (`ticket_counters`, `entry_change_seq`) và các
 * cross-game reader đọc `{game}_*` trực tiếp qua `getDb()` (player entry/outstanding).
 *
 * Alias mỏng của {@link GameRepo} — giữ tên cũ để không phải sửa import nội bộ.
 */
export class GameCoreBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends GameRepo<TEntity, TDataMapper> {}

/**
 * Repository cho các collections trong database `megawin-tenant`.
 *
 * Alias mỏng của {@link TenantRepo} — giữ tên cũ để không phải sửa import nội bộ.
 */
export class MegawinTenantCoreBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends TenantRepo<TEntity, TDataMapper> {}
