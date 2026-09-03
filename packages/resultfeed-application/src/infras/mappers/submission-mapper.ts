/**
 * ResultFeed – Submission Mapper
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { SubmissionEntity } from "@megawin/resultfeed/entities";
import type { Document } from "mongodb";

export class SubmissionMapper extends MongoMapper<Document, SubmissionEntity> {
  protected mapProps(doc: Document): SubmissionEntity {
    return {
      id: doc._id.toHexString(),
      sourceId: doc.sourceId,
      gameKey: doc.gameKey,
      requestUrl: doc.requestUrl,
      httpStatus: doc.httpStatus,
      contentType: doc.contentType,
      bodyGz: doc.bodyGz,
      contentHash: doc.contentHash,
      bodyBytes: doc.bodyBytes,
      providerId: doc.providerId,
      elapsedMs: doc.elapsedMs,
      state: doc.state,
      failureReason: doc.failureReason,
      fetchedAt: doc.fetchedAt,
      seenCount: doc.seenCount,
      lastSeenAt: doc.lastSeenAt,
      lastRequestUrl: doc.lastRequestUrl,
    } satisfies SubmissionEntity;
  }
}
