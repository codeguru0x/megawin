# p0-01 — Foundation: Entities + OpsConfig + Indexes + Dọn di sản split (domain package)

> **Nguồn:** `.cursor/analysis/mega645-operations-risk-control.analysis.md` §2.2 (di sản + index chết), §3.3–§3.9 (thiết kế DB), §3.7 (alert types), §3.8 (ops config — defaults ĐÃ CHỐT Q1), §8 Q2 (xoá split)
> **Phase:** P0 · **Thứ tự:** 01 · **Phụ thuộc:** không — merge sớm nhất trong chuỗi ops.
> **Package đích:** `packages/game-mega645` (domain thuần — KHÔNG I/O).

## Mục tiêu

Khai toàn bộ nền tảng type-safe cho hệ stats/alert: 6 collection mới + enum alert type + section `ops` trong GlobalConfig + defaults (đã chốt Q1) + index (thêm mới, xoá 2 index chết `drawDate`) + **xoá di sản split** (Q2). Sau plan này, p0-02 (repos/worker) và p0-03 (API/UI) chỉ import — không định nghĩa thêm type nền.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File mẫu (ưu tiên Power 6/55 — ĐÃ implement) |
|---|---|
| Entity betting-stats | `packages/game-power655/src/entities/betting-stats.ts` |
| Entity number-stats (chuẩn nhóm jackpot) | `packages/game-power655/src/entities/number-stats.ts` |
| Entity account/combo-stats | `packages/game-power655/src/entities/account-stats.ts`, `combo-stats.ts` |
| Entity ops-alert | `packages/game-power655/src/entities/ops-alert.ts` |
| `ops` trong GlobalConfig + defaults | `packages/game-power655/src/entities/global-config.ts` + `rules/jackpot.ts` (`DEFAULT_POWER655_CONFIG.ops`) |
| Helper comboKey | `packages/game-power655/src/rules/combo-key.ts` |
| Khai index | `packages/game-power655/src/indexes/index.ts` (khối stats/alerts) |
| Base types dùng chung | `packages/game-core/src/types/betting-stats.ts`, `ops-alert.ts` — import, KHÔNG định nghĩa lại (rule §5 code-quality) |

## File & thay đổi

### 1. XOÁ di sản split (Q2 — làm ĐẦU TIÊN, diff sạch trước khi thêm mới)

- SỬA `packages/game-mega645/src/entities/enums.ts` — XOÁ const `MEGA645_SPLIT_ELIGIBLE_TIERS` (dòng 67–75).
- SỬA `packages/game-mega645/src/rules/prize-tiers.ts` — XOÁ field `splitEligible` khỏi interface `PrizeTierRule` + 4 chỗ gán trong `DEFAULT_PRIZE_TIER_RULES` + mệnh đề "splitEligible" trong JSDoc liên quan (rule §4 code-quality: sửa comment khớp code, không xoá comment còn đúng).
- Xác minh TRƯỚC khi xoá: `rg "splitEligible|SPLIT_ELIGIBLE" --type ts` toàn repo — mọi match phải nằm trong 2 file trên (định nghĩa + tự tham chiếu). Có match ngoài → DỪNG, điều tra.

### 2. TẠO `packages/game-mega645/src/entities/betting-stats.ts`

Theo analysis §3.4, nguyên văn shape:

- `Mega645PlayTypeStat { amount; sets; boards }` — JSDoc từng field ghi đơn vị `(VND)` và công thức (`sets = Σ(expandedLines × betCount)`, `boards` không nhân betCount — tín hiệu "Bao 18 amount lớn nhưng boards nhỏ").
- `Mega645Exposure { fixedWorstCase }` — JSDoc BẮT BUỘC ghi: công thức `= totals.sets × tier1 (RAW, không cap; tier1 Mega 6/45 default 10tr = ¼ Power 6/55)`, và ghi chú "jackpot exposure KHÔNG lưu ở đây — 1 pool duy nhất, đọc `DrawJackpotSnapshot.closingAmount`/`cycle.currentAmount` lúc build response (analysis §3.6)".
- `Mega645TopPotential { entryId; accountId; username; amount; fixedPotential }` — JSDoc `fixedPotential`: `= betUnitCount × tier1 snapshot lúc accumulate; KHÔNG cộng jackpot share (không bất biến per-entry)`.
- `Mega645DrawBettingStatsDoc extends Omit<DrawBettingStatsBase, "lastEntryId">, DeltaAccumulatedDoc` + `byPlayType: Record<PlayType, Mega645PlayTypeStat>` (12 key: standard, bao5, bao7–bao15, bao18) + `exposure` + `topPotential`.
- `Mega645DrawBettingStatsEntity extends Omit<Mega645DrawBettingStatsDoc, "_id">` (pattern `_id: unknown` + Entity — theo `mongodb.mdc`).

