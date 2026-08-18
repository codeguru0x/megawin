/**
 * Validate manifest ops-docs <-> file `.md` staff thực tế trên đĩa <-> skill AI agent.
 *
 * Chạy: `pnpm --filter @megawin/backoffice docs:check`
 *
 * Kiểm tra 4 điều:
 * - Mọi `doc.file` trong manifest phải tồn tại file `.md` tương ứng (THIẾU).
 * - Mọi file staff `.md` trên đĩa phải được manifest tham chiếu (THỪA / mồ côi).
 * - Tên file/thư mục phải ASCII kebab-case — KHÔNG tên tiếng Việt (`tong-quan` không phải lỗi
 *   ASCII nhưng là tên tiếng Việt; chặn bằng blocklist các slug tiếng Việt đã từng dùng để
 *   không ai vô tình thêm lại).
 * - Mọi doc staff (`games/**` + `resettle/**`) phải được ÍT NHẤT 1 skill AI agent import bằng
 *   `?raw` — đây là guard chống lệch doc↔agent: doc mới mà không skill nào nạp thì AI không bao
 *   giờ biết nội dung đó, staff đọc `/guides` thấy nhưng hỏi AI lại nhận câu trả lời sai. Xem
 *   `.cursor/rules/ops-docs-agent-sync.mdc`.
 *
 * Exit code != 0 nếu lệch → dùng trong CI chặn merge tài liệu lệch registry.
 */

import { RUNBOOK_MANIFEST } from "@megawin/ops-docs/manifest";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

const require = createRequire(import.meta.url);

// Resolve thư mục gốc package ops-docs từ entry manifest đã resolve.
const manifestPath = require.resolve("@megawin/ops-docs/manifest");
const pkgRoot = dirname(dirname(manifestPath)); // .../packages/ops-docs/src/manifest.ts -> .../packages/ops-docs
const docsRoot = join(pkgRoot, "docs");
// `src/scripts/check-docs.ts` -> app root -> `agent/skills`.
const skillsRoot = join(dirname(dirname(dirname(new URL(import.meta.url).pathname))), "agent", "skills");

/**
 * Liệt kê đệ quy mọi file `.md` staff (BỎ thư mục `_developer`).
 *
 * @param dir - Thư mục bắt đầu quét.
 * @returns Danh sách path tương đối so với `docsRoot` (VD: `resettle/power655/type-a.md`).
 */
function listStaffMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "_developer") {
        continue;
      }
      out.push(...listStaffMarkdown(full));
    } else if (name.endsWith(".md")) {
      out.push(relative(docsRoot, full));
    }
  }
  return out;
}

/**
 * Thu thập mọi path doc mà skill AI agent import bằng `?raw`.
 *
 * Chỉ quét chuỗi literal trong `agent/skills/*.ts` — skill dùng import tĩnh (eve bundle inline
 * lúc build), nên không có trường hợp path động cần xử lý.
 *
 * @returns Set path tương đối so với `docsRoot` (VD: `games/keno/overview.md`).
 */
function collectSkillDocRefs(): Set<string> {
  const refs = new Set<string>();
  const RAW_IMPORT_RE = /@megawin\/ops-docs\/docs\/([^"'?]+\.md)\?raw/g;
  for (const name of readdirSync(skillsRoot)) {
    if (!name.endsWith(".ts")) {
      continue;
    }
    const content = readFileSync(join(skillsRoot, name), "utf8");
    for (const m of content.matchAll(RAW_IMPORT_RE)) {
      const path = m[1];
      if (path !== undefined) {
        refs.add(path);
      }
    }
  }
  return refs;
}

/** Slug tiếng Việt đã từng dùng — chặn để không ai thêm lại sau khi đã rename sang tiếng Anh. */
const VIETNAMESE_SLUGS = [
  "tong-quan",
  "cach-choi",
  "tra-thuong",
  "tu-vung",
  "vong-doi-ve",
  "tai-chinh",
  "_chung",
  "san-pham",
];
// Tên file/thư mục hợp lệ: ASCII chữ thường, số, `-`, `_` (prefix `_shared`), phân cách `/`.
const ASCII_PATH_RE = /^[a-z0-9_/-]+\.md$/;

const manifestFiles = new Set(RUNBOOK_MANIFEST.flatMap((g) => g.topics.flatMap((t) => t.docs.map((d) => d.file))));
const diskFiles = new Set(listStaffMarkdown(docsRoot));
const skillRefs = collectSkillDocRefs();

const missing = [...manifestFiles].filter((f) => !diskFiles.has(f));
const orphan = [...diskFiles].filter((f) => !manifestFiles.has(f));
const badName = [...diskFiles].filter(
  (f) => !ASCII_PATH_RE.test(f) || VIETNAMESE_SLUGS.some((s) => f.split("/").includes(s) || f.endsWith(`/${s}.md`)),
);
// MỌI doc staff (`games/**` + `resettle/**`) phải có skill nạp. Doc `_developer/**` đã bị loại từ
// `listStaffMarkdown` nên không nằm trong `diskFiles` — bản dev là SSOT cho dev, agent không nạp.
const missingSkill = [...diskFiles].filter((f) => !skillRefs.has(f));
const staleSkillRef = [...skillRefs].filter((f) => !diskFiles.has(f));

const hasError =
  missing.length > 0 || orphan.length > 0 || badName.length > 0 || missingSkill.length > 0 || staleSkillRef.length > 0;

if (!hasError) {
  console.log(
    `docs:check OK — ${manifestFiles.size} doc staff khớp manifest, ` +
      `${skillRefs.size} doc được skill AI agent nạp.`,
  );
  process.exit(0);
}

if (missing.length > 0) {
  console.error("THIẾU file (manifest trỏ tới nhưng không có .md):");
  for (const f of missing) {
    console.error(`  - ${f}`);
  }
}
if (orphan.length > 0) {
  console.error("THỪA file (.md tồn tại nhưng manifest không tham chiếu):");
  for (const f of orphan) {
    console.error(`  - ${f}`);
  }
}
if (badName.length > 0) {
  console.error("TÊN FILE SAI (phải ASCII kebab-case tiếng Anh, không tên tiếng Việt):");
  for (const f of badName) {
    console.error(`  - ${f}`);
  }
}
if (missingSkill.length > 0) {
  console.error("DOC KHÔNG ĐƯỢC AGENT NẠP (có trong /guides nhưng không skill nào import ?raw → AI sẽ trả lời sai):");
  for (const f of missingSkill) {
    console.error(`  - ${f}`);
  }
}
if (staleSkillRef.length > 0) {
  console.error("SKILL TRỎ FILE KHÔNG TỒN TẠI (đã rename/xoá doc mà quên sửa skill):");
  for (const f of staleSkillRef) {
    console.error(`  - ${f}`);
  }
}
console.error("\nQuy trình đồng bộ doc ↔ manifest ↔ skill agent: .cursor/rules/ops-docs-agent-sync.mdc");
process.exit(1);
