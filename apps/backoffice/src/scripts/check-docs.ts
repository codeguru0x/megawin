/**
 * Validate manifest ops-docs <-> file `.md` staff thực tế trên đĩa.
 *
 * Chạy: `pnpm --filter @megawin/backoffice docs:check`
 *
 * Kiểm tra 2 chiều:
 * - Mọi `doc.file` trong manifest phải tồn tại file `.md` tương ứng (THIẾU).
 * - Mọi file staff `.md` trên đĩa phải được manifest tham chiếu (THỪA / mồ côi).
 *
 * Exit code != 0 nếu lệch → dùng trong CI chặn merge tài liệu lệch registry.
 */

import { RUNBOOK_MANIFEST } from "@megawin/ops-docs/manifest";

import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

const require = createRequire(import.meta.url);

// Resolve thư mục gốc package ops-docs từ entry manifest đã resolve.
const manifestPath = require.resolve("@megawin/ops-docs/manifest");
const pkgRoot = dirname(dirname(manifestPath)); // .../packages/ops-docs/src/manifest.ts -> .../packages/ops-docs
const docsRoot = join(pkgRoot, "docs");

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
      if (name === "_developer") continue;
      out.push(...listStaffMarkdown(full));
    } else if (name.endsWith(".md")) {
      out.push(relative(docsRoot, full));
    }
  }
  return out;
}

const manifestFiles = new Set(RUNBOOK_MANIFEST.flatMap((g) => g.topics.flatMap((t) => t.docs.map((d) => d.file))));
const diskFiles = new Set(listStaffMarkdown(docsRoot));

const missing = [...manifestFiles].filter((f) => !diskFiles.has(f));
const orphan = [...diskFiles].filter((f) => !manifestFiles.has(f));

if (missing.length === 0 && orphan.length === 0) {
  console.log(`docs:check OK — ${manifestFiles.size} doc staff khớp manifest.`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error("THIẾU file (manifest trỏ tới nhưng không có .md):");
  for (const f of missing) console.error(`  - ${f}`);
}
if (orphan.length > 0) {
  console.error("THỪA file (.md tồn tại nhưng manifest không tham chiếu):");
  for (const f of orphan) console.error(`  - ${f}`);
}
process.exit(1);