JSDoc class-level của Doc ghi: "1 doc/draw · watermark `lastEntryId` idempotent · `final` đóng dấu ở TERMINAL (Settled/Void), KHÔNG ở SalesClosed". KHÔNG có `numberFreq`/`topAccounts`/`topCombos` trong doc (analysis §3.4, §3.1-3).

### 3. TẠO `packages/game-mega645/src/entities/number-stats.ts`

`Mega645DrawNumberStatsDoc` nguyên văn analysis §3.3: `{drawId, number ("01".."45" zero-padded), sets, amount, boards, createdAt, updatedAt}` extends `DeltaAccumulatedDoc`. JSDoc header file ghi rõ: "Tách collection riêng — chuẩn nhóm jackpot chốt tại Power 6/55 §3.3/§6.1-D1". JSDoc `amount`: "Σ board amount các board CHỨA số — không chia (kết luận toán học Keno §3.7)". JSDoc `boards`: "phân biệt 'nhiều người chọn' vs 'ít người cược đậm'". KHÔNG có chiều `numberKind` (Mega 6/45 chỉ 1 loại số).

### 4. TẠO `packages/game-mega645/src/entities/account-stats.ts` + `combo-stats.ts`

Copy shape Power 6/55, đổi tên field số:

- `Mega645DrawAccountStatsDoc`: `{drawId, accountId, username, amount, entries, sets}` + watermark.
- `Mega645DrawComboStatsDoc`: `{drawId, comboKey, playType, numbers: string[], sets, amount, accountCount}` + watermark. **Field số đặt tên `numbers`** khớp `EntryBoardSnapshot.numbers` (Power 6/55 dùng `mainNumbers` vì entity nó tên vậy — adapt tên, KHÔNG đổi thiết kế; analysis §3.5). JSDoc `comboKey` BẮT BUỘC ghi format: `` `${playType}:${sortedNumbers.join(",")}` `` theo BOARD — vé Bao 18 = 1 doc (18 số đã chọn), KHÔNG expand C(18,6). JSDoc `accountCount`: "counter vô hướng sync bằng `syncAccountCounts` ($set tuyệt đối) — KHÔNG $size mảng (mongodb.mdc §8)".
- `Mega645DrawComboAccountDoc`: `{drawId, comboKey, accountId, username, sets, amount}` + watermark.

### 5. TẠO `packages/game-mega645/src/rules/combo-key.ts`

Copy `packages/game-power655/src/rules/combo-key.ts`: `buildComboKey(playType, numbers)` — sort trên BẢN COPY (`[...numbers].sort()`, KHÔNG mutate input), join `","`, prefix playType. Đây là single source of truth cho p0-02 (accumulator) + p1-01 (ownership-gate) — KHÔNG viết lại 2 nơi. Export barrel `rules/index.ts`.

### 6. TẠO `packages/game-mega645/src/entities/ops-alert.ts`

- `Mega645OpsAlertType` — const object `as const` + type dẫn xuất (§5.3 code-quality), **nguyên văn analysis §3.7** gồm 6 member: `LargeBet`, `ExposureThreshold`, `ComboConcentration`, `BaoHighStake`, `RevenueAnomaly`, `SettleStuck` (2 member cuối JSDoc `Để dành — KHÔNG bắn P0`).
- **JSDoc TỪNG member là yêu cầu cứng** (chuẩn Power 6/55): ghi công thức BẬT (kèm tên field config: `ops.alerts.largeBetAmount`, `fixedExposureWarnAmount`, `comboAccountsWarn`, `baoHighStakeAmount`) + điều kiện Critical + dedupeKey — copy nguyên khối JSDoc trong analysis §3.7. Reviewer từ chối nếu JSDoc chỉ 1 dòng mô tả.
- `Mega645OpsAlertDoc extends OpsAlertBase { type: Mega645OpsAlertType }` — import `OpsAlertBase`, `OpsAlertStatus`, `OpsAlertSeverity` từ `@megawin/game-core/types`.

### 7. SỬA `packages/game-mega645/src/entities/global-config.ts`

