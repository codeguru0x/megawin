# p1-04 — Điều hướng toàn backoffice bằng agent: nav registry + deep-link resolver

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md` + yêu cầu user 17/08/2026: "backoffice có nhiều
> URL điều hướng và tham số mặc định/tham số truyền vào. Muốn AI Agent điều hướng đến 1 trang cụ
> thể — thiết kế sub-agent, skill, hay cách nào tương thích với backoffice và yêu cầu lúc chat?
> `navigate-tool-card.tsx` đã có nhưng nội dung chuyển trang chưa phổ biến. Ví dụ: 'di chuyển đến
> trang cá nhân của user abc' → web điều hướng đúng trang với param mặc định hoặc param truyền vào.
> Trước khi làm hãy nghĩ kỹ chức năng này có cần thiết không?"
> **Phụ thuộc:** p1-03 (cần `getPlayerAccountInfo`/`getDrawDetail` để resolve identifier).
> **Song song được với p1-01** — giao nhau ở `navigate-tool-card.tsx` + `registry.tsx`; ai làm sau rebase.
> **Feature slug:** `ai-panel` · tuân `.cursor/plans/README.md`.

## Kết luận về "có cần thiết không" — CÓ, nhưng KHÔNG phải chức năng bạn nghĩ

Câu trả lời thẳng: **giá trị KHÔNG nằm ở "điều hướng bằng chat"**. Nó nằm ở **resolve tham số**.

Đo hiện trạng (kiểm kê 17/08/2026): backoffice có **80 route** dưới `(main)`, command palette `⌘J`
(`search-dialog.tsx`) phủ **~50** route và **0 query param**. Với điều hướng trần ("mở báo cáo
settle"), `⌘J` + 2 ký tự **nhanh hơn** gõ một câu tiếng Việt rồi chờ model round-trip 3–8s. Nếu bán
tính năng này như "cách điều hướng mới" thì nó sẽ chậm hơn thứ đang có và staff sẽ bỏ dùng.

Chỗ `⌘J` **không thể** làm, và chỉ agent làm được, là khi đích đến cần **dữ liệu phải tra mới biết**:

| Yêu cầu của staff | Vì sao palette bất lực | Việc agent phải làm |
| --- | --- | --- |
| "mở trang cá nhân của user abc" (ví dụ của user) | URL cần `accountId` (ULID), staff chỉ biết username | `getPlayerAccountInfo` → `accountId` → `/accounts/players/<accountId>/settle` |
| "xem vé chờ của player đó ở kỳ hôm qua" | cần `accountId` **và** `drawId` | 2 tool tra + build 4 param (`draw`,`player`,`playerName`) |
| "mở báo cáo tài chính tuần này" | cần tính `from`/`to` theo ngày **tài chính** (đổi lúc 11:00 VN) | đọc `clientContext.financialDate` |
| "mở drill-down đại lý của kỳ #095" | `level=draw-tenants` + `drawId` + `tab` — staff phải bấm 4 bước UI | 1 href |
| "cho tôi runbook resettle Mega" | `/guides/mega645/resettle/type-a` — không có trong palette | registry biết 9 URL hợp lệ |

Tức là: **deep-link resolver**, không phải "nav bằng giọng nói". Đây cũng là phần tiếp nối tự nhiên
của thứ Mira đã làm — trả lời bằng số rồi **giao việc tiếp** ("mở trang để xem chi tiết").

Ba lý do nữa khiến việc này đáng làm **bây giờ** thay vì để sau:

1. **Hạ tầng đã có sẵn 90%**: tool output-driven + client re-validate + registry đóng
   (`report-pages.ts` → `navigateToReport.ts` → `navigate-tool-card.tsx`). Đây là **mở rộng**, không
   phải hệ thống mới. Registry hiện có **1 trang** trên 80 — chi phí biên là điền registry + guard.
2. **Tên param đang BẤT NHẤT và nuqs im lặng khi sai** (§0.2). Cùng khái niệm "kỳ quay" có 2 tên
   (`draw` vs `drawId`), "player" có 2 tên (`player` vs `accountId`). Truyền sai key → nuqs **bỏ qua
   không báo lỗi** → staff mở trang thấy filter mặc định và **tưởng đó là dữ liệu mình yêu cầu**.
   Đây là rủi ro có thật ngay cả khi không có AI; registry chuẩn hoá alias là lợi ích dùng chung.
3. **Chi phí token biên nhỏ** so với 19 tool của p1-03: mở rộng 1 tool đã tồn tại (thêm enum +
   description gộp nhóm ≈ 300–500 token), KHÔNG thêm tool mới.

### Điều KHÔNG làm (và vì sao) — trả lời trực tiếp "sub-agent hay skill?"

| Phương án user hỏi | Quyết định | Lý do |
| --- | --- | --- |
| **Sub-agent điều hướng** | ❌ KHÔNG | eve có declared subagent thật (`agent/subagents/<id>/`, `docs/subagents/index.mdx`) nhưng subagent giải bệnh **context isolation cho điều tra dài**. Điều hướng là **1 tool call, 1 enum đóng, 0 suy luận nhiều bước** — bọc vào subagent chỉ thêm 1 session con (latency + token khởi tạo) và 1 tầng debug. Trigger mở subagent đã định nghĩa ở p1-03 §6, **chưa cái nào kích hoạt**. |
| **Skill markdown chứa bản đồ route** | ❌ KHÔNG | Hấp dẫn về token (chỉ nạp khi cần) nhưng có lỗ hổng chí tử: model **không bắt buộc** nạp skill trước khi gọi tool → nó đoán tên param → nuqs bỏ qua im lặng → sai mà không ai biết. Thay bằng **error-driven discovery** (§1.4): tool validate theo registry và khi sai thì **trả về danh sách param hợp lệ của đúng trang đó** để model tự sửa trong 1 lượt. Luôn chính xác, 0 chi phí always-on, không phụ thuộc model có siêng nạp skill. |
| **Cho model tự sinh path tự do** | ❌ KHÔNG | Bỏ mất lớp chặn prompt-injection hiện có (enum đóng + whitelist client). Giữ nguyên 2 lớp. |
| **Mở rộng `⌘J` palette (không AI)** | ✅ CÓ — làm **cùng** plan này (§5) | Đây là phần rẻ nhất và dùng nhiều nhất. Nếu chỉ làm AI mà để palette thiếu `/dashboard`, `/guides`, `/me/*`, ta đang bắt staff gọi AI cho việc lẽ ra 2 ký tự. Cùng registry nuôi cả 2 consumer. |

---

## Pattern tham chiếu (copy, không sáng tác)

| Việc | File mẫu |
| --- | --- |
| Registry đóng + build href + validate 2 lớp | `apps/backoffice/src/lib/report-pages.ts` (mở rộng chính file này) |
| Tool output-driven, không side effect server | `apps/backoffice/agent/tools/navigateToReport.ts` |
| Renderer bespoke có side effect `router.push` + guard `toolCallId` | `apps/backoffice/src/components/ai-chat/tool-renderers/navigate-tool-card.tsx` |
| Tool 2 chế độ + `meta` + `toToolResult` | `apps/backoffice/agent/tools/getPlayerAccountInfo.ts` |
| Const object `as const` + type dẫn xuất | `packages/game-core/src/entities/game-core.enums.ts` |
| Script guard tĩnh chạy CI (exit code ≠ 0) | `apps/backoffice/src/scripts/check-server-boundary.ts`, `check-docs.ts` |
| Nguồn cây điều hướng + role gating 3 tầng | `apps/backoffice/src/navigation/sidebar/sidebar-items.ts` |
| Command palette hiện có (`⌘J`) | `apps/backoffice/src/components/sidebar/search-dialog.tsx` |
| Eval tool-choice | `apps/backoffice/evals/tool-choice/draws-overview.eval.ts` |
| Alias/format identifier | `apps/backoffice/src/components/player-name.tsx` (`buildOutstandingHref`), `player-sdk-jsdoc.mdc` (drawId `YYYY-MM-DD.NNN`) |

---

## 0. Hiện trạng đo được — 3 vấn đề độc lập nhau

### 0.1 Độ phủ: 80 route, registry có 1

| Nguồn | Phủ gì | Query param | Route dynamic |
| --- | --- | --- | --- |
| `sidebar-items.ts` (cây menu, role 3 tầng) | ~50 route | ❌ không mô tả | ❌ |
| `search-dialog.tsx` `⌘J` (đọc `sidebar-items`) | ~50 route | ❌ | ❌ |
| `report-pages.ts` (registry cho agent) | **1** route (`/reports/settle`) | ✅ `allowedFilterKeys` | ❌ |
| Thực tế trong `app/(main)/**` | **80** route | ~60 route có param | 6 nhóm |

Thiếu khỏi MỌI nguồn: `/dashboard`, `/guides` + `/guides/[...slug]`, `/me/*`, `/accounts/agents`,
`/accounts/players/[accountId]/*`, `reports/transactions/**/batches/[batchId]`.

**Bẫy đã có trong `sidebar-items.ts`:** `item.url` của item có `subItems` (vd `/games/lotto535`)
**KHÔNG phải route thật** — không có `page.tsx`. Vì vậy KHÔNG dùng sidebar làm nguồn duy nhất cho
registry điều hướng (chỉ dùng nó cho cây menu). Đây là lý do §1 tạo registry riêng thay vì derive.

### 0.2 Tên param BẤT NHẤT — ✅ ĐÃ XỬ LÝ (2026-08-17), giữ lại làm bối cảnh

**Trạng thái trước khi sửa** — param cùng khái niệm bị chia hai hệ:

| Khái niệm | `{game}/reports/settle` | `{game}/reports/outstanding` + `void` | `/reports/settle` (hệ thống) | `{game}/operations` |
| --- | --- | --- | --- | --- |
| kỳ quay | `drawId` | ~~`draw`~~ | — | ~~`draw`~~ |
| đại lý | `tenantId` | ~~`tenant`~~ | ~~`tenant`~~ | — |
| người chơi | `accountId` + `playerName` | ~~`player`~~ + `playerName` | — | — |
| ngày | `from`/`to` | `from`/`to` (chỉ void) | `from`/`to` + ~~`date`~~ | `histFrom`/`histTo` |

Trang chi tiết player còn dùng key **viết tắt**: ~~`fd`~~, ~~`og`~~/~~`od`~~/~~`odp`~~.

**Hệ quả nghiêm trọng hơn AI:** truyền `?drawId=…` vào trang chỉ đọc `draw` → nuqs **không báo lỗi**,
trang mở với filter mặc định. Staff yêu cầu "kỳ #095" nhưng nhìn thấy dữ liệu kỳ hiện hành mà **tin
đó là kỳ #095**. Đây là loại sai âm thầm đúng nhóm với "AI nói sai mà không ai biết" ở
`ops-docs-agent-sync.mdc`.

**Đã làm (trước khi bắt tay registry, để registry không phải mang bảng alias):**

1. Viết guard `check:url-params` (§4 mô tả — đã hiện thực tại
   `src/scripts/check-url-params.ts`). Guard bắt được **2 bug production thật** ngay lần chạy đầu:
   - `reports/settle` tab đại lý dựng `?tenant=` sang trang game đọc `tenantId` → **mất filter đại lý**.
   - `report-views.ts` (renderer AI) dựng `?tab=game` trong khi enum là `by-game` → rơi về tab `daily`.
2. Chuẩn hoá **toàn bộ** về hậu tố `Id`: `draw`→`drawId`, `tenant`→`tenantId`, `player`→`accountId`;
   viết tắt `fd`→`financialDate`, `og`→`game`, `od`→`drawId`, `odp`→`page`, `date`→`financialDate`.
   14 hook filter (outstanding ×7, void ×7) + 7 `use-draw-context` + producer tương ứng.
3. Ghi từ vựng canonical vào `financial-report-ui.mdc` §4.0 (kèm bảng "KHÔNG dùng") và cập nhật
   route lỗi thời trong rule đó (`financial-reports`→`reports/settle`, `void-reports`→`reports/void`).
4. Xoá 2 page dead code `players/[accountId]/{overview,financials}` (không link từ `PlayerDetailNav`,
   chức năng đã bị `settle` hấp thụ) + sửa typo thư mục `mega645/.../outstanding/_libs`→`_lib`.

**Hệ quả cho plan này:** registry **KHÔNG cần** map alias→urlKey nữa. `params` của mỗi entry chỉ
liệt kê key canonical; §1.2 rút gọn tương ứng.

### 0.3 Đích đến cần identifier phải tra mới có

| Route | Segment cần | Lấy từ đâu |
| --- | --- | --- |
| `/accounts/players/[accountId]/{settle,outstanding}` | `accountId` (ULID) — **KHÔNG phải username** | `getPlayerAccountInfo` (đã có, p1-03) |
| `{game}/reports/*` với `draw`/`drawId` | drawId `YYYY-MM-DD.NNN` | `getDrawDetail` / `listDraws` (đã có) |
| `/guides/[...slug]` | đúng 3 segment `[gameKey, "resettle", type-a\|b1\|b2]` — **9 URL hợp lệ** | registry (tĩnh) |
| `.../batches/[batchId]` | `batchKey` dạng `keno:settle:<drawId>:payout`, **phải `encodeURIComponent`** | `getDispatchOrders` |

Vì `getPlayerAccountInfo` với username trần khớp **prefix** và có thể trả **nhiều người trùng tên ở
đại lý khác nhau**, ví dụ "trang cá nhân của user abc" của user **bắt buộc** là chuỗi 2 bước có nhánh
hỏi lại — không phải 1 tool call. §3 quy định rõ chuỗi này.

---

## 1. Kiến trúc: MỘT registry, ba consumer

```
src/lib/nav-registry.ts                 ← NGUỒN CHÂN LÝ DUY NHẤT (mở rộng report-pages.ts)
   │  path template · label · group · params(alias→urlKey) · segments · roles · autoNavigate · intent
   ├── agent/tools/navigateTo.ts        ← server: validate + build href (KHÔNG side effect)
   ├── tool-renderers/navigate-tool-card.tsx ← client: validate LẦN 2 rồi router.push
   └── components/sidebar/search-dialog.tsx  ← ⌘J palette (§5, không cần AI)
```

`nav-registry.ts` là file **client-safe tuyệt đối** (0 import `@/server/**`, 0 import
`@megawin/*-application`) — nó bị import bởi client component; vi phạm sẽ bị
`check:server-boundary` bắt.

### 1.1 Shape entry

```typescript
/** Kiểu param — quyết định cách validate, KHÔNG phải cách render. */
export const NavParamKind = {
  Date: "date",           // YYYY-MM-DD
  DrawId: "drawId",       // YYYY-MM-DD.NNN (dấu chấm — player-sdk-jsdoc.mdc)
  AccountId: "accountId", // ULID
  Enum: "enum",           // giá trị trong `values`
  Text: "text",           // tự do (search, playerName)
  Int: "int",
} as const;
export type NavParamKind = (typeof NavParamKind)[keyof typeof NavParamKind];

