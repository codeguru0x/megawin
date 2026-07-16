---
name: "Lottery 01 — Domain Package"
overview: "Tạo package domain thuần @megawin/game-lottery: entities, enums, rules, helpers, schemas, labels, indexes. Không I/O."
todos: []
isProject: false
---

# Plan 01 — Domain Package (`packages/game-lottery`)

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.
> **Dependency**: không có — đây là plan đầu tiên.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs thiết kế (source of truth)

1. `docs/game/lottery/new/01-domain-model.md` — TOÀN BỘ entities/enums/picks grammar/marketKey — ĐỌC ĐẦU TIÊN
2. `docs/game/lottery/new/00-tong-quan.md` — region/playType/betMode semantics, cơ cấu giải MB27/MN18
3. `docs/game/lottery/new/02-config-pricing.md` — pricing types (PricePerPointTable, PayoutTable, NumberSurchargeTable, MarketRulesTable)
4. `docs/game/lottery/new/04-result-settle.md` §1–3 — result structure + matcher per betMode
5. `docs/game/lottery/new/05-lolive.md` §2 — LiveStateDoc/LivePriceDoc
6. `docs/game/lottery/new/07-risk-exposure.md` §2, §5.1 — RiskDoc/RiskTableDoc + ReportViewCatalog

### Rules

- `.cursor/rules/entity-typesafe-mongodb.mdc` — named interfaces cho MỌI embedded doc
- `.cursor/rules/mongodb.mdc` — chuẩn Doc/Entity, Long, index
- `.cursor/rules/code-quality-standards.mdc` — JSDoc field có đơn vị (VND) + công thức

### Template — Bingo18 (game gần nhất, boards[] unified)

- `packages/game-bingo18/src/entities/*` — COPY STRUCTURE (enums, types, ticket, entry, draw, game-config, global-config, tenant-config, feed-types, draw-counter, report)
- `packages/game-bingo18/src/rules/`, `helpers/`, `labels/`, `indexes/`, `schemas/` — COPY STRUCTURE
- `packages/game-bingo18/package.json`, `tsconfig.json` — COPY config (subpath exports `./entities`, `./rules`, ...)
- `packages/game-core/src/entities/game-core.enums.ts` — DrawStatus, EntryStatus, EntryOutcome, TicketStatus, TicketChannel (TÁI DÙNG, không tự định nghĩa)
- `packages/game-core/src/types/` — DrawSales, DrawFinancial, DrawStats, EntryTenantSnapshot, EntryVoidInfo, EntryReversal (TÁI DÙNG)
- `packages/data/src/mongo/dot-path.ts` — `docPath<TDoc>()`

---

## Tổng quan

Package domain thuần, KHÔNG I/O. gameKey = `lottery`, ticket prefix `LOT` (`LOT-YYYYMMDD-NNNNN`).
4 đài (`mienBac`, `mienNam18A/B/C`), mỗi đài 1 kỳ/ngày. Board unified `boards[]` với 4 trục:
`playType` × `position` × `betMode` (+ `prizeSelector` cho `de`). Selection canonical `picks: string[]`.

---

## Phase 1: Package scaffold

- Tạo `packages/game-lottery/` mirror `game-bingo18`: `package.json` (name `@megawin/game-lottery`), `tsconfig.json`, `src/index.ts`.
- Subpath exports: `./entities`, `./rules`, `./helpers`, `./schemas`, `./labels`, `./indexes` — mỗi thư mục có barrel `index.ts`. Exports `types`/`import` → `src`, `default` → `dist` (như bingo18).
- Verify: `pnpm install` nhận package; `turbo run check-types --filter=@megawin/game-lottery` chạy được.

## Phase 2: Enums (`src/entities/enums.ts`)

Theo `01-domain-model.md` §2 — copy NGUYÊN VĂN các định nghĩa đã chốt trong doc:

