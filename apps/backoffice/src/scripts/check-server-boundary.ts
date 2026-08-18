/**
 * Guard ranh giới server-side của backoffice — 2 check độc lập.
 *
 * Chạy: `pnpm --filter @megawin/backoffice check:server-boundary`
 *
 * **Check 1 — client bundle không chạm code server-only.** BFS từ mọi file có directive
 * `"use client"`, đi theo **value import** nội bộ (`@/…` và relative), báo lỗi nếu chạm
 * `src/server/use-cases/**` hoặc `src/server/ai/**` (cả 2 gọi `@megawin/*-application` → kéo Mongo
 * driver). Bỏ qua `import type` vì `verbatimModuleSyntax` erase hoàn toàn — client component ĐƯỢC
 * PHÉP `import type` để render (tiền lệ: `components/ai-chat/tool-renderers/*` dùng type
 * `GetGameConfigOutput`).
 *
 * **Check 2 — hướng phụ thuộc một chiều.** `server/ai/**` → `server/use-cases/**` là chiều DUY
 * NHẤT hợp lệ. Raw facade phải trung lập với consumer (dashboard route + tool AI dùng chung nó);
 * import ngược nghĩa là contract dành cho model đang rỉ vào tầng dữ liệu. Check này bắt CẢ
 * `import type` — type-only vẫn là coupling sai hướng về mặt thiết kế.
 *
 * VÌ SAO KHÔNG DÙNG PACKAGE `server-only` cho check 1: package đó có `exports` map điều kiện
 * `react-server` -> `empty.js`, `default` -> `index.js` (file này `throw` ngay khi nạp).
 * Next.js set condition `react-server` nên an toàn, NHƯNG `src/server/{use-cases,ai}/**` còn được
 * `agent/tools/*` import — bundle đó do **eve/rolldown** build, KHÔNG set `react-server` -> resolve
 * sang `index.js` -> tool AI chết lúc runtime. Đã verify nội dung package trên npm (2026-08) trước
 * khi loại bỏ phương án này. Guard tĩnh cho cùng mức bảo vệ mà không phụ thuộc bundler condition.
 *
 * `src/server/server-actions.ts` KHÔNG bị chặn — Server Actions vốn được client import (RPC).
 *
 * Exit code != 0 nếu vi phạm → dùng trong CI.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** `src/scripts/check-server-boundary.ts` -> `src`. */
const srcRoot = dirname(dirname(new URL(import.meta.url).pathname));
/** Use-case cross-package dùng chung route + AI (raw DTO). */
const useCasesRoot = join(srcRoot, "server", "use-cases");
/** Tầng chỉ tồn tại vì agent (payload gắn nhãn cho model). */
const aiRoot = join(srcRoot, "server", "ai");
/** Thư mục bị cấm xuất hiện trong graph client — cả 2 đều gọi `@megawin/*-application`. */
const SERVER_ONLY_ROOTS = [useCasesRoot, aiRoot] as const;

const SOURCE_EXT = [".ts", ".tsx"] as const;
const SKIP_DIRS = new Set(["node_modules", ".next", "scripts"]);

