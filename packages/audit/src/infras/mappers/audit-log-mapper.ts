/**
 * Mapper cho `audit_logs` collection — doc → `AuditLogEntity`.
 *
 * Map `_id` (ObjectId) → `id` (hex string); copy nguyên các field còn lại.
 * `AuditLogDoc` không có nested ObjectId nên không cần xử lý gì thêm.
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";

import type { AuditLogEntity } from "../../entities";

export class AuditLogMapper extends MongoMapper<Document, AuditLogEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): AuditLogEntity {
    const { _id, ...rest } = doc;
    return { id: _id.toHexString(), ...rest } as AuditLogEntity;
  }
}