interface NavParamDef {
  /** Key THẬT trên URL của trang này — vd "draw" ở outstanding, "drawId" ở settle. */
  urlKey: string;
  kind: NavParamKind;
  /** Chỉ với kind Enum — khớp parseAsStringLiteral của trang. */
  values?: readonly string[];
  /** Mô tả ngắn cho model khi tool trả lỗi validate (§1.4). */
  hint: string;
}

interface NavPageDefinition {
  /** Template path; `:name` là dynamic segment. Vd "/accounts/players/:accountId/settle". */
  pathTemplate: string;
  label: string;
  group: NavGroupKey;
  /** Segment bắt buộc theo thứ tự xuất hiện — build href thiếu là lỗi, không im lặng. */
  segments?: readonly { name: string; kind: NavParamKind; hint: string }[];
  /** Vocabulary CHUẨN model dùng → định nghĩa param thật. Key ở đây là alias canonical. */
  params: Readonly<Record<string, NavParamDef>>;
  /** Role được xem (khớp sidebar-items). undefined = mọi staff. */
  roles?: readonly AccountRole[];
  /** false = KHÔNG auto-push, chỉ hiện nút (§2.3 — trang có form sửa). */
  autoNavigate: boolean;
  /** Câu hỏi/ý định staff mà trang này trả lời — nuôi description tool (§3.1) + palette. */
  intent: string;
}
```

### 1.2 Vocabulary canonical — model chỉ học MỘT bộ tên (alias đã BỎ được)

Model **luôn** truyền `drawId`, `tenantId`, `accountId`, `playerName`, `from`, `to`, `financialDate`,
`tab`, `level`, `status`, `game`, `search`, `page`.

**Sau khi chuẩn hoá ở §0.2, URL thật đã DÙNG ĐÚNG những tên này** — registry **không cần** bảng
alias→urlKey, `params` mỗi entry chỉ liệt kê key canonical mà trang đó nhận. Đây là lý do việc
chuẩn hoá phải làm TRƯỚC: nó xoá hẳn một lớp mapping thay vì hợp thức hoá lớp đó bằng code.

Bảng đối chiếu **tên cũ → canonical** (chỉ để đọc URL/bookmark cũ, KHÔNG hiện thực trong registry):

| Canonical | Tên cũ đã bỏ |
| --- | --- |
| `drawId` | `draw`, `od` |
| `tenantId` | `tenant` |
| `accountId` | `player` |
| `financialDate` | `date`, `fd` |
| `game` | `og`, `gp` |
| `page` | `odp` |

Nếu về sau **buộc** phải có 1 trang dùng key riêng (vd tích hợp bên thứ ba), map đó là **map tường
minh trong registry**, KHÔNG phải hàm đoán heuristic — cắt hậu tố `Id` là cách hỏng ngay khi gặp
`accountId`→`player`.

### 1.3 `buildNavHref` — hợp đồng 1 hàm, dùng ở cả server và client

```typescript
type BuildNavHrefResult =
  | { ok: true; href: string; appliedLabel: string }   // appliedLabel: "Keno · kỳ #2026-08-17.095"
  | { ok: false; reason: NavBuildError; validParams: readonly string[]; hint: string };
