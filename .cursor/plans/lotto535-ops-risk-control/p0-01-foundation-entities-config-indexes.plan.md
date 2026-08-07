# p0-01 — Foundation: Entities + OpsConfig + Indexes + combo-key (domain package)

> **Nguồn:** `.cursor/analysis/lotto535-operations-risk-control.analysis.md` §3.3–§3.9 (thiết kế DB), §3.7 (alert types), §3.8 (ops config), §3.9 (indexes)
> **Phase:** P0 · **Thứ tự:** 01 · **Phụ thuộc:** không — merge sớm nhất.
> **Package đích:** `packages/game-lotto535` (domain thuần — KHÔNG I/O).

## Mục tiêu

Khai toàn bộ nền tảng type-safe cho hệ stats/alert: 6 collection mới + `Lotto535StatsPlayKey`/`toStatsPlayKey` + enum alert type (5 P0 + 2 để dành) + `rules/combo-key.ts` + section `ops` trong GlobalConfig + defaults + index (thêm mới, xoá 3 index chết `drawDate`) + **setup vitest cho domain package**. Sau plan này, p0-02 (repos/worker) và p0-03 (API/UI) chỉ import — không định nghĩa thêm type nền.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File Power 6/55 production (p0-01 đã done) |
|---|---|
| Entity betting-stats | `packages/game-power655/src/entities/betting-stats.ts` |
| Entity number-stats (tách collection) | `packages/game-power655/src/entities/number-stats.ts` |
| Entity account/combo-stats | `packages/game-power655/src/entities/account-stats.ts`, `combo-stats.ts` |
| Entity ops-alert | `packages/game-power655/src/entities/ops-alert.ts` |
| `combo-key` rule thuần | `packages/game-power655/src/rules/combo-key.ts` |
| `ops` trong GlobalConfig + defaults | `packages/game-power655/src/entities/global-config.ts` + `rules/jackpot.ts` (`DEFAULT_POWER655_CONFIG.ops`) |
| Khai index (khối stats/alerts + xoá index chết) | `packages/game-power655/src/indexes/index.ts` |
| Base types dùng chung | `packages/game-core/src/types/betting-stats.ts`, `ops-alert.ts` — import, KHÔNG định nghĩa lại (rule §5 code-quality) |
| Vitest config mẫu (package không cần DB) | `packages/game-lotto535-application/vitest.config.ts` (bỏ `globalSetup` + `loadEnv`) |

## File & thay đổi

### 1. TẠO `packages/game-lotto535/src/entities/betting-stats.ts`

Theo analysis §3.4, nguyên văn shape:

- **`Lotto535StatsPlayKey`** — const object `as const`, 13 member, **giá trị BẮT BUỘC dẫn xuất từ `PlayType` member + template literal** (user chốt 06/08 — Q6): `Standard: PlayType.Standard`, `MainCover4: PlayType.MainCover4`, `MainCover6: \`${PlayType.MainCover}6\`` … `MainCover15: \`${PlayType.MainCover}15\``, `SpecialCover: PlayType.SpecialCover`. KHÔNG plain text `"mainCover6"` tự gõ. Type dẫn xuất `(typeof …)[keyof typeof …]`. JSDoc const ghi lý do dẫn xuất (đổi PlayType 1 chỗ → key đổi theo, compiler bắt gõ nhầm).
- **`toStatsPlayKey(board)`** — pure function map 1 board → key: `playType === PlayType.MainCover` → `\`${PlayType.MainCover}${board.mainNumbers.length}\`` (N=6–15 đã được `validateSelection` đảm bảo — JSDoc ghi tiền đề này); 3 playType còn lại giữ nguyên giá trị. Nhận param type có tên (`EntryBoardSnapshot` hoặc type con có tên — KHÔNG `Pick` inline nếu đã có type phù hợp, tuân §5.2/§5.4 code-quality).
- `Lotto535PlayTypeStat { amount; sets; boards }` — JSDoc từng field ghi đơn vị `(VND)` và công thức (`sets = Σ(expandedLines × betCount)`, `boards` không nhân betCount — "mainCover15 amount lớn nhưng boards nhỏ").
- `Lotto535Exposure { fixedWorstCase }` — JSDoc BẮT BUỘC: công thức `= totals.sets × tier1 (RAW, không cap)` + "jackpot exposure KHÔNG lưu ở đây — đọc pool lúc build response (analysis §3.6); Split Cycle KHÔNG vào exposure (chia pool đã tích luỹ, không tạo liability mới)".
- `Lotto535TopPotential { entryId; accountId; username; amount; fixedPotential }` — JSDoc `fixedPotential`: `= betUnitCount × tier1 snapshot lúc accumulate; KHÔNG cộng JP share lẫn split share (không bất biến per-entry)`. JSDoc interface ghi 2 caveat §3.4: đổi tier1 giữa kỳ → baseline khác nhau trong cùng danh sách; entry void KHÔNG bị gỡ khỏi mảng — drill-down phải đọc entry thật.
- `Lotto535DrawBettingStatsDoc extends Omit<DrawBettingStatsBase, "lastEntryId">, DeltaAccumulatedDoc` + `byPlayType: Record<Lotto535StatsPlayKey, Lotto535PlayTypeStat>` + `exposure` + `topPotential`.
- `Lotto535DrawBettingStatsEntity extends Omit<Lotto535DrawBettingStatsDoc, "_id">` (pattern `_id: unknown` + Entity — `mongodb.mdc`).

