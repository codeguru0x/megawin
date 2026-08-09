import type { BaseEntity, MongoMapper } from "@megawin/data/mongo";
import { SharedRepo } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/**
 * Base repository cho collections shared/infra của worker-core (DB `megawin`).
 *
 * `worker_locks` là lock toàn cục, không thuộc game/identity/report.
 * Alias mỏng của {@link SharedRepo} — giữ tên cũ để không phải sửa import.
 */
export class WorkerCoreBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends SharedRepo<TEntity, TDataMapper> {}
