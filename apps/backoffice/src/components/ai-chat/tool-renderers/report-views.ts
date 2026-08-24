"use client";

/**
 * AI Chat — spec hiển thị cho các tool trả dữ liệu báo cáo (tầng 1, xem `view-spec.ts`).
 *
 * Mỗi tool ~12 dòng khai báo thay cho ~150 dòng TSX. Thêm tool mới: khai spec ở đây + map vào
 * `toolViewSpecs` trong `registry.tsx`. KHÔNG viết component mới trừ khi cần chart/interaction
 * đặc thù (lúc đó dùng tầng 2 — `toolRenderers`).
 *
 * ⚠️ TYPE PHẢI LÀ `WireType<...>`, KHÔNG phải DTO gốc: output đi qua `serializeDates()` ở biên
 * tool (`@megawin/shared/utils`) nên mọi `Date` đã thành ISO string lúc tới client. Khai DTO gốc
 * sẽ nói `snapshotAt: Date` trong khi runtime là `string` — type đúng nhưng SAI thực tế.
 */

import type { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS, getGameLabel } from "@megawin/game-core/labels";
import type { DailyOverviewRow, GamePeriodRow, GameSummaryRow } from "@megawin/game-core-application/repos";
import type {
  GetDailyOverviewOutput,
  GetGamePeriodTrendOutput,
  GetGameSummaryOutput,
  GetSystemOutstandingOutput,
} from "@megawin/game-core-application/use-cases/reports";
import type { WireType } from "@megawin/shared/types";
import { FinancialPeriod } from "@megawin/shared/utils";

import { getGameHex } from "@/lib/game-colors";
import type { GetGameConfigOutput, GetGameJackpotOutput } from "@/server/ai";
import type { GetDrawSettleReportDispatchOutput, ReportDispatchMeta } from "@/server/ai/reports/types";

import { CellFormat } from "./format-cell";
import { toConfigItemDisplayRow } from "./format-config-value";
import { defineToolView } from "./view-spec";

/**
 * `GetDailyOverviewOutput.data` là union: dạng tổng hợp theo ngày (`DailyOverviewRow`) hoặc raw
 * doc theo game khi use-case nhận `input.date`. Narrow bằng field đặc trưng `financialDate` —
 * chỉ dạng tổng hợp có field này.
 */
function isDailyOverviewRows(rows: GetDailyOverviewOutput["data"]): rows is DailyOverviewRow[] {
  const first = rows.at(0);
  return first === undefined || "financialDate" in first;
}

/** `getFinancialDailyOverview` — bảng theo ngày + tổng GGR/trả thưởng/lợi nhuận. */
export const dailyOverviewView = defineToolView<WireType<GetDailyOverviewOutput>, DailyOverviewRow>({
  select: (output) => (isDailyOverviewRows(output.data) ? output.data : null),
  view: {
    kind: "table",
    title: "Tổng quan tài chính theo ngày",
    totals: [
      { key: "ggr", label: "GGR" },
      { key: "totalPayout", label: "Trả thưởng" },
      { key: "netProfit", label: "Lợi nhuận ròng", signed: true },
    ],
    columns: [
      { key: "financialDate", label: "Ngày", format: CellFormat.Date },
      { key: "ggr", label: "GGR", format: CellFormat.Number },
      { key: "netProfit", label: "Lợi nhuận", format: CellFormat.Number, signed: true },
    ],
    link: {
      label: "Mở báo cáo tài chính",
      href: (rows) => {
        // KHÔNG dùng rows.at(0)/at(-1): use-case sắp theo ngày GIẢM DẦN nên first/last sẽ tạo
        // `from > to` và trang báo cáo trả rỗng. Bug này có trong card bespoke trước đây, lộ ra
        // khi đo link thật lúc verify (p0-04 §4.11). Lấy min/max mới đúng, không phụ thuộc thứ tự.
        let from = rows.at(0)?.financialDate;
        let to = from;
        for (const row of rows) {
          if (from === undefined || row.financialDate < from) {
            from = row.financialDate;
          }
          if (to === undefined || row.financialDate > to) {
            to = row.financialDate;
          }
        }
        return from !== undefined && to !== undefined
          ? `/reports/settle?tab=daily&from=${from}&to=${to}`
          : "/reports/settle";
      },
    },
    empty: "Không có dữ liệu tài chính trong khoảng ngày này.",
  },
});

