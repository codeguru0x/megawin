# p0-01 — Foundation: Entities + OpsConfig + Indexes (domain package)

> **Nguồn:** `.cursor/analysis/power655-operations-risk-control.analysis.md` §3 (thiết kế DB), §3.7 (alert types), §3.8 (ops config), §3.9 (indexes)
> **Phase:** P0 · **Thứ tự:** 01 · **Phụ thuộc:** không — merge sớm nhất.
> **Package đích:** `packages/game-power655` (domain thuần — KHÔNG I/O).

## Mục tiêu

Khai toàn bộ nền tảng type-safe cho hệ stats/alert: 6 collection mới + enum alert type + section `ops` trong GlobalConfig + defaults + index (thêm mới và xoá 3 index chết `drawDate`). Sau plan này, p0-02 (repos/worker) và p0-03 (API/UI) chỉ import — không định nghĩa thêm type nền.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File Keno production |
|---|---|
| Entity betting-stats | `packages/game-keno/src/entities/betting-stats.ts` |
| Entity account/combo-stats | `packages/game-keno/src/entities/account-stats.ts`, `combo-stats.ts` |
| Entity ops-alert | `packages/game-keno/src/entities/ops-alert.ts` |
| `ops` trong GlobalConfig + defaults | `packages/game-keno/src/entities/global-config.ts` (dòng ~80 `ops: OpsConfig`) |
| Khai index | `packages/game-keno/src/indexes/index.ts` (khối stats/alerts) |
| Base types dùng chung | `packages/game-core/src/types/betting-stats.ts`, `ops-alert.ts` — import, KHÔNG định nghĩa lại (rule §5 code-quality) |

## File & thay đổi

### 1. TẠO `packages/game-power655/src/entities/betting-stats.ts`

Theo analysis §3.4, nguyên văn shape:

- `Power655PlayTypeStat { amount; sets; boards }` — JSDoc từng field ghi đơn vị `(VND)` và công thức (`sets = Σ(expandedLines × betCount)`, `boards` không nhân betCount).
- `Power655Exposure { fixedWorstCase }` — JSDoc BẮT BUỘC ghi: công thức `= totals.sets × tier1 (RAW, không cap)`, và ghi chú "jackpot exposure KHÔNG lưu ở đây — đọc pool lúc build response (analysis §3.6)".
- `Power655TopPotential { entryId; accountId; username; amount; fixedPotential }` — JSDoc `fixedPotential`: `= betUnitCount × tier1 snapshot lúc accumulate; KHÔNG cộng jackpot share (không bất biến per-entry)`.
- `Power655DrawBettingStatsDoc extends Omit<DrawBettingStatsBase, "lastEntryId">, DeltaAccumulatedDoc` + `byPlayType: Record<PlayType, Power655PlayTypeStat>` + `exposure` + `topPotential`.
- `Power655DrawBettingStatsEntity extends Omit<Power655DrawBettingStatsDoc, "_id">` (pattern `_id: unknown` + Entity — theo `mongodb.mdc`).

JSDoc class-level của Doc ghi: "1 doc/draw · watermark `lastEntryId` idempotent · `final` đóng dấu ở TERMINAL (Settled/Void), KHÔNG ở SalesClosed". KHÔNG có `numberFreq`/`topAccounts`/`topCombos` trong doc (analysis §3.4, §3.1(3)).

### 2. TẠO `packages/game-power655/src/entities/number-stats.ts` — KHÁC KENO CÓ CHỦ ĐÍCH

`Power655DrawNumberStatsDoc` nguyên văn analysis §3.3: `{drawId, number ("01".."55" zero-padded), sets, amount, boards, createdAt, updatedAt}` extends `DeltaAccumulatedDoc`. JSDoc header file ghi rõ: "Tách collection riêng thay vì nhúng như Keno — quyết định 05/08/2026, chừa đường chỉ số unbounded per số (analysis §3.3, §6.1-D1)". JSDoc `amount`: "Σ board amount các board CHỨA số — không chia (kết luận toán học Keno §3.7)". JSDoc `boards`: "phân biệt 'nhiều người chọn' vs 'ít người cược đậm'".

### 3. TẠO `packages/game-power655/src/entities/account-stats.ts` + `combo-stats.ts`

Copy shape Keno, đổi comboKey:

