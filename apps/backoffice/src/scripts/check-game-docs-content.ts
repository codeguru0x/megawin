/**
 * Lint nội dung tài liệu sản phẩm game staff-facing (`packages/ops-docs/docs/games/**`).
 *
 * Chạy: `pnpm --filter @megawin/backoffice docs:check-content`
 *
 * Đây là guard §7.1 của `p1-02-game-knowledge-config-truth.plan.md`: "doc không được chứa số
 * cấu hình" là một POLICY — phải được ĐO bằng CI, không chỉ được khai báo trong plan. Quét mọi
 * file `.md` dưới `docs/games/` (KHÔNG đụng `docs/resettle/` — nhóm doc đó thuộc phạm vi khác,
 * đã có từ trước plan này) và chặn 7 loại vi phạm:
 *
 * 1. Số tiền dạng phân tách hàng nghìn (`2.000.000`) hoặc `<số> tỷ|triệu|nghìn|VND`.
 * 2. Phần trăm (`32%`, `12,5%`).
 * 3. "Vietlott" xuất hiện cùng đoạn với một match số tiền/% ở trên (đúng lỗi plan chặn).
 * 4. Thiếu banner bắt buộc "Số liệu trong tài liệu này" (§2.2 template).
 * 5. Đường dẫn field cấu hình dạng `play.unitPrice`/`jackpot.seedAmount` — §3.2/§7.3: nghĩa của
 *    số phải nằm trong `label`/`unit` của payload tool, KHÔNG nằm trong doc. Doc chỉ được nói Ý
 *    NGHĨA + section (`getGameConfig section "play"`), không được nói tên field.
 * 6. Rò rỉ chi tiết dev: đường dẫn `packages/`/`apps/`, tên class/pattern backend (`UseCase`,
 *    `Repository`, `Entity`, `Doc` viết hoa liền field), tên collection Mongo (`_tickets`,
 *    `_draws`, `_entries`).
 * 7. Số ĐẾM cấu hình: số board/kỳ/phút/giây, dải chữ cái board (`A-E`), ngày quay trong tuần —
 *    xem chú thích ở `CONFIG_COUNT_RE` bên dưới cho lỗi thật đã xảy ra.
 *
 * Cho phép ngoại lệ bằng comment allowlist ngay trên dòng vi phạm, nêu rõ lý do (chính sách
 * suppression giống Biome — `biome-lint-conventions.mdc` §d):
 *
 * ```markdown
 * <!-- structural: không gian số Keno, không phải config -->
 * Mỗi kỳ hệ thống quay ngẫu nhiên 20 số từ tập 01-80.
 * ```
 *
 * Exit code != 0 nếu có vi phạm → dùng trong CI chặn merge tài liệu lệch policy "tài liệu dạy cơ
 * chế, config cấp số".
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

const require = createRequire(import.meta.url);

const manifestPath = require.resolve("@megawin/ops-docs/manifest");
const pkgRoot = dirname(dirname(manifestPath)); // .../packages/ops-docs/src/manifest.ts -> .../packages/ops-docs
const gamesRoot = join(pkgRoot, "docs", "games");

/** Một vi phạm tìm được trong 1 dòng của 1 file. */
interface Violation {
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

/** Liệt kê đệ quy mọi file `.md` dưới `dir`, trả về path tuyệt đối. */
function listMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listMarkdown(full));
    } else if (name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

// Hoist regex ra module scope (§7.9 vercel-react-best-practices) — file được quét lặp lại mỗi dòng.
const MONEY_GROUPED_RE = /\d{1,3}(?:[.,]\d{3})+/;
const MONEY_UNIT_RE = /\d+\s*(?:tỷ|triệu|nghìn|VND)\b/i;
const PERCENT_RE = /\d+(?:[.,]\d+)?\s*%/;
const VIETLOTT_RE = /Vietlott/;
const BANNER_RE = /Số liệu trong tài liệu này/;
// Field path dạng `section.fieldName` hoặc `section.sub.fieldName` — chỉ những section hợp lệ của
// GameConfigSection (§1.2/§3.3 của plan) để tránh false-positive với câu văn thường có dấu chấm.
//
// `(?<![\w-])` chặn khớp phần đuôi của từ có gạch nối: `how-to-play.md` KHÔNG được coi là field
// path `play.md`. `(?!md\b)` chặn tên file `.md` — cross-link giữa các doc là hợp lệ và cần thiết.
const FIELD_PATH_RE =
  /(?<![\w-])(?:play|rates|prizes|jackpot|ops|defaultPrizes|basicPrizes|bigSmallPrizes|evenOddPrizes|payoutCaps|singleNumPrizes|doubleMatchPrizes|tripleMatchPrizes|sumTotalPrizes|bigSmallDrawPrizes)\.(?!md\b)[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*\b/;
const DEV_LEAK_RE = /\b(?:packages\/|apps\/|UseCase|Repository|GlobalConfigDoc|_tickets\b|_draws\b|_entries\b)/;
// Số ĐẾM cấu hình — lỗi thật đã xảy ra (2026-08): doc ghi "1 vé có tối đa 5 board (A-E)" trong khi
// `play.maxBoardsPerTicket` đang là 10 → agent trả lời staff con số SAI mà nghe rất tự tin vì "có
// tài liệu". Ba pattern dưới đây bắt đúng nhóm dễ tái phạm nhất, cố ý HẸP để không đụng số
// structural (số line, "1 lần", không gian số):
//
// - `CONFIG_COUNT_RE`: số ≥ 2 đứng ngay trước danh từ đo bằng config (`board`/`bảng`/`kỳ`/`phút`/
//   `giây`). Ngưỡng ≥ 2 vì "1 board", "1 line", "1 kỳ" gần như luôn là câu văn mô tả cơ chế
//   ("board chơi cơ bản có đúng 1 line"), không phải trần cấu hình.
// - `BOARD_LETTER_RANGE_RE`: dải chữ cái board (`A-E`, `A–F`) — ám chỉ số board tối đa mà không
//   viết số, nên `CONFIG_COUNT_RE` không bắt được. Tên board do phía đặt vé gửi lên, doc không
//   được cố định dải.
// - `WEEKDAY_RE`: ngày quay trong tuần (`thứ 3`, `3 lần mỗi tuần`) — `play.drawDaysOfWeek` /
//   `drawsPerDay` đều là config.
const CONFIG_COUNT_RE = /\b[2-9]\d*\s*(?:board|bảng|kỳ|phút|giây)\b/i;
const BOARD_LETTER_RANGE_RE = /\bA[-–][B-Z]\b/;
const WEEKDAY_RE = /\bthứ\s*[0-9]|\b\d+\s*lần\s*(?:mỗi|một)\s*tuần/i;
const ALLOWLIST_MARKER = /<!--\s*structural:/;

/**
 * Quét 1 file, trả về danh sách vi phạm. Dòng có `<!-- structural: ... -->` ngay phía trên hoặc
 * cùng dòng được coi là allowlist tường minh — bỏ qua mọi rule số (không bỏ qua field-path/dev-leak,
 * hai loại đó không có lý do "structural" hợp lệ).
 */
function lintFile(path: string): Violation[] {
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  const relPath = relative(gamesRoot, path);
  const violations: Violation[] = [];

  let hasBanner = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (BANNER_RE.test(line)) {
      hasBanner = true;
    }

    const prevLine = lines[i - 1] ?? "";
    const isAllowlisted = ALLOWLIST_MARKER.test(line) || ALLOWLIST_MARKER.test(prevLine);

    if (!isAllowlisted) {
      if (MONEY_GROUPED_RE.test(line) || MONEY_UNIT_RE.test(line)) {
        violations.push({ file: relPath, line: i + 1, rule: "so-tien", snippet: line.trim() });
      }
      if (PERCENT_RE.test(line)) {
        violations.push({ file: relPath, line: i + 1, rule: "phan-tram", snippet: line.trim() });
      }
      if (
        VIETLOTT_RE.test(line) &&
        (MONEY_GROUPED_RE.test(line) || MONEY_UNIT_RE.test(line) || PERCENT_RE.test(line))
      ) {
        violations.push({ file: relPath, line: i + 1, rule: "vietlott-so", snippet: line.trim() });
      }
      if (CONFIG_COUNT_RE.test(line) || BOARD_LETTER_RANGE_RE.test(line) || WEEKDAY_RE.test(line)) {
        violations.push({ file: relPath, line: i + 1, rule: "so-dem-config", snippet: line.trim() });
      }
    }

    // Field path và dev leak KHÔNG được allowlist bằng "structural" — đây không phải số STRUCTURAL.
    if (FIELD_PATH_RE.test(line)) {
      violations.push({ file: relPath, line: i + 1, rule: "field-path", snippet: line.trim() });
    }
    if (DEV_LEAK_RE.test(line)) {
      violations.push({ file: relPath, line: i + 1, rule: "dev-leak", snippet: line.trim() });
    }
  }

  if (!hasBanner) {
    violations.push({
      file: relPath,
      line: 0,
      rule: "thieu-banner",
      snippet: "(không có banner 'Số liệu trong tài liệu này')",
    });
  }

  return violations;
}

const files = listMarkdown(gamesRoot);
const allViolations = files.flatMap(lintFile);

if (allViolations.length === 0) {
  console.log(`docs:check-content OK — ${files.length} file games/ sạch, không chứa số config/field-path/dev-leak.`);
  process.exit(0);
}

const RULE_LABELS: Record<string, string> = {
  "so-tien": "Số tiền (phải lấy từ getGameConfig, không viết trong doc)",
  "phan-tram": "Phần trăm (phải lấy từ getGameConfig, không viết trong doc)",
  "vietlott-so": "Nhắc Vietlott kèm số cụ thể (không dùng số Vietlott làm giá trị MegaWin)",
  "so-dem-config": "Số đếm cấu hình (board/kỳ/phút/giây/ngày quay — phải lấy từ getGameConfig)",
  "field-path": "Đường dẫn field cấu hình (chỉ ghi Ý NGHĨA + section, không ghi tên field)",
  "dev-leak": "Rò rỉ chi tiết dev (path/class/collection nội bộ)",
  "thieu-banner": "Thiếu banner bắt buộc 'Số liệu trong tài liệu này'",
};

console.error(`docs:check-content THẤT BẠI — ${allViolations.length} vi phạm trong ${files.length} file:\n`);
for (const v of allViolations) {
  const label = RULE_LABELS[v.rule] ?? v.rule;
  console.error(`  ${v.file}:${v.line} [${label}]`);
  console.error(`    ${v.snippet}`);
}
console.error(
  "\nNếu là số STRUCTURAL hợp lệ (không gian số, công thức đếm line): thêm allowlist tường minh " +
    "`<!-- structural: <lý do> -->` ngay trên dòng, KHÔNG hạ regex. Field-path/dev-leak KHÔNG được " +
    "allowlist — sửa doc để chỉ nói ý nghĩa, không nói tên field/chi tiết backend.",
);
process.exit(1);
