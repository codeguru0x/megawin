/**
 * Tiện ích xử lý Markdown cho knowledge base: slugify heading + trích TOC + reading time.
 *
 * Dùng chung giữa renderer (sinh `id` cho heading) và TOC (scroll-spy theo `id`),
 * nên slugify PHẢI cho ra kết quả giống nhau ở cả hai phía.
 */

/** Một mục trong mục lục (Table of Contents). */
export interface TocItem {
  /** `id` của heading tương ứng (khớp slug). */
  id: string;
  /** Văn bản heading hiển thị. */
  text: string;
  /** Cấp heading: 2 = `##`, 3 = `###`. (Bỏ h1 — đã là tiêu đề trang.) */
  level: number;
}

/**
 * Chuyển text heading thành slug `id` ổn định, hỗ trợ tiếng Việt có dấu.
 *
 * @param text - Văn bản heading thô.
 * @returns Slug kebab-case không dấu, chỉ `[a-z0-9-]`.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu thanh
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Hoist regex ra module scope — tránh tạo lại mỗi lần gọi.
const HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/;
const FENCE_RE = /^```/;

/**
 * Trích heading cấp 2-3 từ Markdown để dựng mục lục.
 *
 * Bỏ qua h1 (tiêu đề trang) và mọi dòng nằm trong code fence ```` ``` ````.
 *
 * @param markdown - Nội dung Markdown thô.
 * @returns Danh sách mục TOC theo thứ tự xuất hiện.
 */
export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (FENCE_RE.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = HEADING_RE.exec(line);
    if (!match || !match[1] || !match[2]) continue;

    const level = match[1].length;
    const text = match[2].trim();
    items.push({ id: slugify(text), text, level });
  }

  return items;
}

/**
 * Trích tiêu đề h1 (`# ...`) đầu tiên làm tiêu đề trang.
 *
 * @param markdown - Nội dung Markdown thô.
 * @returns Tiêu đề h1, hoặc `null` nếu không có.
 */
export function extractTitle(markdown: string): string | null {
  const match = /^#\s+(.+?)\s*$/m.exec(markdown);
  return match?.[1] ? match[1].trim() : null;
}

/**
 * Ước lượng thời gian đọc (phút), 200 từ/phút, tối thiểu 1 phút.
 *
 * @param markdown - Nội dung Markdown thô.
 * @returns Số phút đọc (làm tròn lên).
 */
export function readingTimeMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}
