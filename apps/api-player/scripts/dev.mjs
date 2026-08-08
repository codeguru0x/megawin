/**
 * Sinh JWT token cho local dev (serverless-offline + ignoreJWTSignature).
 *
 * Token hết hạn sau 24h. Claims đọc từ .env (MOCK_*), fallback sang defaults.
 * serverless-offline chỉ decode token (không verify signature), nhưng vẫn
 * check iss/aud/exp → iss và aud phải khớp COGNITO_PLAYER_POOL_ISSUER_URL / COGNITO_PLAYER_POOL_CLIENT_ID.
 *
 * Usage:
 *   pnpm dev         → sinh token + khởi động serverless offline
 *   pnpm dev:token   → chỉ sinh token (copy vào Postman/curl)
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

// ── Build JWT token ──

const claims = {
  sub: get("MOCK_SUB", "local-dev-sub-001"),
  iss: get("COGNITO_PLAYER_POOL_ISSUER_URL", "https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_LOCAL"),
  aud: get("COGNITO_PLAYER_POOL_CLIENT_ID", "local-test-client"),
  exp: Math.floor(Date.now() / 1000) + 30 * 86400,
  "cognito:username": get("MOCK_USERNAME", "player001@local"),
  "custom:account_type": get("MOCK_ACCOUNT_TYPE", "player"),
  "custom:account_status": get("MOCK_ACCOUNT_STATUS", "active"),
  "custom:account_id": get("MOCK_ACCOUNT_ID", "00000000000000DEVP1AYER01"),
  "custom:tenant_id": get("MOCK_TENANT_ID", "local"),
  "custom:roles": get("MOCK_ROLES", "player"),
};

const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
const token = `${header}.${payload}.local`;

// ── Print ──

const SEP = "─".repeat(60);

console.log();
console.log(SEP);
console.log("  LOCAL DEV JWT TOKEN (expires in 24h)");
console.log(SEP);
console.log();
console.log(`  Bearer ${token}`);
console.log();
console.log("  Claims:");
console.log(`    sub          : ${claims.sub}`);
console.log(`    username     : ${claims["cognito:username"]}`);
console.log(`    account_type : ${claims["custom:account_type"]}`);
console.log(`    account_id   : ${claims["custom:account_id"]}`);
console.log(`    tenant_id    : ${claims["custom:tenant_id"]}`);
console.log(`    roles        : ${claims["custom:roles"]}`);
console.log(`    exp          : ${new Date(claims.exp * 1000).toLocaleString()}`);
console.log();
console.log("  Example:");
console.log(`    curl http://localhost:4010/player/keno/draws/current \\`);
console.log(`      -H "Authorization: Bearer ${token}"`);
console.log();
console.log(SEP);
console.log();
