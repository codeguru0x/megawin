/**
 * ResultFeed – Historical Import Script
 *
 * `06-historical-import.plan.md §3`. Đọc file JSONL lịch sử theo từng game, map sang
 * `ParsedObservation`, chạy `checkIntrinsic` + `canonicalizeNumbers` + hash, rồi bulk upsert
 * thẳng vào `observations` + `consensus` (bypass `ConsensusTickUseCase` — script tự quyết
 * `Agreed`, xem `ConsensusRepository.bulkUpsertPublished`).
 *
 * ⚠️ BẮT BUỘC set `RESULTFEED_IMPORT_MONGODB_URI` (env RIÊNG, xem `.env.test.example §3.1.1`)
 * — KHÔNG dùng chung `MONGODB_URI` của vitest (bị `setup-db-guard.ts` ép local-only). Script
 * fail-fast nếu thiếu, sau đó gán `process.env.MONGODB_URI` TRƯỚC khi gọi bất kỳ repo nào —
 * mọi repo (`ObservationRepository`, …) kế thừa `ResultFeedRepo` đọc key `MONGODB_URI` mặc
 * định, không cần sửa gì ở `@megawin/data`.
 *
 * IDEMPOTENT: chạy lại nhiều lần trên CÙNG file (kể cả sau khi sửa data lỗi, hoặc đổi
 * `RESULTFEED_IMPORT_MONGODB_URI` từ DB test sang production) an toàn — mọi write đều là
 * upsert theo unique key + `$set` full-field (xem `bulkUpsertObservations`/`bulkUpsertPublished`).
 *
 * Chạy: `pnpm --filter @megawin/resultfeed-application import:historical [game] [file]`.
 * `[game]` OPTIONAL — bỏ qua (hoặc truyền `all`) ⇒ import TẤT CẢ 7 game tuần tự; truyền đúng 1
 * giá trị trong `keno|bingo18|lotto535|mega645|power655|max3d|max3dpro` ⇒ chỉ import game đó.
 * File nguồn mặc định lấy từ `test/history-result/<name>.jsonl` (xem `GAME_FILES`) — truyền thêm
 * `[file]` (chỉ áp dụng khi chọn ĐÚNG 1 game) để trỏ file khác (VD file lịch sử thật ở đường dẫn
 * khác ngoài fixture test).
 */

import type { ConsensusAgreement, ObservationDoc } from "@megawin/resultfeed/entities";
import {
  ConflictPolicy,
  IntrinsicState,
  ResultFeedGameKey,
  ResultFeedProviderId,
  ResultFeedSourceId,
  SourceRole,
  SubmissionState,
} from "@megawin/resultfeed/entities";
import { canonicalizeNumbers, checkIntrinsic, computeDisplayHash, computePayoutHash } from "@megawin/resultfeed/rules";
import { Binary } from "mongodb";

import { ConsensusRepository } from "../infras/repos/consensus-repo";
import { ObservationRepository } from "../infras/repos/observation-repo";
import { SourceRepository } from "../infras/repos/source-repo";
import { SubmissionRepository } from "../infras/repos/submission-repo";
import type { Max3dRawRow } from "../sources/historical-import/parse-max3d";
import { parseMax3dRow } from "../sources/historical-import/parse-max3d";
import type { SimpleNumbersRawRow } from "../sources/historical-import/parse-simple-numbers";
import { parseSimpleNumbersRow } from "../sources/historical-import/parse-simple-numbers";
import { parsedObservationSchema } from "../sources/types";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";

// ── Load .env.test.local (đọc thôi, KHÔNG tạo/ghi đè — quy tắc no-env-file-modification) ──
// Script chạy độc lập qua `tsx`, KHÔNG đi qua `vite.loadEnv()` như `vitest.config.ts` — phải
// tự nạp file env. Node ≥ 20.6 có `process.loadEnvFile` built-in, không cần thêm dependency
// `dotenv`. Bỏ qua lỗi "file not found" — CI/production có thể set env trực tiếp, không qua file.
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
      "(xem khai báo mẫu ở .env.test.example §3.1.1). KHÔNG dùng chung MONGODB_URI của vitest.",
  );
}
process.env.MONGODB_URI = IMPORT_MONGODB_URI;

// ── Cấu hình ───────────────────────────────────────────────────────────────
const PARSER_VERSION = "historical-import-v1";
const BATCH_SIZE = 500;

