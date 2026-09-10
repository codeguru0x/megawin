/**
 * Ops Hub — Mô hình trạng thái dẫn xuất (2 trục độc lập + health).
 *
 * Nguồn chân lý: `ops-hub-page-layout.guideline.md` §1. TOÀN BỘ logic phân loại 1 kỳ quay
 * (đang bán / hết giờ cược / chặng pipeline / có bị treo không) sống DUY NHẤT ở file này.
 * Cấm rải `if (status === ...)` ở component — 2 chỗ dẫn xuất là 2 chỗ sẽ lệch nhau.
 */

import type { OpsHubDrawRow, OpsHubThresholds } from "@megawin/game-bingo18-application/use-cases/operations";
import { DrawStatus } from "@megawin/game-core/entities";
import { MIN_SALES_WINDOW_SECONDS } from "@megawin/game-core/utils";
import { formatDurationCompact } from "@megawin/shared/utils";

// ─── Trục A — SaleGate ─────────────────────────────────────────────────────────

/** Trục A — cổng bán hàng. Quyết định kỳ thuộc bề mặt UI nào (guideline §0.3) và action nào khả dụng. */
export const SaleGate = {
  /** Đang nhận cược: `salesOpen && now < closeAt`. Hàng trăm kỳ ở đây. */
  Open: "open",
  /** ⚠️ CHƯA TỪNG mở bán mà vẫn còn cửa sổ bán: `scheduled && now < closeAt`. Cứu được — action MỞ BÁN. */
  PendingOpen: "pending_open",
  /** ⚠️ ĐÃ mở rồi bị đóng tay / huỷ trước giờ. `salesClosed` mở lại được; `voiding`/`void` thì không. */
  Halted: "halted",
  /** Hết giờ cược — khoá cứng `closeAt` đã qua. Vùng vận hành. */
  Ended: "ended",
} as const;
export type SaleGate = (typeof SaleGate)[keyof typeof SaleGate];

// ─── Trục B — OpsStage ─────────────────────────────────────────────────────────

/** Trục B — chặng pipeline vận hành. Chỉ đầy đủ ý nghĩa khi gate ≠ Open. */
export const OpsStage = {
  /** Đang bán, chưa có gì để làm. Quan tâm duy nhất: tiền. */
  Selling: "selling",
  /** Hết giờ cược, status vẫn salesOpen — CHỜ ĐÓNG BÁN (batch). Bình thường. */
  PendingClose: "pending_close",
  /** Đã đóng bán, chưa tới giờ quay. Cửa sổ CỰC NGẮN (≤60s Keno / ≤30s Bingo18). */
  AwaitingDraw: "awaiting_draw",
  /** Đã qua giờ quay, chưa có kết quả. */
  AwaitingResult: "awaiting_result",
  /** Có kết quả, chưa kết sổ. Tiền đang treo. */
  AwaitingSettle: "awaiting_settle",
  /** Đang chạy kết sổ. */
  Settling: "settling",
  /** Đang chạy huỷ kỳ. */
  Voiding: "voiding",
  /** ⚠️ Kết quả sửa SAU khi đã kết sổ → phải kết sổ lại. */
  NeedsResettle: "needs_resettle",
  /** ⚠️ QUÁ GIỜ MỞ BÁN: `scheduled` đã qua `closeAt` — chưa từng mở bán, không cứu được. Chỉ VOID. */
  NeverOpened: "never_opened",
} as const;
export type OpsStage = (typeof OpsStage)[keyof typeof OpsStage];

// ─── Cờ sức khoẻ ───────────────────────────────────────────────────────────────

/** Cờ sức khoẻ — chặng hiện tại đã kéo dài quá ngưỡng của CHÍNH chặng đó chưa. */
export const StageHealth = {
  Ok: "ok",
  Warn: "warn",
  Stuck: "stuck",
} as const;
export type StageHealth = (typeof StageHealth)[keyof typeof StageHealth];

/** Kết quả dẫn xuất — 3 trục độc lập + mốc tuổi + lý do (hiện ở inline expand p1-03). */
export interface DrawOpsState {
  gate: SaleGate;
  stage: OpsStage;
  health: StageHealth;
  /** Tuổi trong chặng (giây). `null` với `Selling` (không có nghĩa). */
  ageInStageSec: number | null;
  /** Giây còn lại tới `closeAt` — CHỈ có nghĩa với `PendingOpen`/`Halted`. */
  remainingSec: number | null;
  /** Vì sao ra `stage`/`health` này — chuỗi ngắn, hiện ở inline expand. */
  reason: string;
}

