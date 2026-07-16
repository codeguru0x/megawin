---
name: "Lottery — Master Plan"
overview: "Plan tổng điều phối toàn bộ dự án game Xổ số truyền thống (game-lottery): thứ tự thực hiện, dependency giữa các plan con, rule/skill áp dụng từng mảng."
todos: []
isProject: true
---

# Lottery — Master Plan (00)

> **Agent instruction**: Đây là plan ĐIỀU PHỐI. Mỗi plan con (01–12) là 1 đơn vị thực thi độc lập,
> thực hiện theo thứ tự dependency bên dưới. TRƯỚC KHI làm bất kỳ plan con nào, PHẢI đọc:
> 1. Toàn bộ `docs/game/lottery/new/*.md` (00→07) — source of truth thiết kế.
> 2. Section "Tham chiếu bắt buộc" của plan con đó.

---

## 1. Nguồn thiết kế (source of truth)

| File | Nội dung |
|---|---|
| `docs/game/lottery/new/00-tong-quan.md` | Phạm vi RGS, region/playType/position/betMode, mô hình giá |
| `docs/game/lottery/new/01-domain-model.md` | Entities, enums, `picks` canonical, marketKey/viewKey, 2 lớp DrawStatus × markets |
| `docs/game/lottery/new/02-config-pricing.md` | pricePerPoint vs payout, 3-tier override, numberSurcharge, MarketRulesTable |
| `docs/game/lottery/new/03-placebet.md` | State machine pre-paid, multi-term, validate 2 lớp + grammar picks |
| `docs/game/lottery/new/04-result-settle.md` | Kết quả MB27/MN18, dò trúng theo picks, settle SFN pipeline |
| `docs/game/lottery/new/05-lolive.md` | Lô Live MB: payout động theo remain, LiveState ↔ draw.markets |
| `docs/game/lottery/new/06-roadmap.md` | Package structure, phases, câu hỏi mở |
| `docs/game/lottery/new/07-risk-exposure.md` | Risk theo (region, playType, position, betMode, pick), Bảng Thao Tác Giá |

## 2. Danh sách plan con & dependency

```
Phase 1 — Core MVP (MB + MN + Lô Live)
┌──────────────────────────────────────────────────────────────────┐
│ 01-domain-package        (game-lottery: entities/enums/rules/    │
│                           helpers/schemas/labels/indexes)        │
│        │                                                         │
│        ▼                                                         │
│ 02-application-package   (game-lottery-application: repos/       │
│                           mappers/services skeleton)             │
│        │                                                         │
│        ├──────────────┬──────────────────┐                       │
│        ▼              ▼                  ▼                       │
│ 03-config-pricing  04-draws-lifecycle  05-place-bet              │
│ (game-config +     (create/open/close/ (state machine +          │
│  tenant-config +    markets/publish-    multi-term + WAL)        │
│  backoffice UI)     result)                    │                 │
│        │              │                        │                 │
│        └──────┬───────┴────────────────────────┘                 │
│               ▼                                                  │
│ 06-settle-worker    (SFN settle + feed + worker-lottery app)     │
│               │                                                  │
│        ┌──────┴───────┐                                          │
│        ▼              ▼                                          │
│ 07-lolive        08-risk-exposure                                │
│ (LiveState +     (risk pipeline + Bảng Thao Tác Giá)             │
│  make-odds +                                                     │
│  live worker)                                                    │
│        │              │                                          │
│        └──────┬───────┘                                          │
│               ▼                                                  │
│ 09-backoffice-operations  (operations + draws pages)             │
└──────────────────────────────────────────────────────────────────┘

Phase 2 — Vận hành nâng cao
│ 10-void-resettle    (void draw + refund + resettle pipeline)     │
│ 11-reports          (outstanding + settle daily + void reports   │
│                      + financial reports UI)                     │

Phase 3 — SDK & tối ưu
│ 12-player-sdk       (@megawin/player-sdk module lottery)         │
```

