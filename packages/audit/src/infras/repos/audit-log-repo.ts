import { type Document, type Filter, ObjectId } from "mongodb";
import { AuditRepo } from "@megawin/data/mongo";

import { AUDIT_LOG_COLLECTION } from "../../indexes";
import type { AuditLogDoc, AuditLogEntity, AuditLogInsertDoc } from "../../entities";
import { AuditLogMapper } from "../mappers";
import type {
  AuditLogCursor,
  AuditLogCursorPage,
  AuditLogFilter,
  AuditLogPageOptions,
} from "./types";

/**
 * Repository cho collection `audit_logs` (DB `megawin-audit`).
 *
 * ## Hạ tầng
 *
 * Extends {@link AuditRepo} — đã hardcode `dbName: "megawin-audit"` + dùng chung
 * `MONGODB_URI` (cùng cluster Atlas, khác DB logic). Dùng {@link AuditLogMapper}
 * để map `_id → id` khi đọc ra (write nhận {@link AuditLogInsertDoc} không có `_id`).
 *
 * ## Ngữ nghĩa append-only
 *
 * Audit record ghi 1 lần, KHÔNG update/delete (trừ TTL tự xoá). `insertAudit`
 * là write path duy nhất. Read path phục vụ Backoffice (list cursor + get by id).
 *
 * ## Pagination cursor-based `(ts, _id)`
 *
 * Audit log là time-series append-heavy — record mới insert liên tục. Offset
 * `skip/limit` không stable (record mới chèn → trang lệch) và chậm dần khi skip
 * sâu. Cursor `(ts, _id)` dùng index `{ ts: -1, _id: -1 }` → mỗi trang là range
 * scan O(limit), không phụ thuộc độ sâu. Tie-break bằng `_id` để nhiều record
 * cùng `ts` (cùng millisecond) vẫn phân trang deterministic.
 *
 * Khung paging (limit+1 / hasMore / slice / build nextCursor) dùng chung từ
 * {@link MongoRepository.cursorPaging}; repo này chỉ lo phần riêng: `buildFilter`
 * (encode cursor `(ts, _id)` + filter nghiệp vụ) và serialize `ts → ISO`.
 */
export class AuditLogRepository extends AuditRepo<AuditLogEntity, AuditLogMapper> {
  constructor() {
    super({ collName: AUDIT_LOG_COLLECTION, dataMapper: new AuditLogMapper() });
    // dbName "megawin-audit" đã set sẵn trong AuditRepo base.
  }

  /**
   * Ghi 1 audit record (append-only).
   *
   * Nhận {@link AuditLogInsertDoc} (không có `id` — Mongo tự sinh `_id`). Trả
   * `_id` hex string của record vừa ghi. Caller (logger) tự bọc try/catch —
   * repo throw bình thường để logger quyết định swallow hay propagate.
   *
   * @param doc - Doc audit đầy đủ field, KHÔNG chứa `id`
   * @returns `_id` hex string của record vừa insert
   */
  async insertAudit(doc: AuditLogInsertDoc): Promise<string> {
    return await this.insertOne(doc);
  }

  /**
   * List audit log cho UI — cursor paginate, newest-first.
   *
   * Build mongoFilter từ {@link AuditLogFilter} + cursor filter, sort
   * `{ ts: -1, _id: -1 }`, lấy `limit + 1` record để tính `hasMore` mà KHÔNG
   * cần `count()`. Slice về `limit`, build `nextCursor` từ record cuối.
   *
   * @param filter - Điều kiện lọc (đã convert `from`/`to` sang UTC ở use-case)
   * @param options - `limit` + `cursor` page trước (null = trang đầu)
   * @returns `data` (đã slice về limit) + `nextCursor` serialize HTTP-safe
   */
  async listByCursor(
    filter: AuditLogFilter,
    options: AuditLogPageOptions,
  ): Promise<AuditLogCursorPage<AuditLogEntity>> {
    return await this.cursorPaging(this.buildFilter(filter, options.cursor) as Filter<Document>, {
      sort: { ts: -1, _id: -1 },
      limit: options.limit,
      // Serialize ts sang ISO để truyền HTTP; id là hex string (đã map).
      toCursor: (last) => ({ ts: last.ts.toISOString(), id: last.id }),
    });
  }

  /**
   * Lấy chi tiết 1 audit record theo `_id`.
   *
   * @param id - `_id` hex string. Trả `null` nếu không tìm thấy.
   */
  async getById(id: string): Promise<AuditLogEntity | null> {
    return await this.findOneById(id);
  }

  /**
   * Build Mongo filter từ {@link AuditLogFilter} + cursor.
   *
   * `from`/`to` gộp thành `{ ts: { $gte, $lte } }`. Cursor `(ts, _id)` thành
   * `$or` 2 nhánh (`ts < cursor.ts` HOẶC `ts == cursor.ts && _id < cursor.id`).
   * Cả range `ts` lẫn cursor cùng tác động `ts` nên mọi điều kiện gộp qua `$and`
   * để không ghi đè nhau.
   */
  private buildFilter(
    filter: AuditLogFilter,
    cursor: AuditLogCursor | null | undefined,
  ): Filter<AuditLogDoc> {
    const conditions: Filter<AuditLogDoc>[] = [];

    if (filter.from || filter.to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (filter.from) range.$gte = filter.from;
      if (filter.to) range.$lte = filter.to;
      conditions.push({ ts: range } as Filter<AuditLogDoc>);
    }

    if (filter.actor) {
      // Match actorId chính xác HOẶC actorName chứa (case-insensitive). User
      // thường gõ username khi không nhớ accountId. Escape regex để giá trị tra
      // cứu (có thể chứa ký tự đặc biệt) không phá pattern.
      const escaped = filter.actor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      conditions.push({
        $or: [{ actorId: filter.actor }, { actorName: { $regex: escaped, $options: "i" } }],
      } as Filter<AuditLogDoc>);
    }
    if (filter.actorType) {
      conditions.push({ actorType: filter.actorType });
    }
    if (filter.tenantId) {
      conditions.push({ tenantId: filter.tenantId });
    }
    if (filter.game) {
      conditions.push({ game: filter.game });
    }
    if (filter.category) {
      conditions.push({ category: filter.category });
    }
    if (filter.action) {
      conditions.push({ action: filter.action });
    }
    if (filter.targetType) {
      conditions.push({ targetType: filter.targetType });
    }
    if (filter.targetId) {
      conditions.push({ targetId: filter.targetId });
    }
    if (filter.status) {
      conditions.push({ status: filter.status });
    }

    if (cursor) {
      conditions.push({
        $or: [{ ts: { $lt: cursor.ts } }, { ts: cursor.ts, _id: { $lt: new ObjectId(cursor.id) } }],
      } as Filter<AuditLogDoc>);
    }

    if (conditions.length === 0) {
      return {};
    }
    if (conditions.length === 1) {
      return conditions[0]!;
    }
    return { $and: conditions };
  }
}
