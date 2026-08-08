/**
 * PURE — không I/O.
 *
 * Unit test cho findRunbookDoc + RUNBOOK_MANIFEST — tra cứu doc staff theo
 * route segments, và convention path resettle (type-a/b1/b2).
 */

import { describe, expect, it } from "vitest";

import { findRunbookDoc, RUNBOOK_MANIFEST } from "../src/manifest";

describe("RUNBOOK_MANIFEST", () => {
  it("mỗi game có topic resettle đủ 3 doc theo đúng convention path", () => {
    for (const game of RUNBOOK_MANIFEST) {
      const resettle = game.topics.find((t) => t.key === "resettle");
      expect(resettle).toBeDefined();
      expect(resettle!.docs.map((d) => d.slug)).toEqual(["type-a", "type-b1", "type-b2"]);
      for (const doc of resettle!.docs) {
        expect(doc.file).toBe(`resettle/${game.gameKey}/${doc.slug}.md`);
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
