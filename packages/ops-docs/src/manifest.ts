/**
 * Registry tài liệu vận hành bản STAFF — nguồn duy nhất backoffice trỏ tới.
 *
 * Chỉ index bản staff (`docs/resettle/{game}/*.md`). Bản developer trong
 * `docs/resettle/_developer/{game}/` là SSOT cho dev, KHÔNG xuất hiện ở đây.
 *
 * Thêm doc staff mới: thêm 1 entry vào `docs` của topic tương ứng, đồng thời
 * thêm 1 dòng raw import trong `guides/_lib/docs-content.ts` (backoffice).
 */

/**
 * Một tài liệu staff đơn lẻ.
 */
export interface RunbookDoc {
  /** Slug doc trong topic, dùng cho route `/guides/{gameKey}/{topicKey}/{slug}`. VD: `"type-b2"`. */
  slug: string;
  /** Tiêu đề hiển thị trên sidebar và breadcrumb. */
  title: string;
  /** Mô tả ngắn 1 dòng cho landing card + search. */
  description: string;
  /** Đường dẫn file `.md` staff tương đối trong package. VD: `"resettle/power655/type-b2.md"`. */
  file: string;
}

/**
 * Một nhóm chủ đề trong một game (VD: resettle).
 */
export interface RunbookTopic {
  /** Key topic dùng trong route. VD: `"resettle"`. */
  key: string;
  /** Tiêu đề topic hiển thị trên sidebar. */
  title: string;
  /** Mô tả ngắn cho landing card. */
  description: string;
  /** Danh sách doc theo thứ tự hiển thị + thứ tự prev/next của pager. */
  docs: RunbookDoc[];
}

/**
 * Toàn bộ tài liệu staff của một game.
 */
export interface RunbookGame {
  /** Game key khớp `--color-game-{gameKey}` trong globals.css. VD: `"power655"`. */
  gameKey: string;
  /** Tên game hiển thị. VD: `"Power 6/55"`. */
  title: string;
  /** Danh sách topic của game. */
  topics: RunbookTopic[];
}

/**
 * Build 3 doc resettle (type-a/b1/b2) cho một game theo convention path.
 *
 * @param gameKey - Game key (power655 | lotto535 | mega645).
 * @returns Topic `resettle` đầy đủ 3 doc.
 */
function buildResettleTopic(gameKey: string): RunbookTopic {
  return {
    key: "resettle",
    title: "Kết sổ lại (Resettle)",
    description: "Hướng dẫn kết sổ lại kỳ quay khi cần sửa kết quả đã công bố.",
    docs: [
      {
        slug: "type-a",
        title: "Type A — Sửa kỳ độc lập",
        description: "Kết sổ lại 1 kỳ không ảnh hưởng kỳ khác. Hệ thống tự động hoàn toàn.",
        file: `resettle/${gameKey}/type-a.md`,
      },
      {
        slug: "type-b1",
        title: "Type B1 — Đổi người trúng Jackpot",
        description: "Kỳ sửa làm thay đổi người trúng Jackpot, chưa có kỳ kế tiếp đã kết sổ.",
        file: `resettle/${gameKey}/type-b1.md`,
      },
      {
        slug: "type-b2",
        title: "Type B2 — Kết sổ lại nhiều kỳ liên tiếp",
        description: "Sửa kỳ kéo theo các kỳ sau phải kết sổ lại tuần tự.",
        file: `resettle/${gameKey}/type-b2.md`,
      },
    ],
  };
}

/**
 * Manifest tài liệu staff cho toàn bộ game có runbook resettle.
 */
export const RUNBOOK_MANIFEST: RunbookGame[] = [
  {
    gameKey: "power655",
    title: "Power 6/55",
    topics: [buildResettleTopic("power655")],
  },
  {
    gameKey: "lotto535",
    title: "Lotto 5/35",
    topics: [buildResettleTopic("lotto535")],
  },
  {
    gameKey: "mega645",
    title: "Mega 6/45",
    topics: [buildResettleTopic("mega645")],
  },
];

/**
 * Tìm doc staff theo route segments `[gameKey, topicKey, slug]`.
 *
 * @param gameKey - Game key.
 * @param topicKey - Topic key.
 * @param slug - Doc slug.
 * @returns Doc + game + topic chứa nó, hoặc `null` nếu không tồn tại.
 */
export function findRunbookDoc(
  gameKey: string,
  topicKey: string,
  slug: string,
): { game: RunbookGame; topic: RunbookTopic; doc: RunbookDoc } | null {
  const game = RUNBOOK_MANIFEST.find((g) => g.gameKey === gameKey);
  if (!game) return null;
  const topic = game.topics.find((t) => t.key === topicKey);
  if (!topic) return null;
  const doc = topic.docs.find((d) => d.slug === slug);
  if (!doc) return null;
  return { game, topic, doc };
}
