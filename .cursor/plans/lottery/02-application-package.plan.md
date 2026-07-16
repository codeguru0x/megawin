---
name: "Lottery 02 — Application Package"
overview: "Tạo package @megawin/game-lottery-application: repos MongoDB (typed dot-path), mappers Doc↔Entity, services skeleton."
todos: []
isProject: false
---

# Plan 02 — Application Package (`packages/game-lottery-application`)

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 01 (domain package) phải xong.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs & Rules

1. `docs/game/lottery/new/01-domain-model.md` §8 — type-safety embedded docs, `docPath` — ĐỌC ĐẦU TIÊN
2. `.cursor/rules/mongodb.mdc` — repo pattern, Long, transaction
3. `.cursor/rules/entity-typesafe-mongodb.mdc` — named type cho repo param
4. `.cursor/rules/code-quality-standards.mdc`

### Template — Bingo18 application

- `packages/game-bingo18-application/src/infras/repos/*` — COPY PATTERN (base-repo, draw-repo, entry-repo, ticket-repo, game-config-repo, tenant-config-repo, draw-counter-repo, place-bet-store)
- `packages/game-bingo18-application/src/infras/mappers/*` — Doc ↔ Entity
- `packages/game-bingo18-application/src/services/*` — event publish, payout dispatch
- `packages/game-bingo18-application/package.json` — exports layout
- `packages/data/src/mongo/` — client, repository base, `docPath`, cursor-page

---

## Tổng quan

Layer infra + use-case skeleton. Plan này chỉ làm **infras + services + helpers**; use-cases cụ thể nằm ở
plan 03–11 (mỗi plan tự thêm thư mục `use-cases/<group>/` của nó). DB: lottery DB riêng (theo pattern
per-game DB hiện có — xem cách bingo18 khai báo db/collection).

---

## Phase 1: Scaffold

- `packages/game-lottery-application/`: package.json (`@megawin/game-lottery-application`), tsconfig, deps: `@megawin/game-lottery`, `@megawin/game-core`, `@megawin/data`, `@megawin/shared`, `@megawin/cache`, `@megawin/audit`.
- Subpath exports: `./repos`, `./mappers`, `./services`, `./use-cases/<group>` (thêm dần), barrel index.ts từng thư mục.
- KHÔNG import `game-*` internals của game khác; chỉ đi qua `game-core`.

## Phase 2: Repos (`src/infras/repos/`)

Mỗi repo dùng `docPath<TDoc>()` cho MỌI dot-path (filter/$set/$inc/aggregate `$path`):

| Repo | Collection | Methods chính |
|---|---|---|
| `ticket-repo.ts` | `lottery_tickets` | insert, findByTicketNo, findByTx, updateProgress, updateSettlement, listByAccount (cursor-page) |
| `entry-repo.ts` | `lottery_ticket_entries` | insertMany, listByDraw (batch iterator), settleEntry ($set payout/result/outcome — ghi trọn embedded doc), listByPicks (multikey index), countPendingByAccount |
| `draw-repo.ts` | `lottery_draws` | create, findByDrawId, findByRegionDate, updateStatus (state guard), updateMarketStatus (template literal `markets.${marketKey}.status` từ typed marketKey), setResult, updateSettleResult (financial+stats+settleSummary 1 lần $set), listForSelector |
| `draw-counter-repo.ts` | `lottery_draw_counters` | nextDrawNo(region, drawDate) atomic $inc |
| `game-config-repo.ts` | `lottery_game_configs` | getGlobal, getTenant, upsertGlobal, upsertTenant (scope field) |
| `live-state-repo.ts` | `lottery_live_states` | get, transition (status guard), ping, closePrize $push |
| `live-price-repo.ts` | `lottery_live_prices` | upsertTable, getByDraw |
| `risk-repo.ts` | `lottery_risks` | bulkUpsert ($inc theo pick token), listByView (viewKey filter), resetByDraw |
| `risk-table-repo.ts` | `lottery_risk_tables` | upsert totals, getByDrawMarket |
| `place-bet-store.ts` | (WAL) | mirror bingo18 place-bet-store — tx-intent WAL crash-safe |

Ràng buộc:
- Repo method param dùng **named type** từ `@megawin/game-lottery/entities` (KHÔNG indexed-access `Doc["field"]`).
- Embedded doc chỉ ghi-1-lần hoặc ghi trọn (`payout`, `result`, `voidInfo`) — hạn chế partial update lồng cấp.
- Index từ `@megawin/game-lottery/indexes` — thêm script ensure-indexes theo pattern hiện có.

## Phase 3: Mappers (`src/infras/mappers/`)

- Doc → Entity: `_id` → `id: string`, `Long` → `string`, Date → ISO string tuỳ chuẩn bingo18.
- Mapper cho: ticket, entry, draw, game-config, live-state, risk.
- Copy pattern `packages/game-bingo18-application/src/infras/mappers/`.

## Phase 4: Services (`src/services/`)

- `event-publisher.ts` — SNS publish (draw events, live events `LOTTERY_LO_LIVE_*` — 05 §5); mirror bingo18 service + topic naming hiện có.
- `payout-dispatch.ts` — enqueue payout/refund orders sang worker-tenant-dispatch (mirror bingo18; chi tiết dùng ở plan 06/10).

## Phase 5: Shared helpers (`src/helpers/`)

- `pricing-resolver.ts` — resolve 3-tier `pricePerPoint`/`payout`/`numberSurcharge`/`marketRules` (02 §5): tenant board-level → tenant table → global. Trả về snapshot struct để place-bet ghi vào board. Unit tests đủ case override.
- `financial-date.ts` — dùng `@megawin/shared/utils/financial-date`, KHÔNG tự viết.

## Phase 6: Verify

- [ ] check-types + lint + test pass.
- [ ] dependency-cruiser: không import operator-*, không import game khác ngoài game-core.
- [ ] Mọi dot-path lồng cấp qua `docPath` — grep `"\."` trong repos để soát path string trần.