JSDoc class-level của Doc: "1 doc/draw · watermark `lastEntryId` idempotent · `final` đóng dấu ở TERMINAL (Settled/Void), KHÔNG ở SalesClosed". KHÔNG có `numberFreq`/`topAccounts`/`topCombos` trong doc.

### 2. TẠO `packages/game-lotto535/src/entities/number-stats.ts` — KHÁC Power 6/55: thêm chiều `kind`

- `Lotto535NumberKind` const-as-const: `Main: "main"` (JSDoc `"01".."35"`), `Special: "special"` (JSDoc `"01".."12"`).
- `Lotto535DrawNumberStatsDoc extends DeltaAccumulatedDoc`: `{drawId, kind, number, sets, amount, boards, createdAt, updatedAt}` — nguyên văn analysis §3.3. JSDoc header file: "1 doc/(draw × kind × số), ≤47 doc/kỳ (35 main + 12 special); đếm theo `board.mainNumbers`/`board.specialNumbers` — KHÔNG expand lines; doc `kind=special` là đầu vào rule `special_skew`". JSDoc `amount`: "Σ board amount các board CHỨA số — không chia (kết luận toán học Keno §3.7)". JSDoc `boards`: "phân biệt 'nhiều người chọn' vs 'ít người cược đậm'".

### 3. TẠO `packages/game-lotto535/src/entities/account-stats.ts` + `combo-stats.ts`

Copy shape Power 6/55, comboKey thêm chiều số ĐB:

- `Lotto535DrawAccountStatsDoc`: `{drawId, accountId, username, amount, entries, sets}` + watermark.
- `Lotto535DrawComboStatsDoc`: `{drawId, comboKey, playType, mainNumbers: string[], specialNumbers: string[], sets, amount, accountCount}` + watermark. JSDoc `comboKey` BẮT BUỘC ghi format: `` `${playType}:${sortedMain.join(",")}|${sortedSpecial.join(",")}` `` theo BOARD — 1 board mainCover15 = 1 doc (15 số đã chọn), KHÔNG expand C(15,5) (analysis §3.5). JSDoc `accountCount`: "counter vô hướng sync bằng `syncAccountCounts` ($set tuyệt đối) — KHÔNG $size mảng".
- `Lotto535DrawComboAccountDoc`: `{drawId, comboKey, accountId, username, sets, amount}` + watermark.

### 4. TẠO `packages/game-lotto535/src/rules/combo-key.ts`

Copy `packages/game-power655/src/rules/combo-key.ts`, thêm chiều special:

- `buildComboKey(playType, mainNumbers, specialNumbers)` — sort trên **bản copy** (`[...arr].sort()` hoặc `toSorted()` — KHÔNG mutate input), format như JSDoc mục 3. Pure, unit-test được.
- Đăng ký barrel `rules/index.ts`. JSDoc ghi: "Thay thế comboKey inline trong `aggregateTopCombos` (format cũ `playType|main|special`) — data on-read cũ không migrate vì use-case bị xoá ở p0-03 (§5.3)".

### 5. TẠO `packages/game-lotto535/src/entities/ops-alert.ts`