/**
 * Mã game trong DB (`"power655"`) → tên hiển thị (`"Power 6/55"`), dùng làm `ChartOverride.xLabel`.
 *
 * Ép kiểu tại ĐÂY (1 chỗ) vì `xLabel` nhận `string` — recharts đưa cho tick/legend/tooltip formatter
 * giá trị thô, không giữ kiểu `GameProduct`. `getGameLabel` tự fallback về chính key khi không khớp
 * enum, nên mã lạ vẫn hiện nguyên văn thay vì rỗng.
 */
const gameProductLabel = (value: string): string => getGameLabel(value as GameProduct);

/** Nhãn độ chia kỳ dùng trong tiêu đề card `getFinancialTrend` ("… theo tháng"). */
const PERIOD_LABELS: Record<FinancialPeriod, string> = {
  [FinancialPeriod.Day]: "ngày",
  [FinancialPeriod.Week]: "tuần",
  [FinancialPeriod.Month]: "tháng",
};

/**
 * 1 dòng hiển thị của `getFinancialTrend` — `GamePeriodRow` + 2 nhãn lấy từ `meta`.
 *
 * `periodLabel`/`gameLabel` là HẰNG SỐ cho mọi dòng, chỉ tồn tại để `titleFrom` dựng được tiêu đề
 * (xem JSDoc `financialTrendView`) — KHÔNG hiển thị thành cột.
 */
interface TrendDisplayRow extends GamePeriodRow {
  periodLabel: string;
  gameLabel: string;
}

/** `getFinancialByGame` — bảng theo game, sắp theo thứ tự use-case trả về. */
export const gameSummaryView = defineToolView<WireType<GetGameSummaryOutput>, GameSummaryRow>({
  select: (output) => output.data,
  view: {
    kind: "table",
    title: "Tài chính theo game",
    totals: [
      { key: "totalStake", label: "Tiền cược" },
      { key: "ggr", label: "GGR" },
      { key: "netProfit", label: "Lợi nhuận ròng", signed: true },
    ],
    columns: [
      { key: "gameProduct", label: "Game" },
      { key: "ggr", label: "GGR", format: CellFormat.Number },
      { key: "netProfit", label: "Lợi nhuận", format: CellFormat.Number, signed: true },
    ],
    link: { label: "Mở báo cáo tài chính", href: () => "/reports/settle?tab=by-game" },
    empty: "Không có dữ liệu game trong khoảng ngày này.",
  },
  // So sánh giữa các game phải dùng ĐÚNG màu brand của game (đồng nhất với dashboard/reports),
  // không phải palette `--chart-1..5` chung — xem `chart-inference.ts` §`ChartOverride.rowColor`.
  // `xLabel`: bảng/chart phải gọi game bằng tên người dùng biết (`Power 6/55`), không phải mã kỹ
  // thuật trong DB (`power655`) — feedback 24/08.
  chart: { rowColor: (row) => getGameHex(row.gameProduct), xLabel: gameProductLabel },
});

/**
 * `getFinancialTrend` — chuỗi thời gian, 1 dòng = 1 kỳ (ngày/tuần/tháng), có thể chỉ 1 game.
 *
 * `titleFrom` gần như BẮT BUỘC ở đây: cùng một tool trả "Keno theo tháng" và "toàn hệ thống theo
 * tuần", mà dòng dữ liệu chỉ có khoá kỳ (`"2026-06"`) — tiêu đề tĩnh sẽ khiến hai câu trả lời khác
 * hẳn nhau hiện cùng một nhãn. Nhưng `TitleFrom` chỉ nhận `rows`, còn game/độ chia nằm ở `meta`,
 * nên `select` gắn `periodLabel`/`gameLabel` vào từng dòng (hằng số cho mọi dòng) để dựng nhãn.
 *
 * Hai field nhãn đó KHÔNG có trong `columns`: chúng chỉ để dựng tiêu đề. Nếu để chúng lộ ra bảng
 * thì mỗi dòng lặp lại cùng một giá trị, và tệ hơn — `chart-inference.ts` thấy thêm cột phân loại
 * và có thể chọn nó làm trục X (mọi dòng cùng giá trị ⇒ biểu đồ 1 cột). Vì lý do đó `chart.xLabel`
 * ở đây KHÔNG map tên game: trục X là kỳ thời gian, không phải game.
 */
