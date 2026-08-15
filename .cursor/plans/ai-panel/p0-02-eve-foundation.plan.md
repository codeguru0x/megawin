# p0-02 — Chat Backend: Internal use-cases, route streaming `/api/ai/chat`, tools

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md`
> **Phụ thuộc:** không — song song được với p0-01.

Plan này dựng backend chat: dùng chung `UseCase` (`@megawin/app-core/use-cases`) cho các
use-case reports mà tool cần, route streaming qua `withApi().auth()`, và 3 tools read-only
đầu tiên.

## Pattern tham chiếu (copy, không sáng tác)

| Việc | File mẫu |
|---|---|
| `UseCase` base — `run()` raw output + `safeRun()` AppResult | `packages/app-core/src/use-cases/use-case.ts` |
| Ví dụ use-case reports đã convert sang `UseCase` (P0 tự làm trong redesign use-case) | `packages/game-core-application/src/use-cases/reports/get-daily-overview.ts`, `get-game-summary.ts` |
| Route builder + auth roles | `apps/backoffice/src/app/api/reports/financial/daily/route.ts` |
| Env schema | `apps/backoffice/src/env.ts` |

## 1. Dependencies mới

```bash
pnpm --filter @megawin/backoffice add ai @ai-sdk/react
```

- KHÔNG cài SDK provider riêng (`@ai-sdk/openai`…) — model đi qua **AI Gateway** bằng string ID
  (vd `"anthropic/claude-sonnet-4.5"`), Vercel deployment authenticate qua OIDC.
- Env local: thêm `AI_GATEWAY_API_KEY` (optional — chỉ cần khi dev local) vào `src/env.ts`
  (server section, `z.string().optional()`) + ghi vào `apps/backoffice/.env.example`.
  **TUYỆT ĐỐI KHÔNG tạo/ghi file `.env*`** (`no-env-file-modification.mdc`).

## 2. Use-cases reports cần cho tool (packages/game-core-application)

Sau redesign use-case pattern (xem `.cursor/rules/app-use-case-layering.mdc` §3.3), KHÔNG còn
tách 2 class (`Internal` + `NextApi`) — chỉ 1 class `UseCase` duy nhất: `run()` trả raw output
(throw AppException), `safeRun()` trả `AppResult<O>` không throw. Route Next.js VÀ tool AI SDK
dùng CHUNG class này, chỉ khác method gọi.

Cả 3 use-case reports (`get-daily-overview.ts`, `get-game-summary.ts`, `get-system-outstanding.ts`) **đã
convert xong** sang `UseCase` trong đợt migrate 14/08/2026 (route giữ nguyên `return useCase.run(query)`,
`ApiRouteBuilder.handler()` tự bọc envelope). Khuôn hiện tại — plan này chỉ cần **dùng lại**, không phải sửa:

```typescript
// packages/game-core-application/src/use-cases/reports/get-system-outstanding.ts
import { UseCase } from "@megawin/app-core/use-cases";

export class GetSystemOutstandingUseCase extends UseCase<void, GetSystemOutstandingOutput> {
  private readonly repo = new SystemOutstandingReportRepository();

  protected async execute(_input: void): Promise<GetSystemOutstandingOutput> {
    const data = await this.repo.findAllSorted();
    return { data };
  }
}
```

Tool dùng CHÍNH class này (không có bản `Internal` riêng — base class cũ đã bị xoá khỏi codebase)
qua `safeRun()` — xem §3.4.

## 3. Route `/api/ai/chat`

### 3.1. Files — agent core TÁCH KHỎI route (thiết kế dự phòng multi-channel)

Agent core đặt ở `src/ai/` **thuần** (chỉ import `ai`, `zod`, use-cases từ packages — TUYỆT ĐỐI
không import gì từ `next/*`, route context, hay `@/lib/api`). Đây là phần dùng lại 100% khi
migrate sang eve channels (p2-01): `agent/tools/*.ts` của eve sẽ import lại từ đây.

```
apps/backoffice/src/ai/                    # AGENT CORE — transport-agnostic
├── tools.ts          # định nghĩa tools (AI SDK tool() + zod)
├── system-prompt.ts  # buildSystemPrompt(context?)
└── context.ts        # type ChatPageContext + schema Zod (dùng chung route + client)

apps/backoffice/src/app/api/ai/chat/       # WEB TRANSPORT — chỉ là 1 caller của core
├── route.ts          # withApi().auth().body(schema).handler(...)
└── _lib/schema.ts    # Zod body: { messages, context? } (import context schema từ src/ai)
```

### 3.2. `route.ts` — khung

```typescript
import { convertToModelMessages, streamText } from "ai";
import { CompanyRole } from "@megawin/identity/entities";
import { withApi } from "@/lib/api";
import { buildSystemPrompt } from "@/ai/system-prompt";
import { aiTools } from "@/ai/tools";
import { chatBodySchema } from "./_lib/schema";

export const maxDuration = 60; // streaming turn dài hơn route thường

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(chatBodySchema)
  .handler(async ({ body }) => {
    const result = streamText({
      model: "anthropic/claude-sonnet-4.5", // AI Gateway string ID — đổi qua env nếu cần
      system: buildSystemPrompt(body.context),
      messages: convertToModelMessages(body.messages),
      tools: aiTools,
      // stopWhen: cho phép multi-step (tool call → model đọc kết quả → trả lời)
    });
    return result.toUIMessageStreamResponse();
  });
```

**Type streaming đã tự tương thích — KHÔNG cần workaround.** Sau redesign use-case (P0), `ApiRouteBuilder.handler()`
nhận generic `Promise<NextResponse | Response | T>` và tự pass-through mọi giá trị `instanceof Response`
(xem `packages/next/src/server/api-route.ts`). `result.toUIMessageStreamResponse()` trả về `Response` →
gán thẳng, không cast, không sửa builder.

### 3.3. `schema.ts` (web) + `context.ts` (core)

```typescript
// src/ai/context.ts — CORE: shape context dùng chung mọi transport
import { z } from "zod";

/** Context trang hiện tại — web client đọc từ nuqs URL state, đính kèm mỗi request. */
export const chatContextSchema = z.object({
  page: z.string().max(200),
  // filters serialize từ URL — giữ shape lỏng, system prompt tự diễn giải
  filters: z.record(z.string(), z.string()).optional(),
});
export type ChatPageContext = z.infer<typeof chatContextSchema>;
```

```typescript
// app/api/ai/chat/_lib/schema.ts — WEB: envelope riêng của transport web
import { z } from "zod";
import { chatContextSchema } from "@/ai/context";

