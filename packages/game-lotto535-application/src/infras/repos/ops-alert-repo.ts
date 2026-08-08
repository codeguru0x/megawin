/**
 * Lotto 5/35 – Ops Alert Repository
 *
 * Collection: lotto535_ops_alerts — 1 doc/(draw × dedupeKey). Alert-driven ops.
 *
 * GHI: evaluator worker `bulkUpsertByDedupe` — upsert theo `{drawId, dedupeKey}`,
 *      `$setOnInsert` (type/status/createdAt) + `status: new` → KHÔNG bắn lại alert đã
 *      tồn tại (idempotent), alert đã Ack KHÔNG bị hạ về New.
 * ĐỌC: `countByStatus(drawId)` (breakdown theo status CHO 1 KỲ — badge snapshot),
 *      `listByFilter` (list alert 1 kỳ, status optional), `ackById`.
 *
 * Port nguyên kiến trúc từ Power 6/55 (`ops-alert-repo.ts`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi field đi qua method typed ở đây.
 * `status` dùng member `OpsAlertStatus.*`, KHÔNG literal "new".
 */

import { Lotto535Collections, OpsAlertStatus } from "@megawin/game-lotto535/entities";
import type { Lotto535OpsAlertDoc, Lotto535OpsAlertEntity } from "@megawin/game-lotto535/entities";
import type { OpsAlertStatus as OpsAlertStatusType } from "@megawin/game-lotto535/entities";
import { docPath } from "@megawin/data/mongo";
import { ObjectId } from "mongodb";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { OpsAlertMapper } from "../mappers/ops-alert-mapper";

const f = docPath<Lotto535OpsAlertDoc>();

export class OpsAlertRepository extends BaseRepo<Lotto535OpsAlertEntity, OpsAlertMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.OpsAlerts,
      dataMapper: new OpsAlertMapper(),
    });
  }

  /**
   * Upsert 1 batch alert theo `{drawId, dedupeKey}` — idempotent.
   *
   * Filter là equality clause thuần → Mongo tự điền `drawId`, `dedupeKey` vào doc mới khi
   * insert. `$setOnInsert` còn lại (`type`, `status`, `createdAt`) chỉ đặt lần đầu; nếu đã
   * tồn tại chỉ `$set` payload + severity (cập nhật số đo mới nhất), KHÔNG reset
   * status/ackBy đã xử lý. Evaluator gom alert trong RAM rồi gọi 1 lần/tick.
   *
   * @param alerts - Alert cần upsert (không có `_id`; Mongo tự sinh).
   */
  async bulkUpsertByDedupe(alerts: Omit<Lotto535OpsAlertDoc, "_id">[]): Promise<void> {
    if (alerts.length === 0) return;

    const ops: AnyBulkWriteOperation<Document>[] = alerts.map((a) => ({
      updateOne: {
        filter: { drawId: a.drawId, dedupeKey: a.dedupeKey },
        update: {
          // Cập nhật số đo mới nhất mỗi tick (không tạo doc mới).
          $set: {
            [f("severity")]: a.severity,
            [f("payload")]: a.payload,
          },
          // Chỉ đặt khi tạo mới — giữ nguyên status/ackBy nếu staff đã xử lý.
          $setOnInsert: {
            [f("type")]: a.type,
            [f("status")]: OpsAlertStatus.New,
            [f("createdAt")]: a.createdAt,
          },
        },
        upsert: true,
      },
    }));

    await this.bulkWrite(ops);
  }

  /**
   * Breakdown số alert theo status CHO 1 KỲ — nguồn badge snapshot trang ops.
   *
   * `$group` trên index `{drawId, status}` (equality prefix `drawId` + group `status`) —
   * chi phí bị chặn bởi số alert của kỳ đó (nhỏ), KHÔNG COLLSCAN toàn collection.
   * Trả đủ 3 key (`New`/`Ack`/`Resolved`) dù status đó chưa có alert nào — reader không
   * phải `?? 0` rải rác.
   *
   * @param drawId - Kỳ cần đếm.
   */
  async countByStatus(drawId: string): Promise<Record<OpsAlertStatusType, number>> {
    const rows = await this.aggregate([
      { $match: { drawId } },
      { $group: { _id: `$${f("status")}`, count: { $sum: 1 } } },
    ]);

    const out: Record<OpsAlertStatusType, number> = {
      [OpsAlertStatus.New]: 0,
      [OpsAlertStatus.Ack]: 0,
      [OpsAlertStatus.Resolved]: 0,
    };
    for (const row of rows) {
      out[row._id as OpsAlertStatusType] = row.count as number;
    }
    return out;
  }

  /** List alert 1 kỳ, lọc status optional. Sort mới nhất trước. */
  async listByFilter(drawId: string, status?: OpsAlertStatusType): Promise<Lotto535OpsAlertEntity[]> {
    const filter: Document = { drawId };
    if (status) {
      filter.status = status;
    }
    return await this.findMany(filter, { sort: { createdAt: -1 } });
  }

  /**
   * Acknowledge 1 alert (staff đã xem/xử lý).
   *
   * Filter có `status: New` — race 2 staff ack cùng lúc: người sau filter không khớp
   * (status đã đổi) → `updateOne` trả `false` (no-op êm, không lỗi).
   *
   * @param alertId - ObjectId hex của alert.
   * @param ackBy - ID staff acknowledge.
   * @returns true nếu cập nhật thành công.
   */
  async ackById(alertId: string, ackBy: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(alertId), [f("status")]: OpsAlertStatus.New },
      {
        $set: {
          [f("status")]: OpsAlertStatus.Ack,
          [f("ackBy")]: ackBy,
          [f("ackAt")]: new Date(),
        },
      },
    );
  }
}