export const financialTrendView = defineToolView<WireType<GetGamePeriodTrendOutput>, TrendDisplayRow>({
  select: (output) =>
    output.data.map((row) => ({
      ...row,
      periodLabel: PERIOD_LABELS[output.meta.period],
      gameLabel: output.meta.gameLabel ?? "toàn hệ thống",
    })),
  view: {
    kind: "table",
    title: "Tài chính theo kỳ",
    titleFrom: (rows) => {
      const first = rows[0];
      return first === undefined ? "Tài chính theo kỳ" : `Tài chính ${first.gameLabel} theo ${first.periodLabel}`;
    },
    // Khoảng dài chia theo ngày có thể ra ~180 dòng — mặc định 7 quá ít để thấy hình dạng chuỗi,
    // nhưng vẫn phải chặn để card không đẩy hết hội thoại xuống dưới.
    maxRows: 14,
    totals: [
      { key: "totalStake", label: "Tiền cược" },
      { key: "ggr", label: "GGR" },
      { key: "netProfit", label: "Lợi nhuận ròng", signed: true },
    ],
    columns: [
      // KHÔNG dùng `CellFormat.Date`: khoá kỳ có thể là `YYYY-MM` (tháng), formatter ngày sẽ hiểu
      // sai. Biểu đồ đã tự nhận dạng mốc thời gian qua `chart-format.ts`.
      { key: "period", label: "Kỳ", alignRight: false },
      { key: "totalStake", label: "Tiền cược", format: CellFormat.Number },
      { key: "netProfit", label: "Lợi nhuận", format: CellFormat.Number, signed: true },
    ],
    link: { label: "Mở báo cáo tài chính", href: () => "/reports/settle?tab=daily" },
    empty: "Không có dữ liệu tài chính trong khoảng này.",
  },
});

/**
 * `getSystemOutstanding` — kỳ quay chờ settle. Row type là `WireType<...>` vì entity gốc có
 * `snapshotAt`/`updatedAt` kiểu `Date` (đã thành ISO string sau `serializeDates`).
 */
export const systemOutstandingView = defineToolView<
  WireType<GetSystemOutstandingOutput>,
  WireType<GetSystemOutstandingOutput>["data"][number]
>({
  select: (output) => output.data,
  view: {
    kind: "table",
    title: "Kỳ quay đang chờ settle",
    totals: [
      { key: "activeDrawCount", label: "Kỳ chờ", format: CellFormat.Number },
      { key: "totalEntryCount", label: "Vé pending", format: CellFormat.Number },
      { key: "totalOutstandingStake", label: "Tiền cược treo" },
    ],
    columns: [
      { key: "gameProduct", label: "Game" },
      { key: "activeDrawCount", label: "Kỳ chờ", format: CellFormat.Number },
      { key: "totalOutstandingStake", label: "Cược treo", format: CellFormat.Number },
    ],
    link: { label: "Mở báo cáo kỳ chờ settle", href: () => "/reports/outstanding" },
    empty: "Hiện không có kỳ quay nào đang chờ settle.",
  },
  // Cùng lý do với `gameSummaryView` — so sánh chéo game phải nhất quán màu brand và tên game.
  chart: { rowColor: (row) => getGameHex(row.gameProduct), xLabel: gameProductLabel },
});

/** 1 dòng hiển thị của `getGameConfig` — `game`/`gameLabel` chỉ dùng dựng href + tiêu đề, không hiện trên bảng. */
interface GameConfigDisplayRow {
  game: GameProduct;
  gameLabel: string;
  label: string;
  displayValue: string;
  note: string;
}

/**
 * `getGameConfig` — bảng 3 cột Nhãn/Giá trị/Ghi chú (p1-02 §3.6). Dòng đầu luôn là
 * `configVersion`/`updatedAt` — staff là lớp kiểm cuối cho số cũ (§3.5 lớp 3), phải thấy được
 * mốc này mà không cần hỏi lại model. `maxRows` nâng lên (bảng giải 1 pick size Keno + payoutCaps
 * có thể ~25-30 dòng, cao hơn hẳn mặc định 7 của báo cáo tài chính).
 *
 * `titleFrom` nêu TÊN GAME, và nó gần như BẮT BUỘC với tool này: `getGameConfig` gọi 1 lần/game
 * nên câu hỏi so sánh cross-game tạo ra nhiều dòng cùng lúc, mà tiêu đề CHÍNH LÀ nhãn dòng gạch
 * đóng sẵn (`ToolResultLine`) ⇒ tiêu đề tĩnh "Cấu hình game" biến hội thoại thành 7 dòng chữ giống
 * hệt nhau, không nói được gì (thấy thật 17/08).
 *
 * Link trỏ trang CẤU HÌNH (không phải báo cáo) nên nhãn phải nói đúng thế.
 */
