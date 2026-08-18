/**
 * Tool eve: `getPlayerInsight` — tài chính + vận hành của 1 player ĐÃ BIẾT `accountId`: tổng quan
 * cược/trúng theo khoảng ngày, tài chính theo ngày từng game, vé đang chờ settle — p1-03 §2.10.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 * `PlayerInsightUseCase` orchestrate NGAY trong file tool (không cần dispatcher `server/ai/`) vì
 * `game-core-application` đã gộp hộ cross-game — không có switch theo `GameProduct` nào cần tách
 * riêng (rule 1, p1-03 §1).
 *
 * CHỈ nhận `accountId`, KHÔNG search theo username/trả hồ sơ cơ bản — tool này gọi 3 use-case tài
 * chính song song (đắt hơn tra định danh), tách riêng khỏi tool rẻ `getPlayerAccountInfo`
 * (search/profile) để model không phải trả giá tài chính cho câu hỏi chỉ cần "username này
 * accountId nào" / "player này là ai". Chưa có `accountId` → gọi `getPlayerAccountInfo` trước.
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` log + làm sạch payload khi lỗi (xem
 * `server/ai/tool-result.ts`).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import {
  GetPlayerFinancialsUseCase,
  GetPlayerOutstandingUseCase,
  GetPlayerOverviewUseCase,
} from "@megawin/game-core-application/use-cases/reports";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

interface PlayerInsightInput {
  accountId: string;
  from?: string;
  to?: string;
}

interface PlayerInsightMeta {
  accountId: string;
  from?: string;
  to?: string;
  /** `true` khi KHÔNG truyền `from`/`to` → `overview`/`financials` bị bỏ qua. */
  rangeSkipped: boolean;
  fetchedAt: string;
}

interface PlayerInsightOutput {
  meta: PlayerInsightMeta;
  /** RAW `PlayerOverviewResult` — chỉ có khi có `from`/`to`. */
  overview?: unknown;
  /** RAW `PlayerSettleGameDailyEntity[]` — chỉ có khi có `from`/`to`. */
  financials?: unknown;
  /** RAW `PlayerOutstandingSummary` — luôn có, không phụ thuộc range. */
  outstanding: unknown;
}

/**
 * Orchestrate overview + financials + outstanding song song — 1 tool thay 3 lượt gọi rời, vì
 * "xem tổng thể tài chính 1 player" là 1 ý định duy nhất của staff (p1-03 §2.10).
 */
class PlayerInsightUseCase extends UseCase<PlayerInsightInput, PlayerInsightOutput> {
  private readonly overview = new GetPlayerOverviewUseCase();
  private readonly financials = new GetPlayerFinancialsUseCase();
  private readonly outstanding = new GetPlayerOutstandingUseCase();

  protected async execute(input: PlayerInsightInput): Promise<PlayerInsightOutput> {
    const { accountId, from, to } = input;
    const fetchedAt = new Date().toISOString();

    // overview/financials CHỈ lấy khi có đủ from+to — thiếu 1 trong 2 thì bỏ qua cả cặp, tránh gọi
    // use-case với range mặc định ngầm (model phải tự suy `from`/`to` từ `clientContext` theo rule 5
    // của instructions.md). outstanding luôn lấy vì không phụ thuộc range (vé đang chờ hiện tại).
    const hasRange = from !== undefined && to !== undefined;

    const [outstandingResult, overviewResult, financialsResult] = await Promise.all([
      this.outstanding.run({ accountId }),
      hasRange ? this.overview.run({ accountId, from, to }) : Promise.resolve(undefined),
      hasRange ? this.financials.run({ accountId, from, to }) : Promise.resolve(undefined),
    ]);

    return {
      meta: { accountId, from, to, rangeSkipped: !hasRange, fetchedAt },
      outstanding: outstandingResult.data,
      overview: overviewResult?.data,
      financials: financialsResult?.data,
    };
  }
}

const useCase = new PlayerInsightUseCase();

export default defineTool({
  description:
    "Tổng quan tài chính/vận hành của 1 player ĐÃ BIẾT `accountId`: tổng quan cược/trúng theo " +
    "khoảng ngày, tài chính theo ngày từng game, vé đang chờ settle. Dùng cho câu hỏi kiểu 'tuần " +
    "này player X cược/trúng bao nhiêu, còn vé chờ không'. CHƯA CÓ `accountId` (staff chỉ nêu " +
    "username) → gọi `getPlayerAccountInfo` TRƯỚC để tra accountId, KHÔNG gọi tool này với " +
    "username (tool này KHÔNG search được). Muốn `overview`/`financials` (theo khoảng ngày) " +
    "PHẢI truyền cả `from` và `to` — suy từ `clientContext` theo đúng rule ngày tài chính, KHÔNG " +
    "tự đoán; thiếu 1 trong 2 thì tool CHỈ trả `outstanding` (vé đang chờ, không phụ thuộc range) " +
    "và báo qua `meta.rangeSkipped`.",
  inputSchema: z.object({
    accountId: z.string().describe("ID tài khoản player (ULID). Chưa có → gọi `getPlayerAccountInfo` trước."),
    from: z.string().optional().describe("Ngày bắt đầu, format YYYY-MM-DD."),
    to: z.string().optional().describe("Ngày kết thúc, format YYYY-MM-DD."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getPlayerInsight"),
});
