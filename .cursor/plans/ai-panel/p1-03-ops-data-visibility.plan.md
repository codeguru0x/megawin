# p1-03 — Phủ dữ liệu vận hành cho Mira: bộ tool đọc theo domain + lộ trình subagent

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md` + yêu cầu user 17/08/2026: "dựa vào các API
> routes đang có trong backoffice, kết hợp tools hiện có, thiết kế tool hoặc sub-agent cho Mira
> xem được nhiều nội dung/dữ liệu hữu ích để hỗ trợ vận hành, hiểu toàn bộ hệ thống, support
> staff tốt nhất — kiến trúc mở rộng cao, dễ maintain".
> **Phụ thuộc:** p0-04 (đã done). **Song song được với p1-01 và p1-02** — chỉ giao nhau ở 2 file
> quen thuộc (`agent/instructions.md`, `tool-renderers/registry.tsx`); ai làm sau rebase.
> **Feature slug:** `ai-panel` · tuân `.cursor/plans/README.md`.

Mira hiện có **6 tool nghiệp vụ** (`getFinancialByGame`, `getFinancialDailyOverview`,
`getSystemOutstanding`, `getGameConfig`, `getGameJackpot`, `navigateToReport`) trong khi
backoffice có **324 API routes** (274 per-game + 50 hệ thống). Staff nhìn thấy trên web nhưng
Mira **mù hoàn toàn** các mảng: kỳ quay & vòng đời draw, giám sát vận hành realtime (alerts,
exposure), drill-down báo cáo settle/void, lịch sử jackpot, đại lý (tenant), người chơi
(player), audit log, và sức khoẻ tích hợp (tenant-dispatch, tx-logs, workers). Hệ quả thật:
staff hỏi "kỳ này có alert gì không", "đại lý X hoa hồng bao nhiêu", "lệnh dispatch nào đang
kẹt" — Mira chỉ biết trả lời "chưa có tool", dù dữ liệu nằm ngay trong hệ thống.

Nguyên tắc trung tâm của plan này:

> **Tool sinh ra theo CÂU HỎI của staff, không theo API route. Route là bằng chứng dữ liệu
> tồn tại — không phải danh sách việc phải làm.**

324 routes KHÔNG map thành 324 tools. Mỗi tool thêm vào là schema + description nằm trong
context **mỗi model call**; tool nhiều mà chọn sai còn tệ hơn tool ít mà đúng. Plan này chốt
**13 tool mới** (2 wave) phủ ~85% câu hỏi vận hành, cùng khung kiến trúc để tool thứ 14 trở đi
chỉ là "thêm 1 file theo pattern".

## Pattern tham chiếu (copy, không sáng tác)

| Việc | File mẫu |
| --- | --- |
| Tool mỏng gọi thẳng use-case package + `serializeDates` | `apps/backoffice/agent/tools/getFinancialByGame.ts` |
| Tool cần gộp 7 game + gắn nhãn → dispatcher `server/ai/<domain>/` | `apps/backoffice/src/server/ai/game-config/get-game-config-snapshot.ts` (switch exhaustive `GameProduct` + `assertNever`) |
| Use-case RAW trung lập dùng chung route + tool | `apps/backoffice/src/server/use-cases/jackpot/get-current-jackpots.ts` |
| Payload tự giải thích (`ConfigItem`/`item()`) — CHỈ khi cần nhãn | `apps/backoffice/src/server/ai/payload.ts` |
| Aggregate nhiều nguồn: `tryLoad` + `Promise.all` | `apps/backoffice/src/app/api/dashboard/jackpots/_lib/get-dashboard-jackpots.ts` |
| Tool output-driven, không side-effect server (điều hướng) | `apps/backoffice/agent/tools/navigateToReport.ts` |
| Registry render tool + nhãn tiếng Việt (`AiToolName`, `AI_TOOL_LABELS`) | `apps/backoffice/src/components/ai-chat/tool-renderers/registry.tsx` |
| Const object `as const` cho tập giá trị đóng | `packages/game-core/src/entities/game-core.enums.ts` (`GameProduct`) |
| Evals đo hành vi model (tool-choice) | p1-02 §7.2 + `node_modules/eve/docs/evals/*.mdx` |

---

## 0. Ma trận gap — dữ liệu web có, Mira chưa có

Đối chiếu 324 routes (kiểm kê 17/08/2026) với 6 tool hiện hữu. READ-only; mọi route WRITE
(publish-result, settle, void, config PUT, ack alert…) **ngoài scope plan này** — xem §9.

| Domain | Routes đại diện | Staff hỏi gì | Tool hiện có? | Wave |
| --- | --- | --- | --- | --- |
| Kỳ quay hiện hành cross-game | `dashboard/draws` | "Các game đang ở kỳ nào, kỳ nào sắp quay?" | ❌ | 1 |
| Vòng đời draw per-game | `{game}/draws`, `draws/current`, `draws/[drawId]` | "Kỳ #095 Keno trạng thái gì, quay lúc mấy giờ, bán được bao nhiêu?" | ❌ | 1 |
| Giám sát vận hành realtime | `{game}/operations/snapshot`, `alerts` | "Kỳ này có alert nào chưa xử lý? Doanh thu kỳ đang mở?" | ❌ | 1 |
| Exposure 1 bộ số | `{game}/operations/combo-lookup` | "Bộ số 01-02-03-04-05-06 Mega đang có bao nhiêu tiền cược?" | ❌ | 2 |
| Drill-down settle theo kỳ | `{game}/reports/draws[/**]` | "Kỳ hôm qua của Power game lãi bao nhiêu, đại lý nào đóng nhiều nhất?" | ❌ (chỉ có tổng theo game/ngày) | 1 |
| Báo cáo void | `{game}/reports/void[/**]` | "Tháng này huỷ mấy kỳ, hoàn bao nhiêu tiền?" | ❌ | 2 |
| Jackpot lịch sử/cycle | `{game}/jackpot/cycles`, `history-by-cycle` | "Jackpot Mega nổ lần gần nhất khi nào, bao nhiêu?" | ❌ (chỉ có số đang tích luỹ) | 2 |
| Đại lý: cấu hình + báo cáo | `{game}/tenant-config`, `reports/financial/by-tenant` | "Đại lý X hoa hồng Keno bao nhiêu? Tuần này đại lý nào doanh thu cao nhất?" | ❌ — `instructions.md` rule 10 đang phải dặn "nói rõ là chưa tra được" | 1 |
| Người chơi | `accounts/players/search`, `[accountId]/overview·financials·outstanding` | "Player 0987… tuần này cược bao nhiêu, trúng bao nhiêu, còn vé chờ không?" | ❌ | 2 |
| Audit log | `audit-logs` | "Ai sửa config Keno hôm qua? Ai publish kết quả kỳ #095?" | ❌ | 2 |
| Tích hợp tenant (dispatch) | `tenant-dispatch/summary`, `stuck-orders`, `list` | "Có lệnh trả thưởng nào kẹt không? Vì sao tenant Y chưa nhận callback?" | ❌ | 1 |
| Tx-logs (API log core↔tenant) | `transactions/api-logs[/**]` | "Giao dịch tx ABC trạng thái gì, lỗi gì?" | ❌ | 2 |
| Worker health | `system/workers` | "Worker settle Keno có đang bật không?" | ❌ | 1 |
| KPI dashboard ngày | `dashboard/kpis` | "KPI hôm nay so với hôm qua?" | ⚠️ một phần (`getFinancialDailyOverview` phủ gần hết) | — (bỏ, tránh trùng) |

**KHÔNG làm tool cho:** `me/**` (self-service của chính staff — hỏi Mira đổi password là sai
kênh), `auth/**`, `tenants` CRUD + `regenerate-key` (Admin-only + WRITE), `accounts` create
(WRITE), `{game}/draws/preview` (chỉ phục vụ form tạo kỳ trên UI).

---

## 1. Kiến trúc 3 tầng — thêm tool thứ N không đắt hơn tool thứ 2

```
agent/tools/<toolName>.ts            ← TẦNG 1: defineTool mỏng (description + Zod + safeRun)
        │  (chỉ khi cần gộp 7 game hoặc gắn nhãn cho model)
src/server/ai/<domain>/              ← TẦNG 2: dispatcher switch GameProduct + output shaping
        │  (raw, trung lập — route web dùng chung được)
src/server/use-cases/<domain>/       ← TẦNG 2b: aggregate RAW cross-package (nếu route cũng cần)
        │
packages/*-application               ← TẦNG 3: UseCase.safeRun() — nguồn logic duy nhất
```

Quy tắc chọn tầng cho từng tool — theo đúng ngưỡng `app-use-case-layering.mdc` §1, KHÔNG mặc
định tạo file `server/` cho mỗi tool:

1. **Package đã gộp hộ** (reports cross-game của `game-core-application`, `@megawin/audit`,
   `@megawin/tenant-dispatch`, `@megawin/tenant-gateway`, `identity-application`,
   `worker-core`) → tool import thẳng, **0 file mới ngoài `agent/tools/`**. Đây là đường đi
   của 7/13 tool mới.
2. **Cần fan-out 7 game** (draws, operations, tenant-config, jackpot history — use-case nằm ở
   7 package `game-{game}-application` riêng) → dispatcher ở `server/ai/<domain>/` theo pattern
   `get-game-config-snapshot.ts`: switch exhaustive trên `GameProduct`, nhánh `default:
   assertNever`, mỗi nhánh bind use-case + (nếu có) mapper của đúng game trong closure — game
   mới thêm vào enum là **đỏ compile ở mọi dispatcher**, không sót chỗ nào.
3. **Route web cũng cần cùng aggregate** → đặt phần RAW ở `server/use-cases/<domain>/`,
   `server/ai/` chỉ giữ mapper gắn nhãn (tiền lệ jackpot). Cụ thể trong plan này:
   `GetDashboardDrawsUseCase` đang nằm ở `app/api/dashboard/draws/_lib/` — **di chuyển** sang
   `src/server/use-cases/draws/` để route + tool dùng chung (route import path đổi, logic giữ
   nguyên).

**Điều CẤM giữ nguyên:** tool không chạm repo/DB; không gọi HTTP vòng qua `/api/**` (tool và
route là 2 consumer ngang hàng của cùng use-case — gọi HTTP là tự nhân đôi auth/serialize và
tạo N+1 latency); không import từ `app/api/**/_lib` (route-local); hướng phụ thuộc
`server/ai/**` → `server/use-cases/**` một chiều, verify bằng
`pnpm --filter @megawin/backoffice check:server-boundary`.

### 1.1 Kỷ luật chung cho MỌI tool mới (áp cả tool thứ 14 về sau)

1. **Read-only tuyệt đối.** Wave nào của plan này cũng không có tool WRITE. Tool ghi (ack
   alert, cancel dispatch…) là chuyện của plan sau với HITL approval + audit actor (§9).
2. **Trần output cứng.** Mọi tham số `limit`/`size` có default nhỏ (5–20) và max ≤ 50 —
   THẤP HƠN max của route web (100–500), vì consumer là context window chứ không phải bảng
   ảo hoá. Kết quả bị cắt phải nói rõ trong `meta` (xem 3).
3. **`meta` chống bịa trong mọi output:** `{ fetchedAt, count, truncated?: { returned, total,
   hint } }` — `hint` dạy model cách thu hẹp ("thêm tenantId để lọc", "giảm range"). Model
   không được im lặng khi dữ liệu bị cắt.
4. **`serializeDates` ở biên mọi tool** — kể cả khi DTO hiện tại toàn primitive (lớp chặn
   thứ 2, tiền lệ `getFinancialByGame`).
5. **Enum từ nguồn chuẩn:** `game` dùng `GameProduct`, nhãn từ `GAME_LABELS` — không map lại.
   Tập giá trị đóng mới (vd `DrawReportScope`) khai báo `const as const` + type dẫn xuất.
6. **Description viết theo công thức 3 phần:** (a) trả lời câu hỏi dạng nào — kèm ví dụ câu
   staff hỏi; (b) phân biệt với tool dễ nhầm ("muốn X thì dùng tool Y"); (c) giới hạn/lưu ý.
   Đây là phần model đọc MỖI call — đầu tư câu chữ ở đây rẻ hơn mọi lớp guard khác.
7. **Không trùng phạm vi:** trước khi thêm tool, tra bảng §2. Một câu hỏi chỉ nên có đúng 1
   tool đúng; 2 tool cùng trả lời được 1 câu là bug thiết kế (nguồn tool-choice error).

---

## 2. Danh mục 13 tool mới — spec từng tool

Ký hiệu tầng: **[T1]** chỉ file `agent/tools/` (import thẳng package) · **[T1+T2]** thêm
dispatcher `server/ai/<domain>/` · **[T1+T2b]** dùng/di chuyển use-case RAW ở
`server/use-cases/`.

### Wave 1 — vận hành hằng ngày (8 tool, làm trước)

#### 2.1 `getDrawsOverview` [T1+T2b]

- **Trả lời:** "Các game đang ở kỳ nào? Kỳ nào sắp đóng cổng/sắp quay?" — bức tranh cross-game
  1 call.
- **Input:** `z.object({})` (không tham số — giống `getSystemOutstanding`).
- **Nguồn:** `GetDashboardDrawsUseCase` sau khi di chuyển `app/api/dashboard/draws/_lib/` →
  `src/server/use-cases/draws/` (§1 mục 3). Route dashboard đổi import, hành vi giữ nguyên.
- **Output:** mỗi game 1 dòng `{ game, drawId, status, salesCloseAt, drawTime, … }` (RAW DTO).

#### 2.2 `getDrawDetail` [T1+T2]

- **Trả lời:** "Kỳ #2026-08-17.095 của Keno trạng thái gì, bán được bao nhiêu, đã publish
  chưa?" và "kỳ hiện tại của game X" khi không truyền `drawId`.
- **Input:** `{ game: enum(GameProduct), drawId?: string }` — bỏ trống `drawId` → kỳ hiện hành.
  Description nhắc model ưu tiên `clientContext.page.operations.drawId` (đã có rule 4
  instructions).
- **Nguồn:** dispatcher mới `server/ai/draws/get-draw-snapshot.ts` — switch 7 game →
  `GetDrawDetailUseCase` / `GetCurrentDrawUseCase` của `game-{game}-application` (đúng cặp
  use-case route `draws/[drawId]` + `draws/current` đang dùng).
- **Output:** DTO draw của game + `meta.game`. KHÔNG gắn nhãn `ConfigItem` — DTO draw là dữ
  liệu sự kiện, field tự hiểu được; chỉ config mới cần nhãn.

#### 2.3 `listDraws` [T1+T2]

- **Trả lời:** "Tuần này Keno quay bao nhiêu kỳ, kỳ nào chưa settle?" — danh sách kỳ có filter.
- **Input:** `{ game, status?: enum(DrawStatus), fromDate?, toDate?, page?, size? }` — `size`
  default 10, max 30.
- **Nguồn:** cùng dispatcher §2.2 (`server/ai/draws/`), nhánh `ListDrawsUseCase`.

#### 2.4 `getOpsSnapshot` [T1+T2]

- **Trả lời:** "Kỳ đang mở của Lotto doanh thu realtime bao nhiêu, có bao nhiêu alert mới?" —
  gộp stats + alert counts + trạng thái kỳ trong 1 call (đúng lý do route `operations/snapshot`
  tồn tại: 1 nguồn cho 1 timer).
- **Input:** `{ game, drawId }` (`drawId` bắt buộc — description chỉ model lấy từ
  `clientContext` hoặc gọi `getDrawDetail` trước).
- **Nguồn:** dispatcher `server/ai/operations/get-ops-snapshot.ts` → `GetOpsSnapshotUseCase`
  per game.
- **Lưu ý:** KHÔNG đụng cơ chế ETag/304 của route — tool luôn lấy tươi.

#### 2.5 `getOpsAlerts` [T1+T2]

- **Trả lời:** "Alert nào chưa xử lý? Có cảnh báo large bet/exposure không?" — chi tiết từng
  alert (snapshot chỉ có counts).
- **Input:** `{ game, drawId, status?: enum(OpsAlertStatus) }` — mặc định `new` (đúng cái staff
  cần xử lý), `grouped` cố định true như route.
- **Nguồn:** cùng dispatcher §2.4, nhánh `ListAlertsUseCase`.
- **Phân biệt trong description:** đọc alert thôi, KHÔNG ack được — muốn ack phải vào trang
  (gợi ý `navigateToReport` nếu có page tương ứng).

#### 2.6 `getTenantGameConfig` [T1+T2]

- **Trả lời:** "Đại lý X hoa hồng Keno bao nhiêu, có đang bật không?" — **đóng đúng gap mà
  `instructions.md` rule 10 đang phải dặn 'nói rõ là chưa tra được'**.
- **Input:** `{ game, tenantId?: string }` — bỏ trống → list config mọi đại lý của game đó.
- **Nguồn:** dispatcher `server/ai/tenant-config/get-tenant-game-config.ts` →
  `GetTenantConfigUseCase` / `ListTenantConfigsUseCase` per game.
- **Output:** gắn nhãn `ConfigItem` (`commissionRate` là `unit: "ratio"` — cùng lớp nghĩa với
  `getGameConfig`, model đã thuộc quy tắc đọc `label`/`unit`). Kèm `note` phân biệt "override
  riêng đại lý" vs "mặc định hệ thống" — đây chính là chỗ dễ trả nhầm mà rule 10 cảnh báo.

#### 2.7 `getDrawSettleReport` [T1]

- **Trả lời:** "Kỳ hôm qua của Power lãi bao nhiêu? Kỳ #095 đại lý nào đóng doanh thu nhiều
  nhất?" — drill-down settle mà 3 tool tài chính hiện có không xuống được.
- **Input:** `{ game, from, to, drawId?: string, page?, limit? }` — không `drawId`: danh sách
  kỳ đã settle trong range (`ListSettleDrawReportsUseCase`); có `drawId`: breakdown theo tenant
  của kỳ đó (`ListDrawTenantsUseCase`). 1 tool, 2 độ sâu — theo nguyên tắc superset, tránh 2
  tool cho 1 chuỗi drill.
- **Nguồn:** use-case reports per-game — **kiểm tra trước**: nếu nằm ở
  `game-{game}-application/use-cases/reports` (per-game) → cần dispatcher [T1+T2]; nếu
  `game-core-application` gộp sẵn → import thẳng. Người implement xác nhận bằng cách đọc route
  `{game}/reports/draws/route.ts` và ghi kết quả vào plan khi thực thi.

#### 2.8 `getIntegrationHealth` [T1+T2]

- **Trả lời:** "Có lệnh trả thưởng nào kẹt không? Worker nào đang tắt? Tình trạng callback
  sang tenant?" — 1 call gộp 3 nguồn cho câu hỏi "hệ thống có ổn không".
- **Input:** `{ from?, to?, tenantId? }`.
- **Nguồn:** `server/ai/integration/get-integration-health.ts` — `tryLoad` + `Promise.all` 3
  use-case: `GetDispatchSummaryUseCase` + `ListStuckOrdersUseCase` (limit 10) từ
  `@megawin/tenant-dispatch/use-cases/admin`, `ListWorkersHealthUseCase` từ
  `@megawin/worker-core/use-cases/admin`. Nguồn chết → block đó `unavailable`, không giết cả
  tool.
- **Phân biệt:** tổng quan sức khoẻ; chi tiết từng order → `getDispatchOrders` (Wave 2).

### Wave 2 — điều tra & đối soát (5 tool, ngay sau Wave 1)

#### 2.9 `searchAuditLogs` [T1]

- **Trả lời:** "Ai sửa config Keno hôm qua? Ai publish kết quả kỳ #095? Tài khoản X đã làm gì
  tuần này?" — truy vết thao tác.
- **Input:** mirror query của route `audit-logs` nhưng gọn: `{ from, to, actor?, game?,
  category?, action?, targetId?, limit? }` (limit default 20, max 50; giữ ràng buộc range ≤ 31
  ngày của use-case).
- **Nguồn:** `ListAuditLogsUseCase` từ `@megawin/audit` — import thẳng, 0 file T2.

#### 2.10 `getPlayerInsight` [T1]

- **Trả lời:** "Player 0987… là ai, tuần này cược/trúng bao nhiêu, còn vé chờ không?"
- **Input:** `{ keyword?: string, accountId?: string, from?, to? }` — có `keyword` không
  `accountId`: search (`SearchPlayerAccountsUseCase`, trả list gọn để model hỏi lại staff chọn
  ai); có `accountId`: `Promise.all` overview + financials + outstanding
  (`GetPlayerOverviewUseCase`, `GetPlayerFinancialsUseCase`, `GetPlayerOutstandingUseCase`).
  1 tool thay 4 — chuỗi "tìm rồi xem" là 1 ý định của staff.
- **Nguồn:** `identity-application` + `game-core-application` — import thẳng.
- **An toàn dữ liệu:** KHÔNG trả field nhạy cảm ngoài nhu cầu vận hành (không hash password,
  không token). Đối chiếu DTO route trước khi ship.

#### 2.11 `getJackpotHistory` [T1+T2]

- **Trả lời:** "Jackpot Mega nổ lần gần nhất khi nào, bao nhiêu tiền? Cycle hiện tại chạy được
  bao nhiêu kỳ?"
- **Input:** `{ game: enum(JackpotGameProduct), cycleNo?: number, page?, size? }` — không
  `cycleNo`: danh sách cycles (`ListJackpotCyclesUseCase`); có: diễn biến trong cycle
  (`ListJackpotHistoryByCycleUseCase`).
- **Nguồn:** dispatcher `server/ai/jackpot/get-jackpot-history.ts` (3 game JP). Mapper gắn
  nhãn tối thiểu, `note` nhắc "số lịch sử — số ĐANG tích luỹ dùng `getGameJackpot`".

#### 2.12 `getDispatchOrders` [T1]

- **Trả lời:** "Lệnh tx ABC đang ở trạng thái gì? Đại lý Y còn order nào retrying?" — drill
  sau khi `getIntegrationHealth` báo có vấn đề.
- **Input:** `{ tx?, tenantId?, gameId?, status?, retryMode?, from?, to?, limit? }` — có `tx`:
  `GetOrderByTxUseCase`; không: `ListDispatchOrdersUseCase`. Kèm tx-logs của giao dịch đó khi
  tra theo `tx` (`GetTxLogByTxUseCase` từ `@megawin/tenant-gateway`) — staff hỏi "vì sao kẹt"
  cần cả 2 mặt.
- **Nguồn:** import thẳng 2 package — 0 file T2 (aggregate 2 use-case ngay trong tool vẫn nằm
  dưới ngưỡng tạo file `server/`, tiền lệ 10/13 tool hiện tại).

#### 2.13 `getVoidReport` [T1 hoặc T1+T2 — cùng kết luận kiểm tra với §2.7]

- **Trả lời:** "Tháng này huỷ mấy kỳ, hoàn bao nhiêu tiền, kỳ nào?"
- **Input:** `{ game, from, to, drawId? }` — cùng pattern 2 độ sâu như §2.7
  (`ListVoidReportsUseCase` / `ListVoidDrawTenantsUseCase`).

### Để lại có chủ đích (KHÔNG làm trong p1-03, ghi lý do để khỏi bàn lại)

| Ứng viên | Lý do bỏ |
| --- | --- |
| `lookupComboExposure` | Câu hỏi hiếm, chỉ 4 game, staff chuyên trách đã có màn ops. Thêm khi có nhu cầu thật — dispatcher `operations/` đã sẵn, chi phí thêm ~1 file |
| `getDashboardKpis` | Trùng ~90% `getFinancialDailyOverview` — vi phạm §1.1 mục 7 |
| Tool đọc `tenants` CRUD/API key | Admin-only + lộ `callbackBaseUrl`/key qua channel Staff — vi phạm §4 |
| Drill-down entries tới từng vé (`reports/entries`, `players`) | Output to, câu hỏi cá biệt — đúng việc cho subagent điều tra (§6), không phải tool phẳng |
| `getTxLogsSummary` riêng | Gộp được vào `getIntegrationHealth`/`getDispatchOrders` |

---

## 3. Ngân sách token — đo trước khi ship, không đoán

6 tool hiện tại + 13 tool mới = **19 tool nghiệp vụ** (+ `bash`/`web_fetch`). Mỗi tool là
description + JSON schema trong context **mỗi model call**.

- **Bước đo bắt buộc sau Wave 1:** lấy usage tokens của 1 turn trước/sau khi thêm 8 tool
  (cùng câu hỏi), ghi số vào bảng dưới. Ước lượng ~150–250 token/tool → +2–5k token/call là
  mức chấp nhận được với context 200k; nhưng phải có SỐ THẬT.
- **Ngưỡng hành động:** nếu tổng schema vượt ~8k token HOẶC evals §7 cho thấy tool-choice
  error tăng → dừng thêm tool phẳng, kích hoạt lộ trình subagent (§6) sớm hơn dự kiến.

| Mốc | Số tool | Token overhead đo được | Ngày |
| --- | --- | --- | --- |
| Trước Wave 1 (baseline) | 6 + 2 | _(không đo — đã qua mốc)_ | |
| Sau Wave 1 | 14 + 2 | | |
| Sau Wave 2 | 19 + 2 | **input/lượt: trung vị 64.770 · tb 77.152 · max 281.438**; output/lượt: trung vị 278 · tb 373 · max 2.284; model call/lượt: trung vị 2 · max 8; $0,018/lượt | 2026-08-18 |

Số trên đo từ **53 case** `evals/` (run `.eve/evals/2026-08-18T06-53-40`, `sonnet-5` + `reasoning:
"low"`), tổng hợp `usage` của mọi `step.completed`. Đây là con số **cả lượt** (gồm system
instructions + 19 schema + kết quả tool), KHÔNG phải riêng overhead schema — muốn bóc riêng phần
schema thì phải chạy cùng câu hỏi với tập tool khác nhau, chưa làm.

**Hai kết luận đã dùng để sửa code, đừng đo lại từ đầu:**

1. **Prompt cache KHÔNG giảm trần session.** Cache đọc lại chiếm **92,2%** input, nhưng
   `inputTokens` provider báo **đã gộp** `cacheReadTokens` (ví dụ thật: `inputTokens: 32.039` với
   `cacheReadTokens: 31.912`). Cache chỉ giảm **tiền**. Ai nhìn tỷ lệ cache cao rồi kết luận "trần
   session dùng chậm hơn thực tế" là sai.
2. **`limits` là bộ bắt loop, không phải hạn mức chi phí** — eve tự gọi nó là _"a guardrail against
   defective long-running sessions"_. Trần 2M input từng đặt ⇒ chỉ ~30 lượt, trong khi 200k output
   ⇒ ~700 lượt: hai trục lệch 24 lần, input thành nút cổ chai và staff gặp continuation prompt mỗi
   ~30 lượt. Đã nâng input lên **20M** (~300 lượt trung vị) cho cân với trục output — xem comment
   trong `agent/agent.ts`.

Kỷ luật viết schema tiết kiệm: `.describe()` ngắn gọn đúng trọng tâm; enum dùng chung
(`GameProduct`) không lặp mô tả giá trị; KHÔNG nhét bảng hướng dẫn dài vào description — quy
tắc chọn tool theo domain nằm ở `instructions.md` (§5), nơi viết 1 lần thay vì lặp trong 19
schema.

---

## 4. An toàn & quyền — tool kế thừa trần quyền của channel, không tự nới

1. **Channel eve đã fail-closed ở role Staff** (`channels/eve.ts` — better-auth, reject thiếu
   `CompanyRole.Staff`). Mọi tool trong plan này chỉ expose dữ liệu mà **role Staff xem được
   trên web**. Route Admin-only (`tenants` CRUD, `regenerate-key`) KHÔNG có tool tương ứng —
   kể cả read: `callbackBaseUrl`/API key là bí mật tích hợp, không phải số liệu vận hành.
2. **Chưa làm phân quyền per-tool theo role trong turn** (Staff vs Admin thấy tool khác nhau)
   — hiện mọi data tool đều ở trần Staff nên chưa cần. Khi có tool Admin-only đầu tiên: giải
   quyết ở tầng tool bằng cách đọc identity từ auth context của eve, ghi thành mục riêng lúc
   đó (KHÔNG thiết kế trước — YAGNI).
3. **Read-only enforce bằng kiến trúc, không bằng lời hứa:** tool chỉ import use-case
   Get*/List*/Search*. Mọi use-case Create/Update/Trigger/Cancel xuất hiện trong
   `agent/tools/` là red flag khi review — grep nhanh:
   `rg -n "Use(Create|Update|Set|Trigger|Cancel|Void|Publish)" apps/backoffice/agent/tools`.