- `Lotto535OpsAlertType` — const-as-const, **nguyên văn analysis §3.7** gồm 7 member: `LargeBet`, `ExposureThreshold`, `ComboConcentration`, `CoverHighStake` (analog `bao_high_stake`), `SpecialSkew` (MỚI — đặc thù game), `RevenueAnomaly` + `SettleStuck` (JSDoc `Để dành — KHÔNG bắn P0`). **BỎ** `SidebetSkew`/`CapSetsNear` (không có side bet/payout cap). KHÔNG alert jackpot/split (user chốt 05/08 — Q3).
- **JSDoc TỪNG member là yêu cầu cứng**: công thức BẬT (kèm tên field config: `ops.alerts.largeBetAmount`, `fixedExposureWarnAmount`, `comboAccountsWarn`, `coverHighStakeAmount`, `specialSkewRatio` + `specialSkewMinAmount`) + điều kiện Critical + dedupeKey — copy nguyên khối JSDoc analysis §3.7. Riêng `SpecialSkew` phải ghi cả lý do nghiệp vụ (12 số ĐB là không gian hẹp; số quay ra kéo consolation/tier2/tier4). Reviewer từ chối nếu JSDoc chỉ 1 dòng.
- `Lotto535OpsAlertDoc extends OpsAlertBase { type: Lotto535OpsAlertType }` — import `OpsAlertBase`, `OpsAlertStatus`, `OpsAlertSeverity` từ `@megawin/game-core/types`.

### 6. SỬA `packages/game-lotto535/src/entities/global-config.ts`

- Thêm `Lotto535OpsAlertsConfig` + `Lotto535OpsConfig` nguyên văn analysis §3.8 (`stats: OpsStatsConfig` import từ game-core). JSDoc từng field ngưỡng ghi default + đơn vị + lý do: `largeBetAmount` 30tr (đồng nhất Power 6/55 — Q4); `fixedExposureWarnAmount` 500tr (tier1 10tr < Power 6/55 40tr → ngưỡng thấp tương ứng); `coverHighStakeAmount` 10tr (mainCover13 = 12,87tr chạm, mainCover12 = 7,92tr chưa); `specialSkewRatio` 0.35 (baseline đều = 1/12 ≈ 8,3%); `specialSkewMinAmount` 50tr (chống nhiễu kỳ vắng); `comboAccountsWarn` 5.
- `GlobalConfigDoc` thêm field `ops: Lotto535OpsConfig`.
- `DEFAULT_LOTTO535_CONFIG` (`rules/jackpot.ts`) thêm block `ops` defaults khớp bảng trên + `enabled` bật 5 alert P0 / tắt 2 để-dành + `stats: { tickSeconds, topPotentialK, topAccountsK, topCombosK }` — **copy đúng giá trị số từ `DEFAULT_POWER655_CONFIG.ops.stats`** (đối chiếu lúc implement, không tự bịa).

### 7. SỬA `packages/game-lotto535/src/entities/enums.ts`

`Lotto535Collections` thêm 6 key theo pattern const-as-const sẵn có: `DrawBettingStats: "lotto535_draw_betting_stats"`, `DrawNumberStats: "lotto535_draw_number_stats"`, `DrawAccountStats: "lotto535_draw_account_stats"`, `DrawComboStats: "lotto535_draw_combo_stats"`, `DrawComboAccounts: "lotto535_draw_combo_accounts"`, `OpsAlerts: "lotto535_ops_alerts"`.

### 8. SỬA `packages/game-lotto535/src/indexes/index.ts`

- **XOÁ 3 index chết** trên `TicketEntries` (dòng ~120–137): `idx_tenant_account_drawDate`, `idx_tenant_drawDate_status`, `idx_drawDate_status` — field `drawDate` KHÔNG tồn tại trên `TicketEntryDoc` (analysis §2.2). Ghi chú migration cho DBA trong PR description: drop 3 index này trên Atlas.
- **THÊM** đúng bảng analysis §3.9 (mỗi index có `purpose` tiếng Việt theo tiền lệ):
  - `draw_betting_stats`: `{drawId:1}` unique · `{final:1}` · `{updatedAt:1}`.
  - `draw_number_stats`: `{drawId:1, kind:1, number:1}` unique · TTL `{createdAt:1}` 90 ngày.
  - `draw_account_stats`: `{drawId:1, accountId:1}` unique · `{drawId:1, amount:-1}` · TTL 90d.
  - `draw_combo_stats`: `{drawId:1, comboKey:1}` unique · `{drawId:1, sets:-1}` · `{drawId:1, accountCount:1}` · **`{drawId:1, playType:1, mainNumbers:1}` multikey** (nhánh coverage mainCover `$all` + specialCover tính `jackpotUnits` — analysis §3.10(2); prefix `playType` để index bound KHÔNG quét biển combo standard, phục vụ p1-01) · TTL 90d.
  - `draw_combo_accounts`: `{drawId:1, comboKey:1, accountId:1}` unique · TTL 90d.
  - `ops_alerts`: `{drawId:1, dedupeKey:1}` unique · `{status:1, severity:1, createdAt:-1}` · TTL 180d.
  - `ticket_entries`: **THÊM `{drawId:1, accountId:1}`** — ownership-gate combo popularity (p1-01). Về insert-stream scan `getEntriesForStatsAfter`: đối chiếu quyết định Power 6/55 p0-01 mục 7 (Keno chạy trên `_id` tự nhiên hay cần index phụ) — **copy đúng kết luận đó**, ghi lại vào plan này khi implement.
