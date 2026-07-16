---
name: "Lottery 03 — Config & Pricing"
overview: "Use-cases game-config/tenant-config + API backoffice + UI config pages: GlobalConfig, TenantConfig, pricing 3-tier, numberSurcharge, MarketRulesTable."
todos: []
isProject: false
---

# Plan 03 — Config & Pricing (Backoffice)

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 02. **Chặn bởi câu hỏi mở** #2 (numberSurcharge scope), #6 (bảng odds gốc) — nếu chưa chốt, dùng placeholder trong GlobalConfig seed + `// TODO(product)`.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs & Rules

1. `docs/game/lottery/new/02-config-pricing.md` — TOÀN BỘ — ĐỌC ĐẦU TIÊN
2. `.cursor/rules/game-config-ui.mdc` — layout config page chuẩn
3. `.cursor/rules/frontend-dev.mdc` — chuẩn FE backoffice
4. `.cursor/rules/code-quality-standards.mdc`

### Template

- Use-cases: `packages/game-bingo18-application/src/use-cases/game-config/`, `use-cases/tenant-config/`
- API: `apps/backoffice/src/app/api/bingo18/config/`, `api/bingo18/tenant-config/`
- UI: `apps/backoffice/src/app/(main)/games/bingo18/config/game/`, `config/tenant/`
- Keno prize overrides (pattern 3-tier gốc): `packages/game-keno*/**` phần `KenoPrizeOverrides`

### Skills

- `frontend-design` + `shadcn` khi build UI.

---

## Tổng quan

2 loại config trong `lottery_game_configs` (scope `global` | `tenant`):
- **GlobalConfig**: `pricePerPointTable` + `payoutTable` + `numberSurchargeTable` + `marketRulesTable` (per viewKey) + `playRules` (min/max point, maxDrawCount...).
- **TenantConfig**: `commissionRate`, `isEnabled`, overrides từng bảng (3-tier: tenant board-level → tenant table → global).

Resolve giá cuối tại place-bet dùng `pricing-resolver` (plan 02 Phase 5) — plan này chỉ lo CRUD + UI.

---

## Phase 1: Use-cases (`use-cases/game-config/`, `use-cases/tenant-config/`)

- `get-game-config.ts` / `update-game-config.ts` (global) — validate: payout > 0, pricePerPoint > 0, marketRules key phải là viewKey hợp lệ (`listMarkets`), numberSurcharge token đúng grammar picks.
- `get-tenant-config.ts` / `update-tenant-config.ts` / `list-tenant-configs.ts` — validate overrides subset của bảng global; commissionRate 0–1.
- Seed script/use-case `ensure-default-config` — GlobalConfig mặc định với odds placeholder (câu hỏi mở #6) đọc được từ file seed, KHÔNG hardcode rải rác.
- Audit log mọi update (theo pattern audit hiện có của bingo18 config).

## Phase 2: API routes (`apps/backoffice/src/app/api/lottery/`)

- `config/route.ts` (GET/PUT global), `tenant-config/route.ts` + `tenant-config/[tenantId]/route.ts` — mirror `api/bingo18/config`.
- Auth + role guard giống bingo18 (copy middleware pattern).

## Phase 3: UI — Game Config page (`(main)/games/lottery/config/game/`)

Theo `game-config-ui.mdc`. Cấu trúc tab/section:

1. **Play Rules** — min/maxPointPerBoard, maxDrawCount, giới hạn boards/vé.
2. **Price Per Point** — bảng theo (region → playType → betMode); editor dạng bảng.
3. **Payout Table** — bảng odds theo (region → playType → betMode) + position.
4. **Number Surcharge** — editor theo region → playType → position → number (chỉ exact); thêm/xoá dòng surcharge.
5. **Market Rules** — bảng theo viewKey (label từ Report View Catalog — plan 01 Phase 7): isEnabled, min/max point, maxPointPerNumber, payout override.

## Phase 4: UI — Tenant Config page (`(main)/games/lottery/config/tenant/`)

- Danh sách tenant + trạng thái isEnabled + commissionRate.
- Detail: form overrides từng bảng (chỉ hiện diff so với global, pattern Keno overrides UI).
- Hiển thị "giá trị hiệu lực" (resolved) cạnh input để staff thấy kết quả 3-tier.

## Phase 5: Verify

- [ ] check-types/lint/test cho application + backoffice.
- [ ] Update config → resolve đúng ở pricing-resolver (integration test resolve 3-tier).
- [ ] UI kiểm tra bằng browser (dev server) — screenshot các tab config.