/**
 * Bắt mọi `import`/`export … from "spec"` và `import("spec")` động.
 * Group 1 = phần trước `from` (để phân biệt type-only), group 2/3 = specifier.
 */
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)([\s\S]*?)from\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Liệt kê đệ quy mọi file `.ts`/`.tsx` dưới `dir`.
 *
 * @param dir - Thư mục bắt đầu quét.
 * @returns Danh sách path tuyệt đối.
 */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (SOURCE_EXT.some((ext) => name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Resolve specifier về path file tuyệt đối, chỉ với module NỘI BỘ app.
 *
 * @param spec - Specifier trong câu import (VD `@/server/use-cases/game-config`, `./types`).
 * @param fromFile - File chứa câu import đó (để resolve relative).
 * @returns Path tuyệt đối, hoặc `undefined` nếu là package ngoài / không tồn tại.
 */
function resolveInternal(spec: string, fromFile: string): string | undefined {
  let base: string;
  if (spec.startsWith("@/")) {
    base = join(srcRoot, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = resolve(dirname(fromFile), spec);
  } else {
    return undefined;
  }

  for (const ext of SOURCE_EXT) {
    if (existsSync(base + ext)) {
      return base + ext;
    }
  }
  for (const ext of SOURCE_EXT) {
    const indexFile = join(base, `index${ext}`);
    if (existsSync(indexFile)) {
      return indexFile;
    }
  }
  // Path có extension sẵn (VD `./foo.client.ts`) hoặc file `.md`/asset — trả về nếu tồn tại thật.
  return existsSync(base) && statSync(base).isFile() ? base : undefined;
}

/**
 * Câu import này có bị erase hoàn toàn lúc compile (type-only) hay không.
 *
 * Xử lý 2 dạng: `import type { A } from` (type-only cả câu) và
 * `import { type A, type B } from` (mọi specifier đều `type` → cũng bị erase).
 *
 * @param clause - Phần giữa keyword `import`/`export` và `from`.
 * @returns `true` nếu câu import không tạo runtime dependency.
 */
function isTypeOnly(clause: string): boolean {
  const trimmed = clause.trim();
  if (trimmed.startsWith("type ")) {
    return true;
  }
  const named = trimmed.match(/^\{([\s\S]*)\}$/);
  const inner = named?.[1];
  if (inner === undefined) {
    return false;
  }
  const specifiers = inner
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return specifiers.length > 0 && specifiers.every((s) => s.startsWith("type "));
}

/**
 * Trích mọi value-import nội bộ của 1 file (đã bỏ type-only).
 *
 * @param file - Path tuyệt đối file cần phân tích.
 * @returns Danh sách path tuyệt đối của module phụ thuộc lúc runtime.
 */
function valueImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const [, clause, staticSpec, dynamicSpec] = match;
    const spec = staticSpec ?? dynamicSpec;
    if (!spec) {
      continue;
    }
    // `clause` chỉ có ở dạng static; dynamic `import()` luôn là value.
    if (staticSpec !== undefined && clause !== undefined && isTypeOnly(clause)) {
      continue;
    }
    const resolved = resolveInternal(spec, file);
    if (resolved !== undefined) {
      out.push(resolved);
    }
  }
  return out;
}

const allFiles = listSourceFiles(srcRoot);
const clientEntries = allFiles.filter((file) => /^\s*(?:"use client"|'use client')/.test(readFileSync(file, "utf8")));

// ── Check 1: client bundle KHÔNG được chạm code server-only ──────────────────────────────────
// BFS từ mọi client entry theo value import. `chain` giữ đường đi để báo lỗi có ngữ cảnh.
const violations: string[] = [];
const visited = new Set<string>();
const queue: Array<{ file: string; chain: string[] }> = clientEntries.map((file) => ({ file, chain: [file] }));

while (queue.length > 0) {
  const current = queue.shift();
  if (current === undefined) {
    break;
  }
  const { file, chain } = current;
  if (visited.has(file)) {
    continue;
  }
  visited.add(file);

  if (SERVER_ONLY_ROOTS.some((root) => file.startsWith(root))) {
    const readable = chain.map((f) => relative(srcRoot, f)).join("\n       → ");
    violations.push(readable);
    continue;
  }

  for (const dep of valueImports(file)) {
    queue.push({ file: dep, chain: [...chain, dep] });
  }
}

// ── Check 2: hướng phụ thuộc `server/ai/**` → `server/use-cases/**` là MỘT CHIỀU ─────────────
// Raw facade (`server/use-cases/`) phải trung lập với consumer: dashboard route và tool AI dùng
// chung nó. Import ngược (`use-cases/` → `ai/`) là dấu hiệu contract dành cho model (`ConfigItem`
// với label/unit/note) đang rỉ vào tầng dữ liệu, ép route Next.js nhận shape của LLM.
// Bắt cả `import type` ở check này — kể cả type-only cũng là coupling sai hướng về thiết kế.
const reverseDeps: string[] = [];
for (const file of allFiles) {
  if (!file.startsWith(useCasesRoot)) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[2] ?? match[3];
    if (spec === undefined) {
      continue;
    }
    const resolved = resolveInternal(spec, file);
    if (resolved?.startsWith(aiRoot)) {
      reverseDeps.push(`${relative(srcRoot, file)} → ${relative(srcRoot, resolved)}`);
    }
  }
}

let failed = false;

if (violations.length > 0) {
  failed = true;
  console.error(`❌ ${violations.length} đường dẫn từ client component tới code server-only:\n`);
  for (const chain of violations) {
    console.error(`  ${chain}\n`);
  }
  console.error(
    "`src/server/use-cases/**` và `src/server/ai/**` gọi `@megawin/*-application` (kéo Mongo\n" +
      "driver) — KHÔNG được vào client bundle.\n" +
      "Sửa: đổi sang `import type` nếu chỉ cần type, hoặc gọi qua route API / Server Action.\n",
  );
}

if (reverseDeps.length > 0) {
  failed = true;
  console.error(`❌ ${reverseDeps.length} import SAI HƯỚNG (\`server/use-cases/\` → \`server/ai/\`):\n`);
  for (const dep of reverseDeps) {
    console.error(`  ${dep}`);
  }
  console.error(
    "\nHướng phụ thuộc phải MỘT CHIỀU: `server/ai/**` → `server/use-cases/**`.\n" +
      "Raw facade phải trung lập với consumer (dashboard route + tool AI dùng chung). Kéo contract\n" +
      "của model (`ConfigItem` label/unit/note) xuống đó là ép route Next.js nhận shape của LLM.\n" +
      "Sửa: chuyển phần map/gắn nhãn lên `server/ai/<domain>/`, giữ `use-cases/` trả RAW DTO.",
  );
}

if (failed) {
  process.exit(1);
}

console.log(
  `✅ Ranh giới sạch — ${clientEntries.length} client entry, ${visited.size} module trong graph, ` +
    "0 chạm `server/{use-cases,ai}/`, 0 import sai hướng `use-cases/` → `ai/`.",
);
