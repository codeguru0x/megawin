/**
 * Power 6/55 – Line Repository
 *
 * Collection: power655TicketLines
 *
 * Lines tạo tại settle time. Business fields (matchResult, main, betCount, …)
 * có thể đổi khi RESETTLE với kết quả mới → upsertLines dùng hybrid
 * `$set` (business fields) + `$setOnInsert` (createdAt) để vừa cho phép overwrite
 * khi re-settle, vừa giữ `createdAt` immutable kể cả khi settle retry sau crash.
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import type { TicketLineDoc } from "@megawin/game-power655/entities";
import { chunk } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";

export class LineRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: Power655Collections.TicketLines });
  }

  /**
   * Idempotent bulk upsert lines cho 1 entry.
   *
   * Hybrid strategy (BẮT BUỘC cho mọi game — xem max3d-resettle plan §A):
   *   - `$set` cho business fields (matchResult, main, betCount, …): RESETTLE re-build
   *     lines theo drawResult MỚI → phải overwrite. Nếu dùng `$setOnInsert` cho toàn
   *     doc, line cũ giữ `matchResult` theo kết quả CŨ → PatchJackpotPrize query sai
   *     tier + player view hiển thị sai.
   *   - `$setOnInsert` cho `createdAt`: settle retry sau crash (giữa upsertLines và
   *     bulkSettleEntries) gọi lại với `now2 ≠ now1`; dùng `$set` sẽ refresh createdAt,
   *     phá semantic "thời điểm tạo line".
   */
  private static readonly BULK_CHUNK_SIZE = 500;

  async upsertLines(lines: Array<Omit<TicketLineDoc, "_id">>): Promise<void> {
    if (lines.length === 0) return;

    const ops = lines.map((doc) => {
      // Tách createdAt khỏi $set: chỉ ghi khi insert mới (immutable timestamp).
      const { createdAt, ...rest } = doc;
      return {
        updateOne: {
          filter: { entryId: doc.entryId, lineIndex: doc.lineIndex },
          update: {
            $set: rest, // business fields — overwrite OK khi resettle
            $setOnInsert: { createdAt },
          },
          upsert: true,
        },
      };
    });

    for (const batch of chunk(ops, LineRepository.BULK_CHUNK_SIZE)) {
      await this.bulkWrite(batch, { ordered: false });
    }
  }

  /**
   * Lấy lines của 1 entry, sort theo lineIndex.
   * Dùng cho player xem chi tiết lines + kết quả match.
   */
  async getLinesByEntryId(
    entryId: string,
    options: { size?: number; cursor?: number } = {},
  ): Promise<{ lines: TicketLineDoc[]; hasMore: boolean }> {
    const { size = 50, cursor } = options;
    // entryId lưu dạng hex string (settle-entries ghi `entry.id`), KHÔNG phải ObjectId.
    // Query bằng string để khớp — dùng ObjectId sẽ không match → trả rỗng.
    const filter: Record<string, unknown> = { entryId };

    if (cursor != null) {
      filter.lineIndex = { $gt: cursor };
    }

    const lines = await this.findManyAsDocuments(filter, {
      sort: { lineIndex: 1 },
      limit: size + 1,
    });

    const hasMore = lines.length > size;
    const slice = hasMore ? lines.slice(0, size) : lines;

    return { lines: slice as unknown as TicketLineDoc[], hasMore };
  }

  /**
   * Lấy TẤT CẢ lines trúng jackpotTier trong draw (KỂ CẢ line đã patch winAmount).
   *
   * Đây là NGUỒN tính mẫu số `totalBetUnits` + danh sách winners trong
   * `PatchJackpotPrize`. PHẢI đọc tất cả — KHÔNG filter `matchResult.winAmount`
   * — để mẫu số và winners DETERMINISTIC qua mọi lần Step Function retry sau
   * crash giữa chừng (kịch bản lines đã patch nhưng entries chưa). Nếu tính từ
   * tập lines-chưa-patch, retry sẽ thấy tập co lại → jackpotPerUnit phình to +
   * entries trúng JP bị bỏ sót vĩnh viễn.
   *
   * Tập này = tập line winner thật: settle-entries luôn ghi JP line với
   * `winAmount = 0` ban đầu, chỉ `PatchJackpotPrize` mới đổi thành > 0. Không
   * có nguồn nào khác tạo JP line, nên "tất cả JP line theo tier" = "tất cả
   * line winner của tier đó".
   *
   * @param jackpotTier - "jackpot1" hoặc "jackpot2"
   * @returns lineId + entryId (hex) + betCount của mỗi line trúng
   */
  async getAllJackpotLines(
    drawId: string,
    jackpotTier: string,
  ): Promise<Array<{ lineId: string; entryId: string; betCount: number }>> {
    const docs = await this.findManyAsDocuments(
      {
        drawId,
        "matchResult.tier": jackpotTier,
      },
      { projection: { _id: 1, entryId: 1, betCount: 1 } },
    );

    return docs.map((d) => ({
      lineId: (d._id as ObjectId).toHexString(),
      entryId: d.entryId instanceof ObjectId ? d.entryId.toHexString() : String(d.entryId),
      betCount: (d.betCount as number | undefined) ?? 1,
    }));
  }

  /**
   * Lấy lines trúng jackpotTier CHƯA patch (`matchResult.winAmount = 0`) trong draw.
   *
   * CHỈ dùng nội bộ bởi {@link patchJackpotLinesPerUnit} để biết line nào cần
   * ghi winAmount. TUYỆT ĐỐI KHÔNG dùng để tính mẫu số `totalBetUnits` hay
   * winners — dùng {@link getAllJackpotLines} cho việc đó (retry-safe).
   *
   * @param jackpotTier - "jackpot1" hoặc "jackpot2"
   */
  private async getUnpatchedJackpotLines(
    drawId: string,
    jackpotTier: string,
  ): Promise<Array<{ lineId: string; betCount: number }>> {
    const docs = await this.findManyAsDocuments(
      {
        drawId,
        "matchResult.tier": jackpotTier,
        "matchResult.winAmount": 0,
      },
      { projection: { _id: 1, betCount: 1 } },
    );

    return docs.map((d) => ({
      lineId: (d._id as ObjectId).toHexString(),
      betCount: (d.betCount as number | undefined) ?? 1,
    }));
  }

  /**
   * Patch winAmount cho từng line trúng JP theo tỷ lệ betCount.
   *
   * Thay vì set cùng 1 amount uniform, mỗi line có winAmount riêng = jackpotPerUnit × betCount.
   * Idempotent: chỉ update lines có winAmount = 0 (đọc qua getUnpatchedJackpotLines
   * + filter `winAmount: 0` trong bulk op). `jackpotPerUnit` do caller tính từ
   * mẫu số DETERMINISTIC (getAllJackpotLines) nên mọi retry đều dùng cùng đơn giá
   * → line patch ở lần retry khác nhau vẫn ra cùng winAmount.
   */
  async patchJackpotLinesPerUnit(drawId: string, jackpotTier: string, jackpotPerUnit: number): Promise<number> {
    // Chỉ lấy lines CHƯA patch để tránh ghi đè line đã có winAmount (idempotent).
    const unpatchedLines = await this.getUnpatchedJackpotLines(drawId, jackpotTier);
    if (unpatchedLines.length === 0) {
      return 0;
    }

    const ops = unpatchedLines.map((line) => {
      const winAmount = jackpotPerUnit * line.betCount;
      return {
        updateOne: {
          filter: {
            _id: new ObjectId(line.lineId),
            "matchResult.winAmount": 0,
          },
          update: { $set: { "matchResult.winAmount": winAmount } },
        },
      };
    });

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }
}