4. **Dữ liệu player:** `getPlayerInsight` trả đúng tập field màn hình player của backoffice
   hiển thị, không hơn. Không log payload chứa danh tính player ra console tool.
5. **Prompt-injection surface không đổi:** tool mới đều đọc DB nội bộ (dữ liệu tin cậy),
   không thêm nguồn text ngoài như `web_fetch` — không cần rule injection mới.

---

## 5. Cập nhật `agent/instructions.md` — bản đồ domain, viết 1 lần

Thêm mục "Chọn tool theo domain" (đặt sau mục "Cách dùng tool" hiện có), dạng bảng ngắn — đây
là chỗ chống tool-choice error rẻ nhất:

| Câu hỏi về | Tool |
| --- | --- |
| Tổng tài chính theo ngày / theo game / theo đại lý | `getFinancialDailyOverview` / `getFinancialByGame` / (by-tenant — xem `getDrawSettleReport` khi theo kỳ) |
| Kỳ quay: hiện hành cross-game / chi tiết 1 kỳ / danh sách kỳ | `getDrawsOverview` / `getDrawDetail` / `listDraws` |
| Kỳ ĐANG MỞ: doanh thu realtime, alert | `getOpsSnapshot` (số) / `getOpsAlerts` (chi tiết alert) |
| Kỳ ĐÃ SETTLE: lãi/lỗ, breakdown đại lý | `getDrawSettleReport` — KHÔNG dùng ops snapshot |
| Vé chờ settle | `getSystemOutstanding` |
| Cấu hình hệ thống / cấu hình RIÊNG đại lý | `getGameConfig` / `getTenantGameConfig` |
| Jackpot đang tích luỹ / lịch sử nổ | `getGameJackpot` / `getJackpotHistory` |
| Người chơi | `getPlayerInsight` |
| Ai đã làm gì (truy vết) | `searchAuditLogs` |
| Hệ thống có ổn không / lệnh dispatch cụ thể | `getIntegrationHealth` / `getDispatchOrders` |

