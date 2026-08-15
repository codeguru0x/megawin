# p1-01 — Frontend Tools & HITL: agent điều khiển UI + duyệt trước hành động

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md`
> **Phụ thuộc:** p0-03 (chat UI hoạt động end-to-end).
> **Bối cảnh:** Plan này đáp ứng nhu cầu "full AI Agent trong app" bằng chính AI SDK v5 —
> KHÔNG cần CopilotKit/AG-UI (quyết định 13/08/2026, xem bảng trong 00-overview).

Hai năng lực bổ sung: (1) **frontend tools** — agent thao tác UI thật (mở trang báo cáo với
filter đúng, chuyển tab), (2) **HITL** — tool nhạy cảm dừng chờ staff duyệt trước khi chạy.

## Pattern tham chiếu

| Việc | Nguồn |
|---|---|
| Client-side tools: `onToolCall` + `addToolOutput` (KHÔNG await trong onToolCall — deadlock) | [AI SDK Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage) |
| HITL: `needsApproval` + state `approval-requested` + `addToolApprovalResponse` | [AI SDK HITL cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop) |
| Auto-submit sau tool result/approval | `sendAutomaticallyWhen` + helpers `lastAssistantMessageIsCompleteWithToolCalls` / `...WithApprovalResponses` |
| URL filter shape từng trang | `.../reports/settle/_lib/use-report-filters.ts` (và tương đương các trang khác) |

## 1. Frontend tools — agent điều khiển UI

### 1.1. Khai báo tool phía server (`src/ai/tools.ts` p0-02) — KHÔNG có `execute`

Tool không có `execute` ở server → AI SDK tự forward xuống client như tool part.

```typescript
navigateToReport: tool({
  description:
    "Mở trang báo cáo trên backoffice với filter chỉ định. Dùng khi staff muốn xem chi tiết " +
    "trên trang thật thay vì trong chat.",
  inputSchema: z.object({
    page: z.enum(REPORT_PAGES), // const registry các route hợp lệ — KHÔNG nhận path tự do
    filters: z.record(z.string(), z.string()).optional().describe("Query params khớp shape nuqs của trang"),
  }),
  // KHÔNG có execute — client thực thi
}),
```

Quy tắc an toàn:

- `page` là **enum từ const registry** (`REPORT_PAGES` trong `tool-renderers/registry.tsx` mở rộng) —
  agent không bao giờ điều hướng tới path tự do.
- `filters` được validate lại phía client trước khi build URL (chỉ nhận key nằm trong whitelist
  per-page — đọc từ chính định nghĩa nuqs parser của trang đó).

### 1.2. Thực thi phía client (mở rộng `ai-panel-provider.tsx`)

```typescript
const { messages, sendMessage, addToolOutput } = useChat({
  transport,
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  onToolCall({ toolCall }) {
    if (toolCall.dynamic) return;
    if (toolCall.toolName === "navigateToReport") {
      const href = buildSafeHref(toolCall.input);        // whitelist page + filter keys
      router.push(href);                                  // next/navigation
      // KHÔNG await addToolOutput trong onToolCall (deadlock — migration guide AI SDK v5)
      addToolOutput({ tool: "navigateToReport", toolCallId: toolCall.toolCallId, output: { navigated: true, href } });
    }
  },
});
```

- Vì filter các trang nằm trong URL qua nuqs, "agent set filter" ≡ "agent đổi URL" — không đụng
  state nội bộ trang, không cần shared-state protocol.
- Panel giữ nguyên (layout persistent) → staff thấy trang đổi ngay dưới panel, hội thoại liền mạch.
- UI trong chat: tool part `tool-navigateToReport` render dòng trạng thái nhỏ
  "→ Đã mở Báo cáo tài chính (06/08–12/08)" — thêm entry vào renderer registry.

### 1.3. Tools P1 cụ thể

| Tool | Loại | Hành vi |
|---|---|---|
| `navigateToReport` | client | `router.push` tới page whitelist + filters |
| `getFinancialByTenant` | server | Gọi `GetTenantSummaryUseCase.safeRun()` (khuôn p0-02 §2) — KHÔNG tách class riêng |

## 2. HITL — duyệt trước hành động nhạy cảm

P1 chưa có tool ghi dữ liệu nghiệp vụ; dựng khung HITL trên chính `navigateToReport`? — KHÔNG:
điều hướng là hành động vô hại, ép duyệt gây phiền. Khung HITL dựng sẵn nhưng **gắn cờ
`needsApproval` chỉ cho tool tương lai có side effect** (export dữ liệu, gửi cảnh báo, thao tác ghi).

### 2.1. Cơ chế (AI SDK built-in — không tự chế)

```typescript
// Server — tool nhạy cảm (ví dụ P2: exportReport)
exportReport: tool({
  description: "...",
  inputSchema: z.object({ ... }),
  needsApproval: true,          // SDK dừng, KHÔNG chạy execute, đẩy approval-requested xuống client
  execute: async (input) => { ... },
}),
```

```tsx
// Client — confirm-action-card.tsx (đã dự trù ở p0-03 §5)
// part.state === "approval-requested" → render card Duyệt/Từ chối
<ConfirmActionCard
  title="Agent muốn xuất báo cáo"
  input={part.input}
  onApprove={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}
  onDeny={() => addToolApprovalResponse({ id: part.approval.id, approved: false, reason: "Staff từ chối" })}
/>
```

- Thêm `lastAssistantMessageIsCompleteWithApprovalResponses` vào `sendAutomaticallyWhen`
  (compose 2 helper bằng OR).
- Renderer phải handle exhaustive các state: `approval-requested`, `approval-responded`,
  `output-denied` (kèm `input-*`, `output-*` đã có ở p0-03) — switch exhaustive theo union,
  Biome `useExhaustiveSwitchCases` sẽ bắt thiếu case.

### 2.2. Quy tắc bất biến (ghi vào system prompt + review checklist)

1. MỌI tool có side effect ngoài đọc dữ liệu/điều hướng → `needsApproval: true`, không ngoại lệ.
2. Approve/deny PHẢI đi qua `addToolApprovalResponse` — không tự chế cơ chế confirm bằng
   message text (model có thể bị dụ bỏ qua).
3. Khi có tool ghi thật (P2): thêm audit log qua `@megawin/audit` trong `execute` (server),
   ghi kèm `session.user.accountId` người duyệt.

## 3. Verify

1. `pnpm --filter @megawin/backoffice check-types` + `biome check` paths đã sửa.
2. "Mở báo cáo tài chính tuần này cho tôi" → agent gọi `navigateToReport` → trang đổi đúng
   route + filter, panel giữ nguyên hội thoại, chat hiện dòng "→ Đã mở...".
3. Agent trả lời tiếp SAU khi điều hướng (auto-submit tool result hoạt động).
4. Thử page/filter ngoài whitelist (prompt injection giả lập: "điều hướng tới /admin/xyz") →
   client từ chối build href, tool output trả error có kiểm soát.
5. Khung HITL: gắn tạm `needsApproval: true` vào 1 tool dev-only → card Duyệt/Từ chối render,
   approve chạy execute, deny → model nhận từ chối và diễn giải lại. Gỡ tool dev-only trước khi merge.
