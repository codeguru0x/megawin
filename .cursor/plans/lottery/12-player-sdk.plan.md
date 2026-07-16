---
name: "Lottery 12 — Player SDK"
overview: "Phase 3: module lottery trong @megawin/player-sdk — enums, types, LotteryApi, endpoints, client, build config, TypeDoc, CHANGELOG, README. Realtime Lô Live events cho client."
todos: []
isProject: false
---

# Plan 12 — Player SDK (`@megawin/player-sdk` module `lottery`)

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 05 (handlers + player DTOs là source of truth), Plan 07 (Lô Live endpoints).

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Rules

1. `.cursor/rules/player-sdk-jsdoc.mdc` — ĐỌC TOÀN BỘ, đặc biệt **Release Checklist — Thêm Game Mới** (11 bước) — LÀM THEO TỪNG BƯỚC
2. `.cursor/rules/code-quality-standards.mdc`

### Source of truth

- Handlers: `apps/api-player/src/handlers/lottery/*` (Zod schemas — SDK Input phải mirror)
- DTOs: `packages/game-lottery-application/src/use-cases/player/dto/player.dto.ts`
- Template: `packages/player-sdk/src/bingo18/` + `src/apis/bingo18.ts`

---

## Tổng quan

Ticket prefix `LOT` (`LOT-YYYYMMDD-NNNNN`). gameKey `lottery`. drawId `YYYY-MM-DD.NNN`.
Đặc thù so game khác: board 4 trục (region/playType/position/betMode) + `picks: string[]`,
multi-term trộn đài, market status trong current draw, Lô Live payload payout động.

---

## Phase 1: Domain types (`src/lottery/`)

- `enums.ts` — re-declare public enums: `LotteryRegion`, `LotteryPlayType`, `LotteryBetMode`, `LotteryNumberPosition`, `LotteryPrizeTier`, `LotteryMarketStatus` (const object + type, JSDoc bảng value/meaning).
- `types.ts` — TẤT CẢ types: `LotteryBoardInput` (JSDoc grammar picks per betMode với ví dụ `["05","27"]`, `["even"]`), `LotteryTicketPurchaseInput` (`drawIds: string[]` theo drawIds rule), `LotteryGameConfigResponse`, `LotteryCurrentDrawResponse` (kèm `markets` + payout), `LotteryTicketSummary`, `LotteryEntryResult`, `LotteryDrawResultSummary/Info` (union MB/MN), `LotteryPlaceBetResponse`, params/response list + cursor pagination, `LotteryLiveStateResponse`.
- `index.ts` — `export * from "./enums"; export * from "./types"`.
- JSDoc: mọi property có format/unit; ticketNo example `"LOT-20260711-00001"`; drawId format `YYYY-MM-DD.NNN` (dấu chấm).

## Phase 2: API module + wiring (theo Release Checklist §2–8)

- `src/apis/lottery.ts` — `LotteryApi` interface + `createLotteryApi` (`@internal`): `getGameConfig`, `getCurrentDraw` (per region param), `placeBet`, `listPendingTickets`, `listTickets`, `getTicketEntries`, `listDrawResults`, `getDrawResult`, `getLiveState`. Mỗi method JSDoc đầy đủ: summary, `**Endpoint:**`, `@param`, `@returns`, `@throws {@link ApiClientError}`, `@example` copy-paste được.
- `src/endpoints.ts` — key `lottery` đầy đủ paths.
- `src/client.ts` — `readonly lottery: LotteryApi`.
- `src/index.ts` — export types + enum values.
- `tsup.config.ts` entry `lottery`; `package.json` subpath `./lottery`; `typedoc.json` entryPoints.

## Phase 3: Realtime Lô Live (nếu Phase 3 roadmap được duyệt)

- Docs section hướng dẫn subscribe events `LOTTERY_LO_LIVE_*` (WebSocket/SSE endpoint từ infra realtime — xác nhận infra trước khi làm; nếu chưa có, chỉ polling `getLiveState`).

## Phase 4: Docs & Release (Checklist §9–11)

- `CHANGELOG.md` — `### Added` toàn bộ API/types mới; KHÔNG tự bump version.
- `README.md` — row bảng imports `@megawin/player-sdk/lottery`; section `### client.lottery — Xổ số truyền thống` (placeBet ví dụ đủ 4 trục + multi-draw, listDrawResults, listPendingTickets); prefix `LOT` vào bảng TicketNo.
- Cập nhật `.cursor/rules/player-sdk-jsdoc.mdc`: bảng TicketNo + Per-game API sections + Game Registry (row `lottery`).

## Phase 5: Verify

- [ ] `pnpm --filter @megawin/player-sdk check-types` + build + `docs:build` pass.
- [ ] SDK Input mirror đúng Zod handler (đối chiếu từng field theo bảng mapping rule).
- [ ] TypeDoc render đủ module lottery, không leak `@internal`.
