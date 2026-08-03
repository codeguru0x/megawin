# p0-05 — `GlobalConfigDoc.ops` + tab "Vận hành" trên trang config game

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` §3.9, `game-config-ui.mdc` §14/§16.
> **Phase:** P0 · **Phụ thuộc:** p0-02 (OpsStatsConfig) · **Blocks:** p0-03 (worker đọc ngưỡng), p0-06 (alert evaluator dùng ngưỡng).

## Mục tiêu

Thêm section `ops` (alerts + stats 3 top-K) vào GlobalConfig, cấu hình động ngay từ P0, staff sửa trên tab "Vận hành" mới của trang config game. KHÔNG rò `ops` ra player. Mỗi field có tooltip 4 phần (§16).

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Entity section | `packages/game-keno/src/entities/global-config.ts` (`GlobalConfigDoc` có `version`), section interface trong `entities/types.ts` (`PayoutCaps`, `PlayRules`) |
| Base type | `OpsStatsConfig` từ `@megawin/game-core/types` (p0-02) |
| Default config | `DEFAULT_KENO_CONFIG` trong `@megawin/game-keno/rules` |
| Update DTO | `packages/game-keno-application/src/use-cases/game-config/dto/game-config.dto.ts` (`UpdateGameConfigInput`, section `Partial<>`, `actor: AuditActor`) |
| Update use-case | `use-cases/game-config/update-game-config.ts` (merge per-section, `upsertGlobalConfig`, `globalConfigCache.invalidate`, `auditUpdateGameConfig`) |
| Zod schema | `apps/backoffice/src/app/api/keno/config/_lib/schema.ts` (`updateKenoGameConfigSchema`, sub-schema per section, `positiveInt`/`nonNegativeInt`) |
| Player allowlist (KHÔNG lộ) | `use-cases/player/get-game-config-player.ts` (build DTO tường minh, không spread) |
| Backoffice đọc full | `use-cases/game-config/get-global-config.ts` |
| Config tab UI | `apps/backoffice/src/app/(main)/games/keno/config/game/page.tsx` (`useQueryState("tab", parseAsStringEnum([...]))`), section mẫu `rates-section.tsx` (rhf + zodResolver + `values`) |
| Update hook | `config/game/_lib/use-game-config.ts` (`useUpdateKenoGameConfig`) |
| Tooltip | `components/ui/tooltip.tsx` + `HeaderTooltip` local helper copy trong section |

## Việc cần làm

### 1. Entity `OpsConfig` (`packages/game-keno/src/entities/types.ts`)

```ts
export interface OpsConfig {
  alerts: {
    largeBetAmount: number;              // default 5_000_000
    exposureWarnPct: number;             // default 60
    sidebetSkewPct: number;              // default 70
    comboSetsWarn: { pick8: number; pick9: number; pick10: number }; // 40/10/4
    comboAccountsWarn: number;           // default 5
    enabled: Record<KenoOpsAlertType, boolean>;
  };
  stats: OpsStatsConfig;                 // từ game-core; default tickSeconds=10, topCombosK=100, topPotentialK=50, topAccountsK=50
}
```

- `KenoOpsAlertType` **PHẢI** khai `const {...} as const` + `type` dẫn xuất (rule `code-quality-standards.mdc` §5.3 — KHÔNG union string trần). Khai ở p0-06 (entity game-keno); nếu p0-06 chưa có, khai tạm ở đây theo đúng pattern §5.3 rồi p0-06 dùng lại (ghi rõ tránh trùng). `Record<KenoOpsAlertType, boolean>` tự đúng khoá nhờ type dẫn xuất.
- `OpsStatsConfig` (từ game-core, p0-02) đã gồm `tickSeconds` — staff chỉnh nhịp worker/poll động (default 10s, xem p0-03).
- Mỗi field JSDoc đầy đủ (đơn vị, default, ý nghĩa) — nguồn text cho tooltip UI.
- Thêm `ops: OpsConfig` vào `GlobalConfigDoc` (+ `GlobalConfigEntity` tự kế thừa qua `Omit`).
- Thêm default `ops` vào `DEFAULT_KENO_CONFIG`.

### 2. Update path (application)

- `UpdateGameConfigInput` thêm `ops?: UpdateOpsInput` (dto). **KHÔNG dùng `Partial<OpsConfig>` hay indexed-access `OpsConfig["alerts"]["comboSetsWarn"]` (sửa Risk #8, vi phạm §5.4):** khai interface tường minh `UpdateOpsInput { alerts?: { largeBetAmount?; exposureWarnPct?; …; comboSetsWarn?: Partial<ComboSetsWarn>; enabled?: Partial<Record<KenoOpsAlertType, boolean>> }; stats?: Partial<OpsStatsConfig> }` — import `ComboSetsWarn`/`OpsStatsConfig` từ entities.
- `update-game-config.ts`: `mergeOps(existing, input: UpdateOpsInput)` merge section `ops` theo đúng pattern `cleanMerged` hiện có (chỉ set khi gửi lên), `version++`, audit.

### 3. Zod schema (`.../keno/config/_lib/schema.ts`)

- `opsSchema` với sub-schema: `alerts` (largeBetAmount `positiveInt`, các Pct `int 0–100`, `comboSetsWarn` object int dương, `comboAccountsWarn` int dương, `enabled` record boolean), `stats` (`tickSeconds` int 5–60, `topCombosK` int 20–200, `topPotentialK`/`topAccountsK` int 20–100). Range PHẢI khớp JSDoc/tooltip.
- Thêm `ops: opsSchema.partial().optional()` vào root `updateKenoGameConfigSchema`; `.refine` giữ nguyên (ít nhất 1 section).

### 4. Player KHÔNG lộ

- Kiểm tra `get-game-config-player.ts` — vì build DTO allowlist tường minh, thêm `ops` vào Doc KHÔNG tự lộ. **Không thêm** `ops` vào player DTO. Viết 1 dòng comment tại DTO player nhắc "ops không expose".

### 5. Tab UI "Vận hành" (`config/game/`)

- `page.tsx`: thêm `"ops"` vào `parseAsStringEnum([...])` + `<TabsTrigger value="ops">Vận hành</TabsTrigger>` + `<TabsContent value="ops">`.
- `_lib/ops-section.tsx` (mới, copy pattern `rates-section.tsx`): rhf + zodResolver (schema local khớp server), `values` từ config, submit qua `useUpdateKenoGameConfig`. Card/section layout theo `game-config-ui`.
- **Tooltip §16 cho MỌI field**: dùng `HeaderTooltip` (copy local helper) hoặc `Tooltip` + icon `Info cursor-help`. Nội dung 4 phần: ý nghĩa · giá trị hợp lệ (khớp Zod) · default · tác động ("hiệu lực trong ~1 chu kỳ worker, không cần deploy"). Checklist: số field == số tooltip.

## Không làm

- KHÔNG tạo collection config riêng (dùng GlobalConfig — analysis §3.9). KHÔNG expose `ops` cho player. KHÔNG field tooltip thiếu.

## Verify

`check-types` game-keno + application + backoffice. Sửa ngưỡng trên UI → API update → `version++` + audit log; reload thấy giá trị mới; player config API KHÔNG chứa `ops`.

## Định nghĩa Done

Staff sửa được ngưỡng + top-K trên tab Vận hành, mọi field có tooltip, player không thấy `ops`. Cập nhật `00-overview.md`.