export const gameConfigView = defineToolView<GetGameConfigOutput, GameConfigDisplayRow>({
  select: (output) => {
    const { meta, items } = output;
    // `updatedAt` optional (xem `GameConfigMeta`) — thiếu thì chỉ ghi mốc đọc, không in "undefined".
    const readAt = `đọc lúc ${meta.fetchedAt.slice(0, 16).replace("T", " ")}`;
    const identity = { game: meta.game, gameLabel: meta.gameLabel };
    const metaRow: GameConfigDisplayRow = {
      ...identity,
      label: "Phiên bản cấu hình",
      displayValue: `v${meta.configVersion}`,
      note: meta.updatedAt === undefined ? readAt : `Cập nhật lúc ${meta.updatedAt.slice(0, 10)} · ${readAt}`,
    };
    return [metaRow, ...items.map((item) => ({ ...identity, ...toConfigItemDisplayRow(item) }))];
  },
  view: {
    kind: "table",
    title: "Cấu hình game",
    // `gameLabel` từ `GAME_LABELS` (use-case đã set) — KHÔNG map lại tên game ở tầng UI.
    titleFrom: (rows) => `Cấu hình ${rows[0]?.gameLabel ?? "game"}`,
    maxRows: 40,
    columns: [
      { key: "label", label: "Mục", alignRight: false },
      { key: "displayValue", label: "Giá trị", alignRight: false },
      { key: "note", label: "Ghi chú", alignRight: false },
    ],
    link: {
      label: "Mở trang cấu hình game",
      href: (rows) => (rows.at(0) !== undefined ? `/games/${rows[0]?.game}/config/game` : "/dashboard"),
    },
    empty: "Không lấy được cấu hình cho game này.",
  },
});

/** 1 dòng hiển thị của `getGameJackpot` — gộp nhiều khối (Power 6/55 = 2 khối JP1/JP2). */
interface GameJackpotDisplayRow {
  gameLabel: string;
  label: string;
  displayValue: string;
  note: string;
}

/**
 * `getGameJackpot` — bảng 4 cột Game/Mục/Giá trị/Ghi chú, gộp phẳng mọi khối trong `blocks`.
 * `gameLabel` phân biệt Power 6/55 Jackpot 1 vs Jackpot 2 (đã set ở use-case, xem
 * `get-game-jackpot.ts`) — trả gộp 1 số là lỗi nghiệp vụ (§3.4).
 */
export const gameJackpotView = defineToolView<GetGameJackpotOutput, GameJackpotDisplayRow>({
  select: (output) =>
    output.blocks.flatMap((block) =>
      block.items.map((item) => ({ gameLabel: block.meta.gameLabel, ...toConfigItemDisplayRow(item) })),
    ),
  view: {
    kind: "table",
    title: "Jackpot đang tích luỹ",
    maxRows: 20,
    columns: [
      { key: "gameLabel", label: "Game" },
      { key: "label", label: "Mục" },
      { key: "displayValue", label: "Giá trị" },
      { key: "note", label: "Ghi chú" },
    ],
    link: { label: "Mở dashboard", href: () => "/dashboard" },
    empty: "Không lấy được số jackpot hiện tại.",
  },
});

/**
 * 1 dòng report settle THÔ — chỉ khai field cần đọc, KHÔNG import type cụ thể của 7 game khác
 * nhau. Dispatcher trả `result: unknown` có chủ đích (RAW passthrough, xem
 * `get-draw-settle-report.ts`) vì `SettleDrawReport`/`SettleTenantReport` là 7 type riêng theo
 * game (dù cùng field) — spec chỉ đọc field CHUNG, không cast về type cụ thể nào.
 */
interface RawSettleReportRow {
  drawId?: unknown;
  tenantId?: unknown;
  financialDate?: unknown;
  entryCount?: unknown;
  totalStake?: unknown;
  ggr?: unknown;
  netProfit?: unknown;
}

