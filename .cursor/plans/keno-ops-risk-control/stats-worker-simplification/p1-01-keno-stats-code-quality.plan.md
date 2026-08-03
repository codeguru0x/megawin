# p1-01 — Keno stats: dọn code quality (Q1–Q4)

> **Nguồn:** `.cursor/analysis/keno-stats-worker-simplification.analysis.md` §5.4 · **Phase:** P1.
> **Phụ thuộc:** p0-02 (Q1 rà JSDoc trên cấu trúc SAU tách; Q4 đặt trong bức tranh 2 worker).
> p0-03 nên xong trước để Q2/Q3 không đá diff (mapper normalize chạm cùng type).

## Mục tiêu

4 việc nhỏ độc lập nhau, gom 1 PR "code quality" — mỗi việc 1 commit riêng để review từng phần:

- **Q1** — quét comment/JSDoc stale còn nhắc kiến trúc cũ (recomputeFull, seed-slot, alert-trong-sync).
- **Q2** — vá lỗ type cast (`as` che thiếu field / spread mù) trong đường stats.
- **Q3** — xoá field `entries` khỏi `KenoPlayTypeStat` (đã có `boards`; `entries` per-playtype không ai đọc).
- ~~**Q4** — alert `worker_stuck`~~ — **SUPERSEDED 03/08/2026.** Đã code + ship, sau đó **hoàn nguyên**
  bằng `.cursor/plans/system-worker-health/p0-02-keno-drop-worker-stuck-alert.plan.md`. Mô tả Q4 bên
  dưới giữ lại **nguyên trạng làm hồ sơ lịch sử** — ĐỪNG implement lại. Chi tiết lý do:
  `.cursor/analysis/system-worker-health.analysis.md` (§3: 4 defect) và Keno analysis §5.7.

## Q1 — Comment stale

**Cách làm:** grep có chủ đích rồi đọc quanh từng match, sửa cho khớp hành vi HIỆN TẠI (rule
code-quality §4 — sửa, không xoá trừ khi code đã xoá):

```bash
rg -n "recomputeFull|recomputeClosedDraws|seed-slot|seed slot|skeleton" \
  packages/game-keno packages/game-keno-application apps/worker-keno
rg -n "alert" packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts
```

Điểm đã biết trước (analysis §5.4): JSDoc quanh `applyDelta`/`ensureDocs` còn nhắc "recomputeFull ghi
đè"/"seed đủ slot" — cơ chế đã xoá ở p2-01/p0-03. Sau p0-02, JSDoc class sync worker không được còn chữ
"alert" ngoài câu trỏ sang `EvaluateOpsAlertsUseCase`.

**Đầu ra:** danh sách match → từng cái ghi "đã sửa thành gì" trong commit message. Match nào mô tả đúng
hành vi hiện tại thì GIỮ (không dọn quá tay).

## Q2 — Lỗ type cast

**Đích chính (analysis §5.4):** chỗ map `KenoBasicPlayType → KenoPlayTypeStat` slot đang dùng cast
(indexed-access + `as`) — thay bằng map tường minh (`switch` hoặc `Record` typed) để compiler bắt
thiếu/lệch key. Grep tìm thêm cast tương tự trong đường stats:

```bash
rg -n " as [A-Z]| as unknown" \
  packages/game-keno-application/src/infras/repos/betting-stats-repo.ts \
  packages/game-keno-application/src/infras/repos/combo-stats-repo.ts \
  packages/game-keno-application/src/infras/mappers \
  packages/game-keno-application/src/use-cases/operations
```

Điểm đã biết trước:

- `betting-stats-mapper.ts` spread `{...rest} as Entity` — **đã vá ở p0-03** (normalize tường minh).
  Q2 chỉ còn xác nhận không tái phát nơi khác.
- Mapper/repo khác trong đường stats (combo-stats, combo-accounts, ops-alert): nếu còn spread-as →
  đổi sang mapProps tường minh field-by-field theo mẫu p0-03 §2.
