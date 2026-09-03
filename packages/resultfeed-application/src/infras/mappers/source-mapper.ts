/**
 * ResultFeed – Source Mapper
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { SourceEntity } from "@megawin/resultfeed/entities";
import type { Document } from "mongodb";

export class SourceMapper extends MongoMapper<Document, SourceEntity> {
  protected mapProps(doc: Document): SourceEntity {
    return {
      id: doc._id.toHexString(),
      sourceId: doc.sourceId,
      name: doc.name,
      baseUrl: doc.baseUrl,
      role: doc.role,
      trustWeight: doc.trustWeight,
      gameKeys: doc.gameKeys,
      isEnabled: doc.isEnabled,
      providerId: doc.providerId,
      parserVersion: doc.parserVersion,
      requiresRender: doc.requiresRender,
      minIntervalMs: doc.minIntervalMs,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies SourceEntity;
  }
}