const DEFAULT_DATA_DIR = path.resolve(import.meta.dirname, "../../test/history-result");
const LOG_DIR = path.resolve(import.meta.dirname, "../../import-logs");

/** File JSONL mặc định theo game — khớp tên file đã có trong `test/history-result/`. */
const GAME_FILES: Record<ResultFeedGameKey, string> = {
  [ResultFeedGameKey.Keno]: "keno.jsonl",
  [ResultFeedGameKey.Bingo18]: "bingo18.jsonl",
  [ResultFeedGameKey.Lotto535]: "lotto535.jsonl",
  [ResultFeedGameKey.Mega645]: "mega645.jsonl",
  [ResultFeedGameKey.Power655]: "power655.jsonl",
  [ResultFeedGameKey.Max3d]: "3d.jsonl",
  [ResultFeedGameKey.Max3dpro]: "3d_pro.jsonl",
};

/** Game nào dùng parser "số phẳng" (`parse-simple-numbers.ts`) — còn lại (Max3d/Max3dpro) dùng `parseMax3dRow`. */
const SIMPLE_NUMBER_GAMES = new Set<ResultFeedGameKey>([
  ResultFeedGameKey.Keno,
  ResultFeedGameKey.Bingo18,
  ResultFeedGameKey.Lotto535,
  ResultFeedGameKey.Mega645,
  ResultFeedGameKey.Power655,
]);

type ObservationInput = Omit<ObservationDoc, "_id" | "createdAt" | "updatedAt">;
interface ConsensusInput {
  gameKey: ResultFeedGameKey;
  drawPeriod: string;
  drawDateSource: string;
  numbers: string[];
  payoutHash: string;
  displayHash: string;
  agreeing: ConsensusAgreement[];
  appliedPolicy: ConflictPolicy;
}

interface ImportStats {
  totalLines: number;
  parsed: number;
  intrinsicPassed: number;
  intrinsicFailed: number;
  errored: number;
}

/**
 * Đảm bảo có `SourceDoc` cho `historical-import` — idempotent, chạy 1 lần đầu script (mọi
 * game). `isEnabled: false` — đây KHÔNG phải nguồn fetch sống (không có `SourceAdapter`
 * đăng ký trong `sources/registry.ts` cho `sourceId` này), chỉ tồn tại để observation/
 * consensus lịch sử có 1 nguồn `Authoritative` hợp lệ để trỏ tới.
 */
async function ensureHistoricalSource(sourceRepo: SourceRepository): Promise<void> {
  await sourceRepo.upsertBySourceId(ResultFeedSourceId.HistoricalImport, {
    name: "Historical Import (JSONL)",
    baseUrl: "file://historical-import",
    role: SourceRole.Authoritative,
    trustWeight: 100,
    gameKeys: Object.values(ResultFeedGameKey),
    isEnabled: false,
    providerId: ResultFeedProviderId.HistoricalImport,
    parserVersion: PARSER_VERSION,
    requiresRender: false,
    minIntervalMs: 0,
  });
}

/**
 * Tạo pseudo-submission DUY NHẤT cho 1 file (không phải 1 submission/dòng) — `contentHash`
 * tính từ `fileName` (KHÔNG từ thời điểm import) để idempotent: chạy lại script trên CÙNG
 * file luôn khớp submission cũ (`$inc seenCount`, không sinh doc mới).
 */
async function ensureFileSubmission(
  submissionRepo: SubmissionRepository,
  gameKey: ResultFeedGameKey,
  fileName: string,
): Promise<string> {
  const metadata = { source: "historical-import", fileName };
  const metadataJson = JSON.stringify(metadata);
  const contentHash = createHash("sha256").update(metadataJson).digest("hex");
  return await submissionRepo.upsertSubmission({
    sourceId: ResultFeedSourceId.HistoricalImport,
    gameKey,
    requestUrl: `file://${fileName}`,
    httpStatus: 200,
    contentType: "application/x-ndjson",
    bodyGz: new Binary(gzipSync(Buffer.from(metadataJson))),
    contentHash,
    bodyBytes: Buffer.byteLength(metadataJson),
    providerId: ResultFeedProviderId.HistoricalImport,
    elapsedMs: 0,
    state: SubmissionState.Parsed,
    failureReason: null,
    fetchedAt: new Date(),
  });
}

