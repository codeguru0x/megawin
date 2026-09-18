/**
 * Fixture Playwright gộp — đóng băng clock + mock snapshot theo đúng thứ tự rồi goto.
 *
 * Thứ tự BẮT BUỘC: clock → route → goto.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { test as base, expect } from "@playwright/test";

import { freezeClock } from "./freeze-clock";
import { mockOpsHubSnapshot, type OpsHubGame } from "./mock-hub-snapshot";

function loadFixture(game: OpsHubGame): unknown {
  const file = path.join(__dirname, "..", "fixtures", `${game}-hub-snapshot.fixture.json`);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

const FIXTURES: Record<OpsHubGame, unknown> = {
  keno: loadFixture("keno"),
  bingo18: loadFixture("bingo18"),
};

/**
 * `opsHub(game, gate?)` — setup determinism rồi điều hướng Ops Hub.
 */
export const test = base.extend<{ opsHub: (game: OpsHubGame, gate?: string) => Promise<void> }>({
  opsHub: async ({ page }, use) => {
    await use(async (game, gate) => {
      await freezeClock(page);
      await mockOpsHubSnapshot(page, game, FIXTURES[game]);
      const query = gate === undefined ? "" : `?gate=${gate}`;
      await page.goto(`/games/${game}/operations-hub${query}`);
    });
  },
});

export { expect };