| # | Plan file | Phụ thuộc | Deliverable chính |
|---|---|---|---|
| 01 | `01-domain-package.plan.md` | — | `packages/game-lottery` hoàn chỉnh, unit tests rules/helpers |
| 02 | `02-application-package.plan.md` | 01 | `packages/game-lottery-application` repos + mappers + place-bet-store |
| 03 | `03-config-pricing.plan.md` | 02 | Use-cases game-config/tenant-config + API + backoffice config pages |
| 04 | `04-draws-lifecycle.plan.md` | 02 | Use-cases draws (create/open/close/markets/publish-result) + scheduler |
| 05 | `05-place-bet.plan.md` | 02, 03, 04 | Place-bet state machine + api-player handlers |
| 06 | `06-settle-worker.plan.md` | 04, 05 | `apps/worker-lottery` + SFN settle + tenant feed |
| 07 | `07-lolive.plan.md` | 05, 06 | LiveState/LivePrice + make-odds + vận hành Live backoffice |
| 08 | `08-risk-exposure.plan.md` | 05, 06 | Risk aggregation worker + Bảng Thao Tác Giá backoffice |
| 09 | `09-backoffice-operations.plan.md` | 06 | Operations + Draws pages hoàn chỉnh |
| 10 | `10-void-resettle.plan.md` | 06 | Void/refund + resettle SFN pipelines |
| 11 | `11-reports.plan.md` | 06, 10 | Outstanding/settle-daily/void reports + UI |
| 12 | `12-player-sdk.plan.md` | 05, 06 | Player SDK module lottery + docs + CHANGELOG |

## 3. Rules & Skills áp dụng theo mảng việc

| Mảng việc | Rules bắt buộc đọc | Ghi chú |
|---|---|---|
| Mọi plan | `.cursor/rules/code-quality-standards.mdc` | JSDoc, comment business logic, DRY types |
| Entities/Repos (01, 02) | `.cursor/rules/entity-typesafe-mongodb.mdc`, `.cursor/rules/mongodb.mdc` | Named interfaces, `docPath<TDoc>()`, dot-path typed |
| Config UI (03) | `.cursor/rules/game-config-ui.mdc` | Layout config page chuẩn |
| Place-bet/Feed (05, 06) | `.cursor/rules/tenant-feed-processing.mdc`, `.cursor/rules/tenant-gateway.mdc` | Snapshot commissionRate, BalanceData callback |
| Backoffice FE (03, 07, 08, 09, 11) | `.cursor/rules/frontend-dev.mdc`, `.cursor/rules/operations-page-ui.mdc` | + skill `frontend-design`, `shadcn` |
| Financial reports (11) | `.cursor/rules/financial-reporting-system.mdc`, `.cursor/rules/financial-report-ui.mdc` | |
| Player SDK (12) | `.cursor/rules/player-sdk-jsdoc.mdc` | TypeDoc, CHANGELOG, README checklist |
| Game rules tham chiếu | `.cursor/rules/bingo18-game-rules.mdc`, `.cursor/rules/keno-game-rules.mdc` | Bingo18 = template chính (boards[] unified) |

**Sau khi hoàn tất Phase 1**: viết rule mới `.cursor/rules/lottery-game-rules.mdc` (mirror `bingo18-game-rules.mdc`) tổng hợp game rules cho các agent sau.

## 4. Template code tham chiếu chính

