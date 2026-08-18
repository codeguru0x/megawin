/**
 * PURE — không I/O.
 *
 * Unit test cho findRunbookDoc + RUNBOOK_MANIFEST — tra cứu doc staff theo
 * route segments, và convention path resettle (type-a/b1/b2).
 */

import { describe, expect, it } from "vitest";

import { findRunbookDoc, RUNBOOK_MANIFEST } from "../src/manifest";

describe("RUNBOOK_MANIFEST", () => {
  const GAMES_WITH_RESETTLE = ["power655", "lotto535", "mega645"];
  const GAMES_WITH_PRODUCT = ["power655", "lotto535", "mega645", "keno", "max3d", "max3dpro", "bingo18"];

  it("3 game jackpot có topic resettle đủ 3 doc theo đúng convention path", () => {
    for (const gameKey of GAMES_WITH_RESETTLE) {
      const game = RUNBOOK_MANIFEST.find((g) => g.gameKey === gameKey);
      expect(game).toBeDefined();
      const resettle = game!.topics.find((t) => t.key === "resettle");
      expect(resettle).toBeDefined();
      expect(resettle!.docs.map((d) => d.slug)).toEqual(["type-a", "type-b1", "type-b2"]);
      for (const doc of resettle!.docs) {
        expect(doc.file).toBe(`resettle/${gameKey}/${doc.slug}.md`);
      }
    }
  });

  it("cả 7 game có topic product đủ 3 doc theo đúng convention path, không chứa số", () => {
    for (const gameKey of GAMES_WITH_PRODUCT) {
      const game = RUNBOOK_MANIFEST.find((g) => g.gameKey === gameKey);
      expect(game).toBeDefined();
      const product = game!.topics.find((t) => t.key === "product");
      expect(product).toBeDefined();
      expect(product!.docs.map((d) => d.slug)).toEqual(["overview", "how-to-play", "payout"]);
      for (const doc of product!.docs) {
        expect(doc.file).toBe(`games/${gameKey}/${doc.slug}.md`);
      }
    }
  });

  it("có entry shared chứa 3 doc từ vựng/vòng đời/dòng tiền", () => {
    const shared = RUNBOOK_MANIFEST.find((g) => g.gameKey === "shared");
    expect(shared).toBeDefined();
    const topic = shared!.topics.find((t) => t.key === "game-concepts");
    expect(topic).toBeDefined();
    expect(topic!.docs.map((d) => d.slug)).toEqual(["glossary", "ticket-lifecycle", "money-flow"]);
    for (const doc of topic!.docs) {
      expect(doc.file).toBe(`games/_shared/${doc.slug}.md`);
    }
  });

  it("mọi slug/file trong manifest đều là ASCII kebab-case (không tên tiếng Việt)", () => {
    for (const game of RUNBOOK_MANIFEST) {
      expect(game.gameKey).toMatch(/^[a-z0-9]+$/);
      for (const topic of game.topics) {
        expect(topic.key).toMatch(/^[a-z0-9-]+$/);
        for (const doc of topic.docs) {
          expect(doc.slug).toMatch(/^[a-z0-9-]+$/);
          expect(doc.file).toMatch(/^[a-z0-9_/-]+\.md$/);
        }
      }
    }
  });
});

describe("findRunbookDoc", () => {
  it("tìm đúng doc theo [gameKey, topicKey, slug]", () => {
    const found = findRunbookDoc("power655", "resettle", "type-b2");
    expect(found).not.toBeNull();
    expect(found!.doc.slug).toBe("type-b2");
    expect(found!.game.gameKey).toBe("power655");
    expect(found!.topic.key).toBe("resettle");
  });

  it("trả null khi game/topic/slug không tồn tại", () => {
    expect(findRunbookDoc("unknown", "resettle", "type-a")).toBeNull();
    expect(findRunbookDoc("power655", "unknown", "type-a")).toBeNull();
    expect(findRunbookDoc("power655", "resettle", "unknown")).toBeNull();
  });
});
