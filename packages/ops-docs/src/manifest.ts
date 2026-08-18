/**
 * Registry tài liệu vận hành bản STAFF — nguồn duy nhất backoffice trỏ tới.
 *
 * Index 2 loại doc staff: `docs/games/{game}/*.md` (topic `product` — cơ chế sản
 * phẩm, KHÔNG số cấu hình, cũng là skill content của AI agent — p1-02) và
 * `docs/resettle/{game}/*.md` (topic `resettle`, chỉ 3 game jackpot). Bản developer
 * trong `docs/resettle/_developer/{game}/` là SSOT cho dev, KHÔNG xuất hiện ở đây.
 *
 * ⚠️ Mỗi doc `docs/games/**` có HAI consumer: trang `/guides` (staff đọc) và skill AI agent
 * (`apps/backoffice/agent/skills/*.ts` import cùng file bằng `?raw`). Thêm/đổi tên/xoá doc
 * PHẢI cập nhật cả 2 phía trong CÙNG commit — quy trình đầy đủ ở
 * `.cursor/rules/ops-docs-agent-sync.mdc`.
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
 * Build topic "Sản phẩm & cách chơi" (3 doc: overview, how-to-play, payout) cho một game
 * theo convention path `games/{gameKey}/{slug}.md` (p1-02 §2.4).
 *
 * Doc này KHÔNG chứa số cấu hình — chỉ mô tả cơ chế, xem `docs/games/{gameKey}/*.md`.
 *
 * ⚠️ Slug = tên file (tiếng Anh, kebab-case) và cũng là URL segment `/guides/{gameKey}/product/
 * {slug}`. Đổi slug ở đây là đổi URL → phải cập nhật `docs-content.ts` + skill agent tương ứng,
 * xem `.cursor/rules/ops-docs-agent-sync.mdc`.
 *
 * @param gameKey - Game key (7/7 game: keno, lotto535, mega645, power655, max3d, max3dpro, bingo18).
 * @param gameTitle - Tên game hiển thị, dùng trong description từng doc.
 * @returns Topic `product` đầy đủ 3 doc.
 */
function buildProductTopic(gameKey: string, gameTitle: string): RunbookTopic {
  return {
    key: "product",
    title: "Sản phẩm & cách chơi",
    description: "Cơ chế game, nội dung đặt cược, điều kiện trúng và cách trả thưởng.",
    docs: [
      {
        slug: "overview",
        title: "Tổng quan",
        description: `Giới thiệu chung sản phẩm ${gameTitle}: cơ chế quay, cách chơi, đặc điểm nổi bật.`,
        file: `games/${gameKey}/overview.md`,
      },
      {
        slug: "how-to-play",
        title: "Nội dung đặt cược",
        description: `Cách chọn số/cược, cấu trúc board/line, công thức tính tiền cược ${gameTitle}.`,
        file: `games/${gameKey}/how-to-play.md`,
      },
      {
        slug: "payout",
        title: "Điều kiện trúng & cách trả thưởng",
        description: `Điều kiện trúng từng hạng giải và cơ chế trả thưởng của ${gameTitle}.`,
        file: `games/${gameKey}/payout.md`,
      },
    ],
  };
}

/**
 * Manifest tài liệu staff cho toàn bộ 7 game — topic `product` (7/7) + topic `resettle`
 * (chỉ 3 game jackpot: lotto535, mega645, power655), cộng entry `shared` cho khái niệm chung.
 */
export const RUNBOOK_MANIFEST: RunbookGame[] = [
  {
    gameKey: "power655",
    title: "Power 6/55",
    topics: [buildProductTopic("power655", "Power 6/55"), buildResettleTopic("power655")],
  },
  {
    gameKey: "lotto535",
    title: "Lotto 5/35",
    topics: [buildProductTopic("lotto535", "Lotto 5/35"), buildResettleTopic("lotto535")],
  },
  {
    gameKey: "mega645",
    title: "Mega 6/45",
    topics: [buildProductTopic("mega645", "Mega 6/45"), buildResettleTopic("mega645")],
  },
  {
    gameKey: "keno",
    title: "Keno",
    topics: [buildProductTopic("keno", "Keno")],
  },
  {
    gameKey: "max3d",
    title: "Max 3D",
    topics: [buildProductTopic("max3d", "Max 3D")],
  },
  {
    gameKey: "max3dpro",
    title: "Max 3D Pro",
    topics: [buildProductTopic("max3dpro", "Max 3D Pro")],
  },
  {
    gameKey: "bingo18",
    title: "Bingo 18",
    topics: [buildProductTopic("bingo18", "Bingo 18")],
  },
  {
    gameKey: "shared",
    title: "Kiến thức chung",
    topics: [
      {
        key: "game-concepts",
        title: "Khái niệm chung 7 sản phẩm",
        description: "Từ vựng, vòng đời vé và dòng tiền — nền tảng đọc trước khi vào từng game.",
        docs: [
          {
            slug: "glossary",
            title: "Từ vựng chung",
            description: "Ticket, board, line, betCount, betUnitCount — quan hệ giữa các khái niệm dùng chung 7 game.",
            file: "games/_shared/glossary.md",
          },
          {
            slug: "ticket-lifecycle",
            title: "Vòng đời vé & kỳ quay",
            description: "Place-bet → chờ quay → settle → payout; void và hoàn tiền.",
            file: "games/_shared/ticket-lifecycle.md",
          },
          {
            slug: "money-flow",
            title: "Dòng tiền vận hành",
            description: "Revenue → hoa hồng đại lý → trả thưởng → (jackpot contribution) → lợi nhuận.",
            file: "games/_shared/money-flow.md",
          },
        ],
      },
    ],
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