/** Ghi 1 dòng lỗi vào file log riêng theo game — KHÔNG throw, không chặn batch còn lại. */
async function appendErrorLog(gameKey: ResultFeedGameKey, lineNo: number, raw: string, reason: string): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `${gameKey}-errors.log`);
  await appendFile(logPath, `[line ${lineNo}] ${reason} | raw=${raw}\n`, "utf8");
}

/** Parse 1 dòng thô JSONL theo game — throw khi hỏng, caller bắt và ghi log lỗi. */
function parseRawLine(gameKey: ResultFeedGameKey, raw: string) {
  const json: unknown = JSON.parse(raw);
  if (SIMPLE_NUMBER_GAMES.has(gameKey)) {
    return parseSimpleNumbersRow(
      gameKey as
        | typeof ResultFeedGameKey.Keno
        | typeof ResultFeedGameKey.Bingo18
        | typeof ResultFeedGameKey.Lotto535
        | typeof ResultFeedGameKey.Mega645
        | typeof ResultFeedGameKey.Power655,
      json as SimpleNumbersRawRow,
    );
  }
  return parseMax3dRow(json as Max3dRawRow);
}

async function flushBatch(
  gameKey: ResultFeedGameKey,
  observationRepo: ObservationRepository,
  consensusRepo: ConsensusRepository,
  observationBuffer: ObservationInput[],
  consensusBuffer: ConsensusInput[],
): Promise<void> {
  if (observationBuffer.length === 0) {
    return;
  }
  await observationRepo.bulkUpsertObservations(observationBuffer);
  observationBuffer.length = 0;

  if (consensusBuffer.length === 0) {
    return;
  }
  // `bulkWrite` không trả `_id` cho doc đã tồn tại (chỉ có ở `upsertedIds` khi insert mới) —
  // query lại theo khoá để lấy `observationId` THẬT, điền vào `agreeing[0]` trước khi publish.
  const drawPeriods = consensusBuffer.map((c) => c.drawPeriod);
  const written = await observationRepo.findByKeysForImport(
    ResultFeedSourceId.HistoricalImport,
    gameKey,
    PARSER_VERSION,
    drawPeriods,
  );
  const idByPeriod = new Map(written.map((o) => [o.drawPeriod, o.id]));

  const readyToPublish: ConsensusInput[] = [];
  for (const consensus of consensusBuffer) {
    const observationId = idByPeriod.get(consensus.drawPeriod);
    if (!observationId) {
      // Lý thuyết không xảy ra (vừa upsert xong) — bỏ qua, KHÔNG publish thiếu observationId.
      continue;
    }
    const [agreement] = consensus.agreeing;
    if (!agreement) {
      continue;
    }
    readyToPublish.push({ ...consensus, agreeing: [{ ...agreement, observationId }] });
  }
  await consensusRepo.bulkUpsertPublished(readyToPublish);
  consensusBuffer.length = 0;
}

