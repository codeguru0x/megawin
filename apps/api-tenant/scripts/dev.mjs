/**
 * In API key + curl examples cho local dev, rồi khởi động serverless-offline.
 *
 * Tenant auth dùng API Key (header X-Api-Key), không dùng JWT.
 * API key lấy từ .env (MOCK_API_KEY) hoặc dùng giá trị mặc định.
 * Key này phải tồn tại trong collection tenants ở MongoDB.
 *
 * Usage:
 *   pnpm dev         → in hướng dẫn + khởi động serverless offline
 *   pnpm dev:info    → chỉ in hướng dẫn
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Load .env ──

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(ROOT, ".env"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  } catch {
    // .env không tồn tại — dùng defaults
  }
  return env;
}

const env = loadEnv();
const get = (key, fallback) => process.env[key] ?? env[key] ?? fallback;

// ── Config ──

const apiKey = get("MOCK_API_KEY", "tenant-dev-api-key-001");
const baseUrl = "http://localhost:4020";

// ── Print ──

const SEP = "─".repeat(60);

console.log();
console.log(SEP);
console.log("  TENANT API — LOCAL DEV");
console.log(SEP);
console.log();
console.log(`  API Key: ${apiKey}`);
console.log();
console.log("  LƯU Ý: API key phải tồn tại trong collection 'tenants'");
console.log("  trong MongoDB. Nếu chưa có, tạo document với:");
console.log(`    { tenantId, displayName, status: "active", apiKey: "${apiKey}" }`);
console.log();
console.log("  Curl examples:");
console.log();
console.log(`    # Danh sách players`);
console.log(`    curl ${baseUrl}/tenant/players \\`);
console.log(`      -H "X-Api-Key: ${apiKey}"`);
console.log();
console.log(`    # Player login`);
console.log(`    curl -X POST ${baseUrl}/tenant/players/login \\`);
console.log(`      -H "X-Api-Key: ${apiKey}" \\`);
console.log(`      -H "Content-Type: application/json" \\`);
console.log(`      -d '{"playerExternalId":"player001"}'`);
console.log();
console.log(`    # Entry feed`);
console.log(`    curl "${baseUrl}/tenant/entries/feed?afterVersion=0" \\`);
console.log(`      -H "X-Api-Key: ${apiKey}"`);
console.log();
console.log(`    # Revenue report`);
console.log(`    curl "${baseUrl}/tenant/reports/revenue?from=2026-01-01&to=2026-12-31" \\`);
console.log(`      -H "X-Api-Key: ${apiKey}"`);
console.log();
console.log(SEP);
console.log();