- Thêm `Mega645OpsAlertsConfig` + `Mega645OpsConfig` nguyên văn analysis §3.8 (`stats: OpsStatsConfig` import từ game-core). JSDoc từng field ngưỡng ghi default + đơn vị VND + lý do (`largeBetAmount` 30tr đồng bộ Power 6/55 vì bảng giá Bao y hệt; `fixedExposureWarnAmount` 500tr scale ¼ theo tier1 10tr; `baoHighStakeAmount` 30tr — bao14 = 30,03tr chạm, bao13 = 17,16tr chưa).
- `GlobalConfigDoc` thêm field `ops: Mega645OpsConfig`.
- `DEFAULT_MEGA645_CONFIG` (`rules/jackpot.ts`) thêm block `ops` defaults ĐÃ CHỐT Q1: `largeBetAmount: 30_000_000`, `fixedExposureWarnAmount: 500_000_000`, `comboAccountsWarn: 5`, `baoHighStakeAmount: 30_000_000`, `enabled` bật 4 alert P0 / tắt 2 alert để-dành, `stats` copy đúng giá trị Power 6/55 đã dùng (`tickSeconds`, `topPotentialK`, `topAccountsK`, `topCombosK` — đối chiếu `DEFAULT_POWER655_CONFIG.ops.stats` lúc implement, dùng đúng số đó).

### 8. SỬA `packages/game-mega645/src/entities/enums.ts`

`Mega645Collections` thêm 6 key theo pattern const-as-const sẵn có: `DrawBettingStats: "mega645_draw_betting_stats"`, `DrawNumberStats: "mega645_draw_number_stats"`, `DrawAccountStats: "mega645_draw_account_stats"`, `DrawComboStats: "mega645_draw_combo_stats"`, `DrawComboAccounts: "mega645_draw_combo_accounts"`, `OpsAlerts: "mega645_ops_alerts"`.

### 9. SỬA `packages/game-mega645/src/indexes/index.ts`

- **XOÁ 2 index chết** trên `TicketEntries`: `idx_tenant_account_drawDate`, `idx_tenant_drawDate_status` (dòng 71–82 — field `drawDate` không tồn tại trên `TicketEntryDoc`, analysis §2.2-1). Ghi chú migration cho DBA trong PR description: drop 2 index này trên Atlas.
- **THÊM** đúng bảng analysis §3.9 (mỗi index có `purpose` tiếng Việt như tiền lệ):
  - `draw_betting_stats`: `{drawId:1}` unique · `{final:1}` · `{updatedAt:1}`.
  - `draw_number_stats`: `{drawId:1, number:1}` unique · TTL `{createdAt:1}` 90 ngày.
  - `draw_account_stats`: `{drawId:1, accountId:1}` unique · `{drawId:1, amount:-1}` · TTL 90d.
  - `draw_combo_stats`: `{drawId:1, comboKey:1}` unique · `{drawId:1, sets:-1}` · `{drawId:1, accountCount:1}` · **`{drawId:1, playType:1, numbers:1}` multikey** (nhánh `$all` bao7–18 tính `jackpotUnits` — analysis §3.10-3; prefix `playType` để index bound KHÔNG quét biển combo standard, phục vụ p1-01) · TTL 90d.
  - `draw_combo_accounts`: `{drawId:1, comboKey:1, accountId:1}` unique · TTL 90d.
  - `ops_alerts`: `{drawId:1, dedupeKey:1}` unique · `{status:1, severity:1, createdAt:-1}` · TTL 180d.
  - `ticket_entries`: **THÊM `{drawId:1, accountId:1}`** — ownership-gate combo popularity p1-01 (hiện CHỈ có trên `ticket_lines`, chưa có trên entries — analysis §3.9). Về index cho `getEntriesForStatsAfter`: copy ĐÚNG quyết định Power 6/55 p0-01 đã chốt lúc implement (thêm hay không thêm index `{drawId, _id}`-tương-đương) — ghi kết luận lại vào plan này.
- Đối chiếu TTL: copy đúng cú pháp `expireAfterSeconds` từ khối Power 6/55/Keno.

### 10. SỬA `packages/game-mega645/src/entities/index.ts` (barrel)

Export 4 file entity mới + types ops config. Import/export block đầu file (§7 code-quality).

## Nguyên tắc MongoDB áp trong plan này

- Unique index là tuyến phòng thủ idempotency (duplicate 11000 = no-op ở p0-02) — PHẢI có trước khi worker chạy.
- TTL index thay batch-cleanup job — không viết cron xoá tay.
- Counter vô hướng (`accountCount`, `largeBetCount`) khai sẵn trong entity để query sargable `{drawId, accountCount: {$gte}}` — không dựa `$size`/`$expr`.
- Index prefix trùng nhau không khai lặp (vd `{drawId:1, comboKey:1}` unique đã cover query `{drawId}` prefix).

## Cách review (sau khi implement)