/** 1 dòng hiển thị của `getDrawSettleReport` — gộp 2 nhánh (danh sách kỳ / breakdown đại lý). */
interface SettleReportDisplayRow {
  game: GameProduct;
  from: string;
  to: string;
  /** `true` khi đây là breakdown theo đại lý của 1 kỳ (dispatcher nhận `drawId`). */
  isTenantBreakdown: boolean;
  /** `drawId` (danh sách kỳ) hoặc `tenantId` (breakdown đại lý) — 2 nhánh dùng chung 1 cột. */
  groupLabel: string;
  financialDate: string;
  entryCount: number;
  totalStake: number;
  ggr: number;
  netProfit: number;
}

function toSettleReportRow(raw: RawSettleReportRow, meta: ReportDispatchMeta): SettleReportDisplayRow {
  const isTenantBreakdown = meta.drawId !== undefined;
  const tenantLabel = isTenantBreakdown && typeof raw.tenantId === "string" ? raw.tenantId : undefined;
  return {
    game: meta.game,
    from: meta.from,
    to: meta.to,
    isTenantBreakdown,
    groupLabel: tenantLabel ?? (typeof raw.drawId === "string" ? raw.drawId : "—"),
    financialDate: typeof raw.financialDate === "string" ? raw.financialDate : "",
    entryCount: typeof raw.entryCount === "number" ? raw.entryCount : 0,
    totalStake: typeof raw.totalStake === "number" ? raw.totalStake : 0,
    ggr: typeof raw.ggr === "number" ? raw.ggr : 0,
    netProfit: typeof raw.netProfit === "number" ? raw.netProfit : 0,
  };
}

/**
 * `getDrawSettleReport` — 1 bảng cho CẢ 2 nhánh drill-down (danh sách kỳ đã settle ↔ breakdown
 * theo đại lý của 1 kỳ), vì 2 nhánh cùng field tài chính cốt lõi, chỉ khác đơn vị nhóm
 * (`drawId` vs `tenantId`) — gộp cột `groupLabel` thay vì 2 view riêng.
 *
 * `titleFrom` bắt buộc vì tool nhận `game` cụ thể ⇒ model có thể gọi lặp nhiều game trong 1 lượt;
 * nhãn phải nêu game và nhánh nào để N dòng gạch phân biệt được nhau (xem `TitleFrom`).
 */
export const drawSettleReportView = defineToolView<WireType<GetDrawSettleReportDispatchOutput>, SettleReportDisplayRow>(
  {
    select: (output) => {
      const result = output.result as { data?: unknown } | null | undefined;
      if (!Array.isArray(result?.data)) {
        return null;
      }
      return result.data.map((raw) => toSettleReportRow(raw as RawSettleReportRow, output.meta));
    },
    view: {
      kind: "table",
      title: "Báo cáo settle kỳ quay",
      titleFrom: (rows) => {
        const first = rows[0];
        if (first === undefined) {
          return "Báo cáo settle kỳ quay";
        }
        const game = GAME_LABELS[first.game];
        return first.isTenantBreakdown
          ? `Settle theo đại lý · ${game} · Kỳ ${first.groupLabel}`
          : `Settle kỳ quay · ${game} · ${first.from} → ${first.to}`;
      },
      totals: [
        { key: "totalStake", label: "Doanh thu" },
        { key: "ggr", label: "GGR" },
        { key: "netProfit", label: "Lợi nhuận ròng", signed: true },
      ],
      columns: [
        { key: "groupLabel", label: "Kỳ / Đại lý" },
        { key: "financialDate", label: "Ngày", format: CellFormat.Date },
        { key: "entryCount", label: "Vé", format: CellFormat.Number },
        { key: "ggr", label: "GGR", format: CellFormat.Number },
        { key: "netProfit", label: "Lợi nhuận", format: CellFormat.Number, signed: true },
      ],
      link: {
        label: "Mở báo cáo settle",
        href: (rows) => {
          const first = rows.at(0);
          if (first === undefined) {
            return "/dashboard";
          }
          const tab = first.isTenantBreakdown ? "tenants" : "draws";
          return `/games/${first.game}/reports/settle?tab=${tab}&from=${first.from}&to=${first.to}`;
        },
      },
      empty: "Không có kỳ nào đã settle trong khoảng thời gian này.",
    },
  },
);
