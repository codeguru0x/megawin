/**
 * ResultFeed – PullResultsUseCase
 *
 * `08-vietlott-result-autofill.plan.md §3`. Đọc kết quả **đã publish** (`publishedAt != null`)
 * — dùng ở 2 nơi: handler `GET /results` của `apps/api-resultfeed`, VÀ implementation "direct"
 * của `VietlottResultClient` trong backoffice (gọi thẳng trong tiến trình, không qua HTTP).
 * Cùng 1 nguồn logic, không trùng lặp.
 *
 * Input đã validate shape ở tầng route (Zod, kể cả `gameKey` là enum `ResultFeedGameKey` —
 * xem `apps/api-resultfeed/src/handlers/results/get-results.ts`) — use-case này KHÔNG validate
 * lại (`code-quality-standards.mdc` §8).
 *
 * Dispatch 2 nhánh theo input:
 * - `drawPeriod` có mặt → single lookup, tối đa 1 item.
 * - Ngược lại → batch theo `since`+`size` (dành cho consumer đọc nhiều kỳ 1 lần — hiện tại
 *   chưa consumer nào dùng nhánh này, chừa sẵn cho G5 MegaWin core PULL).
 *
 * KHÔNG trả `drawId` — đúng D7 (`00-overview.md` §6): resultfeed không biết quy ước `drawId`
 * của MegaWin core.
 */

import type { ConsensusEntity, ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { ConsensusState } from "@megawin/resultfeed/entities";

import { ConsensusRepository } from "../../infras/repos/consensus-repo";

export interface PullResultsInput {
  gameKey: ResultFeedGameKey;
  /** Có mặt ⇒ single lookup 1 kỳ. Không có ⇒ batch theo `since`+`size`. */
  drawPeriod?: string;
  /**
   * Chưa dùng để filter (repo hiện chỉ hỗ trợ "mới nhất trước" qua `findPublished`) — giữ lại
   * trong input để tương thích API contract tương lai (cursor theo thời gian), KHÔNG throw nếu
   * caller truyền vào.
   */
  since?: string;
  /** Chỉ áp dụng cho nhánh batch. Mặc định 50 (khớp `ConsensusRepository.findPublished`). */
  size?: number;
}

export interface PullResultsItem {
  gameKey: ResultFeedGameKey;
  drawPeriod: string;
  drawDateSource: string;
  numbers: string[];
  payoutHash: string;
  publishedAt: string;
  /** `true` khi 1 người đã xác nhận (state = `human_verified`). Máy chốt (state = `agreed`) thì `false`. */
  verifiedByHuman: boolean;
  /** Số nguồn đã đồng ý với kết quả này (độ dài `agreeing`). Dùng để hiện độ tin cậy khi chưa có người verify. */
  sourceCount: number;
}

export interface PullResultsOutput {
  items: PullResultsItem[];
}

/** Chuyển 1 `ConsensusEntity` đã publish thành `PullResultsItem`. `null` nếu thiếu field bắt
 * buộc (numbers/payoutHash/publishedAt) — về lý thuyết không xảy ra vì publish luôn ghi kèm
 * đủ 3 field này (`applyMachineDecision`/`setHumanVerified`), nhưng type của `ConsensusEntity`
 * khai `string[] | null`/`string | null` nên vẫn phải guard tường minh thay vì ép kiểu ẩn. */
function toItem(doc: ConsensusEntity): PullResultsItem | null {
  if (doc.numbers === null || doc.payoutHash === null || doc.publishedAt === null) {
    return null;
  }
  return {
    gameKey: doc.gameKey,
    drawPeriod: doc.drawPeriod,
    drawDateSource: doc.drawDateSource,
    numbers: doc.numbers,
    payoutHash: doc.payoutHash,
    publishedAt: doc.publishedAt.toISOString(),
    verifiedByHuman: doc.state === ConsensusState.HumanVerified,
    sourceCount: doc.agreeing.length,
  };
}

export class PullResultsUseCase {
  private readonly consensusRepo = new ConsensusRepository();

  async run(input: PullResultsInput): Promise<PullResultsOutput> {
    if (input.drawPeriod) {
      return await this.runSingle(input.gameKey, input.drawPeriod);
    }
    return await this.runBatch(input.gameKey, input.size ?? 50);
  }

  private async runSingle(gameKey: ResultFeedGameKey, drawPeriod: string): Promise<PullResultsOutput> {
    const doc = await this.consensusRepo.findByGameKeyAndPeriod(gameKey, drawPeriod);
    if (!doc) {
      return { items: [] };
    }
    const item = toItem(doc);
    return { items: item ? [item] : [] };
  }

  private async runBatch(gameKey: ResultFeedGameKey, size: number): Promise<PullResultsOutput> {
    const docs = await this.consensusRepo.findPublished(gameKey, size);
    const items: PullResultsItem[] = [];
    for (const doc of docs) {
      const item = toItem(doc);
      if (item) {
        items.push(item);
      }
    }
    return { items };
  }
}
