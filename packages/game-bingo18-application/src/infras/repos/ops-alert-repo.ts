/**
 * Bingo 18 – Ops Alert Repository
 *
 * Collection: bingo18_ops_alerts — 1 doc/(draw × dedupeKey). Alert-driven ops.
 *
 * GHI: evaluator trong worker `bulkUpsertByDedupe` — upsert theo `{drawId, dedupeKey}`,
 *      `$setOnInsert` (type/status/createdAt) + `status:"new"` → KHÔNG bắn lại alert đã tồn tại (idempotent).
 * ĐỌC: `countByStatus` (index-only cho badge), `listByDrawAndStatus`, `ack`.
 *
 * Ack KHÔNG xoá doc, KHÔNG chặn worker cập nhật payload (UI v6 Keno 30/07 — guideline §4:
 * ack = "staff đã biết" ≠ "hết rủi ro"; giữ audit trail ai xử lý lúc nào).
 * `status` dùng member `OpsAlertStatus.*`, KHÔNG literal "new".
 */

import { docPath } from "@megawin/data/mongo";
import type {
  Bingo18OpsAlertDoc,
  Bingo18OpsAlertEntity,
  OpsAlertStatus as OpsAlertStatusType,
} from "@megawin/game-bingo18/entities";
import { Bingo18Collections, OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-bingo18/entities";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { ObjectId } from "mongodb";

import { OpsAlertMapper } from "../mappers/ops-alert-mapper";
import { BaseRepo } from "./base-repo";
import type { HubAlertCounts } from "./types";

const f = docPath<Bingo18OpsAlertDoc>();

export class OpsAlertRepository extends BaseRepo<Bingo18OpsAlertEntity, OpsAlertMapper> {
  constructor() {
    super({
      collName: Bingo18Collections.OpsAlerts,
      dataMapper: new OpsAlertMapper(),
    });
  }

  /**
   * Upsert 1 batch alert theo `{drawId, dedupeKey}` — idempotent.
   *
   * Filter là equality clause thuần → Mongo tự điền `drawId`, `dedupeKey` vào
   * doc mới khi insert (không cần lặp lại trong `$setOnInsert`). `$setOnInsert`
   * còn lại (`type`, `status`, `createdAt`) chỉ đặt lần đầu; nếu đã tồn tại chỉ
   * `$set` payload + severity (cập nhật số đo mới nhất), KHÔNG reset
   * status/ackBy đã xử lý. Evaluator gom alert trong RAM rồi gọi 1 lần/tick.
   *
   * @param alerts - Alert cần upsert (không có `_id`; Mongo tự sinh).
   */
  async bulkUpsertByDedupe(alerts: Omit<Bingo18OpsAlertDoc, "_id">[]): Promise<void> {
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

  /** Đếm alert theo status — index-only (`{status, createdAt}`), rẻ cho badge snapshot. */
  async countByStatus(status: OpsAlertStatusType): Promise<number> {
    return await this.count({ status });
  }

  /**
   * Đếm alert `critical` chưa xử lý (`status: new`) — badge đỏ + âm thanh tuỳ chọn.
   *
   * Chỉ tính critical còn active (chưa ack): staff đã ack rồi thì badge không đỏ nữa.
   */
  async countActiveCritical(): Promise<number> {
    return await this.count({
      status: OpsAlertStatus.New,
      severity: OpsAlertSeverity.Critical,
    });
  }

  /** List alert 1 kỳ, lọc status optional. Sort mới nhất trước. */
  async listByDrawAndStatus(drawId: string, status?: OpsAlertStatusType): Promise<Bingo18OpsAlertEntity[]> {
    const filter: Document = { drawId };
    if (status) {
      filter.status = status;
    }
    return await this.findMany(filter, { sort: { createdAt: -1 } });
  }

  /**
   * Đếm alert đang mở theo TỪNG kỳ — 1 aggregate cho N kỳ. Nguồn tô đỏ dòng trên Ops Hub
   * (`GetOpsHubSnapshotUseCase`).
   *
   * Vì sao KHÔNG tái dùng {@link countByStatus}/{@link countActiveCritical}: 2 method đó đếm
   * GLOBAL (không filter `drawId`), phục vụ badge tổng trên trang Operations 1 kỳ. Hub cần
   * biết kỳ NÀO có alert để tô đỏ đúng dòng → phải group theo `drawId`.
   *
   * Vì sao 1 aggregate thay vì N lần `countDocuments`: N kỳ × 1 count = N round-trip, vi
   * phạm ràng buộc "số query không tỷ lệ với số kỳ" của Ops Hub.
   *
   * Chỉ đếm alert CHƯA resolved (`status $in [New, Ack]`) — alert đã resolved không hiện
   * trên Hub (hub là bảng việc đang mở, không phải lịch sử).
   *
   * @param drawIds - Lấy từ `listUnfinishedDrawRows`. Rỗng → trả `Map` rỗng, KHÔNG gọi DB.
   * @returns Map `drawId` → `{ open, critical }`. Kỳ không có alert KHÔNG xuất hiện trong Map.
   */
  async countByDrawIds(drawIds: string[]): Promise<Map<string, HubAlertCounts>> {
    if (drawIds.length === 0) {
      return new Map();
    }

    const rows = await this.aggregate([
      {
        $match: {
          [f("drawId")]: { $in: drawIds },
          [f("status")]: { $in: [OpsAlertStatus.New, OpsAlertStatus.Ack] },
        },
      },
      {
        $group: {
          _id: f("$drawId"),
          open: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: [f("$severity"), OpsAlertSeverity.Critical] }, 1, 0] },
          },
        },
      },
    ]);

    return new Map(rows.map((r) => [r._id as string, { open: r.open as number, critical: r.critical as number }]));
  }

  /**
   * Acknowledge 1 alert (staff đã xem/xử lý).
   *
   * @param alertId - ObjectId hex của alert.
   * @param ackBy - ID staff acknowledge.
   * @returns true nếu cập nhật thành công.
   */
  async ack(alertId: string, ackBy: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(alertId) },
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
