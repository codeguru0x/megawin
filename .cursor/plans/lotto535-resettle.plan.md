---
name: Lotto 5/35 Resettle Plan (Cycle Ledger + Split)
overview: Mirror resettle Power 6/55 cho Lotto 5/35 — single jackpot, winningSpecial, Split Cycle. Cycle Ledger làm SSOT; scenario A/B1/B2; republish GIỮ settledAt.
---

# Lotto 5/35 — Resettle Implementation Plan (chi tiết)

> Tham chiếu mirror: `.cursor/plans/power655-resettle.plan.md` và code `packages/game-power655-application/src/use-cases/resettle/`.

## Khác biệt cốt lõi vs Power 6/55

| | Power 6/55 | Lotto 5/35 |
|---|---|---|
| Jackpot | Dual JP1/JP2 + overflow | Single jackpot |
| Kết quả | `winningMain[]` + `bonusNumber` | `winningMain[]` + `winningSpecial` |
| Cycle đặc thù | JP2 reset | **Split Cycle** (Evening, >= splitThreshold) |
| Ledger flags | `hasJp1Winner`, `hasJp2Winner`, `jp2DidReset` | `hasJpWinner`, `didSplit`, `isSplitCycleAtSettle` |

## Quyết định thiết kế

- **Split-affected = jp-winner-affected** → Type B1/B2, DBA chốt cycle.
- **`republishResultAfterSettled`**: GIỮ `settledAt`, chỉ `$unset financial, stats, settleSummary` (KHÔNG unset jackpot).
- **Wipe lines** (`deleteByDrawId`) trong `PrepareResettle` trước re-settle (`$setOnInsert` không ghi đè matchResult).

## Scenario detection

```
jpOrSplitAffected = hasNewJpWinner || hadOldJpWinner || newWouldSplit || hadOldSplit
newWouldSplit = drawNo===Evening && ledger(T).opening >= splitThreshold && !hasNewJpWinner
hadOldSplit = ledger(T).didSplit
chainHasWinnerOrSplit = chain có entry hasJpWinner || didSplit

TYPE_B2: (jpOrSplitAffected && chainLength>0) || chainHasWinnerOrSplit
TYPE_B1: jpOrSplitAffected && chainLength===0
TYPE_A: ngược lại
LEDGER_MISSING: findByDraw(T)==null
```

## File checklist

### Domain — `packages/game-lotto535`
- `src/entities/jackpot-cycle-entry.ts`
- `src/entities/enums.ts` — `JackpotCycleEntries`
- `src/entities/entry.ts` — `EntryReversal`
- `src/rules/resettle.ts`, `src/rules/draw-result.ts`
- `src/indexes/index.ts` — ledger + reversal sparse index

### Application — `packages/game-lotto535-application`
- `infras/mappers/jackpot-cycle-entry-mapper.ts`
- `infras/repos/jackpot-cycle-entry-repo.ts`, `entry-resettle-repo.ts`
- Sửa `draw-repo`, `entry-repo`, `line-repo`
- `use-cases/resettle/*`, `draws/trigger-resettle.ts`, sửa `publish-result.ts`
- Sửa `settle/types.ts`, `prepare-settle.ts`, `finalize-settle.ts`

### Worker — `apps/worker-lotto535`
- `handlers/resettle/*`, `step-functions/resettle.*`, `functions/resettle.yml`, `serverless.yml`

### Backoffice
- API `resettle` + `resettle-preflight`, schema, env, UI `resettle-action`

### Docs — `apps/worker-lotto535/docs/resettle/`
