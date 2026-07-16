---
name: "Lottery 05 — Place Bet"
overview: "State machine place-bet pre-paid multi-term: validate 2 lớp market + grammar picks, pricing snapshot, WAL crash-safe, sinh entries, api-player handlers."
todos: []
isProject: false
---

# Plan 05 — Place Bet & Player Handlers

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 02, 03, 04. **Chặn bởi câu hỏi mở** #3 (point per-số hay per-board trên multi-number), #4 (maxDrawCount).

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs & Rules

1. `docs/game/lottery/new/03-placebet.md` — TOÀN BỘ — ĐỌC ĐẦU TIÊN
2. `docs/game/lottery/new/01-domain-model.md` §3, §7 — board schema + bảng grammar
3. `docs/game/lottery/new/02-config-pricing.md` §5–6 — resolve + snapshot
4. `.cursor/rules/tenant-gateway.mdc` — reserve/withdraw ví tenant
5. `.cursor/rules/tenant-feed-processing.mdc` — snapshot commissionRate
6. `.cursor/rules/mongodb.mdc`, `.cursor/rules/code-quality-standards.mdc`

### Template

- `packages/game-bingo18-application/src/use-cases/place-bet/` — state machine + dto — COPY PATTERN
- `packages/game-bingo18-application/src/infras/repos/place-bet-store.ts` — WAL
- `packages/game-core/src/entities/tx-intent.ts` — TxIntent WAL
- `apps/api-player/src/handlers/bingo18/place-bet.ts` — handler + Zod schema
- Multi-draw pattern: `apps/api-player/src/handlers/power655/place-bet.ts` (drawIds nhiều kỳ)

---

## Tổng quan

Pre-paid: thu `payAmount` trước qua tenant-gateway (reserve → withdraw), WAL crash-safe.
Multi-term: `drawIds` trộn nhiều ngày + nhiều đài; mỗi (board × draw cùng region) → 1 entry.
Pricing/commission snapshot bất biến vào board/entry.

---

## Phase 1: DTO & Validation

`use-cases/place-bet/dto/`:
- `PlaceBetInput`: `{ tenantId, accountId, drawIds: string[], boards: LotteryBoardInput[], channel, ipAddress?, requestId }`.
- `LotteryBoardInput`: `{ boardNo, region, playType, position?, betMode?, picks, prizeSelector?, point }` — position default `last`, betMode default `exact`.

Validation pipeline (03 §3), thứ tự fail-fast:
1. Tenant enabled + account hợp lệ.
2. `drawIds` tồn tại, chưa settle, số kỳ ≤ `maxDrawCount`; check pending entries limit (mirror game hiện có).
3. Per board: `validateBoard` + `validatePicksGrammar` (rules plan 01).
4. Per (board × draw): `acceptBet` 2 lớp (draw.status + markets[marketKey]) — board region A chỉ ghép draw region A.
5. Point: min/maxPointPerBoard theo marketRules resolved; **maxPointPerNumber** — check tổng point hiện có trên số đó từ risk data (07 §4.1) + point mới ≤ trần.

## Phase 2: Pricing snapshot

- Gọi `pricing-resolver` (plan 02): per board resolve `pricePerPoint` (3-tier + numberSurcharge cho exact) + `payout`.
- Công thức tiền (03 §1): board `amount = pricePerPoint × point` (× số token nếu chốt per-số — câu hỏi #3); per-draw subtotal; ticket total = Σ draws.
- Lô Live: payout snapshot theo `remainPrizeCount` tại thời điểm cược (đọc LivePrice — plan 07; ở plan này chặn `loLive` nếu LiveState chưa có, trả error rõ).
- Snapshot `EntryTenantSnapshot` (commissionRate → commissionAmount) theo tenant-feed-processing rule.

## Phase 3: State machine + WAL

Mirror bingo18 place-bet:
1. `prepare` — build ticket + entries in-memory, ticketNo `LOT-YYYYMMDD-NNNNN` từ ticket-counter.
2. `validate` — pipeline Phase 1.
3. `reserve` — tenant-gateway reserve balance.
4. `withdraw` — trừ tiền thật; WAL TxIntent ghi trước mỗi bước side-effect.
5. `persist` — insert ticket + insertMany entries (1 entry / board-group × draw × region), progress `{totalDraws, settledDraws: 0}`.
6. `notify` — publish event + feed.

Crash-safety: recovery job đọc WAL dở dang → rollback/hoàn tất (mirror pattern hiện có). Idempotency theo `requestId`/`tx`.

## Phase 4: api-player handlers (`apps/api-player/src/handlers/lottery/`)

Theo action filenames chuẩn (player-sdk rule):
- `place-bet.ts` — Zod schema mirror DTO (betCount không áp dụng — lottery dùng point; giữ `drawIds: string[]`).
- `get-game-config.ts` — trả config public: playTypes/betModes per region, pricePerPoint, payout, marketRules public fields.
- `get-current-draw.ts` — kỳ đang mở per region **kèm trạng thái markets** + payout để client render menu (01 §2.5).
- `list-pending-tickets.ts`, `list-tickets.ts`, `get-ticket-entries.ts` — cursor pagination.
- `list-draw-results.ts`, `get-draw-result.ts`.
- Tạo `apps/api-player/src/functions/lottery-endpoint.yml` (authorizer `cognitoPlayerAuth`, mirror `bingo18-endpoint.yml`) + include vào `apps/api-player/serverless.yml` (~dòng 118): `- ${file(src/functions/lottery-endpoint.yml)}`.

## Phase 4b: Touchpoints hệ thống cho place-bet (khảo sát bingo18)

- `packages/tenant-gateway/src/transaction/types.ts` (~dòng 174) — thêm `"lottery"` vào union/JSDoc game key.
- Tạo `LotteryTicketLookupService` trong `packages/game-lottery-application/src/services/ticket-lookup-service.ts` (mirror `Bingo18TicketLookupService`) — recovery worker cần `existsByTx(tx)`.
- `apps/worker-game-core/src/handlers/recovery/recover-tx-intents.ts` (~dòng 35–63) — đăng ký `lottery: (tx) => lotteryLookup.existsByTx(tx)` để WAL recovery nhận diện tx của lottery.

## Phase 5: Use-cases player (`use-cases/player/`)

- `list-tickets`, `get-ticket-entries`, `list-draw-results`, `get-game-config` + `dto/player.dto.ts` (source of truth cho SDK plan 12) — mirror bingo18.

## Phase 6: Verify

- [ ] Unit test công thức tiền: đủ case single/multi-number/xiên/parity/sizes/surcharge/multi-draw trộn đài.
- [ ] Test validation matrix: từng lỗi trả đúng error code.
- [ ] Test idempotency: replay requestId không double-charge.
- [ ] Integration: place-bet → entries sinh đúng (board region A không sinh entry draw region B).
