---
name: "Lottery 06 — Settle Worker & Tenant Feed"
overview: "apps/worker-lottery: SFN settle pipeline (prepare → settle-entries → calculate-financials → dispatch payouts → finalize), tenant feed sync."
todos: []
isProject: false
---

# Plan 06 — Settle Worker (`apps/worker-lottery`) & Tenant Feed

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 04 (publish-result), Plan 05 (entries tồn tại).

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs & Rules

1. `docs/game/lottery/new/04-result-settle.md` §2–6 — dò trúng, công thức payout, SFN pipeline, DrawFinancial — ĐỌC ĐẦU TIÊN
2. `docs/game/lottery/new/05-lolive.md` §6 — Lô Live settle CÙNG draw (sau khi kỳ kết thúc)
3. `.cursor/rules/tenant-feed-processing.mdc` — feed sync, EntryTenantSnapshot
4. `.cursor/rules/mongodb.mdc` (batch, bulkWrite), `.cursor/rules/code-quality-standards.mdc` (JSDoc CRASH-SAFE/IDEMPOTENT)

### Template — worker-bingo18 (COPY TOÀN BỘ CẤU TRÚC)

- `apps/worker-bingo18/serverless.yml`, `esbuild.config.mjs`, `src/functions/*.yml`
- `apps/worker-bingo18/src/step-functions/settle.ts` + `settle.asl.json` + `generate-asl.sh`
- `apps/worker-bingo18/src/handlers/settle/*` — prepare-settle, settle-entries, calculate-financials, enqueue-dispatch-payouts, finalize-settle, build-settle-report, sync-ticket-summaries, publish-settle-daily, publish-player-daily
- `apps/worker-bingo18/src/handlers/feed/feed-sync.ts`
- `packages/game-bingo18-application/src/use-cases/settle/*` — use-case logic (worker handler chỉ là wrapper)

---

## Tổng quan

SFN settle per draw (per region — mỗi đài settle độc lập). Trigger: staff `trigger-settle` sau publish-result
(hoặc auto sau publish). Mọi bước idempotent + crash-safe (aggregate từ DB, chạy lại an toàn).
Lô Live entries settle CÙNG pipeline này (dò theo picks với result đầy đủ — 05 §6).

---

## Phase 1: Scaffold `apps/worker-lottery`

- Copy cấu trúc worker-bingo18: package.json (`@megawin/worker-lottery`), serverless.yml (service `worker-lottery`), esbuild config, tsconfig.
- `src/functions/settle.yml`, `feed.yml` (void/resettle/outstanding yml để plan 10/11).
- SFN definition `src/step-functions/settle.ts` → generate `settle.asl.json`.

## Phase 2: Use-cases settle (`use-cases/settle/` trong application package)

| Use-case | Nội dung |
|---|---|
| `prepare-settle.ts` | Guard `published → settling`; validate result tồn tại; init cursor batch |
| `settle-entries.ts` | Batch iterate entries pending của draw; per entry: per board snapshot → `calcBoardPayout` (helpers plan 01) → `LotteryEntryPayout` (winAmount = Σ boards, payoutTx UUIDv7); bulkWrite $set trọn `payout`+`result`+`outcome`+`status` |
| `calculate-financials.ts` | Aggregate từ DB (idempotent): totalRevenue = Σ amount, totalPrizes = Σ payoutAmount, totalAgentCommission = Σ commissionAmount; `profit = revenue − prizes − commission`; ghi financial+stats+settleSummary 1 lần `updateSettleResult` |
| `enqueue-dispatch-payouts.ts` | Orders payout → worker-tenant-dispatch (idempotency payoutTx) |
| `finalize-settle.ts` | `settling → settled`, settledAt, update ticket progress/settlement (`sync-ticket-summaries`) |
| `build-settle-report.ts` + `publish-settle-daily.ts` + `publish-player-daily.ts` | Report docs (dùng plan 11; scaffold ở đây theo pipeline bingo18) |

Lưu ý dò trúng:
- Dò theo `picks` + betMode matcher; `de` chỉ so bộ theo `prizeSelector` (default special); Lô-family so tập giải theo `resolvePrizeSet` per position; nháy = frequence (04 §3).
- Xiên: thắng khi TẤT CẢ token về; parity/sizes theo kết quả tương ứng; Lô Live: exact so các giải SAU điểm vào (05 §6.1), parity/sizes so giải kế tiếp snapshot lúc cược.

## Phase 3: SFN pipeline

```
prepare-settle → settle-entries (Map/loop batch) → calculate-financials
  → enqueue-dispatch-payouts → sync-ticket-summaries → build-settle-report
  → publish-settle-daily → publish-player-daily → finalize-settle
```
- Retry/catch policy copy settle.asl bingo18; mọi state idempotent.

## Phase 4: Tenant feed

- `use-cases/feed/` + handler `feed/feed-sync.ts` — theo `tenant-feed-processing.mdc`: entry change seq → feed docs snapshot `commissionRate`/`commissionAmount`; cursor per tenant.
- Đăng ký gameKey `lottery` vào feed infra chung (entry-feed-mapper của game-core) nếu cần.

## Phase 5: Trigger integration

- `trigger-settle` use-case (plan 04 Phase 3) gọi StartExecution SFN với input `{drawId}`.
- Idempotency: executionName theo drawId — không double-settle.

## Phase 6: Verify

- [ ] Unit test settle-entries với fixture result MB27/MN18 đủ playType × betMode × position (case doc 04 §3).
- [ ] Test idempotent: chạy lại calculate-financials không đổi số.
- [ ] Test feed snapshot đúng commissionRate lúc place-bet (không đọc config hiện tại).
- [ ] Deploy dev bằng `turbo run deploy --filter=@megawin/worker-lottery...` (theo pipeline hiện có).