| Cần làm | Copy pattern từ |
|---|---|
| Domain package | `packages/game-bingo18/src/**` (entities, rules, helpers, labels, indexes, schemas) |
| Application package | `packages/game-bingo18-application/src/**` (repos, mappers, use-cases) |
| Worker + SFN | `apps/worker-bingo18/**` (functions/*.yml, step-functions/*.ts, handlers) |
| Player handlers | `apps/api-player/src/handlers/bingo18/**` |
| Backoffice pages | `apps/backoffice/src/app/(main)/games/bingo18/**` + `games/keno/operations/**` |
| Backoffice API | `apps/backoffice/src/app/api/bingo18/**` |
| Player SDK | `packages/player-sdk/src/bingo18/**` + `src/apis/bingo18.ts` |

## 5. Quyết định kiến trúc đã chốt (KHÔNG mở lại khi thực thi)

1. **Naming**: `region` (đài, KHÔNG dùng gameType), `playType` giữ nguyên, prefix `Lottery` cho mọi enum/type.
2. **Selection canonical**: `picks: string[]` — token grammar theo betMode (01 §2.3.1). KHÔNG có field `numbers`/`parityPick`/`sizePick` riêng.
3. **2 lớp trạng thái**: `DrawStatus` (game-core, lifecycle kỳ) × `draw.markets` (per marketKey, runtime trong kỳ). Lô Live là market ngoại lệ duy nhất được mở khi `salesClosed`.
4. **`marketKey`/`viewKey`** là trục định danh xuyên suốt config–market–risk–report.
5. **Pre-paid**: `payAmount` thu trước; chỉ `winAmount`/`payoutAmount` khi settle. KHÔNG có WinLose kiểu ref.
6. **1 đài 1 kỳ/ngày**: unique index `{region, drawDate}`; `drawId` = `YYYY-MM-DD.NNN` (thường `.001`).
7. **Snapshot bất biến**: `pricePerPoint`, `payout`, `commissionRate` snapshot vào board/entry tại place-bet.
8. **Type-safety Mongo**: mọi dot-path qua `docPath<TDoc>()` từ `@megawin/data/mongo`.
9. **Result nhập tay** Phase 1 (staff PublishResult qua backoffice, có validate cơ cấu giải).
10. **Naming app/package**: `packages/game-lottery`, `packages/game-lottery-application`, `apps/worker-lottery` — core game, KHÔNG prefix operator (đây là game RGS của core).

## 5b. Touchpoints đăng ký game mới vào hệ thống (checklist bắt buộc)

Kết quả khảo sát codebase — khi thêm game `lottery` PHẢI chạm các điểm sau (phân bổ vào plan tương ứng):

| Touchpoint | File | Plan |
|---|---|---|
| `GameProduct` enum thêm `Lottery: "lottery"` | `packages/game-core/src/entities/game-core.enums.ts` | 01 |
| Ticket prefix `lottery: "LOT"` | `packages/game-core/src/entities/ticket-counter.ts` | 01 |
| Game label | `packages/game-core/src/labels/game-labels.ts` | 01 |
| Tenant-gateway game key union | `packages/tenant-gateway/src/transaction/types.ts` (~dòng 174) | 05 |
| Đăng ký endpoint yml | `apps/api-player/serverless.yml` (~dòng 118) + `src/functions/lottery-endpoint.yml` | 05 |
| Recovery WAL lookup | `apps/worker-game-core/src/handlers/recovery/recover-tx-intents.ts` — thêm `lottery: (tx) => lotteryLookup.existsByTx(tx)` + `LotteryTicketLookupService` (mirror `Bingo18TicketLookupService`) | 05 |
| Sidebar menu (7 sub-items) | `apps/backoffice/src/navigation/sidebar/sidebar-items.ts` | 09 |
| Query keys | `apps/backoffice/src/lib/query-keys/lottery.ts` + `index.ts` + `modules.ts` | 09 |
| Game labels + colors + CSS vars | `apps/backoffice/src/lib/game-labels.ts`, `game-colors.ts`, `src/app/globals.css` (`--game-lottery`, `--game-lottery-muted` light+dark) | 09 |
| Dashboard draws registry | `apps/backoffice/src/app/api/dashboard/draws/_lib/get-dashboard-draws.ts` (lottery KHÔNG thuộc `HIGH_FREQ_GAMES`) | 09 |
| Player SDK 7 điểm wiring | theo Release Checklist rule | 12 |
| Rule mới `lottery-game-rules.mdc` | `.cursor/rules/` | sau Phase 1 |

> MongoDB indexes: mỗi game tự khai `LOTTERY_INDEXES` trong `packages/game-lottery/src/indexes/` (mẫu `BINGO18_INDEXES`); apply thủ công/ops — không có script tập trung.

## 6. Câu hỏi mở cần chốt với product TRƯỚC các plan tương ứng

| # | Câu hỏi (chi tiết `06-roadmap.md` §4) | Chặn plan |
|---|---|---|
| 1 | Hằng số Lô Live: `minProfit`, `maxProfit`, payout tại `remain=1` | 07 |
| 2 | `numberSurcharge` scope: mỗi đài riêng hay chung? | 03 |
| 3 | `point` trên multi-number board: per-số hay per-board? | 03, 05 |
| 4 | `maxDrawCount` multi-term = bao nhiêu kỳ/vé? | 05 |
| 5 | Cơ cấu giải chính xác MB 27 / MN 18 (validate PublishResult) | 04 |
| 6 | Bảng odds gốc per (playType, betMode) cho GlobalConfig | 03 |

> Không được tự bịa số cho các câu hỏi trên — nếu chưa chốt, code với placeholder có comment `// TODO(product)` + config đọc từ GlobalConfig để đổi được không cần deploy.

## 7. Definition of Done chung cho mọi plan con

- [ ] `pnpm --filter <pkg> check-types` pass.
- [ ] `pnpm --filter <pkg> lint` pass (kể cả dependency-cruiser boundary).
- [ ] Unit tests cho rules/helpers/công thức tiền (vitest).
- [ ] JSDoc đầy đủ theo `code-quality-standards.mdc` (class, method, interface field có đơn vị/công thức).
- [ ] KHÔNG đổi `pnpm-workspace.yaml` / `turbo.json` (trừ plan 01 khai báo package mới nếu workspace glob chưa cover).
- [ ] KHÔNG tạo/ghi file `.env*`.
