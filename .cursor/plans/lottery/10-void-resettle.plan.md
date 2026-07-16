---
name: "Lottery 10 — Void & Resettle"
overview: "Phase 2: void draw + refund pipeline (SFN void) và resettle (đối soát sai kết quả — reverse payouts + settle lại), theo unified resettle pattern hiện có."
todos: []
isProject: false
---

# Plan 10 — Void Draw & Resettle

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 06 (settle pipeline). Đây là plan Phase 2.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs & Rules & Plans mẫu

1. `docs/game/lottery/new/04-result-settle.md` §4 (resettle trong pipeline) — ĐỌC ĐẦU TIÊN
2. `.cursor/plans/bingo18-resettle.plan.md` + `.cursor/plans/unified_resettle.plan.md` — pattern resettle chuẩn hoá
3. `.cursor/rules/mongodb.mdc`, `.cursor/rules/code-quality-standards.mdc` (CRASH-SAFE/IDEMPOTENT JSDoc)

### Template

- `packages/game-bingo18-application/src/use-cases/void/` — prepare-void, void-entries, build-void-report, enqueue-dispatch-refunds, finalize-void
- `packages/game-bingo18-application/src/use-cases/resettle/` — prepare-resettle, enqueue-reversals
- `apps/worker-bingo18/src/step-functions/void.ts`, `resettle.ts` + handlers `void/`, `resettle/`
- `packages/game-core` — `EntryReversal`, `EntryVoidInfo`, tx-intent

---

## Tổng quan

- **Void**: huỷ kỳ (trước hoặc sau publish, trước settle hoàn tất) → refund toàn bộ `amount` cho player qua tenant-dispatch. `DrawStatus: voiding → void`.
- **Resettle**: staff sửa result kỳ ĐÃ settled → reverse payout cũ (reversal orders) → settle lại với result mới. Theo unified resettle pattern (simplified — không tách jackpot vì lottery không có jackpot pool).
- Đặc thù lottery: ticket multi-term — void 1 kỳ chỉ refund phần entry kỳ đó (per-draw subtotal trong `pricing`), cập nhật `ticket.voidSummary` + `progress`.

---

## Phase 1: Void pipeline

- `use-cases/void/`: `prepare-void` (guard status + lock), `void-entries` (batch: status → voided, `voidInfo`, refundTx UUIDv7), `enqueue-dispatch-refunds` (refund = per-draw amount của entry), `build-void-report`, `finalize-void` (draw → void, voidSummary; update tickets: progress + voidSummary, KHÔNG đụng entries kỳ khác).
- SFN `void.ts` + `functions/void.yml` trong worker-lottery.
- `void-draw.ts` trigger use-case trong draws (backoffice action + confirm).

## Phase 2: Resettle pipeline

- `use-cases/resettle/`: `prepare-resettle` (guard settled + result mới đã validate; snapshot result cũ vào audit), `enqueue-reversals` (reversal orders cho entries đã payout — `EntryReversal` với reversalTx), sau reversal xong → re-run settle pipeline (plan 06) với result mới.
- SFN `resettle.ts` + `functions/resettle.yml` — mirror bingo18 resettle ASL (reversal → chờ dispatch → settle lại → finalize).
- Backoffice: action "Sửa kết quả & Resettle" trên kỳ settled (plan 09 draws page) — form nhập result mới + diff so result cũ + confirm 2 bước + audit.
- Lô Live trong resettle: entries loLive dò lại theo result mới như mọi entry khác (không cần LiveState).

## Phase 3: Verify

- [ ] Test void multi-term: vé 3 kỳ, void kỳ 2 → chỉ entry kỳ 2 refund, kỳ 1/3 nguyên vẹn, ticket progress đúng.
- [ ] Test resettle: reversal đủ số tiền payout cũ, settle mới đúng, financial ghi đè đúng.
- [ ] Test idempotency refundTx/reversalTx (replay không double-refund).
- [ ] Test guard: không void kỳ đã settled (phải đi resettle/manual), không resettle kỳ chưa settled.