Kèm 3 rule hành vi mới (đánh số tiếp 11–13):

- **11 — realtime vs settled:** số từ `getOpsSnapshot` là realtime kỳ đang mở, thay đổi liên
  tục — không dùng trả lời "kỳ hôm qua lãi bao nhiêu" (đó là `getDrawSettleReport`). Ngược
  lại report settle không có kỳ chưa đóng.
- **12 — dữ liệu bị cắt:** khi `meta.truncated` xuất hiện, PHẢI nói rõ "đang hiển thị X/Y" và
  đề nghị thu hẹp theo `meta.truncated.hint` — không được trình bày như danh sách đầy đủ.
- **13 — hoa hồng đại lý:** sửa đoạn rule 10 hiện tại ("nếu chưa có tool đọc được, nói rõ là
  chưa tra được") → trỏ sang `getTenantGameConfig`.

---

## 6. Subagent — phân tích thẳng: CHƯA, và trigger đo được để đổi ý

User hỏi "tool hoặc sub-agent". Trả lời có căn cứ:

**P1 này KHÔNG dùng subagent, vì:**

1. **Vấn đề hiện tại là THIẾU DỮ LIỆU, không phải thừa context.** 13 tool mới giải quyết đúng
   bệnh. Subagent giải quyết bệnh khác (context isolation cho investigation dài) — chưa mắc.
2. **19 tool vẫn trong vùng model chọn tốt** (thực nghiệm chung: suy giảm rõ khi >30–40 tool
   mô tả kém; ta có bảng domain §5 + description 3 phần §1.1). Khẳng định lại bằng evals §7.
3. **Chi phí subagent là thật:** mỗi lần gọi là 1 session con (latency + token khởi tạo), thêm
   1 tầng debug, thêm surface eval. Trả chi phí đó khi có lợi ích đo được, không trả trước.

**Trigger mở plan `p2-02-subagents` (bất kỳ 1 trong 3, có số thật):**

| # | Trigger | Cách đo |
| --- | --- | --- |
| T1 | Tool-choice error ≥ 15% trên bộ eval §7 sau Wave 2 | eve evals, chạy định kỳ |
| T2 | Câu hỏi điều tra đa bước (≥4 tool call, drill entries/players) làm turn vượt ngân sách context hoặc bị compaction cắt giữa chừng | usage log turn thật |
| T3 | Tổng schema tool vượt ~8k token mà vẫn còn domain mới cần phủ (§3) | đo bảng §3 |

**Phác thảo sẵn để p2-02 không bắt đầu từ giấy trắng** (chỉ phác, không implement):

- `investigator` — nhận câu hỏi điều tra ("vì sao kỳ X lệch tiền", "player Y có bất thường
  không"), được cấp bộ tool drill-down sâu (entries/players/lines — chính các tool đã cố ý bỏ
  ở §2), chạy nhiều bước trong context RIÊNG, trả về **kết luận + bằng chứng đã chưng cất**.
  Agent chính chỉ nhận bản chưng cất — context chính không phình.
- `integration-doctor` — chẩn đoán dispatch/tx-logs/workers theo playbook (skill riêng), trả
  root-cause + đề xuất. Tách vì playbook chẩn đoán dài, không đáng nằm trong instructions
  chính.
- Ranh giới: subagent cũng read-only, cùng trần quyền channel; agent chính là người duy nhất
  nói chuyện với staff.

---

## 7. Evals — mở rộng khung p1-02 cho tool-choice

Bộ case mới `agent/evals/` (theo khung p1-02 §7.2, chạy cùng lệnh):

1. **Tool-choice theo domain** — mỗi tool ≥ 2 case hỏi kiểu staff thật (1 câu dùng từ chuyên
   môn, 1 câu nói đời thường) → assert đúng tool được gọi, đúng tham số chính (`game`,
   `drawId`, range).
2. **Case phân biệt cặp dễ nhầm** (quan trọng nhất): ops-snapshot vs settle-report ("kỳ này
   lãi bao nhiêu" khi kỳ đang mở vs đã settle), `getGameConfig` vs `getTenantGameConfig`
  ("hoa hồng Keno" vs "hoa hồng đại lý X"), `getGameJackpot` vs `getJackpotHistory`.
3. **Truncation:** seed case trả `meta.truncated` → assert câu trả lời có nói rõ bị cắt
   (rule 12).
4. **Từ chối đúng:** hỏi API key đại lý / đổi config → assert không gọi tool WRITE nào (không
   tồn tại) và từ chối rõ ràng.

---

## 8. Tool renderers — mức tối thiểu, không chặn ship

Mỗi tool mới thêm entry `AiToolName` + `AI_TOOL_LABELS` (nhãn tiếng Việt) trong
`tool-renderers/registry.tsx` — bắt buộc, file giao với p1-01/p1-02 (ai làm sau rebase).
Renderer chuyên biệt (card/bảng) CHỈ làm cho 4 tool trả lời hằng ngày: `getDrawsOverview`,
`getOpsSnapshot`, `getDrawSettleReport`, `getIntegrationHealth` — còn lại dùng render 3 tầng
mặc định của p0-04. Card đẹp cho tool ít dùng là chi phí trước lợi ích.

---

## 9. Thứ tự thực hiện & verify

```
§1 di chuyển GetDashboardDrawsUseCase → server/use-cases/draws/ (kèm sửa route import)
   │
Wave 1: dispatcher draws/ + operations/ + tenant-config/ (T2) → 8 tool (T1)
   │   → §5 instructions + §8 registry labels → đo token baseline/sau (§3)
   │   → evals Wave 1 (§7) → verify checklist dưới
Wave 2: 5 tool còn lại + evals bổ sung + đo token lần cuối
```

Checklist verify mỗi wave (không tick bằng mắt):

- [ ] `pnpm --filter @megawin/backoffice check-types`
- [ ] `pnpm --filter @megawin/backoffice check:server-boundary` (hướng `ai/` → `use-cases/`)
- [ ] `npx biome check <paths đã sửa>`
- [ ] `cd apps/backoffice && npx eve build` — mỗi tool xuất hiện trong artifact compile
- [ ] Grep read-only §4 mục 3 không match gì trong `agent/tools/`
- [ ] 1 turn thật qua UI cho MỖI tool mới (câu hỏi tự nhiên, không nêu tên tool) — số khớp
      với màn hình web tương ứng
- [ ] Evals §7 pass; ghi số token vào bảng §3
- [ ] Sửa `.md` xong chạy `pnpm format:docs`

## 10. Ngoài scope (ghi nhận, không làm)

- **Tool WRITE** (ack alert, cancel dispatch, open/close sales…) — cần HITL approval + audit
  actor + eval riêng; mở plan mới khi có yêu cầu thật, khung HITL đã có ở p1-01.
- **Subagents** — chờ trigger §6, mở `p2-02-subagents`.
- **`lookupComboExposure`, drill entries/players phẳng, KPI dashboard** — lý do ở cuối §2.
- **Phân quyền per-tool theo role** — §4 mục 2, khi có tool Admin-only đầu tiên.
- **Renderer card cho toàn bộ tool** — §8.
- **Rate limiting per-user** — vẫn ở P2 như 00-overview.

