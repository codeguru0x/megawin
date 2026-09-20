# P1-05 — Hợp nhất hue heatmap (Mega645/Power655/Lotto535/Keno) về 1 scale chung

## Status (2026-09-20) — DONE (financial-cool blue) + historical draw fixes

**Heat scale (chốt cuối cùng sau 2 lần reject amber):**
- Source chung: `apps/backoffice/src/components/games/shared/number-heatmap/heat-scale.ts`
- Main lane: **blue** (`HEAT_BADGE_STYLES_BLUE` / `HEAT_CELL_BG_BLUE`) — cold trong suốt →
  low/mid slate/blue nhạt liên tục → warm `blue-500` → hot `blue-700` + ring
- Lotto Special (ĐB): **indigo** (`HEAT_BADGE_STYLES_INDIGO` / `HEAT_CELL_BG_INDIGO`) — cùng
  thang luminance, tách khỏi main
- Rule: `.cursor/rules/operations-page-ui.mdc` §4 đã cập nhật khớp

**Lịch sử đổi màu (đừng quay lại amber):**
1. Amber thuần (19/09) — cold/low/mid quá sáng, "loá"
2. Soft-eye stone + amber-700/950 (20/09 sáng) — badge cam nổi trên patch stone loang lổ,
   "xấu, không chuyên nghiệp"
3. **Financial-cool blue** (20/09 trưa) — lý do: amber/orange đã là `--warning` trong
   design system; tái dùng cho mật độ cược (chỉ số trung tính) gây hiểu lầm "có cảnh báo".
   Pattern Bloomberg/Grafana/Datadog: gam lạnh đơn sắc cho volume/monitor dài hạn, chừa
   đỏ/vàng cho risk-alert thật

**Bugfix (cùng ngày, cùng PR):**
1. Draw selector kỳ cũ hiện ISO thô — `drawFromRemote.drawTime` gán thẳng WireType ISO;
   fix: `displayVNTime()` ở cả 7 game `use-draw-context`
2. Keno "Cược gần nhất" trống khi settled — `useLiveFeed(..., active && !isSettled)` tắt hẳn;
   fix: fetch 1 lần khi settled (khớp mega/power/lotto)

**Phạm vi file đã sửa:**
- `heat-scale.ts` (mới) + barrel `number-heatmap/index.ts`
- 4 heatmap: keno / mega645 / power655 / lotto535
- 7 `use-draw-context.tsx` + keno `use-operations.ts` + analytics `index.tsx`
- `operations-page-ui.mdc`

## 1. Quyết định gốc (19/09) — vẫn giữ

Đổi từ per-game hue (teal/red/amber/sky) sang **1 scale chung** cho 4 game có heatmap —
chấp nhận mất đặc trưng nhận diện game tại heatmap (icon header P1-01 vẫn giữ per-game).

Hue cụ thể đã **đảo** từ amber → blue (xem Status trên) — phần còn lại của plan (rollout
quy trình, rủi ro contrast) vẫn áp dụng với blue/indigo.

## 2. Scale hiện hành (thay cho ví dụ amber cũ)

```typescript
// Main — blue (Keno / Mega645 / Power655 / Lotto main)
export const HEAT_BADGE_STYLES_BLUE: Record<HeatLevel, string> = {
  cold: "bg-slate-100 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
  low: "bg-slate-200/80 text-slate-600 dark:bg-slate-700/45 dark:text-slate-300",
  mid: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
  warm: "bg-blue-500 text-white dark:bg-blue-600",
  hot: "bg-blue-700 text-white ring-2 ring-blue-300/70 dark:bg-blue-500 dark:ring-blue-300/50",
};

// Lotto Special — indigo (cùng luminance)
export const HEAT_BADGE_STYLES_INDIGO: Record<HeatLevel, string> = { /* ... */ };
```

`getHeatLevel()` ngưỡng giữ nguyên (0.1 / 0.3 / 0.55 / 0.8). Không đổi `MEGA_HEX`/brand
game ở icon/header.

## 3. Cell background tinting

Cùng file `heat-scale.ts` — `HEAT_CELL_BG_BLUE` / `_INDIGO`: low bắt đầu tint rất nhạt
(tránh "nhảy" từ trong suốt lên patch đậm — nguồn cảm giác loang lổ bản soft-eye).

## 4. `operations-page-ui.mdc` — đã cập nhật cùng PR

Badge: financial-cool blue; Lotto Special indigo; **CẤM** amber/orange cho heatmap intensity
(xung đột `--warning`).

## 5. Rủi ro còn theo dõi

- User chưa duyệt ảnh light/dark cuối (session Cognito hết hạn lúc verify tự động) — cần
  spot-check thủ công trên `keno/operations?drawId=…&tab=analysis`
- Playwright `ops-hub-visual.spec.ts`: heatmap nằm trong vùng chụp Ops Hub hay không — nếu
  có thì regression tự có; nếu không thì cân nhắc thêm snapshot riêng (không chặn merge P1-05)