- TTL: copy đúng cú pháp `expireAfterSeconds` từ khối Power 6/55/Keno.

### 9. SỬA `packages/game-lotto535/src/entities/index.ts` + `rules/index.ts` (barrel)

Export 4 file entity mới + `combo-key` + types ops config. Import block đầu file (§7 code-quality).

### 10. SETUP VITEST cho `packages/game-lotto535` (domain — CHƯA có test runner)

- TẠO `packages/game-lotto535/vitest.config.ts` — copy từ `game-lotto535-application` nhưng **BỎ `globalSetup` và `loadEnv`** (test pure không DB, không env): `include: ["test/**/*.test.ts"]`, `environment: "node"`, dùng `sharedConfig` từ `@megawin/vitest-config`.
- SỬA `packages/game-lotto535/package.json`: devDeps thêm `@megawin/vitest-config: workspace:*`, `vitest` (cùng version `^4.1.10` với application), `vite`; scripts thêm `"test": "vitest run"`, `"test:watch": "vitest --watch"`. KHÔNG cần `pretest` build deps (import từ src qua exports `types/import`).
- TẠO `packages/game-lotto535/test/` với 2 test file (mục Cách test bên dưới).

## Nguyên tắc MongoDB áp trong plan này

- Unique index là tuyến phòng thủ idempotency (duplicate 11000 = no-op ở p0-02) — PHẢI có trước khi worker chạy.
- TTL index thay batch-cleanup job — không viết cron xoá tay. (Đây cũng là cơ chế dọn doc test trên staging DB — 00-overview quy tắc test.)
- Counter vô hướng (`accountCount`, `largeBetCount`) khai sẵn trong entity để query sargable `{drawId, accountCount: {$gte}}`.
- Index prefix trùng nhau không khai lặp.

## Cách review (sau khi implement)

1. Diff từng file đối chiếu mục "File & thay đổi" — đúng shape analysis §3.3–§3.9, không thêm field ngoài thiết kế.
2. So khớp side-by-side với file Power 6/55 tương ứng: khác biệt CHỈ được nằm trong {13 play key dẫn xuất, number-stats có `kind`, comboKey 2 chiều số, alert set (`cover_high_stake` + `special_skew`, bỏ sidebet/cap), defaults, vitest setup}.
3. **Kiểm điểm Q6 (user chốt 06/08)**: mở `betting-stats.ts` — MỌI giá trị trong `Lotto535StatsPlayKey` phải tham chiếu `PlayType.` member (template literal cho MainCover6–15); `rg '"mainCover\d+"' packages/game-lotto535/src` = 0 match (không plain text).
4. Kiểm JSDoc: mọi interface/field có JSDoc đơn vị/công thức; 5 alert type P0 có đủ công thức bật + Critical + dedupeKey; `SpecialSkew` có lý do nghiệp vụ; `Lotto535TopPotential` có 2 caveat.
5. Grep kiểm: `rg 'Doc\["' packages/game-lotto535/src` = 0 match mới (§5.4); `rg '"drawDate"' packages/game-lotto535/src/indexes` = 0 match.
6. Xác nhận KHÔNG định nghĩa lại type game-core: `rg "interface (DeltaAccumulatedDoc|OpsAlertBase|DrawBettingTotals|OpsStatsConfig)" packages/game-lotto535/src` = 0 match.
7. Kiểm vitest config domain: KHÔNG có `globalSetup`/`loadEnv` (test pure — không được vô tình trỏ DB staging).

## Cách test

```bash
pnpm --filter @megawin/game-lotto535 check-types
pnpm --filter @megawin/game-lotto535 test                        # test mới setup
pnpm --filter @megawin/game-lotto535-application check-types     # downstream không gãy
pnpm --filter @megawin/backoffice check-types                    # GlobalConfigDoc đổi shape — BO compile được
```

Unit tests viết mới (PURE — không DB, không cần quy tắc staging):