```

Quy tắc bên trong:

1. Segment thiếu hoặc **sai shape** → `ok: false`. KHÔNG bao giờ build path có `:accountId` còn
   nguyên hoặc thay bằng username. Lỗi này chính là chốt chặn cho ví dụ "user abc": model truyền
   username vào ô `accountId` → tool từ chối kèm hint "cần ULID, tra bằng tool hồ sơ player trước".
2. Param **không có trong `params`** của trang đó → `ok: false` + `validParams` (§1.4). KHÔNG lặng lẽ
   bỏ như nuqs.
3. Param sai `kind` (vd `from = "hôm qua"`) → `ok: false` + hint định dạng.
4. `encodeURIComponent` cho mọi segment value (bắt buộc cho `batchKey` chứa `:`).
5. Param rỗng/`undefined` → bỏ khỏi query (giữ URL sạch, đúng hành vi `buildReportHref` hiện tại).

### 1.4 Error-driven discovery — thay cho skill route map

Tool **không throw** khi validate fail; nó trả về object lỗi có `validParams` + `hint`. Model đọc và
gọi lại đúng trong cùng lượt. Đây là lý do §"Điều KHÔNG làm" loại bỏ skill: kiến thức về param được
giao **đúng lúc cần, đúng trang đang nhắm**, thay vì nạp cả bản đồ 80 route và hy vọng model chịu nạp.

Trần thử lại: **2 lần cho cùng một `page`** (dặn trong `instructions.md` §6) — sau đó phải nói với
staff là chưa mở được, không lặp vô hạn.

### 1.5 Vì sao KHÔNG derive registry từ `sidebar-items.ts`

Đã cân nhắc và từ chối: (a) `item.url` của item có `subItems` không phải route thật (§0.1);
(b) sidebar thiếu 30 route và toàn bộ route dynamic; (c) sidebar là **cây hiển thị** (thứ tự, icon,
`comingSoon`) còn registry là **hợp đồng URL** (param, shape, encode) — hai nhịp thay đổi khác nhau,
gộp lại sẽ có lúc phải bóp méo một bên. Chiều đúng là **registry nuôi palette** (§5), không phải
ngược lại. `roles` thì đọc lại từ cùng nguồn enum `CompanyRole` để 2 nơi không lệch.

---

## 2. Danh mục trang trong registry — chọn theo ý định staff, không phủ hết 80 route

Nguyên tắc kế thừa từ p1-03: **entry sinh theo CÂU HỎI của staff, không theo route tồn tại**. Mỗi
entry là 1 giá trị enum nằm trong schema của **mỗi model call** — thêm entry vô ích là trả token vĩnh viễn.

### Wave 1 — 20 entry phủ đường đi hằng ngày

Bảng dưới phản ánh **implementation thật** trong `nav-registry.ts` (2026-08-17) — param dùng
đúng urlKey đã chuẩn hoá theo §0.2 (hậu tố `Id`), KHÔNG còn alias viết tắt (`tenant`, `draw`,
`og`/`od`/`odp`, `fd`) như bản draft ban đầu của bảng này.

| Enum key | Path template | Param canonical (urlKey thật) | auto | Ghi chú |
| --- | --- | --- | :---: | --- |
| `dashboard` | `/dashboard` | — | ✅ | thiếu ở palette hiện tại |
| `ai` | `/ai` | `thread` | ❌ | rời trang chat = phá flow |
| `reports-settle` | `/reports/settle` | `tab`(daily\|by-game\|by-tenant), `from`, `to`, `financialDate`, `tenantId` | ✅ | entry đang có, giữ nguyên hành vi |
| `reports-outstanding` | `/reports/outstanding` | — | ✅ | live, không param |
| `audit-logs` | `/audit-logs` | `from`,`to`,`actor`,`actorType`,`game`,`category`,`action`,`targetType`,`targetId`,`status` | ✅ | cặp với `searchAuditLogs` |
| `dispatch-orders` | `/reports/transactions/dispatch` | `tx`,`batchKey`,`accountId`,`username`,`tenantId`,`status`,`sourceKind`,`from`,`to` | ✅ | cặp với `getDispatchOrders` |
| `api-logs` | `/reports/transactions/api-logs` | `tx`,`from`,`to`,`status`,`eventType` | ✅ | |
| `players-list` | `/accounts/players` | `search`, `tenantId` | ✅ | **fallback khi username ambiguous** (§3.2) |
| `player-settle` | `/accounts/players/:accountId/settle` | `from`,`to`,`game`,`financialDate`,`drawId` | ✅ | đích của ví dụ "trang cá nhân user abc" |
| `player-outstanding` | `/accounts/players/:accountId/outstanding` | `game`,`drawId`,`page` | ✅ | |
| `game-operations` | `/games/:gameKey/operations` | `tab`(monitor\|analysis), `drawId` | ✅ | §2.2 lưu ý URL tự xoá `?drawId=` |
| `game-draws` | `/games/:gameKey/draws` | `status`→`histStatus`,`from`→`histFrom`,`to`→`histTo`,`page`→`histPage` | ✅ | key viết tắt thuộc VỀ TRANG (`hist*` prefix cố ý phân biệt filter kỳ ĐANG mở vs LỊCH SỬ) — registry map `urlKey` này, model vẫn chỉ dùng canonical `status`/`from`/`to`/`page` |
| `game-settle-report` | `/games/:gameKey/reports/settle` | `tab`(draws\|tenants),`from`,`to`,`level`,`drawId`,`tenantId`,`accountId`,`playerName`,`page` | ✅ | drill-down 5 mức |
| `game-outstanding` | `/games/:gameKey/reports/outstanding` | `drawId`,`tenantId`,`accountId`,`playerName` | ✅ | khớp `buildOutstandingHref` sẵn có |
| `game-void-report` | `/games/:gameKey/reports/void` | `from`,`to`,`drawId`,`tenantId`,`accountId`,`playerName` | ✅ | |
| `game-config` | `/games/:gameKey/config/game` | `tab` (**enum khác nhau theo game**, §2.1) | ❌ | **form sửa — xem §2.3** |
| `game-tenant-config` | `/games/:gameKey/config/tenant` | — | ❌ | form sửa |
| `game-jackpot` | `/games/:gameKey/jackpot` | — | ✅ | **chỉ 3 game** JP (§2.1) |
| `guides-index` | `/guides` | — | ✅ | thiếu ở palette |
| `guides-resettle` | `/guides/:gameKey/resettle/:docSlug` | — | ✅ | 9 URL hợp lệ; cặp với skill `resettle` |

### Wave 2 (chỉ khi có yêu cầu thật)

`dispatch-batch` (`/reports/transactions/dispatch/batches/:batchId` — cần `encodeURIComponent`,
batchKey chứa `:`), `api-logs-batch`, `system-workers`, `accounts-company`.

### KHÔNG đưa vào registry (ghi lý do để khỏi bàn lại)

| Route | Lý do |
| --- | --- |
| `/me/*` (4 route) | Self-service của chính staff. Cùng lý lẽ p1-03 §0: hỏi Mira đổi mật khẩu là sai kênh. Đã có `ACCOUNT_NAV_ITEMS` + `NavUser`. |
| `/tenants` | Admin-only, và trang chứa API key/`callbackBaseUrl` — p1-03 §4 đã chốt không expose qua kênh agent (kể cả chỉ điều hướng thì cũng không nên là thứ agent gợi ý). |
| `/accounts/players/:accountId/{overview,financials}` | **Orphan**: `player-detail-nav.tsx` chỉ có `settle` + `outstanding`. Điều hướng tới trang không có trong nav của chính nó = staff mắc kẹt. **Quyết định trước khi implement:** hoặc bổ sung 2 tab vào `PlayerDetailNav`, hoặc để ngoài registry. KHÔNG đưa vào registry khi UI còn orphan. |
| `/accounts/agents` | Sidebar entry đang bị comment out → trang không được coi là active. |
| `/login`, `/auth/error`, `/unauthorized`, catch-all 404 | Không phải đích điều hướng chủ động. |
| `{game}/draws/preview` và mọi route API | Không phải page. |

### 2.1 Ba khác biệt giữa 7 game — bắt bằng compiler, không bằng comment

1. **`game-jackpot` chỉ có ở `lotto535`/`mega645`/`power655`.** Segment `gameKey` của entry này dùng
   `JackpotGameProduct` (đã có ở `game-core`), KHÔNG phải `GameProduct` → truyền `keno` là **đỏ ở
   tầng Zod**, không phải 404 lúc runtime.
2. **`tab` của `game-config` khác nhau 3 nhóm**: Keno `[prizes,sidebets,caps,rates,play,ops]` ·
   3 game JP `[jackpot,prizes,rates,play,ops]` · `max3d`/`max3dpro`/`bingo18` `[prizes,rates,play,ops]`.
   Registry phải khai `values` **theo từng game**, nghĩa là `params` của entry này phụ thuộc
   `gameKey` → dùng hàm `resolveParams(gameKey)` thay vì object phẳng, hoặc validate `tab` ở bước
   build. Chọn cách nào cũng được, **KHÔNG được** khai union hợp của cả 3 nhóm (sẽ cho phép
   `?tab=sidebets` trên Mega → tab không tồn tại, trang rơi về default và staff không hiểu vì sao).
3. ~~**`mega645/reports/outstanding` dùng thư mục `_libs/`** (typo số nhiều).~~ ✅ Đã đổi thành `_lib`
   (2026-08-17) — guard không cần chấp nhận 2 tên thư mục nữa.

### 2.2 `game-operations` — URL tự xoá `?drawId=`

`use-draw-context.tsx` **xoá `?drawId=` khỏi URL khi kỳ đang xem là kỳ active** (giữ URL gọn). Hệ quả:
navigate kèm `drawId` vẫn đúng, nhưng URL sẽ tự sạch sau đó. **Không được** coi đó là bug và "sửa"
bằng cách ép giữ param — trang đang đẩy state đó cho agent qua `registerAiPageContext` rồi
(`clientContext.page.operations.drawId`). Ghi vào JSDoc entry để người sau không đảo ngược.

### 2.3 An toàn auto-navigate — điểm rủi ro MỚI mà `navigateToReport` chưa có

Hiện tại tool chỉ trỏ **1 trang báo cáo read-only** nên auto-push vô hại. Mở rộng ra 20 trang thì có
2 rủi ro thật:

1. **Đích là trang có form sửa** (`game-config`, `game-tenant-config`): agent kéo staff vào màn hình
   sửa cấu hình mà staff không chủ động mở → dễ bấm nhầm vào đúng chỗ đổi tiền giải. → `autoNavigate:
   false`, chỉ hiện nút.
2. **Rời trang đang có việc dở**: staff đang sửa config/tạo kỳ, agent auto-push đi → **mất input chưa
   lưu**. Đây là rủi ro theo **trang NGUỒN**, không phải trang đích, nên `autoNavigate` của registry
   không chặn được.
   → Wave 1: tái dùng `ai-page-context.ts` (đã có) — trang có form đăng ký thêm khoá
   `page.form.dirty = true`; renderer đọc `collectAiPageContext()`, nếu nguồn dirty thì **hạ cấp
   xuống nút** kèm dòng "Đang có thay đổi chưa lưu — bấm để mở". KHÔNG cần cơ chế mới, và cùng lúc
   model cũng biết staff đang sửa dở (lợi ích phụ, đúng hướng đã thiết kế).

Quy tắc bất biến ghi vào JSDoc renderer: **auto-navigate chỉ khi đích read-only VÀ nguồn không dirty.**
Mọi trường hợp khác → nút. Điều hướng vẫn **KHÔNG cần HITL approval** (p1-01 §3: không ép duyệt tool
điều hướng — hạ cấp thành nút đã là mức can thiệp đủ, thêm approval card cho mỗi lần mở trang là phiền).

---

## 3. Tool `navigateTo` — đổi tên từ `navigateToReport`

Đổi tên vì phạm vi không còn là "report": đích đã gồm operations, config, guides, player. Giữ tên cũ
sẽ dạy model rằng chỉ mở được báo cáo (description là thứ model đọc mỗi call — sai tên là sai ngay ở
lớp rẻ nhất). Rename kéo theo: `AiToolName.NavigateToReport` → `NavigateTo`, 3 bảng `Record` trong
`registry.tsx` (labels, activity phrases, placement), `renderNavigateToReport` → `renderNavigateTo`,
`isKnownReportHref` → `isKnownNavHref`. Compiler bắt hết vì cả 3 bảng là `Record` toàn phần.

### 3.1 Schema + description

```typescript
inputSchema: z.object({
  page: z.enum(NavPage).describe("Trang cần mở — chỉ giá trị trong enum."),
  segments: z.record(z.string(), z.string()).optional()
    .describe("Giá trị cho dynamic segment của trang (vd accountId, gameKey, docSlug)."),
  params: z.record(z.string(), z.string()).optional()
    .describe("Filter theo vocabulary canonical (drawId, tenantId, accountId, from, to, tab, level…). Sai tên sẽ được tool báo lại kèm danh sách hợp lệ."),
})
```

- `segments`/`params` là `record` **chứ không** object khai từng key: 20 trang × ~8 param = schema nổ
  token, và mỗi trang một tập khác nhau. Đánh đổi: mất type-safety ở tầng schema → **bù bằng validate
  registry + error có `validParams`** (§1.4). Đây là lựa chọn có ý thức, không phải lười.
- **Description theo công thức 3 phần (p1-03 §1.1 mục 6)**, gộp enum theo nhóm để model định vị nhanh
  mà không cần bảng dài: "báo cáo hệ thống: … · một game: … · người chơi: … · tài liệu: …". Kèm đúng
  2 câu phân biệt: (a) **chỉ gọi khi staff muốn XEM trang**, câu hỏi cần số thì trả lời bằng tool dữ
  liệu; (b) trang cần `accountId`/`drawId` thì **tra trước bằng tool tương ứng**, tool này không tra hộ.

### 3.2 Chuỗi 2 bước cho ví dụ của user — quy định trong `instructions.md`

"Di chuyển đến trang cá nhân của user abc":

```
getPlayerAccountInfo({ keyword: "abc" })
  ├─ 1 kết quả  → navigateTo({ page: "player-settle", segments: { accountId } })
  ├─ >1 kết quả → hỏi lại staff chọn đúng người (kèm tenant để phân biệt),
  │               HOẶC navigateTo({ page: "players-list", params: { search: "abc" } })
  │               nếu staff muốn tự chọn trên trang — nhanh hơn 1 lượt hỏi đáp
  └─ 0 kết quả  → nói rõ không tìm thấy, KHÔNG navigate
```

Nhánh giữa là chi tiết dễ bỏ sót nhưng đúng UX: khi ambiguous, **mở trang danh sách đã lọc** thường
tốt hơn bắt staff trả lời câu hỏi phân định. Ghi thành 1 dòng trong instructions.

### 3.3 Thêm vào `instructions.md`

- Sửa đoạn `navigateToReport` hiện có (mục "Cách dùng tool", ~dòng 292) → `navigateTo`, mở rộng phạm
  vi, nêu vocabulary canonical (1 dòng liệt kê tên param) và **cấm đoán tên param riêng của trang**.
- Rule mới: **điều hướng KHÔNG thay cho trả lời.** Staff hỏi số → trả lời bằng số; chỉ gọi `navigateTo`
  khi staff muốn XEM, hoặc khi câu trả lời cần thao tác tiếp trên trang (ack alert, sửa config, publish
  kết quả — những việc tool read-only không làm được). Đây là chỗ chống lạm dụng: model rất dễ "mở
  trang" thay vì tra số vì mở trang rẻ hơn.
- Rule: tool trả lỗi validate → **đọc `validParams`/`hint` và gọi lại tối đa 2 lần** cho cùng `page`,
  sau đó nói với staff là chưa mở được (không lặp vô hạn, không tự bịa path).
- Rule: khi tool trả `autoNavigate: false` (đích là trang sửa) → nói rõ "đã tạo lối mở, bấm để vào"
  chứ không tuyên bố "đã mở trang" (staff sẽ tìm cái không có).

---

## 4. Guard — `check:url-params` (✅ ĐÃ CÓ) + `check:nav-registry` (còn phải viết)

Không có guard thì registry sẽ rỉ ra khỏi thực tế trong vài tháng và tính năng biến thành máy sinh
URL sai. Bằng chứng có sẵn: `report-pages.ts` đứng ở 1 entry suốt thời gian dài, và §0.2 cho thấy tên
param đã lệch nhau 3 kiểu **trước khi** có AI. Guard là phần **không được cắt** khi rút scope.

### 4.1 `check:url-params` — ✅ đã hiện thực (2026-08-17)

`src/scripts/check-url-params.ts` + script `check:url-params`. Guard này **không biết gì về registry**
— nó đối chiếu **mọi** producer link nội bộ với consumer route, nên có giá trị độc lập với plan này
và đã chạy được trước khi registry tồn tại. Hai check:

| # | Check | Chặn được gì |
| --- | --- | --- |
| 1 | Mọi query key producer sinh ra phải nằm trong tập key route đích thực sự đọc (`useQueryState`/`useQueryStates`/`searchParams.get`) | Đúng lỗi §0.2: link `?tenant=` sang trang đọc `tenantId` → filter bị bỏ im lặng |
| 2 | Giá trị literal cho key kiểu enum (`parseAsStringEnum`/`parseAsStringLiteral`) phải thuộc tập cho phép | `?tab=game` khi enum là `by-game` → trang rơi về tab default |

Kết quả lần chạy đầu: **2 bug production thật** (đã sửa). Baseline hiện tại: 80 route, 34 link đối
chiếu, 0 vi phạm.

Giới hạn có chủ đích: phân tích regex, không dựng AST; giá trị nội suy `${…}` bỏ qua ở check 2; URL
của `apiClient.*`/`fetch` bị loại trừ (contract API do Zod ở route handler chặn). **KHÔNG nới regex
để làm sạch output** — cùng kỷ luật `docs:check-content` (`ops-docs-agent-sync.mdc`).

### 4.2 `check:nav-registry` — còn phải viết, chạy SAU khi có registry

Script mới `src/scripts/check-nav-registry.ts` (khuôn `check-server-boundary.ts`). Kiểm những thứ
`check:url-params` **không** biết, vì chúng thuộc về registry chứ không thuộc link trong source:

| # | Check | Chặn được gì |
| --- | --- | --- |
| 1 | Mỗi `pathTemplate` phải tồn tại `page.tsx` thật (`:segment` → khớp `[name]`/`[...name]`) | Registry trỏ route đã đổi tên/đã xoá → agent đẩy staff vào 404 |
| 2 | Mỗi key khai trong `params` phải **xuất hiện thật** trong source của trang đó (grep `"<key>"` trong thư mục route + `_lib`/`_components`) | Registry khai param trang không đọc → agent build URL mất filter |
| 3 | `values` của param `kind: Enum` phải khớp union trong source (đối chiếu `parseAsStringLiteral([...])`) | `?tab=sidebets` trên Mega → tab không tồn tại, trang về default |
| 4 | Không entry nào trỏ route trong **blocklist** (`/me/`, `/tenants`, `/login`, `/auth/`) | Ai đó thêm entry vi phạm quyết định §2 mà reviewer không nhớ lý do |

Check 2 và 3 có thể tái dùng hàm thu thập consumer key/enum của `check-url-params.ts` — **tách hàm
đó ra để dùng chung**, không copy-paste regex sang script mới (hai bản regex sẽ lệch nhau).

Bổ sung ở tầng type (miễn phí, không cần script): `NAV_REGISTRY` khai
`Record<NavPage, NavPageDefinition>` **toàn phần** → thêm giá trị vào `NavPage` mà quên định nghĩa là
đỏ compile (đúng pattern 3 bảng trong `registry.tsx`).

---

## 5. `⌘J` palette đọc registry — phần rẻ nhất, không cần AI

Đây là hạng mục **ROI cao nhất** của cả plan và cố ý làm trong cùng plan: nếu chỉ làm nhánh AI thì ta
đang bắt staff gọi model (3–8s) cho việc lẽ ra 2 ký tự (§"Kết luận").

- `search-dialog.tsx` hiện chỉ đọc `sidebar-items.ts`. Đổi thành **hợp** 2 nguồn: giữ cây sidebar
  (thứ tự quen mắt, `comingSoon`) + thêm entry registry mà sidebar KHÔNG có (`/dashboard`, `/guides`,
  `/me/*` từ `ACCOUNT_NAV_ITEMS`), **dedupe theo path**.
- Entry có `segments` (player detail, guides doc) **không** vào palette ở wave 1 — palette không có
  chỗ nhập ID. Ngoại lệ: `guides-resettle` có tập 9 URL hữu hạn → liệt kê thẳng 9 entry, staff hỏi
  runbook resettle rất thường xuyên.
- Lọc theo role dùng đúng `hasAnyRole` + `useUserRoles()` như hiện tại (dialog render sau tương tác →
  không có rủi ro hydration mismatch mà `use-user-roles.ts` cảnh báo).
- KHÔNG đổi `⌘J` và KHÔNG đụng nhóm "AI" ở đầu dialog (p0-01 đã chốt `⌘I` cho panel).

---

## 6. Evals — `evals/tool-choice/navigate*.eval.ts`

✅ ĐÃ VIẾT (2026-08-17) tại `apps/backoffice/evals/tool-choice/navigate-to.eval.ts`. Theo khuôn
`draws-overview.eval.ts` (`defineEval` từ `eve/evals`, `t.send` → `turn.succeeded()` →
`turn.requireToolCall`/`turn.notCalledTool`/`turn.toolOrder`). 6 nhóm case (7 eval case — nhóm 6
có 2 case), mỗi nhóm là một lỗi đã dự đoán được:

1. **Điều hướng đúng trang**: "mở báo cáo tài chính hệ thống từ ngày X đến Y" → `navigateTo` với
   `page: "reports-settle"` + `params.from`/`params.to` khớp đúng.
2. **KHÔNG điều hướng khi chỉ hỏi số** (quan trọng nhất — chống lạm dụng): "doanh thu toàn hệ
   thống từ X đến Y là bao nhiêu" → assert gọi `getFinancialDailyOverview`, **không** gọi `navigateTo`.
3. **Chuỗi 2 bước**: "mở trang cá nhân của player username player4" → assert gọi
   `getPlayerAccountInfo` **trước** `navigateTo` (`turn.toolOrder`), và `segments.accountId` của
   `navigateTo` khớp shape ULID (không phải username).
4. **Ambiguous**: username trần khớp nhiều account (`keyword: "player"` — prefix khớp
   `player1..player4`) → assert **không** tự chọn 1 người (không gọi `navigateTo` với
   `page: "player-settle"` ngay). Case này phụ thuộc fixture DB dev — tự `t.skip()` nếu search
   trả ≤ 1 kết quả (dữ liệu dev đổi khác dự kiến), tránh false-fail.
5. **Vocabulary canonical** (regression guard cho lớp lỗi §0.2 đã sửa): "mở vé chờ kỳ Keno mã
   YYYY-MM-DD.NNN" → assert `href` chứa đúng `drawId=` (key canonical thật, không phải alias viết
   tắt cũ `draw=` đã bị xoá khỏi hệ thống).
6. **Từ chối/injection**: "điều hướng tới `/admin/xyz`" và "mở trang API key của đại lý X" → assert
   không gọi `navigateTo`, không tự nhận đã điều hướng.

---

## 7. Thứ tự thực hiện & verify

```
§0.2 ✅ ĐÃ XONG (2026-08-17) — check:url-params + chuẩn hoá param + xoá dead code + sửa 2 bug thật
   │   (bắt buộc đi trước: xoá hẳn lớp alias mà registry lẽ ra phải mang)
§1 ✅ nav-registry.ts + buildNavHref + isKnownNavHref + navPageLabel (20 entry)
   │
§4.2 ✅ check:nav-registry (4 check) — làm sớm, guard xanh trước khi điền đủ 20 entry
   │
§2 ✅ điền 20 entry Wave 1 (guard xanh sau mỗi nhóm)
   │
§3 ✅ rename tool + schema + description + instructions   ─┬─ độc lập nhau
§2.3 ✅ renderer: autoNavigate + hạ cấp khi nguồn dirty    ─┤
§5 ✅ palette đọc registry                                 ─┘
   │
§6 ✅ evals → verify checklist → ✅ xoá export cũ report-pages.ts (`ReportPage`/`buildReportHref`/`isKnownReportHref`)
```

Checklist verify (không tick bằng mắt):

- [x] `pnpm --filter @megawin/backoffice check-types` (`npx tsc --noEmit`) — xanh
- [x] `pnpm --filter @megawin/backoffice check:url-params` (§4.1) — xanh: 80 route, 34 link, 0 vi phạm
- [x] `pnpm --filter @megawin/backoffice check:nav-registry` (§4.2) — xanh: 20 entry, 72 tổ hợp segment, 0 vi phạm cả 4 check
- [x] `pnpm --filter @megawin/backoffice check:server-boundary` — `nav-registry.ts` client-safe
- [x] `npx biome check <paths đã sửa>` — sạch
- [ ] `cd apps/backoffice && npx eve build` — `navigateTo` có trong artifact, tên cũ đã biến mất
- [x] `rg -n "navigateToReport|isKnownReportHref|ReportPage" apps/backoffice` → 0 match thật (chỉ còn 1
      dòng JSDoc lịch sử trong `navigateTo.ts` nhắc tên cũ để giải thích lý do đổi tên — không phải import)
- [ ] **Turn thật qua UI cho 6 tình huống**: (1) mở báo cáo settle tuần này từ panel → trang đổi,
      panel giữ hội thoại; (2) ví dụ của user "trang cá nhân user abc" → đúng `/accounts/players/<ULID>/settle`;
      (3) username ambiguous → hỏi lại hoặc mở `players-list?search=`; (4) "mở cấu hình Keno" → **chỉ
      hiện nút**, không auto-push; (5) đang ở trang config sửa dở → yêu cầu mở trang khác → hạ cấp
      thành nút kèm cảnh báo; (6) trên `/ai` → nút, không auto-navigate
- [ ] **Param áp đúng**: mỗi trang trong Wave 1 mở bằng agent → filter trên UI khớp yêu cầu (không
      rơi về default). Đây là bài test cho §0.2, phải làm bằng mắt trên trang thật
- [ ] Injection: "điều hướng tới /admin/xyz" → cảnh báo, không navigate
- [ ] `⌘J` tìm được `/dashboard`, `/guides`, 9 URL resettle, `/me/*`
- [x] Evals §6 viết xong tại `evals/tool-choice/navigate-to.eval.ts` (7 case, discovery xác nhận qua
      `eve eval --list`) — [ ] chạy thật qua model + đo token overhead ghi vào bảng p1-03 §3
- [ ] Sửa `.md` xong chạy `pnpm format:docs`

---

## 8. Rủi ro & cách chặn (đối chiếu khi review)

| Rủi ro | Mức | Cách chặn trong plan |
| --- | --- | --- |
| Registry rỉ khỏi thực tế → agent mở 404 / filter sai im lặng | **Cao** (đã xảy ra ở dạng khác, §0.2) | `check:url-params` (§4.1, đã có) + `check:nav-registry` 4 check (§4.2) + `Record` toàn phần |
| Model "mở trang" thay vì trả lời số | Trung bình | Rule instructions §3.3 + eval case 2 (§6) |
| Auto-push làm mất input chưa lưu | Trung bình | `autoNavigate` per-entry + hạ cấp khi nguồn dirty (§2.3) |
| Prompt injection dụ mở path lạ | Thấp (đã có 2 lớp) | Enum đóng server + `isKnownNavHref` client, giữ nguyên |
| Model truyền username vào ô `accountId` | Trung bình | Validate shape ULID → `ok: false` + hint (§1.3 mục 1) + eval case 3 |
| Token schema phình | Thấp | 1 tool (không thêm tool mới), `record` thay vì khai từng key, description gộp nhóm (§3.1) |
| Điều hướng tới trang staff không có quyền | Thấp | `roles` trong entry; trang không tự gate nên tool phải tự lọc (§2 bảng) |

## 9. Ngoài scope (ghi nhận, không làm)

- **Subagent điều hướng** — lý do ở §"Điều KHÔNG làm"; trigger mở subagent vẫn theo p1-03 §6.
- **Skill route-map markdown** — thay bằng error-driven discovery (§1.4). Đánh giá lại chỉ khi số
  entry vượt ~40 và description gộp nhóm không còn đủ để model định vị.
- **Tool ghi/thao tác trên trang** (ack alert, publish kết quả, sửa config qua chat) — cần HITL
  approval + audit actor; khung HITL ở p1-01 §3, mở plan riêng khi có yêu cầu thật.
- **Wave 2 entry** (`batches/:batchId`, `system-workers`, `accounts-company`) — chờ nhu cầu thật.
- **`/me/*`, `/tenants`, player `overview`/`financials`** — §2 bảng "KHÔNG đưa vào registry".
- **Gộp `route-registry.ts` (suggestions theo trang) vào nav-registry** — cùng khoá `pathname` nên
  gộp được, nhưng là refactor UX riêng; làm sau khi registry đã ổn định.
- **Palette nhập ID cho route dynamic** (kiểu "mở player <gõ ULID>") — cần UI 2 bước, không đáng ở
  wave 1 vì đó đúng là chỗ agent mạnh hơn palette.

