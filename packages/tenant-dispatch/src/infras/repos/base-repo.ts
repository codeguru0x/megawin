import type { BaseEntity } from "@megawin/data/mongo";
import { type MongoMapper, TenantRepo } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/**
 * Base repository cho tenant-dispatch — trỏ vào DB `megawin-tenant`.
 *
 * Tất cả repo trong package này kế thừa từ đây để đảm bảo ghi đúng DB.
 * Alias mỏng của {@link TenantRepo}.
 */
export class TenantDispatchBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends TenantRepo<TEntity, TDataMapper> {}
