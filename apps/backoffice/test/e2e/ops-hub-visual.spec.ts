/**
 * Ops Hub — screenshot regression (5 tab × 2 game).
 *
 * Chụp region "Hàng chờ kỳ quay" (không fullPage) — ổn định hơn sidebar.
 * Baseline PNG gitignore (local-only). CI skip — chỉ chạy behaviour.
 */
import { expect, test } from "./support/hub-fixtures";
import {
  FIXTURE_DRAW_LABEL_BY_GATE,
  HUB_GATE_TAB_LABELS,
  HUB_GATE_TAB_ORDER,
  HUB_QUEUE_REGION,
  HubGateTab,
} from "./support/hub-gate-tabs";

const GAMES = ["keno", "bingo18"] as const;

// Baseline không commit → CI không có ảnh expected. Behaviour nằm ở ops-hub-behaviour.spec.ts.
test.skip(!!process.env.CI, "Screenshot baseline chỉ local (gitignore); CI chạy behaviour.");

for (const game of GAMES) {
  test.describe(`${game} Ops Hub — visual`, () => {
    for (const gate of HUB_GATE_TAB_ORDER) {
      test(`tab ${HUB_GATE_TAB_LABELS[gate]}`, async ({ page, opsHub }) => {
        await opsHub(game, gate);

        await expect(
          page.getByRole("tab", { name: new RegExp(HUB_GATE_TAB_LABELS[gate]), selected: true }),
        ).toBeVisible({ timeout: 30_000 });
        const zone = page.getByRole("region", { name: HUB_QUEUE_REGION });
        await expect(zone.getByRole("table")).toBeVisible();
        await expect(
          page.getByText(FIXTURE_DRAW_LABEL_BY_GATE[HubGateTab.AwaitingSettle], { exact: true }).first(),
        ).toBeVisible();

        await expect(zone).toHaveScreenshot(`${game}-hub-${gate}.png`);
      });
    }
  });
}