1. Diff từng file đối chiếu mục "File & thay đổi" — đúng shape analysis §3.3–§3.9, không thêm field ngoài thiết kế.
2. So khớp side-by-side với file Power 6/55 tương ứng: khác biệt CHỈ được nằm trong {số 45, field `numbers` thay `mainNumbers`, single jackpot trong JSDoc exposure, defaults ngưỡng 500tr, xoá split}.
3. Kiểm JSDoc: mở từng entity — mọi interface/field có JSDoc đơn vị/công thức; 4 alert type P0 có đủ công thức bật + Critical + dedupeKey.
4. Grep kiểm: `rg 'Doc\["' packages/game-mega645/src` = 0 match mới (§5.4); `rg '"drawDate"' packages/game-mega645/src/indexes` = 0 match; `rg "splitEligible|SPLIT_ELIGIBLE" --type ts` toàn repo = 0 match.
5. Xác nhận KHÔNG định nghĩa lại type game-core: `rg "interface (DeltaAccumulatedDoc|OpsAlertBase|DrawBettingTotals|OpsStatsConfig)" packages/game-mega645/src` = 0 match.
6. Kiểm `buildComboKey` không mutate input (đọc code: sort trên `[...numbers]`).

## Cách test

```bash
pnpm --filter @megawin/game-mega645 check-types
pnpm --filter @megawin/game-mega645-application check-types   # downstream không gãy (đặc biệt sau khi xoá splitEligible)
pnpm --filter @megawin/backoffice check-types                  # GlobalConfigDoc đổi shape — BO compile được
pnpm --filter @megawin/game-mega645-application test           # test suite hiện hữu (global-config, settle...) vẫn pass
```

Domain package `game-mega645` KHÔNG có vitest (đã kiểm 06/08) — KHÔNG setup mới cho plan này (types thuần, không hành vi runtime). Test pure-rule `buildComboKey` viết ở p0-02 trong `game-mega645-application/test/` (vitest ĐÃ có sẵn), cùng file với accumulator test. Test hành vi defaults `ops` nằm ở p0-03 (get-config merge default).

**Logic ngược cần thử (negative):** cố tình gán `enabled` thiếu 1 key alert type trong defaults → `Record<Mega645OpsAlertType, boolean>` phải báo lỗi compile (bằng chứng type dẫn xuất hoạt động — thử tay rồi revert, không commit).

## Rủi ro & cách test rủi ro

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | Xoá 2 index `drawDate` làm gãy query đang sống | `rg "drawDate" packages/game-mega645-application apps/backoffice/src/app/api/mega645 apps/worker-mega645` — mọi match còn lại phải trên `mega645_draws`/`draw_counters` (Doc có field thật). Match nào trỏ `ticket_entries` → dừng, điều tra trước khi xoá. |
| R2 | Xoá `splitEligible` gãy compile chỗ khác (caller ẩn qua type inference) | Grep mục 1 + `check-types` cả 3 filter ở Cách test. `DEFAULT_PRIZE_TIER_RULES` là object literal — TS báo excess property nếu sót chỗ gán. |
| R3 | Thêm `ops` required vào `GlobalConfigDoc` làm gãy code đọc config hiện hữu (doc DB cũ KHÔNG có `ops`) | Lý do §3.8 bắt merge-default ở tầng đọc (p0-03). Trong p0-01: kiểm mọi nơi construct/validate `GlobalConfigDoc` (`rg "GlobalConfigDoc" packages/game-mega645-application` → mapper/use-case) compile được; KHÔNG để runtime đọc `config.ops.x` trước khi p0-03 merge default. Mọi consumer mới của `ops` chỉ xuất hiện từ p0-02+ và đều đi qua đường get-config có default. |
| R4 | Defaults `ops` lệch với Zod range của p0-03 (default nằm ngoài range → form lưu lỗi) | Ghi bảng defaults vào plan p0-03 mục Zod; verify theo cơ chế p0-03 đã chốt (test `global-config.test.ts` ép defaults qua mapper + test tay form BO — xem ghi chú R3 trong plan Power 6/55 p0-03). |
| R5 | Tên collection gõ nhầm (string trần) | Chỉ khai 1 lần trong `Mega645Collections`; grep `mega645_draw_` toàn repo — mọi match phải ở `enums.ts` hoặc test. |
| R6 | Unique index tạo trên collection ĐÃ có data trùng | Không xảy ra P0 — 6 collection đều mới. Ghi chú vào PR: nếu môi trường dev từng chạy nhánh thử nghiệm, DBA drop collection trước khi ensureIndexes (KHÔNG dùng code xoá trong test/app). |
| R7 | TTL xoá data draw chưa settle (kỳ kéo dài bất thường) | TTL 90d trên `createdAt` — kỳ dài nhất ~3 ngày + maxDrawCount 6 kỳ mua trước ≪ 90d. Khẳng định bằng chú thích cạnh index; không cần test runtime. |
| R8 | comboKey không ổn định (thứ tự numbers khác nhau → 2 doc cho cùng bộ) | `buildComboKey` sort nội bộ — test unit ở p0-02: 2 input hoán vị → cùng key; input KHÔNG bị mutate. |
