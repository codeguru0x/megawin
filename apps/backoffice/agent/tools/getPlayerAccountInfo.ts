/**
 * Tool eve: `getPlayerAccountInfo` — tra hồ sơ CƠ BẢN của 1 tài khoản player theo username/keyword
 * HOẶC theo `accountId`, dữ liệu KHÔNG nhạy cảm, KHÔNG kèm số liệu tài chính.
 *
 * Tách riêng khỏi `getPlayerInsight` (vốn gộp cả tra định danh + tài chính) vì 2 lý do:
 * 1. Chi phí khác nhau — tool này chỉ gọi identity (1 query rẻ), `getPlayerInsight` gọi thêm 3
 *    use-case tài chính song song (overview/financials/outstanding). Không nên trả giá đắt cho
 *    câu hỏi chỉ cần "username này là accountId nào" / "player này là ai".
 * 2. Tần suất dùng khác nhau — model cần tool RẺ này ở MỌI bước cần tra accountId từ username,
 *    không chỉ trước khi hỏi tài chính (vd tra accountId để dùng cho tool khác).
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3):
 * `SearchPlayerAccountsUseCase` (search) / `GetPlayerAccountUseCase` (detail) từ
 * `identity-application/use-cases/accounts`. CHỈ trả field không nhạy cảm (`accountId`,
 * `username`, `displayName`, `status`, `roles`, `tenantId`, `createdAt`, `updatedAt`) — KHÔNG có
 * password/email/phone.
 *
 * Hành vi match của `SearchPlayerAccountsUseCase` (đọc source thật `account-repo.ts`): `keyword`
 * dạng đầy đủ `username@tenantId` → exact match (0-1 kết quả); `keyword` là ULID → exact match
 * accountId; `keyword` bare username (không `@`) → prefix regex trên username, có thể trả NHIỀU
 * kết quả nếu trùng tên ở tenant khác nhau — model phải hỏi lại staff chọn đúng người.
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` log + làm sạch payload khi lỗi (xem
 * `server/ai/tool-result.ts`).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { SearchPlayerAccountItem } from "@megawin/identity-application/use-cases/accounts";
import { GetPlayerAccountUseCase, SearchPlayerAccountsUseCase } from "@megawin/identity-application/use-cases/accounts";
import { AppException } from "@megawin/shared/errors";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

interface PlayerAccountInfoInput {
  keyword?: string;
  accountId?: string;
}

interface PlayerAccountInfoMeta {
  mode: "search" | "detail";
  fetchedAt: string;
}

interface PlayerAccountInfoOutput {
  meta: PlayerAccountInfoMeta;
  /** Chỉ có khi mode = search — có thể nhiều account nếu `keyword` bare trùng tên nhiều tenant. */
  accounts?: SearchPlayerAccountItem[];
  /** Chỉ có khi mode = detail — RAW `GetPlayerAccountOutput`. */
  account?: unknown;
}

/** Orchestrate search HOẶC detail — 2 nhánh của cùng 1 nhu cầu "tra định danh player". */
class PlayerAccountInfoUseCase extends UseCase<PlayerAccountInfoInput, PlayerAccountInfoOutput> {
  private readonly search = new SearchPlayerAccountsUseCase();
  private readonly detail = new GetPlayerAccountUseCase();

  protected async execute(input: PlayerAccountInfoInput): Promise<PlayerAccountInfoOutput> {
    const fetchedAt = new Date().toISOString();

    if (input.accountId !== undefined) {
      const account = await this.detail.run({ accountId: input.accountId });
      return { meta: { mode: "detail", fetchedAt }, account };
    }

    if (input.keyword === undefined) {
      throw AppException.badRequest("Cần truyền `keyword` (tìm kiếm) hoặc `accountId` (xem hồ sơ).");
    }
    const { accounts } = await this.search.run({ keyword: input.keyword });
    return { meta: { mode: "search", fetchedAt }, accounts };
  }
}

const useCase = new PlayerAccountInfoUseCase();

export default defineTool({
  description:
    "Tra hồ sơ CƠ BẢN của 1 tài khoản player theo username/keyword hoặc theo `accountId` — CHỈ " +
    "dữ liệu KHÔNG nhạy cảm (tên hiển thị, trạng thái, đại lý, vai trò — KHÔNG có mật khẩu/email/" +
    "SĐT), KHÔNG kèm số liệu tài chính. Dùng cho câu hỏi kiểu 'player abc123 là ai', hoặc BẤT KỲ " +
    "lúc nào cần tra `accountId` từ username trước khi gọi tool khác cần accountId (vd " +
    "`getPlayerInsight`, `getFinancialByGame` không nhận username). Truyền `keyword` → chế độ " +
    "TÌM: dạng đầy đủ `username@tenantId` cho ĐÚNG 1 kết quả; username trần (không `@`) khớp " +
    "PREFIX, có thể trả NHIỀU người trùng tên ở đại lý khác nhau — hỏi lại staff chọn đúng người " +
    "khi có >1 kết quả. Truyền `accountId` → chế độ CHI TIẾT, trả đúng 1 hồ sơ. Muốn xem TÀI " +
    "CHÍNH/VÉ CHỜ của player → dùng `getPlayerInsight` (tool đó KHÔNG search theo username, cần " +
    "`accountId` sẵn — lấy từ tool này trước).",
  inputSchema: z
    .object({
      keyword: z.string().optional().describe("Username hoặc 1 phần username để tìm kiếm."),
      accountId: z.string().optional().describe("ID tài khoản player (ULID) để xem hồ sơ."),
    })
    .refine((v) => v.keyword !== undefined || v.accountId !== undefined, {
      message: "Cần truyền `keyword` hoặc `accountId`.",
    }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getPlayerAccountInfo"),
});
