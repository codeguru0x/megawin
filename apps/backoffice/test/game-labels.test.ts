/**
 * PURE — không DB (jsdom env).
 *
 * Smoke test kích hoạt suite cho apps/backoffice.
 * Kiểm tra `getGameLabel` + GAME_PRODUCT_OPTIONS — logic thuần map gameId → nhãn.
 */

import { describe, it, expect } from "vitest";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { getGameLabel, GAME_PRODUCT_OPTIONS } from "@/lib/game-labels";

describe("game-labels", () => {
  it("getGameLabel map đúng gameId enum → nhãn tiếng Việt", () => {
    expect(getGameLabel(GameProduct.Mega645)).toBe("Mega 6/45");
    expect(getGameLabel(GameProduct.Keno)).toBe("Keno");
  });

  it("getGameLabel fallback về chính gameId khi không khớp enum", () => {
    expect(getGameLabel("unknown-game")).toBe("unknown-game");
  });

  it("GAME_PRODUCT_OPTIONS phủ đủ mọi GameProduct", () => {
    expect(GAME_PRODUCT_OPTIONS).toHaveLength(Object.values(GameProduct).length);
    for (const opt of GAME_PRODUCT_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});
