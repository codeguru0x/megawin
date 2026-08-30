import type { RunbookDoc, RunbookGame, RunbookTopic } from "@megawin/ops-docs/manifest";
import type { Route } from "next";

import { STAFF_GUIDE_MANIFEST } from "./staff-manifest";

/** Một doc đã "phẳng hoá" kèm ngữ cảnh game/topic + route đầy đủ. */
export interface FlatDoc {
  game: RunbookGame;
  topic: RunbookTopic;
  doc: RunbookDoc;
  /** Route đầy đủ `/guides/{gameKey}/{topicKey}/{slug}`. */
  href: Route;
}

/**
 * Phẳng hoá `STAFF_GUIDE_MANIFEST` (chỉ topic staff-facing) thành danh sách doc theo thứ tự duyệt
 * cây. Dùng cho search palette (index phẳng) và pager (prev/next theo thứ tự).
 *
 * @returns Mảng `FlatDoc` theo thứ tự game → topic → doc.
 */
export function flattenDocs(): FlatDoc[] {
  const out: FlatDoc[] = [];
  for (const game of STAFF_GUIDE_MANIFEST) {
    for (const topic of game.topics) {
      for (const doc of topic.docs) {
        out.push({
          game,
          topic,
          doc,
          href: `/guides/${game.gameKey}/${topic.key}/${doc.slug}` as Route,
        });
      }
    }
  }
  return out;
}

/**
 * Tìm doc liền trước/sau trong cùng topic (dùng cho pager Prev/Next).
 *
 * Tra trên `STAFF_GUIDE_MANIFEST` — pager không được trỏ sang doc thuộc topic đã ẩn.
 *
 * @param gameKey - Game key.
 * @param topicKey - Topic key.
 * @param slug - Doc slug hiện tại.
 * @returns `{ prev, next }`, mỗi cái có thể `null` ở biên topic.
 */
export function getAdjacentDocs(
  gameKey: string,
  topicKey: string,
  slug: string,
): { prev: FlatDoc | null; next: FlatDoc | null } {
  const game = STAFF_GUIDE_MANIFEST.find((g) => g.gameKey === gameKey);
  const topic = game?.topics.find((t) => t.key === topicKey);
  if (!game || !topic) return { prev: null, next: null };

  const idx = topic.docs.findIndex((d) => d.slug === slug);
  if (idx === -1) return { prev: null, next: null };

  const toFlat = (doc: RunbookDoc): FlatDoc => ({
    game,
    topic,
    doc,
    href: `/guides/${game.gameKey}/${topic.key}/${doc.slug}` as Route,
  });

  const prevDoc = idx > 0 ? topic.docs[idx - 1] : undefined;
  const nextDoc = idx < topic.docs.length - 1 ? topic.docs[idx + 1] : undefined;

  return {
    prev: prevDoc ? toFlat(prevDoc) : null,
    next: nextDoc ? toFlat(nextDoc) : null,
  };
}
