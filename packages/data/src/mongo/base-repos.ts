import type { Document } from "mongodb";
import { ReadPreference } from "mongodb";

import type { BaseEntity } from "./base-entity";
import { Constants } from "./constants";
import type { MongoMapper } from "./mapper";
import { MongoRepository } from "./repository";

/**
 * ReadPreference route mọi query sang Atlas **Analytics Node**.
 *
 * Tag `nodeType: "ANALYTICS"` do Atlas gắn sẵn trên analytics node. Đọc từ
 * secondary analytics → tách read nặng (dashboard/report) khỏi primary OLTP.
 */
const ANALYTICS_READ = new ReadPreference("secondary", [{ nodeType: "ANALYTICS" }]);

type BaseRepoArgs<TMapper> = {
  collName: string;
  dataMapper?: TMapper;
};

/**
 * Base cho repo hạ tầng/shared — DB `megawin` (primary).
 *
 * Dùng cho collection cross-cutting không thuộc game/identity/report:
 * `worker_locks` và các lock/registry toàn cục tương lai.
 */
export abstract class SharedRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({ collName, dbName: Constants.Default.DbName, dataMapper });
  }
}

/**
 * Base cho mọi repo game — DB `megawin-game` (primary).
 *
 * Gồm `{game}_*` (tickets, ticket_entries, draws, game_configs, …) và
 * counters/sequence phục vụ game (`ticket_counters`, `entry_change_seq`).
 */
export abstract class GameRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({ collName, dbName: Constants.Default.GameDbName, dataMapper });
  }
}

/**
 * Base cho repo identity — DB `megawin-identity` (primary).
 *
 * `accounts`, `tenants`. Nằm trên critical path auth — luôn đọc/ghi primary.
 */
export abstract class IdentityRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({ collName, dbName: Constants.Default.IdentityDbName, dataMapper });
  }
}

/**
 * Base cho repo tích hợp tenant — DB `megawin-tenant` (primary).
 *
 * WAL (`tx_logs`, `tx_intents`), feed (`entry_feed`, `feed_sync_cursor`),
 * dispatch (`tenant_dispatch_orders`).
 */
export abstract class TenantRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({ collName, dbName: Constants.Default.MegawinTenantDbName, dataMapper });
  }
}

/**
 * Base cho repo report — DB `megawin-report` (primary).
 *
 * Dùng cho CẢ ghi (pipeline settle/void) lẫn đọc thông thường. Khi cần tách read
 * nặng sang Analytics Node, dùng {@link ReportReadRepo} (plan riêng).
 */
export abstract class ReportRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({ collName, dbName: Constants.Default.ReportDbName, dataMapper });
  }
}

/**
 * Base cho repo CHỈ ĐỌC report — DB `megawin-report`, route sang Analytics Node.
 *
 * Mọi query của repo này đọc từ analytics secondary (qua `collectionOptions`),
 * tách read dashboard nặng khỏi primary OLTP. KHÔNG dùng để ghi.
 *
 * Khi tách hẳn cluster analytics tương lai: đổi sang `mongoEnvKey` riêng tại đây.
 */
export abstract class ReportReadRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({
      collName,
      dbName: Constants.Default.ReportDbName,
      collectionOptions: { readPreference: ANALYTICS_READ },
      dataMapper,
    });
  }
}

/**
 * Base cho repo audit log — DB `megawin-audit` (primary).
 *
 * Fire-and-forget write. (Tích hợp đầy đủ triển khai ở plan audit riêng.)
 */
export abstract class AuditRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({ collName, dbName: Constants.Default.AuditDbName, dataMapper });
  }
}
