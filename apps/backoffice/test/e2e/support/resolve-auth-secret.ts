/**
 * Resolve `BETTER_AUTH_SECRET` cho E2E mint — CI-first, local fallback hẹp.
 *
 * Thứ tự:
 * 1. `process.env.BETTER_AUTH_SECRET` nếu đã có (CI / shell / direnv) — **không đụng file**.
 * 2. Chỉ đọc **đúng 1 key** từ `.env.local` rồi `.env` (local DX). Không nạp Mongo/Cognito/…
 *
 * Không ghi đè `process.env` đã set. Không tạo/ghi `.env*` (no-env-file-modification.mdc).
 *
 * CI (p2-02): inject `BETTER_AUTH_SECRET` vào job (secret **riêng E2E**, ≠ production).
 * `webServer` của Playwright kế thừa `process.env` → Next ký/verify cùng secret với mint.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const APP_ROOT = path.resolve(__dirname, "../../..");

/** Đọc 1 key từ file dotenv — không side-effect lên `process.env`. */
function readKeyFromEnvFile(filePath: string, key: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (line.slice(0, eq).trim() !== key) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

/**
 * Secret dùng ký cookie E2E. Throw sớm với hướng dẫn rõ nếu thiếu.
 */
export function resolveBetterAuthSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const fromLocal =
    readKeyFromEnvFile(path.join(APP_ROOT, ".env.local"), "BETTER_AUTH_SECRET") ??
    readKeyFromEnvFile(path.join(APP_ROOT, ".env"), "BETTER_AUTH_SECRET");

  if (fromLocal) {
    // Gán vào process.env để better-auth / lần gọi sau thấy cùng giá trị — chỉ khi chưa có.
    process.env.BETTER_AUTH_SECRET = fromLocal;
    return fromLocal;
  }

  throw new Error(
    [
      "E2E mint thiếu BETTER_AUTH_SECRET.",
      "Local: thêm vào apps/backoffice/.env.local (không commit) hoặc export trước khi chạy test.",
      "CI: inject GitHub Actions secret BETTER_AUTH_SECRET (dùng giá trị RIÊNG cho E2E, không dùng production).",
    ].join(" "),
  );
}

/** Base URL cho better-auth mint — khớp port Playwright (3100) khi thiếu env. */
export function resolveE2eBaseURL(): string {
  return process.env.BETTER_AUTH_URL?.trim() || process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3100";
}