- Cast trong `syncDraw`/`writeBatch` (VD `doc as unknown as X` khi đọc documents thô): thay bằng
  projection type hẹp khai tường minh (interface nhỏ đặt cạnh method, mô tả đúng field được project).

Tiêu chí xong: các file trên không còn `as Entity`/`as unknown as` che thiếu field; cast còn lại (nếu
buộc phải có, VD `_id` ObjectId) kèm comment 1 dòng lý do.

## Q3 — Xoá `entries` khỏi `KenoPlayTypeStat`

ĐÃ CHỐT (analysis §9.1): số **bộ cược** mới là đơn vị UI hiển thị (PickCard chỉ dùng số bộ +
`revenue`); `entries` per-playtype không ai render — chỉ ghi rồi bỏ, giữ lại gây hiểu nhầm.
Tổng entries cấp draw vẫn còn ở `totals.entries` (GIỮ — cái này có consumer KPI).

> Field đơn vị bộ cược lúc viết plan tên `boards` (entity) / `selections` (FE); đã rename thành
> `sets` ở cả 2 tầng — xem [Q5](#q5--rename-boards--sets-đơn-vị-bộ-cược).

| File | Việc |
|---|---|
| `packages/game-keno/src/entities/betting-stats.ts` | xoá field `entries` khỏi `KenoPlayTypeStat` (+JSDoc nếu nhắc) |
| `packages/game-keno/src/rules/stats-shape.ts` | `createEmptyPlayTypeStat()` bỏ `entries: 0` |
| `packages/game-keno-application/src/use-cases/operations/stats-accumulator.ts` | bỏ mọi chỗ cộng `entries` per-slot (`incPlayTypeStat` và caller) |
| `packages/game-keno-application/src/infras/repos/betting-stats-repo.ts` | `applyDelta` bỏ `$inc` path `...entries` (nếu build path từ object delta thì tự biến mất — xác nhận) |
| `packages/game-keno-application/src/infras/mappers/betting-stats-mapper.ts` | normalize (p0-03) bỏ field — compiler tự bắt |
| `apps/backoffice/.../keno/operations/_lib/types.ts` + `adapters.ts` | xoá `PlayTypeRow.entries` + chỗ build nó trong `toPlayTypeRows`/`toSideBetPairs` (sum helper còn key `"entries"`) + component nào render field đó (compiler dẫn) |

**Trình tự an toàn:** xoá field khỏi entity TRƯỚC → `check-types` liệt kê mọi nơi còn đọc/ghi → sửa
theo danh sách compiler. Sau đó grep `\.entries` trong 2 package + FE keno xác nhận chỉ còn
`totals.entries` + các usage không liên quan (`ticket_entries`, byTenant.entries...).

**Doc cũ trên DB còn field `entries` trong từng slot:** vô hại — mapper normalize không map nó (bỏ qua
field lạ), `$inc` không chạm nữa. KHÔNG cần `$unset` migration (ghi rõ trong PR: rác field cũ chấp nhận).

## Q4 — Alert `worker_stuck` — ⛔ SUPERSEDED 03/08/2026, KHÔNG IMPLEMENT

> **Trạng thái:** đã code, đã ship, **đang được hoàn nguyên** bởi
> `.cursor/plans/system-worker-health/p0-02-keno-drop-worker-stuck-alert.plan.md`.
>
> **Vì sao bỏ:** nhu cầu (biết kỳ nào kẹt) là THẬT, nhưng `ops_alerts` là chỗ SAI. `ops_alerts` dành cho
> **sự kiện nghiệp vụ của 1 kỳ** (có `drawId` bắt buộc, cần staff ack); sức khoẻ worker là **trạng thái
> hạ tầng** (tự hết khi worker hồi phục, không thuộc kỳ nào). Đặt sai chỗ sinh 4 defect:
>
> 1. `OpsAlertStatus.Resolved` **không có nơi nào set** trong toàn repo ⇒ worker khỏi rồi badge vẫn đỏ
>    tới khi staff ack một sự cố **đã tự khỏi** ⇒ mòn giá trị badge của alert nghiệp vụ thật.
> 2. Badge đếm **global** (`countActiveCritical`) nhưng panel lọc **per-draw** — worker luôn kẹt ở kỳ
>    cũ nhất, staff mở kỳ đang chạy ⇒ đỏ mà panel trống.
> 3. `Record<KenoOpsAlertType, boolean>` buộc `enabled` có key `worker_stuck` dù 0 consumer đọc (chính
>    là defect #5 trong bảng review `00-overview.md`, "fix" bằng JSDoc 8 dòng bào chữa).
> 4. Streak reset mỗi invocation ⇒ không phân biệt "lỗi thoáng qua" với "kẹt 6 tiếng".
>
> **Thay bằng:** `recordItemFailure`/`clearItemFailure` của `SingleRunWorker` (`worker-core`) —
> streak persist trên `worker_locks.stalledItems`, **0 DB call thêm**, tự rỗng khi hồi phục, hiển thị ở
> trang BO chung `/system/workers` cho cả 9 worker app.
>
> Phân tích đầy đủ: `.cursor/analysis/system-worker-health.analysis.md`; Keno analysis §5.7.
>
> **Phần mô tả dưới đây giữ nguyên làm hồ sơ lịch sử** (nó phản ánh thiết kế tại thời điểm ship, cần cho
> ai đọc lại diff của PR cũ). ĐỪNG dùng làm hướng dẫn implement.

Hiện `failed` chỉ nằm trong log CloudWatch — kỳ kẹt lặp lại (data bẩn làm `syncDraw` throw mãi, hoặc
cursor alert bị chặn theo p0-02 quyết định #3) không ai biết cho tới khi user thấy số liệu đứng yên.

**Thiết kế tối thiểu (không hạ tầng mới):** tái dùng chính hệ alert ops sẵn có.

1. `packages/game-keno/src/entities/ops-alert.ts` — thêm member vào `KenoOpsAlertType`:

```typescript
/** Worker stats/alert kẹt: 1 kỳ lỗi lặp lại nhiều tick liên tiếp — cần người xem log. */
WorkerStuck: "worker_stuck",
```

(const-as-const §5.3 — thêm member là non-breaking cho `Record<KenoOpsAlertType, T>`? **KHÔNG** — 
`OpsAlertsConfig.enabled: Record<KenoOpsAlertType, boolean>` sẽ BẮT thiếu key → phải thêm default
`worker_stuck: true` vào config schema/default + zod backoffice. Compiler dẫn đường — đó là chủ đích.)

2. Trong sync worker: đếm lỗi LIÊN TIẾP per-drawId (Map instance, reset ở `beforeLoop` — chỉ cần phát
   hiện kẹt trong 1 invocation là đủ vì kỳ kẹt thật sẽ kẹt mọi invocation; ngưỡng đề xuất: cùng 1 drawId
   fail ≥ 3 tick liên tiếp trong invocation) → upsert alert `severity: critical`,
   `dedupeKey: "worker_stuck:{drawId}"` qua `OpsAlertRepository` (sync worker phải giữ lại/nhận lại
   alertRepo CHỈ cho mục này — ghi JSDoc rõ đây là alert VẬN HÀNH của chính worker, không phải alert
   nghiệp vụ đã tách sang p0-02).
3. Trong alert worker (p0-02): khi cursor bị chặn bởi cùng 1 drawId ≥ 3 tick → tương tự.
4. FE: `alerts-panel.tsx` + `ops-constants.ts` (label/màu cho type mới) — kiểm chỗ render theo
   `KenoOpsAlertType` có mapping cứng không (`Record` sẽ được compiler bắt; string switch thì grep).

**Cân nhắc đã chốt:** không dùng CloudWatch alarm/metric mới (hạ tầng riêng, không hiển thị cho ops
trong backoffice); không đếm cross-invocation (cần persist thêm state — YAGNI, kỳ kẹt thật kẹt mọi
invocation nên ngưỡng trong-invocation là đủ).

## Q5 — Rename `boards` → `sets` (đơn vị bộ cược)

Phát sinh trong review 02/08: field đếm đơn vị cược tên `boards` nhưng giá trị là `Σ(board.betCount)`,
KHÔNG phải số board. Tên cũ đụng thẳng `entrySummary.boards[]` (mảng board thật — `length` của nó
chính là `selectionCount`, đại lượng KHÁC) → người đọc code/dashboard hiểu sai đơn vị. FE lại gọi
cùng thứ đó là `selections` và render nhãn "lượt" → 3 tên cho 1 đại lượng.

**Chốt tên:** `sets` — khớp `combo.sets`, `capSets`, `maxSetsForFixed` đã có sẵn trong domain và khớp
nhãn UI "Số bộ".

| Tầng | Đổi |
|---|---|
| `game-core/types/betting-stats.ts` | `DrawBettingTotals.boards` → `sets` (dùng chung 4 game) |
| `game-keno/entities` | `KenoPlayTypeStat.boards`→`sets`, `KenoNumberStat.boards`→`sets`, `KenoDrawAccountStatsDoc.boards`→`sets` |
| `game-keno/rules/stats-shape.ts` | `createEmptyPlayTypeStat()` trả `sets: 0` |
| keno-application | mapper (normalize), repo (`$inc` path), accumulator, `AccountStatsDelta`, test |
| bingo18/max3d/max3dpro-application | accumulator: `private boards` → `sets`, `seed`/`toSnapshot` đọc `totals.sets` |
| FE 4 game | `OpsKpi.totalBoards`→`totalSets` (keno), `totalBasicBoards`→`totalBasicSets` (bingo18), `PlayTypeRow.selections`→`sets`, `NumberFreqItem.count/entries`→`sets`, `TopComboRow.boardCount`→`sets`, `TenantRow.boards`→`sets`; nhãn "lượt"/"Boards" → "bộ"/"Số bộ cược" |

**KHÔNG đổi** (tên `boards` ở đây ĐÚNG nghĩa — đếm `+= 1` mỗi board): `Max3dPlayTypeStat.boards`,
`Max3dTripletStake.boards`, `Max3dproPlayTypeStat.boards`, `Max3dproTripletStake.boards`, và mọi
`entrySummary.boards[]`. JSDoc 4 field này đã ghi rõ "KHÁC `DrawBettingTotals.sets`" để người sau
không rename lây.

### Migration doc đang mở — HUỶ (dự án chưa deploy, không có doc cũ)

**Cập nhật 02/08/2026:** bản đầu của mục này viết cả lớp tương thích đọc (`readSetsCounter` cộng
`sets + boards`, `WithLegacySets<T>`) và script `$rename` migration, với lý do "kỳ đang mở lúc deploy
sẽ có doc chứa cả `boards` (trước) và `sets` (sau)". Sai tiền đề: dự án **chưa từng deploy** field
`boards` ra production — không có worker nào từng chạy để viết field đó vào bất kỳ document nào.
"Doc lai" là kịch bản không thể xảy ra, không phải rủi ro cần phòng.

Đã xoá toàn bộ lớp tương thích: `packages/game-core/src/utils/legacy-stats-fields.ts` (file + export ở
`utils/index.ts`), mapper Keno (`normalizeTotals`/`normalizePlayTypeStat`/`normalizeNumberFreq`/
`account-stats-mapper.ts`) đọc thẳng `raw?.sets ?? 0`, `seed()` 3 accumulator bingo18/max3d/max3dpro đọc
thẳng `b.totals.sets`. Test "doc lai" trong `betting-stats-mapper.test.ts` đổi thành test doc chỉ có
`sets` (kịch bản thật: doc final trước khi mapper từng đọc field `boards`).

**Bài học cho lần rename sau (kể cả port p2-01):** trước khi viết lớp "đọc chịu lỗi" hay script
migration cho 1 rename, luôn hỏi trước: *"field cũ đã từng được ai ghi vào Mongo thật chưa?"* Nếu
project/feature chưa deploy, câu trả lời là KHÔNG và toàn bộ lớp tương thích là code thừa — chỉ cần
sửa tên tại chỗ, xoá field cũ khỏi type, để compiler bắt hết chỗ dùng sai. Lớp tương thích chỉ cần khi
có **dữ liệu thật** đang mang tên cũ.

## Đánh giá & verify

1. `check-types` cho `@megawin/game-keno`, `@megawin/game-keno-application`, `@megawin/worker-keno`,
   `@megawin/backoffice` (Q3/Q4 chạm FE types).
2. Q1: đọc lại output grep sau sửa — 0 match sai.
3. Q2: grep tiêu chí xong ở trên — 0 cast mù còn lại.
4. Q3: grep `\.entries` như §Q3; UI Operations render bình thường (dev).
5. Q4: test dev — chèn 1 entry data bẩn (sửa tay doc entry cho parse fail) → sau 3 tick thấy alert
   `worker_stuck` trong panel backoffice; sửa lại data → kỳ tự thoát kẹt, alert ack tay.
6. Q5: `check-types` thêm `@megawin/game-core` + 3 package `game-{bingo18,max3d,max3dpro}-application`;
   `grep -rn "\.boards\b"` trong stats-context 4 game → chỉ còn 4 field Max3D/Max3DPro cố ý giữ +
   `entrySummary.boards`.

## Review & rủi ro

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | Q3 xoá nhầm `totals.entries` (có consumer) thay vì `slot.entries` | 🟠 | Diff entity: chỉ `KenoPlayTypeStat` mất field; `DrawBettingTotals` nguyên |
| 2 | Q4 thêm enum member → thiếu key ở `Record` nào đó ngoài dự kiến (config zod, FE label map) | 🟠 | Chạy check-types TOÀN BỘ 4 package; compiler là lưới — không suy đoán tay |
| 3 | Q4 kéo alertRepo lại vào sync worker → người sau tưởng tách p0-02 chưa xong | 🟡 | JSDoc field alertRepo trong sync worker ghi rõ "CHỈ worker_stuck (alert vận hành)" |
| 4 | Q1 sửa comment nhưng sai thực tế mới (comment sai còn tệ hơn) | 🟡 | Mỗi comment sửa phải trích dẫn code hiện hành trong PR description |
| 5 | Q4 alert spam khi sự cố diện rộng (mọi kỳ cùng fail vì DB) | 🟢 | dedupeKey per-drawId + upsert → mỗi kỳ 1 alert; chấp nhận |
| 6 | ~~Q5 doc kỳ đang mở lúc deploy mất phần counter cộng trước rename~~ — HUỶ 02/08: dự án chưa deploy, không có doc cũ mang `boards`. Xem "Migration doc đang mở" | ➖ | Không cần lớp tương thích; rename trực tiếp |
| 7 | Q5 rename lây sang `boards` ĐÚNG nghĩa của Max3D/Max3DPro (đếm `+= 1` mỗi board) | 🟠 | Audit từng field; 4 field giữ nguyên + JSDoc ghi "KHÁC `DrawBettingTotals.sets`" |
| 8 | ~~Q5 migration `$rename` ghi đè `sets` trên doc lai~~ — HUỶ 02/08: không có migration để chạy | ➖ | — |
| 9 | Q5 FE/BE lệch nhịp release (FE đọc `totals.sets`, API còn trả `boards`) | 🟡 | Rename BE + FE trong cùng 1 lượt sửa (không phải cùng PR release riêng — dự án chưa deploy nên không có "lệch nhịp" thật) |

### Kết quả review (02/08) — ✅ PASS sau 3 fix nhỏ

| # | Rủi ro | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Q3 xoá nhầm `totals.entries` | ✅ | `KenoPlayTypeStat` (`entities/betting-stats.ts:33-38`) còn đúng 2 field `amount`/`sets`. `DrawBettingTotals` (`game-core/types/betting-stats.ts`) NGUYÊN 5 field kể cả `entries` — KPI vẫn có nguồn |
| 2 | Q4 thiếu key `Record` ngoài dự kiến | ✅ | `check-types` PASS cả 5 package (`worker-core`, `game-keno`, `game-keno-application`, `worker-keno`, `backoffice`). 3 điểm consumer đã có key: default config `rules/financials.ts:258`, label FE `ops-constants.ts:28`, render payload `alerts-panel.tsx:176`. Zod route dựng schema từ `Object.values(KenoOpsAlertType)` (`api/keno/config/_lib/schema.ts:102-109`) → tự có key mới, không cần sửa tay |
| 3 | Q4 kéo `alertRepo` về sync worker gây hiểu nhầm | ✅ | JSDoc field (`sync-betting-stats.ts:123-127`) + JSDoc class dòng 31-34 nói rõ ranh giới alert nghiệp vụ (đã tách) vs alert vận hành |
| 4 | Q1 comment sửa sai thực tế mới | ✅ | Grep `recomputeFull\|recomputeClosedDraws\|seed-slot\|skeleton` → match còn lại đều là mô tả LỊCH SỬ có chủ đích ("bản trước p2-01 …", "doc cũ skeleton p2-01 vẫn đọc đúng") hoặc phủ định ("KHÔNG seed skeleton") — đúng hành vi hiện tại |
| 5 | Q4 alert spam sự cố diện rộng | ✅ | `dedupeKey: worker_stuck:{drawId}` + `bulkUpsertByDedupe` → tối đa 1 alert/kỳ; ngưỡng 3 tick liên tiếp lọc thêm lỗi thoáng qua |
| 6 | ~~Q5 mất counter trước deploy~~ | ➖ HUỶ | Tiền đề sai — dự án chưa deploy nên không có doc mang `boards`. Đã xoá lớp tương thích `readSetsCounter`/`WithLegacySets` (`game-core/utils/legacy-stats-fields.ts`); mapper Keno + `seed()` 3 accumulator đọc thẳng `sets`. Xem "Migration doc đang mở" |
| 7 | Q5 rename lây field `boards` đúng nghĩa | ✅ | Giữ nguyên `Max3dPlayTypeStat.boards`, `Max3dTripletStake.boards`, `Max3dproPlayTypeStat.boards`, `Max3dproTripletStake.boards` (`+= 1` mỗi board); JSDoc 4 field ghi "KHÁC `DrawBettingTotals.sets` (`Σ betCount`) — tên `boards` ở đây ĐÚNG nghĩa, không đổi theo rename 02/08/2026" |
| 8 | ~~Q5 migration ghi đè doc lai~~ | ➖ HUỶ | Không có migration script — không có dữ liệu cũ cần dọn |
| 9 | Q5 FE/BE lệch nhịp | ✅ | Không có API nào expose field thô: FE đọc entity đã qua mapper. `tsc --noEmit` toàn `apps/backoffice` PASS sau khi đổi `totalSets`/`totalBasicSets`/`PlayTypeRow.sets`/`NumberFreqItem.sets`/`TopComboRow.sets`/`TenantRow.sets` |

**Fix trong lượt review:**

1. **Q4 — payload alert phình không giới hạn** (🟠, mới): cả 2 worker ghi `lastError: error.message` trần.
   Message của lỗi Mongo/BSON có thể kèm dump cả document → alert doc phình, panel FE render chuỗi khổng lồ.
   Đã đổi sang `truncateErrorMessage(error)` (`@megawin/shared/utils`, cắt 500 ký tự) — cùng util mà
   `SingleRunWorker.finalizeAndRelease` dùng cho `lastError`, nên 2 chỗ nhất quán.
2. **Q4 — ngữ nghĩa `enabled[worker_stuck]` mơ hồ** (🟡): key tồn tại trong `Record` và default `true`, nhưng
   KHÔNG worker nào đọc (khác 5 alert nghiệp vụ đi qua gate `enabled`). Người sau dễ tưởng tắt được. Đã ghi
   rõ trong JSDoc member `WorkerStuck` (`entities/ops-alert.ts`) + comment default config: worker bắn TRỰC
   TIẾP, sức khoẻ worker không phải thứ để staff tắt; UI ops-config cố ý không render toggle (`ALERT_META`
   chỉ liệt kê 5 loại nghiệp vụ).
   → **HẬU KIỂM 03/08/2026:** "fix bằng JSDoc" là chữa ngọn. Phải viết 8 dòng bào chữa cho 1 member không
   tuân luật của chính enum chứa nó = dấu hiệu member đó **không thuộc enum đó**. Gốc: `worker_stuck` là
   trạng thái hạ tầng, không phải sự kiện nghiệp vụ của kỳ quay. Đã chốt xoá hẳn — xem banner ⛔ ở §Q4 và
   `.cursor/plans/system-worker-health/`.
3. **Q1 — 1 comment stale còn sót**: `stats-accumulator.ts` field `byPlayType` ghi "factory dùng chung với
   **repo seed doc**" — repo không còn seed từ p0-03. Đã đổi sang "mapper normalize phía đọc".
4. **Q5 (mới, phát sinh từ câu hỏi review)** — rename `boards` → `sets` toàn bộ đường stats 4 game +
   FE. Xem §Q5. Dead code phát hiện thêm khi rà FE:
   `TenantBreakdownCard` trong `bingo18/.../analytics-panels.tsx` không còn ai import (đã thay bằng
   `tenant-panel.tsx`) → đã xoá cùng `TenantRow` cục bộ và import `Store`.
5. **Q5 (huỷ lớp tương thích, phát sinh từ câu hỏi review lần 2)** — bản đầu §Q5 viết cả `readSetsCounter`
   (cộng `sets + boards`) và script migration `$rename`, dựa trên tiền đề "kỳ đang mở lúc deploy có doc
   lai". Sai: dự án **chưa deploy**, không có worker nào từng ghi field `boards` vào Mongo thật → không
   có doc lai để phòng. Đã xoá `game-core/utils/legacy-stats-fields.ts` + export, mapper Keno và `seed()`
   3 accumulator đọc thẳng `sets`, test đổi từ "doc lai" sang "doc chỉ có `sets`". Xem "Migration doc
   đang mở" trong §Q5.

**Q2 — kết quả grep cast** (tiêu chí "0 cast mù" trong đường stats):

| File | Cast còn lại | Đánh giá |
|---|---|---|
| `betting-stats-mapper.ts` | 0 | ✅ p0-03 đã vá, không tái phát |
| `betting-stats-repo.ts` | `update as UpdateFilter<Document>` (dòng 194), `(value as KenoPlayTypeStat).amount` (dòng 315) | ✅ ĐẠT — cả 2 có comment 1 dòng lý do: driver type không mô tả nổi `$push` + `$each/$sort/$slice` với computed path; cast thứ 2 là type-guard nội bộ |
| `stats-accumulator.ts` | `board.playType as KenoPlayType` (2 chỗ) | ✅ ĐẠT — comment ghi rõ `playType` là `string` từ projection thô nhưng đã qua Zod lúc place-bet. Chỗ CHÍNH mà Q2 nhắm (`as unknown as Record` khi map slot) đã thay bằng `switch` tường minh (dòng 293-320) |
| Mapper/repo khác (`draw-mapper`, `ticket-mapper`, `game-config-mapper`…) | còn `{...rest} as Entity` | ⚠️ **NGOÀI phạm vi** — không thuộc đường stats (§Q2 liệt kê đúng 4 path). Ghi nhận là nợ kỹ thuật riêng, KHÔNG mở rộng scope PR này |

Verify đã chạy: §1 check-types 5 package PASS, §2 grep Q1, §3 grep Q2.
Chưa chạy: §4 click-through UI dev. ~~§5 test `worker_stuck` bằng data bẩn~~ — không còn cần: Q4 bị
hoàn nguyên (§Q4 banner ⛔), smoke test tương ứng chuyển sang
`.cursor/plans/system-worker-health/p0-02` §4.3.

## Rollback

Q1/Q2 thuần văn bản/type — revert tự do. Q3 revert cần chấp nhận doc tạo trong thời gian chạy bản mới
thiếu `entries` per-slot (giá trị sẽ lệch nếu quay lại đọc — nhưng không ai đọc, chính là lý do xoá).
Q4 revert = mất alert vận hành, không ảnh hưởng số liệu; nhớ gỡ key `worker_stuck` khỏi config default
nếu revert entity (hoặc revert nguyên PR).