/** Timestamp của 1 dòng ĐÃ parse ra epoch ms — parse 1 lần, tái dùng cho mọi phép so (§5.1 điểm 1). */
export interface ParsedDrawTimestamps {
  drawTimeMs: number;
  closeAtMs: number;
  openAtMs: number | null;
  publishedAtMs: number | null;
  settledAtMs: number | null;
  updatedAtMs: number;
}

/**
 * Parse 5 field ISO string của 1 dòng ra epoch ms — gọi ĐÚNG 1 LẦN mỗi dòng mỗi tick trong
 * `useMemo` dựng `rows` (không gọi lại trong `deriveDrawState`). 200 dòng × 5 field parse lại
 * mỗi lần derive = 1000 lần `new Date().getTime()` mỗi tick — chi phí thật cho N ≈ 200.
 */
export function parseDrawTimestamps(row: OpsHubDrawRow): ParsedDrawTimestamps {
  return {
    drawTimeMs: Date.parse(row.drawTime),
    closeAtMs: Date.parse(row.closeAt),
    openAtMs: row.openAt ? Date.parse(row.openAt) : null,
    publishedAtMs: row.publishedAt ? Date.parse(row.publishedAt) : null,
    settledAtMs: row.settledAt ? Date.parse(row.settledAt) : null,
    updatedAtMs: Date.parse(row.updatedAt),
  };
}

// ─── Bước 1 — SaleGate (guideline §1.3, match đầu tiên thắng) ─────────────────