1. `test/entities/stats-play-key.test.ts`:
   - **Đúng logic**: `toStatsPlayKey` với board standard → `PlayType.Standard`; mainCover4 → `PlayType.MainCover4`; mainCover 6 số → `"mainCover6"`; mainCover 15 số → `"mainCover15"`; specialCover → `PlayType.SpecialCover`. `Object.values(Lotto535StatsPlayKey).length === 13` và không trùng giá trị.
   - **Logic ngược/sai**: board mainCover 5 số hoặc 16 số (không thể xảy ra qua validateSelection nhưng type không chặn) → khẳng định hành vi đã chọn (trả key ngoài union bị compiler chặn ở caller, hoặc throw — copy hành vi Power 6/55, ghi kết luận vào plan). Khẳng định type-level: `Record<Lotto535StatsPlayKey, X>` thiếu 1 key → `check-types` fail (viết bằng `@ts-expect-error` trong test type).
2. `test/rules/combo-key.test.ts`:
   - **Đúng logic**: main + special chưa sort → key ổn định (`buildComboKey(pt, ["05","01","03","02","04"], ["07"])` === key của bản đã sort); 2 board cùng bộ số khác thứ tự → cùng key; specialCover nhiều số ĐB → phần special sort đúng.
   - **Logic ngược/sai**: input KHÔNG bị mutate (assert mảng gốc giữ nguyên thứ tự sau khi gọi); 2 bộ khác nhau 1 số → key khác nhau; main giống nhau nhưng special khác → key khác (chiều special có tham gia — điểm dễ sót khi copy từ Power 6/55 vốn không có special).

Không có integration test cho plan này (types + pure rules). Test hành vi defaults `ops` (merge tại tầng đọc) nằm ở p0-03 `global-config.test.ts`.

## Rủi ro & cách test rủi ro (review đề phòng)

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | Xoá 3 index `drawDate` làm gãy query đang sống | `rg "drawDate" packages/game-lotto535-application apps/backoffice/src/app/api/lotto535 apps/worker-lotto535` — mọi match còn lại phải trên field có thật (`financialDate` là field khác, không nhầm). Match nào trỏ `ticket_entries.drawDate` → dừng, điều tra trước khi xoá. |
| R2 | Thêm `ops` required vào `GlobalConfigDoc` làm gãy code đọc config hiện hữu (doc DB cũ KHÔNG có `ops`) | Merge-default ở tầng đọc là việc của p0-03. Trong p0-01: `rg "GlobalConfigDoc" packages/game-lotto535-application` → mọi nơi construct/validate compile được; KHÔNG để runtime đọc `config.ops.x` trước khi p0-03 merge default (consumer mới của `ops` chỉ xuất hiện từ p0-02+ và đi qua đường get-config có default). |
| R3 | Defaults `ops` lệch Zod range p0-03 (default ngoài range → form lưu lỗi) | Ghi bảng defaults vào plan p0-03 mục Zod; verify qua `global-config.test.ts` p0-03 (defaults chạy qua mapper + persist). Chú ý riêng `specialSkewRatio` là SỐ THẬP PHÂN 0–1 (khác các ngưỡng VND int) — Zod phải là `z.number().min(0).max(1)`, không `positive().int()`. |
| R4 | Tên collection gõ nhầm (string trần) | Chỉ khai 1 lần trong `Lotto535Collections`; `rg "lotto535_draw_" --type ts` toàn repo — mọi match phải ở `enums.ts` hoặc test. |
| R5 | `Lotto535StatsPlayKey` template literal cho ra type `string` thay vì literal union (mất type-safety mà không ai nhận ra) | Test type: gán `const k: Lotto535StatsPlayKey = "mainCover99"` với `@ts-expect-error` — nếu không báo lỗi tức union đã suy thành `string`, phải sửa (đảm bảo `PlayType.MainCover` là literal type từ `as const`). |
| R6 | comboKey thiếu chiều special (copy nguyên Power 6/55 quên sửa) → 2 bộ khác số ĐB gộp làm 1, rule concentration sai | Test combo-key case "main giống, special khác → key khác" (mục Cách test 2). Review: format string có đủ `|${sortedSpecial}`. |
| R7 | Unique index tạo trên collection ĐÃ có data trùng | Không xảy ra P0 — 6 collection đều mới. Ghi chú PR: nếu staging từng chạy nhánh thử nghiệm, DBA kiểm collection trước khi ensureIndexes (KHÔNG drop tự động — DB chung). |
| R8 | TTL xoá data draw chưa settle | TTL 90d trên `createdAt` — kỳ dài nhất ~16h + maxDrawCount 6 kỳ mua trước ≪ 90d. Chú thích cạnh index; không cần test runtime. |

## Định nghĩa Done

`check-types` 3 package pass, `pnpm --filter @megawin/game-lotto535 test` pass (2 test file pure), review checklist 7 mục có bằng chứng, cập nhật bảng trạng thái `00-overview.md`.
