/**
 * ResultFeed – Alert Mapper
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { AlertEntity } from "@megawin/resultfeed/entities";
import type { Document } from "mongodb";

export class AlertMapper extends MongoMapper<Document, AlertEntity> {
  protected mapProps(doc: Document): AlertEntity {
    return {
      id: doc._id.toHexString(),
      type: doc.type,
      severity: doc.severity,
      payload: doc.payload,
      dedupeKey: doc.dedupeKey,
      status: doc.status,
      createdAt: doc.createdAt,
      ackBy: doc.ackBy,
      ackAt: doc.ackAt,
    } satisfies AlertEntity;
  }
}