- `LotteryRegion` (4 đài) + `LOTTERY_SOUTHERN_REGIONS`.
- `LotteryPlayType` (de, lo, xien2/3/4, ba3D, bon4D, loLive, lo2D7, ba3D17, ba3D7, bon4D16) + `LOTTERY_PLAY_TYPES_BY_REGION`, `LOTTERY_POSITION_FIRST_PLAY_TYPES`, `LOTTERY_MULTIPAY_PLAY_TYPES`, `LOTTERY_PRIZE_SELECTOR_PLAY_TYPES`.
- `LotteryBetMode` (exact/parity/sizes) + `LotteryParityPick`, `LotterySizePick`, `LOTTERY_BET_MODES_BY_PLAY_TYPE`.
- `LotteryNumberPosition` (first/last), `LotteryPrizeTier` (special→eighth).
- `LotteryMarketStatus` (open/suspended/closed), `LotteryLiveStatus`, `LotteryLiveEvents` (theo 05).
- `LotteryCollections` (9 collections: tickets, ticket_entries, draws, draw_counters, game_configs, live_states, live_prices, risks, risk_tables).
- Mọi enum theo pattern `const object as const` + type alias cùng tên.

## Phase 3: Market key & types (`src/entities/types.ts`)

- `LotteryMarketKey`, `LotteryViewKey` (type string) + JSDoc format.
- Pricing types theo `02-config-pricing.md` §2: `LotteryPricePerPointTable`, `LotteryPayoutTable`, `LotteryNumberSurchargeTable`, `LotteryMarketRules`, `LotteryMarketRulesTable`, `LotteryPricingOverrides`, `LotteryPlayRules`.
- `MarketRules` gồm: `isEnabled`, `minPointPerBoard`, `maxPointPerBoard`, `maxPointPerNumber`, `payout?` override — theo doc 02 §2.4.

## Phase 4: Entities (`src/entities/*.ts`)

Mỗi file 1 chủ đề, theo `01-domain-model.md` §3–5 + `05` §2 + `07` §2:

| File | Nội dung |
|---|---|
| `ticket.ts` | `LotteryBoard` (picks canonical), `LotteryTicketDoc`, `LotteryTicketPricing`, `LotteryTicketVoidSummary` |
| `entry.ts` | `LotteryTicketEntryDoc`, `LotteryEntryBoardSnapshot`, `LotteryEntryBoardPayout`, `LotteryEntryPayout`, `LotteryEntryResult` |
| `draw.ts` | `LotteryDrawDoc`, `LotteryDrawMarket`, `LotteryDrawResult` (union `LotteryNorthernResult` \| `LotterySouthernResult` — 04 §1), `LotteryDrawSettleSummary` |
| `draw-counter.ts` | counter per (region, drawDate) |
| `game-config.ts` / `global-config.ts` / `tenant-config.ts` | GlobalConfigDoc + TenantConfigDoc theo 02 §3–4 |
| `live-state.ts` | `LotteryLiveStateDoc` theo 05 §2.1 |
| `live-price.ts` | `LotteryLivePriceDoc` theo 05 §2.2 |
| `risk.ts` | `LotteryRiskDoc`, `LotteryRiskTableDoc` theo 07 §2 |
| `feed-types.ts` | feed entry shape (mirror bingo18 `feed-types.ts`, snapshot commissionRate/commissionAmount) |
| `report.ts` | copy shape report docs từ bingo18 (outstanding/settle/void) đổi prefix — dùng ở plan 11 |

Ràng buộc:
- Field tiền = integer VND, JSDoc ghi `(VND)` + công thức.
- `version: Long` trên entry/ticket (mirror bingo18).
- Tái dùng `DrawStatus`, `EntryStatus`, `EntryOutcome`, `TicketStatus`, `DrawSales`, `DrawFinancial`, `DrawStats`, `EntryTenantSnapshot`, `EntryVoidInfo`, `EntryReversal` từ `@megawin/game-core` — KHÔNG định nghĩa lại (rule 5.1 code-quality).

## Phase 5: Rules (`src/rules/`)

Pure functions, unit-testable:

- `buildMarketKey(playType, position, betMode)`, `buildViewKey(region, marketKey)`, `parseMarketKey`, `listMarkets(region)` — derive từ `LOTTERY_PLAY_TYPES_BY_REGION` × position × betMode hợp lệ.
- `validateBoard(board)` — kiểm (region, playType) hợp lệ, position first chỉ de/lo (MN lo chỉ last), betMode hợp lệ theo playType, prizeSelector chỉ de + index trong phạm vi số bộ của tier (04 §1).
- `validatePicksGrammar(picks, playType, betMode)` — grammar bảng 01 §7: exact 2D/3D/4D zero-padded, xiên 2/3/4 token distinct, parity/sizes đúng 1 token keyword.
- `acceptBet(board, draw)` — 2 lớp: `status === salesOpen && now < closeAt && markets[key].status === open`; ngoại lệ `loLive.*` được nhận khi `salesClosed` (01 §5.1).
- `resolveMarketRules(viewKey, tenantConfig, globalConfig)` — 3-tier resolve (02 §2.4).

## Phase 6: Helpers (`src/helpers/`)

Theo `04-result-settle.md` §2–3:

- `flattenResult(result, region)` — flatten 27/18 bộ số thành list `{tier, index, number}`.
- `getNumberFrequence(picks, resultNumbers, position, digits)` — đếm nháy (cắt đầu/đuôi theo position + số chữ số).
- `resolvePrizeSet(playType, position, region)` — tập giải để dò theo bảng 04 §2.1.
- Matcher per betMode: `matchExact`, `matchParity`, `matchSizes` (xỉu 00–49, tài 50–99), `matchXien` (tất cả token cùng về).
- `calcBoardPayout(boardSnapshot, result)` → `LotteryEntryBoardPayout` — công thức 04 §3 (multiPay cho playType CÓ nháy).
- `calcLivePayoutTable(...)` — bảng payout theo remainPrizeCount (05 §3) — chỉ khung hàm, số cụ thể đọc config (câu hỏi mở #1).
- Unit tests vitest cho TOÀN BỘ matcher + frequence + payout (case từ doc 04 §3, đủ các betMode × playType).

## Phase 7: Schemas, Labels, Indexes

- `src/schemas/` — Zod schema board input + place-bet input (mirror handler sẽ dùng ở plan 05); zod validate picks grammar gọi lại rules Phase 5.
- `src/labels/` — nhãn tiếng Việt: playType/betMode/position/prizeTier/region + **Report View Catalog** (07 §5.1): map `viewKey → {label, shortLabel, group}`.
- `src/indexes/` — Mongo index definitions (mirror `game-bingo18/src/indexes`):
  - draws: unique `{region, drawDate}`, `{status, drawTime}`, `{financialDate}`
  - entries: `{drawId, status}`, `{tenantId, drawId}`, **multikey** `{tenantId, drawId, "entrySummary.boards.picks": 1}` (01 §4.1), `{ticketId}`, `{financialDate, tenantId}`
  - tickets: `{tenantId, accountId, createdAt}`, `{ticketNo}` unique, `{tx}` unique
  - risks/risk_tables/live_states/live_prices theo doc 05/07

## Phase 8: Đăng ký game vào `game-core` (touchpoints hệ thống)

Sửa 3 file registry cốt lõi (khảo sát bingo18 — bắt buộc để hệ thống nhận game mới):

- `packages/game-core/src/entities/game-core.enums.ts` — thêm `Lottery: "lottery"` vào `GameProduct` (kèm JSDoc mô tả game).
- `packages/game-core/src/entities/ticket-counter.ts` (~dòng 43) — thêm ticket prefix `lottery: "LOT"`.
- `packages/game-core/src/labels/game-labels.ts` (~dòng 27) — thêm `[GameProduct.Lottery]: "Xổ Số"`.

## Phase 9: Verify

- [ ] `pnpm --filter @megawin/game-lottery check-types && pnpm --filter @megawin/game-lottery test`
- [ ] Barrel exports đầy đủ, không export type trùng tên game-core.
- [ ] JSDoc review: mọi Doc/field tiền/công thức có chú thích.
