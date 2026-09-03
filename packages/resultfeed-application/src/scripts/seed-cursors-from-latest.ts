/**
 * ResultFeed – Seed Cursors From Latest Script
 *
 * Neo (`SourceCursorRepository.seedAnchor`) cursor `source_cursors` cho MỌI adapter fetch
 * sống đang đăng ký trong `SOURCE_ADAPTERS` (`sources/registry.ts`) tới kỳ MỚI NHẤT đã có
 * trong `consensus` (đã publish) của từng game — chạy SAU khi `import-historical-results.ts`
 * nạp xong dữ liệu lịch sử, để lần fetch sống đầu tiên tiếp tục ĐÚNG SAU kỳ cuối cùng đã
 * biết, KHÔNG fetch lại từ đầu.
 *
 * Đây là hành động VẬN HÀNH ngang hàng với `import-historical-results.ts` — chạy tay bằng
 * `tsx` trên máy có quyền truy cập DB, KHÔNG đi qua backoffice API (không có audit log
 * riêng, giống mọi migration script chạy tay khác). Khác với `SourceCursorRepository.seedAnchor`
 * dùng cho ops "đọc kỳ hiện tại trên site rồi nhập tay" (single game, qua backoffice) — script
 * này tính kỳ TỰ ĐỘNG từ dữ liệu đã có trong DB, dùng cho setup ban đầu/hàng loạt.
 *
 * ⚠️ AN TOÀN: script CHỈ seed cursor đang cold-start (`lastConfirmedPeriod === null`) — bỏ
 * qua cursor đã có tiến độ (đã từng fetch sống thành công/thất bại) để không vô tình lùi
 * hoặc ghi đè tiến độ đang chạy. Muốn ép reset cursor đã có tiến độ, dùng
 * `SourceCursorRepository.seedAnchor` qua backoffice (chưa xây) hoặc sửa cursor bằng tay.
 *
 * Dùng CHUNG env `RESULTFEED_IMPORT_MONGODB_URI` với `import-historical-results.ts` (xem
 * `.env.test.example §3.1.1`) — cùng 1 DB đích, cùng tier tin cậy (ops có quyền chạy script
 * trên DB, không phải request qua API sống).
 *
 * Chạy: `pnpm --filter @megawin/resultfeed-application seed:cursors`.
 */

import { incrementPeriod } from "@megawin/resultfeed/rules";

import { ConsensusRepository } from "../infras/repos/consensus-repo";
import { SourceCursorRepository } from "../infras/repos/source-cursor-repo";
import { SOURCE_ADAPTERS } from "../sources/registry";
import path from "node:path";

// ── Load .env.test.local (đọc thôi, KHÔNG tạo/ghi đè — quy tắc no-env-file-modification) ──
const ENV_FILE_CANDIDATES = [".env.test.local", ".env.test"];
for (const fileName of ENV_FILE_CANDIDATES) {
  try {
    process.loadEnvFile(path.resolve(import.meta.dirname, "../../", fileName));
    break;
  } catch {
    // File không tồn tại — thử candidate kế tiếp, hoặc chấp nhận env đã có sẵn từ shell/CI.
  }
}

// ── Fail-fast env — PHẢI ở đầu file, trước khi bất kỳ repo được gọi ───────────
const IMPORT_MONGODB_URI = process.env.RESULTFEED_IMPORT_MONGODB_URI;
if (!IMPORT_MONGODB_URI) {
  throw new Error(
    "Missing env RESULTFEED_IMPORT_MONGODB_URI — điền vào packages/resultfeed-application/.env.test.local " +
      "(xem khai báo mẫu ở .env.test.example §3.1.1). Dùng CHUNG biến với import-historical-results.ts.",
  );
}
process.env.MONGODB_URI = IMPORT_MONGODB_URI;

type SeedOutcome = "seeded" | "skipped_has_progress" | "skipped_no_consensus";

interface SeedResult {
  sourceId: string;
  gameKey: string;
  outcome: SeedOutcome;
  lastConfirmedPeriod?: string;
  nextExpectedPeriod?: string;
}

/**
 * Seed 1 cursor (source × game) — bỏ qua nếu đã có tiến độ hoặc chưa có consensus nào đã
 * publish cho game đó (chưa import lịch sử, chưa fetch sống lần nào thành công).
 */
async function seedOne(
  cursorRepo: SourceCursorRepository,
  consensusRepo: ConsensusRepository,
  sourceId: (typeof SOURCE_ADAPTERS)[string]["sourceId"],
  gameKey: (typeof SOURCE_ADAPTERS)[string]["gameKeys"][number],
): Promise<SeedResult> {
  await cursorRepo.ensureCursor(sourceId, gameKey);
  const cursor = await cursorRepo.findBySourceAndGameKey(sourceId, gameKey);
  if (cursor && cursor.lastConfirmedPeriod !== null) {
    return { sourceId, gameKey, outcome: "skipped_has_progress", lastConfirmedPeriod: cursor.lastConfirmedPeriod };
  }

  const latest = await consensusRepo.findLatestPublishedPeriod(gameKey);
  if (!latest) {
    return { sourceId, gameKey, outcome: "skipped_no_consensus" };
  }

  const nextExpectedPeriod = incrementPeriod(latest.drawPeriod);
  await cursorRepo.seedAnchor(sourceId, gameKey, {
    lastConfirmedPeriod: latest.drawPeriod,
    nextExpectedPeriod,
  });
  return { sourceId, gameKey, outcome: "seeded", lastConfirmedPeriod: latest.drawPeriod, nextExpectedPeriod };
}

async function main(): Promise<void> {
  const cursorRepo = new SourceCursorRepository();
  const consensusRepo = new ConsensusRepository();

  const results: SeedResult[] = [];
  for (const adapter of Object.values(SOURCE_ADAPTERS)) {
    for (const gameKey of adapter.gameKeys) {
      const result = await seedOne(cursorRepo, consensusRepo, adapter.sourceId, gameKey);
      results.push(result);
      console.log(`[seed-cursors] ${result.sourceId} × ${result.gameKey} → ${result.outcome}`, result);
    }
  }

  const seeded = results.filter((r) => r.outcome === "seeded").length;
  const skippedProgress = results.filter((r) => r.outcome === "skipped_has_progress").length;
  const skippedEmpty = results.filter((r) => r.outcome === "skipped_no_consensus").length;
  console.log(
    `[seed-cursors] Xong: ${seeded} seeded, ${skippedProgress} đã có tiến độ, ${skippedEmpty} chưa có consensus.`,
  );

  // Đóng connection Mongo để process tự thoát — không cần process.exit() thủ công.
  const client = await cursorRepo.getClient();
  await client.close();
}

main().catch((error) => {
  console.error("[seed-cursors] Lỗi không xử lý được:", error);
  process.exitCode = 1;
});