- `Power655DrawAccountStatsDoc`: `{drawId, accountId, username, amount, entries, sets}` + watermark.
- `Power655DrawComboStatsDoc`: `{drawId, comboKey, playType, mainNumbers: string[], sets, amount, accountCount}` + watermark. JSDoc `comboKey` BẮT BUỘC ghi format: `` `${playType}:${sortedMainNumbers.join(",")}` `` theo BOARD — vé Bao 18 = 1 doc (18 số đã chọn), KHÔNG expand C(18,6)` (analysis §3.5). JSDoc `accountCount`: "counter vô hướng sync bằng `syncAccountCounts` ($set tuyệt đối) — KHÔNG $size mảng (mongodb.mdc §8)".
- `Power655DrawComboAccountDoc`: `{drawId, comboKey, accountId, username, sets, amount}` + watermark.

### 4. TẠO `packages/game-power655/src/entities/ops-alert.ts`

- `Power655OpsAlertType` — const object `as const` + type dẫn xuất (§5.3 code-quality), **nguyên văn analysis §3.7** gồm 6 member: `LargeBet`, `ExposureThreshold`, `ComboConcentration`, `BaoHighStake`, `RevenueAnomaly`, `SettleStuck` (2 member cuối JSDoc `Để dành — KHÔNG bắn P0`). KHÔNG có `SidebetSkew`/`CapSetsNear`/`JackpotMilestone`.
- **JSDoc TỪNG member là yêu cầu cứng (user chốt 05/08)**: phải ghi công thức BẬT (kèm tên field config: `ops.alerts.largeBetAmount`, `fixedExposureWarnAmount`, `comboAccountsWarn`, `baoHighStakeAmount`) + điều kiện Critical + dedupeKey — copy nguyên khối JSDoc trong analysis §3.7. Reviewer từ chối nếu JSDoc chỉ 1 dòng mô tả.
- `Power655OpsAlertDoc extends OpsAlertBase { type: Power655OpsAlertType }` — import `OpsAlertBase`, `OpsAlertStatus`, `OpsAlertSeverity` từ `@megawin/game-core/types`.

### 5. SỬA `packages/game-power655/src/entities/global-config.ts`

- Thêm `Power655OpsAlertsConfig` + `Power655OpsConfig` nguyên văn analysis §3.8 (`stats: OpsStatsConfig` import từ game-core). JSDoc từng field ngưỡng ghi default + đơn vị VND + lý do (`largeBetAmount` default 30tr vì vé Bao phổ biến lớn; `fixedExposureWarnAmount` VND tuyệt đối vì không có cap để tính %).
- `GlobalConfigDoc` thêm field `ops: Power655OpsConfig`.
- `DEFAULT_POWER655_CONFIG` (trong `rules/jackpot.ts` hoặc nơi hiện khai — xác định lúc implement) thêm block `ops` defaults: `largeBetAmount: 30_000_000`, `fixedExposureWarnAmount: 2_000_000_000`, `comboAccountsWarn: 5`, `baoHighStakeAmount: 30_000_000`, `enabled` bật 4 alert P0 / tắt 2 alert để-dành, `stats: { tickSeconds: 10, topPotentialK: 10, topAccountsK: 10, topCombosK: 10 }` (đối chiếu số K với default Keno lúc implement — dùng đúng giá trị Keno nếu khác).

### 6. SỬA `packages/game-power655/src/entities/enums.ts`

`Power655Collections` thêm 6 key theo pattern const-as-const sẵn có: `DrawBettingStats: "power655_draw_betting_stats"`, `DrawNumberStats: "power655_draw_number_stats"`, `DrawAccountStats: "power655_draw_account_stats"`, `DrawComboStats: "power655_draw_combo_stats"`, `DrawComboAccounts: "power655_draw_combo_accounts"`, `OpsAlerts: "power655_ops_alerts"`.

### 7. SỬA `packages/game-power655/src/indexes/index.ts`

- **XOÁ 3 index chết** trên `TicketEntries`: `idx_tenant_account_drawDate`, `idx_tenant_drawDate_status`, `idx_drawDate_status` (field `drawDate` không tồn tại trên `TicketEntryDoc` — analysis §2.2). Ghi chú migration cho DBA trong PR description: drop 3 index này trên Atlas.
- **THÊM** đúng bảng analysis §3.9 (mỗi index có `purpose` tiếng Việt như tiền lệ):
  - `draw_betting_stats`: `{drawId:1}` unique · `{final:1}` · `{updatedAt:1}`.
  - `draw_number_stats`: `{drawId:1, number:1}` unique · TTL `{createdAt:1}` 90 ngày.
  - `draw_account_stats`: `{drawId:1, accountId:1}` unique · `{drawId:1, amount:-1}` · TTL 90d.
  - `draw_combo_stats`: `{drawId:1, comboKey:1}` unique · `{drawId:1, sets:-1}` · `{drawId:1, accountCount:1}` · **`{drawId:1, playType:1, mainNumbers:1}` multikey** (nhánh `$all` bao7–18 tính `jackpotUnits` — analysis §3.10(3); prefix `playType` để index bound KHÔNG quét biển combo standard, phục vụ p1-01) · TTL 90d.
  - `draw_combo_accounts`: `{drawId:1, comboKey:1, accountId:1}` unique · TTL 90d.
  - `ops_alerts`: `{drawId:1, dedupeKey:1}` unique · `{status:1, severity:1, createdAt:-1}` · TTL 180d.
  - `ticket_entries`: **THÊM `{drawId:1, accountId:1}`** — ownership-gate combo popularity (analysis §3.10; hiện index này CHỈ có trên `ticket_lines`, chưa có trên entries). Ngoài ra đối chiếu Keno — nếu `getEntriesForStatsAfter` Keno cần index `{drawId:1, _id:1}` thì thêm tương đương, nếu Keno chạy trên `_id` tự nhiên thì KHÔNG thêm (copy đúng quyết định Keno, ghi lại kết luận vào plan này khi implement).
- Đối chiếu TTL: copy đúng cú pháp `expireAfterSeconds` từ khối Keno.

### 8. SỬA `packages/game-power655/src/entities/index.ts` (barrel)

Export 4 file entity mới + types ops config. Import block đầu file (§7 code-quality).

## Nguyên tắc MongoDB áp trong plan này

- Unique index là tuyến phòng thủ idempotency (duplicate 11000 = no-op ở p0-02) — PHẢI có trước khi worker chạy.
- TTL index thay batch-cleanup job — không viết cron xoá tay.
- Counter vô hướng (`accountCount`, `largeBetCount`) khai sẵn trong entity để query sargable `{drawId, accountCount: {$gte}}` — không dựa `$size`/`$expr`.
- Index prefix trùng nhau không khai lặp (vd `{drawId:1, comboKey:1}` unique đã cover query `{drawId}` prefix).

## Cách review (sau khi implement)

1. Diff từng file đối chiếu mục "File & thay đổi" — đúng shape analysis §3.3–§3.9, không thêm field ngoài thiết kế.
2. So khớp side-by-side với file Keno tương ứng: khác biệt CHỈ được nằm trong {số 55, comboKey theo board, exposure 2 phần, alert set, number-stats tách, defaults}.
3. Kiểm JSDoc: mở từng entity — mọi interface/field có JSDoc đơn vị/công thức; 4 alert type P0 có đủ công thức bật + Critical + dedupeKey.
4. Grep kiểm: `rg 'Doc\["' packages/game-power655/src` = 0 match mới (§5.4); `rg '"drawDate"' packages/game-power655/src/indexes` = 0 match.
5. Xác nhận KHÔNG định nghĩa lại type game-core: `rg "interface (DeltaAccumulatedDoc|OpsAlertBase|DrawBettingTotals|OpsStatsConfig)" packages/game-power655/src` = 0 match.

## Cách test

```bash
pnpm --filter @megawin/game-power655 check-types
pnpm --filter @megawin/game-power655-application check-types   # downstream không gãy
pnpm --filter @megawin/backoffice check-types                  # GlobalConfigDoc đổi shape — BO compile được
pnpm --filter @megawin/game-power655 test                      # nếu package có test hiện hữu
```

Không có unit test riêng cho plan này (types thuần) — test hành vi defaults `ops` nằm ở p0-03 (get-config merge default).

## Rủi ro & cách test rủi ro

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | Xoá 3 index `drawDate` làm gãy query đang sống | `rg "drawDate" packages/game-power655-application apps/backoffice/src/app/api/power655 apps/worker-power655` — mọi match còn lại phải trên `power655_draws`/`draw_counters` (Doc có field thật). Match nào trỏ `ticket_entries` → dừng, điều tra trước khi xoá. |
| R2 | Thêm `ops` required vào `GlobalConfigDoc` làm gãy code đọc config hiện hữu (doc DB cũ KHÔNG có `ops`) | Đây là lý do §3.8 bắt merge-default ở tầng đọc (p0-03). Trong p0-01: kiểm mọi nơi construct/validate `GlobalConfigDoc` (`rg "GlobalConfigDoc" packages/game-power655-application` → mapper/use-case) compile được; nếu mapper hiện tại cast thẳng doc DB → ghi chú TODO trỏ p0-03 mapper normalize, KHÔNG để runtime đọc `config.ops.x` trước khi p0-03 merge default. An toàn nhất: mọi consumer mới của `ops` chỉ xuất hiện từ p0-02+ và đều đi qua đường get-config có default. |
| R3 | Defaults `ops` lệch với Zod range của p0-03 (default nằm ngoài range → form lưu lỗi) | Ghi bảng defaults vào plan p0-03 mục Zod; khi viết Zod, thêm test khẳng định `schema.parse(DEFAULT_POWER655_CONFIG.ops)` pass. |
| R4 | Tên collection gõ nhầm (string trần) | Chỉ khai 1 lần trong `Power655Collections`; grep `power655_draw_` toàn repo — mọi match phải ở `enums.ts` hoặc test. |
| R5 | Unique index tạo trên collection ĐÃ có data trùng | Không xảy ra P0 — 6 collection đều mới. Ghi chú vào PR: nếu môi trường dev từng chạy nhánh thử nghiệm, drop collection trước khi ensureIndexes. |
| R6 | TTL xoá data draw chưa settle (kỳ kéo dài bất thường) | TTL 90d trên `createdAt` — kỳ dài nhất 3 ngày + maxDrawCount 6 kỳ mua trước ≪ 90d. Khẳng định bằng chú thích cạnh index; không cần test runtime. |
