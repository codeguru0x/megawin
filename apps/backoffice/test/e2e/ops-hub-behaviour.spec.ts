/**
 * Ops Hub — assertion hành vi (KHÔNG screenshot).
 *
 * Scope vùng bằng landmark `aria-label` (a11y), không `data-testid`.
 */
import { expect, test } from "./support/hub-fixtures";
import {
  FIXTURE_DRAW_LABEL_BY_GATE,
  FIXTURE_SELLING_LABEL,
  HUB_BULK_BAR_REGION,
  HUB_GATE_TAB_LABELS,
  HUB_GATE_TAB_ORDER,
  HUB_QUEUE_REGION,
  HubGateTab,
  PRIMARY_ACTION_BY_GATE,
} from "./support/hub-gate-tabs";

const GAMES = ["keno", "bingo18"] as const;

for (const game of GAMES) {
  test.describe(`${game} Ops Hub — hành vi`, () => {
    test("5 tab đúng label và đúng thứ tự", async ({ page, opsHub }) => {
      await opsHub(game);

      const tabs = page.getByRole("tab");
      await expect(tabs).toHaveCount(HUB_GATE_TAB_ORDER.length);
      for (let i = 0; i < HUB_GATE_TAB_ORDER.length; i++) {
        const gate = HUB_GATE_TAB_ORDER[i]!;
        await expect(tabs.nth(i)).toContainText(HUB_GATE_TAB_LABELS[gate]);
      }
    });

    for (const gate of HUB_GATE_TAB_ORDER) {
      test(`deep link ?gate=${gate} chọn đúng tab`, async ({ page, opsHub }) => {
        await opsHub(game, gate);

        await expect(
          page.getByRole("tab", { name: new RegExp(HUB_GATE_TAB_LABELS[gate]), selected: true }),
        ).toBeVisible({ timeout: 30_000 });
      });
    }

    test("click tab đồng bộ vào URL", async ({ page, opsHub }) => {
      await opsHub(game);

      await page.getByRole("tab", { name: new RegExp(HUB_GATE_TAB_LABELS.awaiting_settle) }).click();
      await expect(page).toHaveURL(/[?&]gate=awaiting_settle/);
    });

    test("mỗi gate tab hiện đúng kỳ fixture", async ({ page, opsHub }) => {
      for (const gate of [
        HubGateTab.PendingOpen,
        HubGateTab.Ended,
        HubGateTab.AwaitingResult,
        HubGateTab.AwaitingSettle,
      ] as const) {
        await opsHub(game, gate);
        const zone = page.getByRole("region", { name: HUB_QUEUE_REGION });
        await expect(zone.getByText(FIXTURE_DRAW_LABEL_BY_GATE[gate], { exact: true })).toBeVisible({
          timeout: 30_000,
        });
      }
    });

    test("tab Chờ mở bán chỉ có action bulk Mở bán", async ({ page, opsHub }) => {
      await opsHub(game, HubGateTab.PendingOpen);

      const zone = page.getByRole("region", { name: HUB_QUEUE_REGION });
      await expect(zone.getByText(FIXTURE_DRAW_LABEL_BY_GATE.pending_open, { exact: true })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("checkbox", { name: "Chọn tất cả" }).check();
      const bar = page.getByRole("region", { name: HUB_BULK_BAR_REGION });
      await expect(bar).toBeVisible();
      await expect(
        bar.getByRole("button", { name: new RegExp(`^${PRIMARY_ACTION_BY_GATE.pending_open} \\(`) }),
      ).toBeVisible();
      await expect(bar.getByRole("button", { name: new RegExp(`^${PRIMARY_ACTION_BY_GATE.ended} \\(`) })).toHaveCount(
        0,
      );
      await expect(
        bar.getByRole("button", { name: new RegExp(`^${PRIMARY_ACTION_BY_GATE.awaiting_settle} \\(`) }),
      ).toHaveCount(0);
    });

    test("tab Chờ đóng bán chỉ có action bulk Đóng bán", async ({ page, opsHub }) => {
      await opsHub(game, HubGateTab.Ended);

      const zone = page.getByRole("region", { name: HUB_QUEUE_REGION });
      await expect(zone.getByText(FIXTURE_DRAW_LABEL_BY_GATE.ended, { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("checkbox", { name: "Chọn tất cả" }).check();
      const bar = page.getByRole("region", { name: HUB_BULK_BAR_REGION });
      await expect(bar.getByRole("button", { name: new RegExp(`^${PRIMARY_ACTION_BY_GATE.ended} \\(`) })).toBeVisible();
      await expect(
        bar.getByRole("button", { name: new RegExp(`^${PRIMARY_ACTION_BY_GATE.pending_open} \\(`) }),
      ).toHaveCount(0);
    });

    test("tab Chờ kết sổ chỉ có action bulk Kết sổ", async ({ page, opsHub }) => {
      await opsHub(game, HubGateTab.AwaitingSettle);

      const zone = page.getByRole("region", { name: HUB_QUEUE_REGION });
      await expect(zone.getByText(FIXTURE_DRAW_LABEL_BY_GATE.awaiting_settle, { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("checkbox", { name: "Chọn tất cả" }).check();
      const bar = page.getByRole("region", { name: HUB_BULK_BAR_REGION });
      await expect(
        bar.getByRole("button", { name: new RegExp(`^${PRIMARY_ACTION_BY_GATE.awaiting_settle} \\(`) }),
      ).toBeVisible();
      await expect(bar.getByRole("button", { name: new RegExp(`^${PRIMARY_ACTION_BY_GATE.ended} \\(`) })).toHaveCount(
        0,
      );
    });

    test("tab Chưa có KQ không có bulk checkbox (không cùng action)", async ({ page, opsHub }) => {
      await opsHub(game, HubGateTab.AwaitingResult);

      const zone = page.getByRole("region", { name: HUB_QUEUE_REGION });
      await expect(zone.getByText(FIXTURE_DRAW_LABEL_BY_GATE.awaiting_result, { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("checkbox", { name: "Chọn tất cả" })).toHaveCount(0);
      await expect(page.getByText(FIXTURE_SELLING_LABEL, { exact: true }).first()).toBeVisible();
    });
  });
}