/** Import 1 file JSONL cho đúng 1 game — streaming readline, batch `BATCH_SIZE` dòng/lần ghi. */
async function importFile(gameKey: ResultFeedGameKey, filePath: string): Promise<ImportStats> {
  const sourceRepo = new SourceRepository();
  const submissionRepo = new SubmissionRepository();
  const observationRepo = new ObservationRepository();
  const consensusRepo = new ConsensusRepository();

  await ensureHistoricalSource(sourceRepo);
  const submissionId = await ensureFileSubmission(submissionRepo, gameKey, path.basename(filePath));

  const stats: ImportStats = { totalLines: 0, parsed: 0, intrinsicPassed: 0, intrinsicFailed: 0, errored: 0 };
  const observationBuffer: ObservationInput[] = [];
  const consensusBuffer: ConsensusInput[] = [];

  const rl = createInterface({ input: createReadStream(filePath, "utf8"), crlfDelay: Number.POSITIVE_INFINITY });

  let lineNo = 0;
  for await (const line of rl) {
    lineNo += 1;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    stats.totalLines += 1;

    try {
      const parsedRaw = parseRawLine(gameKey, trimmed);
      const validated = parsedObservationSchema.parse(parsedRaw);
      stats.parsed += 1;

      const intrinsic = checkIntrinsic(gameKey, validated.numbersDisplay, validated.claimedChecksums);
      const numbersCanonical = canonicalizeNumbers(gameKey, validated.numbersDisplay);
      const payoutHash = computePayoutHash(gameKey, validated.drawPeriod, validated.numbersDisplay);
      const displayHash = computeDisplayHash(gameKey, validated.drawPeriod, validated.numbersDisplay);

      observationBuffer.push({
        sourceId: ResultFeedSourceId.HistoricalImport,
        gameKey,
        drawPeriod: validated.drawPeriod,
        drawDateSource: validated.drawDateSource,
        drawTimeSource: validated.drawTimeSource,
        numbersDisplay: validated.numbersDisplay,
        numbersCanonical,
        displayHash,
        payoutHash,
        claimedChecksums: validated.claimedChecksums,
        intrinsicState: intrinsic.state,
        intrinsicMismatch: intrinsic.mismatch,
        parserVersion: PARSER_VERSION,
        submissionId,
      });

      if (intrinsic.state === IntrinsicState.Failed) {
        stats.intrinsicFailed += 1;
        await appendErrorLog(gameKey, lineNo, trimmed, `intrinsic_failed: ${intrinsic.mismatch}`);
      } else {
        stats.intrinsicPassed += 1;
        consensusBuffer.push({
          gameKey,
          drawPeriod: validated.drawPeriod,
          drawDateSource: validated.drawDateSource,
          numbers: validated.numbersDisplay,
          payoutHash,
          displayHash,
          agreeing: [
            {
              sourceId: ResultFeedSourceId.HistoricalImport,
              observationId: "", // Điền lại giá trị thật ở `flushBatch` (query sau khi upsert observation).
              role: SourceRole.Authoritative,
              trustWeight: 100,
            },
          ],
          appliedPolicy: ConflictPolicy.HumanOnly,
        });
      }
    } catch (error) {
      stats.errored += 1;
      const reason = error instanceof Error ? error.message : String(error);
      await appendErrorLog(gameKey, lineNo, trimmed, reason);
      continue;
    }

    if (observationBuffer.length >= BATCH_SIZE) {
      await flushBatch(gameKey, observationRepo, consensusRepo, observationBuffer, consensusBuffer);
    }
  }
  await flushBatch(gameKey, observationRepo, consensusRepo, observationBuffer, consensusBuffer);

  return stats;
}

/**
 * Chuẩn hoá argv[2] thành danh sách game cần import.
 *
 * KHÔNG truyền (hoặc truyền `"all"`) ⇒ trả về TẤT CẢ 7 game — đây là hành vi mặc định khi chạy
 * `pnpm import:historical` không kèm argument, phục vụ use-case "nạp lại toàn bộ lịch sử" (VD
 * migrate DB test → production, xem JSDoc đầu file). Truyền đúng 1 giá trị hợp lệ ⇒ chỉ import
 * game đó — dùng khi chỉ cần nạp/sửa lại 1 game cụ thể, không muốn quét lại 6 game còn lại.
 *
 * @throws {Error} Khi argument có giá trị nhưng không khớp bất kỳ `ResultFeedGameKey` nào.
 */
function resolveGamesToImport(gameArg: string | undefined): ResultFeedGameKey[] {
  if (!gameArg || gameArg === "all") {
    return Object.values(ResultFeedGameKey);
  }
  const validGameKeys = Object.values(ResultFeedGameKey);
  if (!validGameKeys.includes(gameArg as ResultFeedGameKey)) {
    throw new Error(
      `Game "${gameArg}" không hợp lệ. Dùng: pnpm import:historical [${validGameKeys.join("|")}|all] [file] ` +
        `(bỏ trống = import tất cả).`,
    );
  }
  return [gameArg as ResultFeedGameKey];
}

async function main(): Promise<void> {
  const [gameArg, fileArg] = process.argv.slice(2);
  const games = resolveGamesToImport(gameArg);

  for (const gameKey of games) {
    const fileName = GAME_FILES[gameKey];
    const filePath = fileArg && games.length === 1 ? path.resolve(fileArg) : path.join(DEFAULT_DATA_DIR, fileName);

    console.log(`[import-historical] Bắt đầu ${gameKey} — file "${filePath}"`);
    const stats = await importFile(gameKey, filePath);
    console.log(`[import-historical] Xong ${gameKey}:`, stats);
  }

  // Đóng connection Mongo để process tự thoát — không cần process.exit() thủ công.
  const client = await new SourceRepository().getClient();
  await client.close();
}

main().catch((error) => {
  console.error("[import-historical] Lỗi không xử lý được:", error);
  process.exitCode = 1;
});