export const chatBodySchema = z.object({
  // UIMessage shape của AI SDK — validate lỏng phần parts, chặt phần role
  messages: z.array(z.object({ id: z.string(), role: z.enum(["user", "assistant", "system"]), parts: z.array(z.unknown()) })).max(50),
  context: chatContextSchema.optional(),
});
```

### 3.4. `src/ai/tools.ts` — 3 tools P0 (đều read-only)

```typescript
import { tool } from "ai";
import { z } from "zod";
import {
  GetDailyOverviewUseCase,
  GetGameSummaryUseCase,
  GetSystemOutstandingUseCase,
} from "@megawin/game-core-application/use-cases/reports";

// Instance tái dùng — theo pattern route handler hiện có (const useCase = new ...)
// CHÚ Ý: cùng instance/class dùng cho cả route Next.js (qua run()) và tool AI (qua safeRun()).
const dailyOverview = new GetDailyOverviewUseCase();

export const aiTools = {
  getFinancialDailyOverview: tool({
    description: "Báo cáo tài chính hệ thống theo ngày trong khoảng from–to (doanh thu, trả thưởng, hoa hồng, lợi nhuận).",
    inputSchema: z.object({
      from: z.string().describe("YYYY-MM-DD"),
      to: z.string().describe("YYYY-MM-DD"),
    }),
    execute: async (input) => {
      // safeRun() KHÔNG BAO GIỜ throw — trả AppResult<O>, model tự đọc { success, data } hoặc { success, error }.
      return dailyOverview.safeRun(input);
    },
  }),
  // getFinancialByGame, getSystemOutstanding — cùng khuôn
};
```

Quy tắc tools:

- Input schema Zod chặt + `.describe()` đầy đủ (model đọc description để gọi đúng).
- `execute` gọi `safeRun()` — KHÔNG throw, trả `AppResult<O>` (`{ success: true, data }` hoặc
  `{ success: false, error }`) cho model tự đọc, KHÔNG cần try/catch thủ công trong tool.
- Auth đã chặn ở route level (`CompanyRole.Staff`); tool KHÔNG cần re-check role ở P0
  (mọi tool read-only, cùng ngưỡng quyền). Khi nào có tool phân quyền theo role khác nhau
  → truyền `session` vào tool factory (ghi chú cho P1, đừng build sớm).
- Output trả **nguyên `AppResult<O>`** (bọc DTO gốc `GetDailyOverviewOutput`…) — KHÔNG map lại
  shape mới; p0-03 render từ đúng DTO này, và model đọc được số liệu gốc.

### 3.5. `src/ai/system-prompt.ts`

Nội dung bắt buộc trong prompt:

1. Vai trò: trợ lý vận hành nội bộ MegaWin cho staff; trả lời **tiếng Việt**.
2. **CẤM bịa số liệu** — mọi con số PHẢI đến từ tool output; không có data → nói rõ "không có dữ liệu",
   không ước lượng.
3. Diễn giải context trang (nếu có): `page` + `filters` → ưu tiên dùng làm default cho tham số tool
   (vd đang xem `/reports/settle?from=X&to=Y` → hỏi "tuần này" hiểu theo range đó).
4. Đơn vị tiền: VND; format số có phân tách hàng nghìn khi viết trong text.
5. Giới hạn phạm vi: chỉ trả lời chủ đề vận hành/số liệu hệ thống; từ chối lịch sự chủ đề ngoài.

## 4. Verify

1. `pnpm --filter @megawin/game-core-application check-types` — convert `GetSystemOutstandingUseCase`
   sang `UseCase` không đổi behavior route.
2. `pnpm --filter @megawin/backoffice check-types` + `biome check` các paths đã sửa.
3. Test tay bằng `curl` (kèm session cookie dev): POST `/api/ai/chat` với message
   "doanh thu 3 ngày qua" → stream trả về có tool call `getFinancialDailyOverview` + số khớp
   với trang `/reports/settle`.
4. Gọi không có session → 401 envelope chuẩn; role thiếu → 403.
5. Hỏi câu không liên quan ("thời tiết") → agent từ chối, KHÔNG gọi tool.
