import { MongoMapper } from "@megawin/data/mongo";
import type { KenoOpsAlertEntity } from "@megawin/game-keno/entities";
import { Document } from "mongodb";

/**
 * Map doc `keno_ops_alerts` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — `ackBy`/`ackAt` optional (chỉ có
 * sau `ack()`), giữ nguyên `undefined` khi doc chưa được acknowledge. Khai tường minh để
 * compiler bắt thiếu/lệch key khi entity đổi shape (code-quality §5.4 Q2).
 */
export class OpsAlertMapper extends MongoMapper<Document, KenoOpsAlertEntity> {
  protected mapProps(doc: Document): KenoOpsAlertEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      type: doc.type,
      severity: doc.severity,
      payload: doc.payload,
      dedupeKey: doc.dedupeKey,
      status: doc.status,
      createdAt: doc.createdAt,
      ackBy: doc.ackBy,
      ackAt: doc.ackAt,
    } satisfies KenoOpsAlertEntity;
  }
}
