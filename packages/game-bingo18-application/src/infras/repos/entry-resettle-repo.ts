/**
 * Bingo 18 – Entry Resettle Repository
 *
 * Collection: bingo18_ticketEntries (chỉ entries trong phiên resettle)
 *
 * Tách riêng khỏi entry-repo.ts vì concern khác nhau:
 * - entry-repo.ts: insert, settle (lần đầu), void, financial aggregates.
 * - entry-resettle-repo.ts: snapshot reversal + reset entries cho resettle round.
 *
 * RULE: Repo chỉ thực hiện DB operation. Mọi business logic
 * (sinh UUIDv7, build batchKey, build snapshot data...) ở use-case layer.
 *
 * Tất cả methods chấp nhận data đã được prepare từ use case — repo không tự
 * sinh UUID, không tự build object.
 */

import { ObjectId } from "mongodb";
import { Bingo18Collections } from "@megawin/game-bingo18/entities";
import type { EntryReversal, TicketEntryEntity } from "@megawin/game-bingo18/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import type { ReversalCandidate, ReversalEntryForDispatch } from "./types";

export class EntryResettleRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  constructor() {
    super({
      collName: Bingo18Collections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  // ─── Snapshot Reversal (PrepareResettle) ──────────────────────────────────

  /**
   * Liệt kê entries `Settled` đã có payout > 0 — candidates cần reversal.
   *
   * Cursor pagination theo `_id ASC` (stable, idempotent). Dataset có thể
   * lớn → caller (use case) tự loop cho đến khi `result.length < limit`.
   *
   * Filter: status=Settled + payout.payoutAmount > 0.
   * Entries thua (payoutAmount = 0) không cần snapshot reversal —
   * `resetEntriesForResettle` sẽ reset chúng cùng nhóm.
   *
   * Projection chỉ lấy fields cần thiết để build reversal snapshot.
   */
  async listCandidatesForReversal(params: {
    drawId: string;
    afterId?: string;
    limit: number;
  }): Promise<ReversalCandidate[]> {
    const { drawId, afterId, limit } = params;

    const filter: Record<string, unknown> = {
      drawId,
      status: EntryStatus.Settled,
      "payout.payoutAmount": { $gt: 0 },
    };

    if (afterId) {
      filter._id = { $gt: new ObjectId(afterId) };
    }

    const docs = await this.findManyAsDocuments(filter, {
      sort: { _id: 1 },
      limit,
      projection: {
        _id: 1,
        "payout.payoutAmount": 1,
      },
    });

    return docs.map((d) => ({
      id: d._id.toHexString(),
      payoutAmount: d.payout?.payoutAmount ?? 0,
    }));
  }

  /**
   * Bulk set `reversal` snapshot cho 1 batch entries — atomic per entry.
   *
   * Chỉ update entries còn ở status=Settled (filter strict). Entries đã bị
   * reset trước đó (idempotent retry) sẽ skip natural.
   *
   * KHÔNG bump version — reversal snapshot là internal field cho dispatch,
   * không thay đổi business state nhìn từ feed/report.
   *
   * Caller (use case) chịu trách nhiệm:
   * - Sinh `reversalTx` UUIDv7 MỚI cho mỗi item qua `generateId()` — KHÔNG
   *   copy từ `payout.payoutTx` cũ. Reversal là transaction độc lập, có
   *   idempotency key riêng để outbox dispatch không trùng với payout cũ.
   * - Truyền cùng `resettleId` (do BO API sinh) cho cả batch.
   *
   * @returns số entries thực sự được set reversal.
   */
  async bulkSetReversal(
    items: Array<{
      entryId: string;
      reversal: EntryReversal;
    }>,
  ): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    const now = new Date();

    const ops = items.map((item) => ({
      updateOne: {
        filter: { _id: new ObjectId(item.entryId), status: EntryStatus.Settled },
        update: {
          $set: {
            reversal: item.reversal,
            updatedAt: now,
          },
        },
      },
    }));

    const result = await this.bulkWrite(ops);
    return result.modifiedCount;
  }

  // ─── Reset Entries (PrepareResettle — sau khi đã snapshot reversal) ───────

  /**
   * Reset toàn bộ entries Settled của 1 draw về Scheduled — chuẩn bị re-settle.
   *
   * Atomic via `$set + $unset` trong 1 updateMany call.
   *
   * Fields bị $unset (xoá hoàn toàn data settle cũ):
   * - `payout` — chứa winAmount, payoutAmount, boardPayouts, payoutTx, settledAt.
   * - `outcome` — "win" / "loss".
   * - `result` — snapshot kết quả quay (winningNumbers, ...).
   *
   * Bingo 18 KHÔNG có `hasCappablePrize` (không có payout cap) → chỉ unset 3 field trên.
   *
   * KHÔNG $unset `reversal` — đã được set ở `bulkSetReversal` step trước,
   * giữ lại để EnqueueReversals đọc; PrepareResettle phiên kế tiếp sẽ wipe.
   *
   * KHÔNG $unset `voidInfo` — nếu entry từng được void (rare path) thì giữ
   * nguyên; resettle chỉ áp dụng cho entries Settled, voidInfo không tồn tại
   * trên entries này theo invariant.
   *
   * Filter strict status=Settled — idempotent: gọi lại không reset entries
   * đã ở Scheduled.
   *
   * KHÔNG bump version: reset chỉ là phase TRUNG GIAN của workflow resettle —
   * entry tạm thời ở `Scheduled` không có result/payout/outcome trong vài phút
   * cho đến khi `bulkSettleEntries` re-settle xong. Đây KHÔNG phải business
   * state có ý nghĩa với tenant; bump version ở đây sẽ:
   *   - Tenant feed nhận event "vé thắng → quay về chưa quay, payout=0"
   *     → UI flicker, webhook gửi player notification mâu thuẫn.
   *   - CDC stream/audit của tenant ghi nhận trạng thái vô nghĩa.
   *
   * Tenant CHỈ nên thấy 1 event duy nhất khi resettle xong: "payout cũ → payout
   * mới" — version được bump ở `bulkSettleEntries` (re-settle). SettleEntries
   * query toàn bộ entries Scheduled (cả thắng và thua) → mọi entry đều được
   * bump version đúng 1 lần ở re-settle, không có entry nào bị kẹt version cũ.
   *
   * Đồng nhất semantic với `bulkSetReversal` và `clearReversalSnapshot` (cùng
   * file) — cả 2 đều không bump vì là internal mechanic của workflow resettle.
   */
  async resetEntriesForResettle(drawId: string): Promise<number> {
    const now = new Date();

    const result = await this.updateMany(
      { drawId, status: EntryStatus.Settled },
      {
        $set: {
          status: EntryStatus.Scheduled,
          updatedAt: now,
        },
        // Xoá các field được set trong bulkSettleEntries (Bingo18 không có hasCappablePrize)
        $unset: {
          payout: "",
          outcome: "",
          result: "",
        },
      },
    );

    return result.modifiedCount;
  }

  // ─── Read for EnqueueReversals ────────────────────────────────────────────

  /**
   * Lấy batch entries có `reversal` snapshot — dùng cho EnqueueReversals.
   *
   * Cursor pagination theo `reversal.reversalTx` ASC (UUIDv7 monotonic).
   * Filter status không cần thiết: entries có `reversal` đang ở Scheduled
   * sau PrepareResettle, EnqueueReversals chạy sau đó trong cùng SFN.
   * Filter qua existence của reversal field là đủ.
   *
   * Projection chỉ lấy fields cần build reversal dispatch order.
   *
   * **ASSUMPTION QUAN TRỌNG**: function này CHỈ được gọi bởi
   * `EnqueueReversalsUseCase` trong scope của Resettle SFN ĐANG CHẠY (giữa
   * `PrepareResettle.bulkSetReversal` và phiên resettle kế tiếp). Sau khi
   * `FinalizeSettle` hoàn tất, `reversal` field LINGERS trên entries (audit
   * trail của phiên gần nhất, xem JSDoc `EntryReversal`) — nếu function này
   * được gọi LẠI ngoài scope SFN (cron, replay tool, ad-hoc query) sẽ trả
   * entries phiên cũ → re-enqueue duplicate reversal → DOUBLE-DEBIT.
   *
   * Defense layer: outbox unique index trên `tx` reject duplicate, nhưng
   * KHÔNG dựa vào đó. Function chỉ được expose tới `EnqueueReversalsUseCase`.
   * Future devs muốn dùng cho replay/audit phải implement function khác.
   */
  async getEntriesWithReversalForDispatch(params: {
    drawId: string;
    afterTx?: string;
    limit: number;
  }): Promise<ReversalEntryForDispatch[]> {
    const { drawId, afterTx, limit } = params;

    const filter: Record<string, unknown> = {
      drawId,
      "reversal.reversalTx": afterTx ? { $gt: afterTx } : { $exists: true },
    };

    const docs = await this.findManyAsDocuments(filter, {
      sort: { "reversal.reversalTx": 1 },
      limit,
      projection: {
        _id: 1,
        tenantId: 1,
        accountId: 1,
        username: 1,
        "entrySummary.ticketNo": 1,
        "reversal.reversalAmount": 1,
        "reversal.reversalTx": 1,
      },
    });

    return docs.map((d) => {
      return {
        id: d._id.toHexString(),
        tenantId: d.tenantId,
        accountId: d.accountId,
        username: d.username,
        ticketNo: d.entrySummary?.ticketNo ?? "",
        reversalAmount: d.reversal?.reversalAmount ?? 0,
        reversalTx: d.reversal?.reversalTx ?? "",
      };
    });
  }

  // ─── Clear reversal (PrepareResettle replay-safe wipe) ────────────────────

  /**
   * Clear `reversal` field cho toàn bộ entries của 1 draw.
   *
   * **CHỈ gọi ở `PrepareResettle` step 1** (replay-safe wipe) — KHÔNG còn gọi
   * ở `FinalizeSettle`.
   *
   * Lý do gọi ở PrepareResettle: bảo đảm correctness cho entries thắng phiên
   * N-1 nhưng KHÔNG thắng phiên N. Nếu không wipe trước, `bulkSetReversal`
   * phiên N chỉ snapshot entries thắng phiên N → entries thắng phiên N-1 sẽ
   * lingers `reversal` cũ → `EnqueueReversals` query `$exists: true` sẽ trả
   * cả 2 set → re-enqueue reversal phiên N-1 → DOUBLE-DEBIT.
   *
   * Replay-safe: nếu PrepareResettle replay (crash giữa chừng), wipe lại reversal
   * lingers từ phiên N replay dở → snapshot phiên N tiếp theo sạch sẽ.
   *
   * Dùng `$unset` (không phải `$set: null`) để:
   * - Tiết kiệm BSON storage (~25 bytes/field × N entries).
   * - Đồng bộ semantic với filter `$exists: true` ở `getEntriesWithReversalForDispatch`.
   * - Sparse index trên `reversal.reversalTx` (nếu có) hoạt động đúng.
   *
   * Idempotent: filter `reversal: { $exists: true }` → entries không có reversal
   * không bị touch.
   * KHÔNG bump version (internal field, không ảnh hưởng business state).
   */
  async clearReversalSnapshot(drawId: string): Promise<void> {
    await this.updateMany(
      { drawId, reversal: { $exists: true } },
      {
        $unset: { reversal: "" },
        $set: { updatedAt: new Date() },
      },
    );
  }
}
