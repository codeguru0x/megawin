import { RUNBOOK_MANIFEST, type RunbookDoc, type RunbookGame, type RunbookTopic } from "@megawin/ops-docs/manifest";

/**
 * Manifest thu hẹp cho trang `/guides` — CHỈ hiển thị quy trình **Kết sổ lại (resettle)**.
 *
 * `RUNBOOK_MANIFEST` gốc (từ `@megawin/ops-docs`) còn có topic "Sản phẩm & cách chơi" (`product`,
 * 7/7 game) và "Kiến thức chung" (`shared`) — hai nhóm doc này viết cho AI agent đọc (mô tả cơ chế
 * + luôn nói "tra `getGameConfig` section ..."), là skill content của `agent/skills/*.ts`
 * (xem `.cursor/rules/ops-docs-agent-sync.mdc`). Staff đọc trực tiếp sẽ thấy thuật ngữ không quen
 * (field, section, "cấu hình") và không hiểu — trang `/guides` chỉ nên hiển thị nội dung có bước
 * thao tác cụ thể cho nhân viên, đúng như trước khi có doc sản phẩm cho AI agent.
 *
 * **KHÔNG xoá topic đó khỏi `RUNBOOK_MANIFEST` gốc** — `check-docs.ts` dùng manifest ĐẦY ĐỦ để xác
 * nhận mọi file `.md` trên đĩa có entry + có skill AI agent nạp (parity doc↔skill). Đây chỉ là bộ
 * lọc ở tầng UI, không phải xoá nguồn.
 */
const STAFF_VISIBLE_TOPIC_KEYS = new Set(["resettle"]);

/**
 * Manifest game/topic/doc đã lọc — chỉ còn topic staff-facing. Game không còn topic nào sau khi
 * lọc (keno, max3d, max3dpro, bingo18, `shared`) biến mất khỏi trang hoàn toàn, vì các game đó
 * chưa có quy trình resettle cho staff.
 */
export const STAFF_GUIDE_MANIFEST: RunbookGame[] = RUNBOOK_MANIFEST.map((game) => ({
  ...game,
  topics: game.topics.filter((topic) => STAFF_VISIBLE_TOPIC_KEYS.has(topic.key)),
})).filter((game) => game.topics.length > 0);

/**
 * Tìm doc staff-facing theo route segments `[gameKey, topicKey, slug]`.
 *
 * Tra trên `STAFF_GUIDE_MANIFEST` (không phải `RUNBOOK_MANIFEST` đầy đủ) — truy cập trực tiếp URL
 * của topic đã ẩn (VD `/guides/keno/product/overview`) phải trả `null` để page gọi `notFound()`,
 * không chỉ ẩn khỏi sidebar/landing.
 *
 * @param gameKey - Game key.
 * @param topicKey - Topic key.
 * @param slug - Doc slug.
 * @returns Doc + game + topic chứa nó, hoặc `null` nếu không tồn tại hoặc không staff-facing.
 */
export function findStaffGuideDoc(
  gameKey: string,
  topicKey: string,
  slug: string,
): { game: RunbookGame; topic: RunbookTopic; doc: RunbookDoc } | null {
  const game = STAFF_GUIDE_MANIFEST.find((g) => g.gameKey === gameKey);
  if (!game) return null;
  const topic = game.topics.find((t) => t.key === topicKey);
  if (!topic) return null;
  const doc = topic.docs.find((d) => d.slug === slug);
  if (!doc) return null;
  return { game, topic, doc };
}
