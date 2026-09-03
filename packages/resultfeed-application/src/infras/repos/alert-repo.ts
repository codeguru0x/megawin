/**
 * ResultFeed – Alert Repository
 *
 * Collection: `alerts`. Bảng alert vận hành RIÊNG của ResultFeed (không dùng chung `ops_alerts`
 * của game — `resultfeed` không import `@megawin/game-*`).
 */

import { docPath } from "@megawin/data/mongo";
import type { AlertDoc, AlertEntity, ResultFeedAlertSeverity, ResultFeedAlertType } from "@megawin/resultfeed/entities";
import { ResultFeedAlertStatus } from "@megawin/resultfeed/entities";

import { AlertMapper } from "../mappers/alert-mapper";
import { BaseRepo } from "./base-repo";

const f = docPath<AlertDoc>();

export class AlertRepository extends BaseRepo<AlertEntity, AlertMapper> {
  constructor() {
    super({ collName: "alerts", dataMapper: new AlertMapper() });
  }

  /**
   * Upsert theo `dedupeKey` — chống bắn trùng alert cùng nội dung mỗi tick evaluator.
   * `severity`/`payload` cập nhật mỗi lần (dữ liệu mới nhất); `status`/`createdAt` chỉ set lần
   * đầu (không reset trạng thái xử lý của vận hành khi alert vẫn còn hiệu lực).
   */
  async upsertByDedupeKey(input: {
    type: ResultFeedAlertType;
    severity: ResultFeedAlertSeverity;
    payload: Record<string, unknown>;
    dedupeKey: string;
  }): Promise<boolean> {
    return await this.updateOne(
      { [f("dedupeKey")]: input.dedupeKey },
      {
        $set: {
          [f("severity")]: input.severity,
          [f("payload")]: input.payload,
        },
        $setOnInsert: {
          [f("type")]: input.type,
          [f("status")]: ResultFeedAlertStatus.New,
          [f("createdAt")]: new Date(),
          [f("ackBy")]: null,
          [f("ackAt")]: null,
        },
      },
      { upsert: true },
    );
  }

  /** Hàng đợi alert theo status — mới nhất trước. */
  async findByStatus(status: ResultFeedAlertStatus, limit = 50): Promise<AlertEntity[]> {
    return await this.findMany({ [f("status")]: status }, { sort: { [f("createdAt")]: -1 }, limit });
  }

  /** Badge snapshot — đếm alert chưa xử lý (index-only count). */
  async countNew(): Promise<number> {
    return await this.count({ [f("status")]: ResultFeedAlertStatus.New });
  }

  /** Vận hành xác nhận đã biết alert này. */
  async ack(id: string, ackBy: string): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("status")]: ResultFeedAlertStatus.Ack,
        [f("ackBy")]: ackBy,
        [f("ackAt")]: new Date(),
      },
    });
  }

  /** Vận hành đóng alert đã xử lý xong. */
  async resolve(id: string): Promise<boolean> {
    return await this.updateById(id, {
      $set: { [f("status")]: ResultFeedAlertStatus.Resolved },
    });
  }
}