function deriveSaleGate(status: DrawStatus, nowMs: number, closeAtMs: number): SaleGate {
  // Chốt TRƯỚC mọi thứ khác: hết giờ cược là hết, bất kể status (guideline §1.3 bảng gate #1).
  if (nowMs >= closeAtMs) {
    return SaleGate.Ended;
  }
  switch (status) {
    case DrawStatus.SalesOpen:
      return SaleGate.Open;
    case DrawStatus.Scheduled:
      return SaleGate.PendingOpen;
    case DrawStatus.SalesClosed:
    case DrawStatus.Voiding:
    case DrawStatus.Void:
      return SaleGate.Halted;
    case DrawStatus.Published:
    case DrawStatus.Settling:
    case DrawStatus.Settled:
      // Phòng thủ: về lý thuyết không xảy ra khi `now < closeAt` (pipeline đã đi xa hơn cả lúc
      // còn nhận cược) — Hub chỉ query `DRAW_UNFINISHED_STATUSES` nên `Settled` không lọt vào,
      // nhưng exhaustive switch trên `DrawStatus` (Biome `useExhaustiveSwitchCases`) buộc handle
      // đủ 8 giá trị. Coi như "đã ngắt bán" để không hiện sai action Mở bán.
      return SaleGate.Halted;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

// ─── Bước 2 — OpsStage (guideline §1.3, KHÔNG nhận gate làm input) ────────────

function deriveOpsStage(
  status: DrawStatus,
  nowMs: number,
  closeAtMs: number,
  drawTimeMs: number,
  publishedAtMs: number | null,
  settledAtMs: number | null,
): OpsStage {
  switch (status) {
    case DrawStatus.SalesOpen:
      return nowMs < closeAtMs ? OpsStage.Selling : OpsStage.PendingClose;
    case DrawStatus.Scheduled:
      return nowMs < closeAtMs ? OpsStage.Selling : OpsStage.NeverOpened;
    case DrawStatus.SalesClosed:
      return nowMs >= drawTimeMs ? OpsStage.AwaitingResult : OpsStage.AwaitingDraw;
    case DrawStatus.Published:
      // KQ sửa SAU khi đã kết sổ (`publishedAt > settledAt`) → phải kết sổ lại. Điều kiện `>`
      // KHÔNG `>=`: bằng nhau nghĩa là kết sổ chạy đúng lúc publish, không phải sửa sau.
      return settledAtMs !== null && publishedAtMs !== null && publishedAtMs > settledAtMs
        ? OpsStage.NeedsResettle
        : OpsStage.AwaitingSettle;
    case DrawStatus.Settling:
      return OpsStage.Settling;
    case DrawStatus.Voiding:
      return OpsStage.Voiding;
    case DrawStatus.Settled:
      // Không xuất hiện trong Hub (`DRAW_UNFINISHED_STATUSES` loại status này) — nhánh phòng
      // thủ giữ switch exhaustive theo `DrawStatus`.
      return OpsStage.AwaitingSettle;
    case DrawStatus.Void:
      // Tương tự — không xuất hiện trong Hub, giữ để switch exhaustive.
      return OpsStage.Voiding;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

// ─── Bước 3 — health + ageInStage/remaining (guideline §1.3 bước 3, §8.3 ngưỡng per-chặng) ────

interface HealthResult {
  health: StageHealth;
  ageInStageSec: number | null;
  remainingSec: number | null;
  reason: string;
}

function secondsBetween(laterMs: number, earlierMs: number): number {
  return Math.max(0, Math.round((laterMs - earlierMs) / 1000));
}

/**
 * Mốc TUYỆT ĐỐI (epoch ms) khi kỳ bước vào chặng hiện tại — `null` khi chặng không có tuổi.
 *
 * Đây là NGUỒN CHÂN LÝ cho mọi counter đếm sống ("treo 3h21ph") trên trang Hub. Mọi component
 * cần neo `RelativeDuration` PHẢI gọi hàm này, **KHÔNG** tính `Date.now() - ageInStageSec * 1000`.
 *
 * Vì sao — bug ĐÃ ĐO ĐƯỢC trên UI thật (08/09, phát hiện qua CDP ở 2 chỗ độc lập): công thức trừ
 * kia trộn 2 nguồn khác nhịp. `Date.now()`/`getNowMs()` là đồng hồ SỐNG (đọc lại mỗi render) còn
 * `ageInStageSec` là ẢNH CHỤP, chỉ tính lại khi `deriveHubSummary` chạy (theo poll, không theo
 * giây). Mỗi render, mốc neo trượt về sau đúng bằng lượng thời gian đồng hồ đã chạy → **triệt
 * tiêu việc đếm**. Triệu chứng đo được: cột "Thời gian" bảng 5A ĐỨNG YÊN `3h17ph` suốt 90 giây
 * trong khi mốc "Công bố KQ" của CÙNG kỳ (neo timestamp tuyệt đối, đúng) đã tới `3h23ph` — lệch
 * 6 phút, và staff thấy CẢ HAI con số trong cùng một khung nhìn.
 *
 * Mốc ở đây khớp 1:1 với mốc {@link deriveHealth} dùng để tính `ageInStageSec` — đổi mốc ở đó thì
 * PHẢI đổi ở đây, nếu không UI sẽ hiện số khác con số đã dùng để phân loại `warn`/`stuck`.
 *
 * @param ts - Timestamp đã parse của kỳ.
 * @param stage - Chặng ĐÃ dẫn xuất (`deriveDrawOpsState().stage`).
 */
export function stageStartMs(ts: ParsedDrawTimestamps, stage: OpsStage): number | null {
  switch (stage) {
    // Mốc `closeAt` — tuổi tính từ lúc hết giờ nhận cược.
    case OpsStage.PendingClose:
    case OpsStage.AwaitingDraw:
    case OpsStage.NeverOpened:
      return ts.closeAtMs;
    // Mốc `drawTime` — đã tới giờ quay mà chưa có kết quả.
    case OpsStage.AwaitingResult:
      return ts.drawTimeMs;
    // Mốc `publishedAt` — tiền bắt đầu "treo" từ lúc có kết quả.
    case OpsStage.AwaitingSettle:
    case OpsStage.NeedsResettle:
      return ts.publishedAtMs;
    // `Settling`/`Voiding` không có timestamp riêng trên doc — `updatedAt` là mốc DUY NHẤT.
    case OpsStage.Settling:
    case OpsStage.Voiding:
      return ts.updatedAtMs;
    // Đang bán — "tuổi trong chặng" không có nghĩa vận hành (guideline §1.5).
    case OpsStage.Selling:
      return null;
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

function deriveHealth(
  gate: SaleGate,
  stage: OpsStage,
  nowMs: number,
  ts: ParsedDrawTimestamps,
  thresholds: OpsHubThresholds,
): HealthResult {
  // Gate PendingOpen/Halted: mốc là THỜI GIAN CÒN LẠI tới `closeAt`, không phải tuổi (guideline §1.3).
  //
  // ⚠️ Mọi `reason` trong file này BẮT BUỘC đi qua `formatDurationCompact` — KHÔNG nối
  // `${sec}s` thô. Trước p1-05 chuỗi này hiện nguyên "273299s" trên UI (bug §A2), staff
  // phải tự chia ra ngày/giờ.
  if (gate === SaleGate.PendingOpen || gate === SaleGate.Halted) {
    const remainingSec = Math.round((ts.closeAtMs - nowMs) / 1000);
    if (remainingSec < MIN_SALES_WINDOW_SECONDS) {
      return {
        health: StageHealth.Stuck,
        ageInStageSec: null,
        remainingSec,
        reason: `Còn ${formatDurationCompact(remainingSec)} là hết giờ cược — hãy mở bán ngay.`,
      };
    }
    if (remainingSec < 3 * MIN_SALES_WINDOW_SECONDS) {
      return {
        health: StageHealth.Warn,
        ageInStageSec: null,
        remainingSec,
        reason: `Còn ${formatDurationCompact(remainingSec)} trước khi hết giờ cược.`,
      };
    }
    return {
      health: StageHealth.Ok,
      ageInStageSec: null,
      remainingSec,
      reason: `Còn ${formatDurationCompact(remainingSec)} để mở bán, chưa gấp.`,
    };
  }

  // Gate Open: Selling không bao giờ stuck (guideline §1.5).
  if (gate === SaleGate.Open) {
    return {
      health: StageHealth.Ok,
      ageInStageSec: null,
      remainingSec: null,
      reason: "Đang bán, không áp dụng ngưỡng.",
    };
  }

  // Gate Ended — health theo NGƯỠNG RIÊNG của từng stage (guideline §8.3), KHÔNG dùng chung 1 stuckSec.
  switch (stage) {
    case OpsStage.PendingClose: {
      const ageInStageSec = secondsBetween(nowMs, ts.closeAtMs);
      if (ageInStageSec >= thresholds.pendingCloseStuckSec) {
        return {
          health: StageHealth.Stuck,
          ageInStageSec,
          remainingSec: null,
          reason: `Chờ đóng bán ${formatDurationCompact(ageInStageSec)} — vượt ngưỡng.`,
        };
      }
      if (ageInStageSec >= thresholds.pendingCloseWarnSec) {
        return {
          health: StageHealth.Warn,
          ageInStageSec,
          remainingSec: null,
          reason: `Chờ đóng bán ${formatDurationCompact(ageInStageSec)}.`,
        };
      }
      return {
        health: StageHealth.Ok,
        ageInStageSec,
        remainingSec: null,
        reason: "Chờ đóng bán theo batch — bình thường.",
      };
    }
    case OpsStage.AwaitingDraw: {
      // Cửa sổ ≤60s (Keno) / ≤30s (Bingo18) — không đặt ngưỡng riêng, luôn Ok.
      const ageInStageSec = secondsBetween(nowMs, ts.closeAtMs);
      return { health: StageHealth.Ok, ageInStageSec, remainingSec: null, reason: "Đã đóng bán, chờ tới giờ quay." };
    }
    case OpsStage.AwaitingResult: {
      const ageInStageSec = secondsBetween(nowMs, ts.drawTimeMs);
      if (ageInStageSec >= thresholds.awaitingResultStuckSec) {
        return {
          health: StageHealth.Stuck,
          ageInStageSec,
          remainingSec: null,
          reason: `Chưa có kết quả sau ${formatDurationCompact(ageInStageSec)} — treo.`,
        };
      }
      if (ageInStageSec >= thresholds.awaitingResultWarnSec) {
        return {
          health: StageHealth.Warn,
          ageInStageSec,
          remainingSec: null,
          reason: `Chưa có kết quả sau ${formatDurationCompact(ageInStageSec)}.`,
        };
      }
      return { health: StageHealth.Ok, ageInStageSec, remainingSec: null, reason: "Đang chờ quay kết quả." };
    }
    case OpsStage.AwaitingSettle: {
      // Mốc là `publishedAt` — lúc có kết quả, tiền bắt đầu "treo" từ đây.
      const ageInStageSec = ts.publishedAtMs !== null ? secondsBetween(nowMs, ts.publishedAtMs) : 0;
      if (ageInStageSec >= thresholds.awaitingSettleStuckSec) {
        return {
          health: StageHealth.Stuck,
          ageInStageSec,
          remainingSec: null,
          reason: `Treo kết sổ ${formatDurationCompact(ageInStageSec)} — tiền chưa trả.`,
        };
      }
      if (ageInStageSec >= thresholds.awaitingSettleWarnSec) {
        return {
          health: StageHealth.Warn,
          ageInStageSec,
          remainingSec: null,
          reason: `Chờ kết sổ ${formatDurationCompact(ageInStageSec)}.`,
        };
      }
      return { health: StageHealth.Ok, ageInStageSec, remainingSec: null, reason: "Có kết quả, chờ kết sổ." };
    }
    case OpsStage.Settling:
    case OpsStage.Voiding: {
      // Mốc `updatedAt` — 2 chặng này không có timestamp riêng.
      const ageInStageSec = secondsBetween(nowMs, ts.updatedAtMs);
      const label = stage === OpsStage.Settling ? "kết sổ" : "huỷ";
      if (ageInStageSec >= thresholds.processingStuckSec) {
        return {
          health: StageHealth.Stuck,
          ageInStageSec,
          remainingSec: null,
          reason: `Đang ${label} nhưng treo ${formatDurationCompact(ageInStageSec)}.`,
        };
      }
      return { health: StageHealth.Ok, ageInStageSec, remainingSec: null, reason: `Đang chạy ${label}.` };
    }
    case OpsStage.NeedsResettle: {
      const ageInStageSec = ts.publishedAtMs !== null ? secondsBetween(nowMs, ts.publishedAtMs) : 0;
      return {
        health: StageHealth.Stuck,
        ageInStageSec,
        remainingSec: null,
        reason: "Kết quả bị sửa SAU khi đã kết sổ — tiền đã trả có thể sai, cần kết sổ lại.",
      };
    }
    case OpsStage.NeverOpened: {
      const ageInStageSec = secondsBetween(nowMs, ts.closeAtMs);
      return {
        health: StageHealth.Stuck,
        ageInStageSec,
        remainingSec: null,
        reason: "Quá giờ mở bán — chưa từng mở bán và đã hết giờ cược. Không thể mở bán lại. Cần huỷ kỳ.",
      };
    }
    case OpsStage.Selling:
      // Không xảy ra khi gate = Ended (Selling chỉ tồn tại khi gate = Open) — nhánh phòng thủ.
      return { health: StageHealth.Ok, ageInStageSec: null, remainingSec: null, reason: "—" };
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

/**
 * Dẫn xuất trạng thái vận hành của 1 kỳ — HÀM PURE DUY NHẤT của cả trang Ops Hub.
 *
 * Implement ĐÚNG bảng dẫn xuất guideline §1.3, theo đúng thứ tự (match đầu tiên thắng). Cấm
 * rải `if (status === ...)` trong component: hai chỗ dẫn xuất là hai chỗ sẽ lệch nhau.
 *
 * `gate` và `stage` tính ĐỘC LẬP — hàm stage KHÔNG nhận `gate` làm input (guideline §1.3 điểm 1).
 * Nhờ vậy test được từng bảng riêng, không có thứ tự phụ thuộc ngầm.
 *
 * @param row - Dòng raw từ snapshot (chỉ cần `status`, các field thời gian đã parse ở `ts`).
 * @param ts - Timestamp đã parse epoch ms — xem {@link parseDrawTimestamps}, parse 1 lần/dòng/tick.
 * @param nowMs - Giờ SERVER đã hiệu chỉnh (`Date.now() + clockOffsetMs`), KHÔNG phải `Date.now()`
 *   thô. Đây là tham số dễ truyền sai nhất và sai thì im lặng — xem `use-hub-context.tsx` §5.2.
 * @param thresholds - Ngưỡng per-chặng từ `OpsHubSnapshotOutput.thresholds` (server config).
 */
export function deriveDrawState(
  row: Pick<OpsHubDrawRow, "status">,
  ts: ParsedDrawTimestamps,
  nowMs: number,
  thresholds: OpsHubThresholds,
): DrawOpsState {
  const gate = deriveSaleGate(row.status, nowMs, ts.closeAtMs);
  const stage = deriveOpsStage(row.status, nowMs, ts.closeAtMs, ts.drawTimeMs, ts.publishedAtMs, ts.settledAtMs);
  const { health, ageInStageSec, remainingSec, reason } = deriveHealth(gate, stage, nowMs, ts, thresholds);

  return { gate, stage, health, ageInStageSec, remainingSec, reason };
}
