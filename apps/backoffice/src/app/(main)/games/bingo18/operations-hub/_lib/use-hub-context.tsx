"use client";

/**
 * Ops Hub — Context Provider
 *
 * Nguồn dữ liệu DUY NHẤT cho toàn trang `operations-hub` (guideline §1, plan p1-01 §4.4):
 * 1 query (`useHubQuery`) → derive 1 lần (`deriveHubSummary`) → mọi zone đọc qua context này.
 * KHÔNG zone nào tự gọi lại `useHubQuery` hay tự derive riêng.
 *
 * Clock offset: server trả `serverNow` (raw ISO) trong mỗi response — client tính lệch giờ
 * với máy local mỗi khi có data mới, KHÔNG tin `Date.now()` thô (server/client có thể lệch vài
 * giây, đủ để suy luận sai `SaleGate`/`StageHealth` ở biên — guideline §2.3). Tính THẲNG trong
 * render (không qua `useEffect`) — xem comment tại khai báo `clockOffsetMsRef` bên dưới vì sao
 * effect trễ 1 tick từng gây sai `boundaryDrawId` ngay sau khi bấm "Live"/refetch.
 *
 * Boundary scheduling: hẹn ĐÚNG 1 `setTimeout` tới mốc đổi trạng thái gần nhất toàn trang
 * (`nextBoundaryAtMs` từ `deriveHubSummary`) — KHÔNG tick `setInterval(1000)` (guideline §5.3).
 * Số đếm hiển thị dạng "3s trước" dùng `RelativeDuration` (DOM ref, không qua context này).
 *
 * P1-02 bổ sung (KHÔNG đổi hợp đồng p1-01 ở trên):
 * - `rows5A`/`rows5B`/`outliers5B`: tính lại theo tab/sort từ `useHubUrlParams`, CÙNG 1
 *   `useMemo` với `derived` (không thêm memo rời — tránh lặp lại `rows`, plan §6.1). `tabCounts`
 *   tách RIÊNG (p1-08 §7/§9 Q2) — cần biết trước `activeTab` để chọn tab mặc định theo count
 *   khi URL chưa có `gate` (không còn tab tĩnh "Cần xử lý" để default vào).
 * - `selectedIds` (`Set<drawId>`) — chọn hàng loạt bảng 5A. KHÔNG dùng TanStack `rowSelection`
 *   (key theo row index/id, trỏ sai kỳ sau refetch — plan §3). KHÔNG persist (guideline §6.3).
 *   Đổi `activeTab` → clear selection + `rowErrors` (1 tab ≈ 1 action; giữ xuyên tab khiến
 *   selection "sống lại" trên "Tất cả" và remount checkbox checked chậm hơn khi đổi tab).
 * - `validSelection` — derived TRONG RENDER từ `rows5A` hiện tại + `selectedIds`, KHÔNG
 *   `useEffect` + `setState` (plan §3.1): kỳ settle/void xong rời `rows` phải tự rơi khỏi
 *   selection ngay lần render kế, không trễ 1 tick effect.
 * - `rowErrors` (`Map<drawId, string>`) — lỗi bulk action per-dòng, xoá khi dòng rời `rows`
 *   hoặc staff bỏ chọn lại (plan §8.5).
 */

import {
  createContext,
  type ReactNode,
  startTransition,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { OpsHubSnapshotOutput } from "@megawin/game-bingo18-application/use-cases/operations";

import { deriveHubSummary } from "./derive-hub-summary";
import type { DayFlowColumn, DerivedRow, OpsFunnel, SellingSummary } from "./hub-types";
import { buildQueueTables, countRowsByTab, defaultSortForTab } from "./sections/queue/filter-sort-rows";
import { HUB_GATE_TAB_ORDER, HubGateTab, QueueSortDir, QueueSortKey } from "./sections/queue/queue-types";
import type { SellingOutlierRow } from "./sections/queue/selling-outliers";
import { findSellingOutliers } from "./sections/queue/selling-outliers";
import { useHubQuery } from "./use-hub-query";
import { useHubUrlParams } from "./use-hub-url-params";

/** Mốc đổi trạng thái tối thiểu/tối đa cho phép hẹn `setTimeout` — tránh 2 cực trị:
 * quá dày (đổi liên tục, giật UI) hoặc quá thưa (>60s, người xem cảm giác trang "đứng"). */
const MIN_BOUNDARY_DELAY_MS = 1_000;
const MAX_BOUNDARY_DELAY_MS = 60_000;

const EMPTY_FUNNEL: OpsFunnel = {
  pendingClose: { count: 0, revenue: 0, hasStuck: false },
  awaitingDraw: { count: 0, revenue: 0, hasStuck: false },
  awaitingResult: { count: 0, revenue: 0, hasStuck: false },
  awaitingSettle: { count: 0, revenue: 0, hasStuck: false },
  processing: { count: 0, revenue: 0, hasStuck: false },
  totalEnded: 0,
  anomalies: { pendingOpen: 0, halted: 0, needsResettle: 0, neverOpened: 0 },
};

const EMPTY_SELLING: SellingSummary = {
  count: 0,
  revenue: 0,
  entries: 0,
  sets: 0,
  exposureRaw: 0,
  avgRevenuePerDraw: 0,
  outliers: [],
};

/** Ép giá trị URL thô (`string | null`) về `HubGateTab` hợp lệ, hoặc `null` nếu URL chưa chọn
 * tab nào (khác biệt có ý nghĩa với p1-08 §9 Q2 — `null` nghĩa là "chưa chọn", cần tính tab mặc
 * định ĐỘNG theo count, không phải hardcode 1 tab tĩnh như bản `NeedsAction` cũ). */
function parseGateTab(raw: string | null): HubGateTab | null {
  const values: readonly string[] = Object.values(HubGateTab);
  return raw !== null && values.includes(raw) ? (raw as HubGateTab) : null;
}

/**
 * Tab mặc định khi URL chưa chọn (p1-08 §9 Q2, thay tab tĩnh `NeedsAction` đã xoá) — tab ĐẦU
 * TIÊN theo `HUB_GATE_TAB_ORDER` có `count > 0` (staff mở trang thấy ngay việc có thật cần làm,
 * không phải luôn rơi vào "Chờ mở bán" trống trong khi "Chờ đóng bán" có 40 kỳ đang đợi). Rơi
 * về `All` nếu cả 4 tab đều rỗng (không có gì cần xử lý — xem toàn cảnh).
 */
function pickDefaultTab(tabCounts: Record<HubGateTab, number>): HubGateTab {
  for (const tab of HUB_GATE_TAB_ORDER) {
    if (tabCounts[tab] > 0) {
      return tab;
    }
  }
  return HubGateTab.All;
}

function parseSortKey(raw: string | null): QueueSortKey | null {
  const values: readonly string[] = Object.values(QueueSortKey);
  return raw !== null && values.includes(raw) ? (raw as QueueSortKey) : null;
}

function parseSortDir(raw: string | null): QueueSortDir {
  return raw === QueueSortDir.Asc ? QueueSortDir.Asc : QueueSortDir.Desc;
}

interface HubContextValue {
  state: {
    /** Response gốc từ server — hiếm khi cần đọc trực tiếp, ưu tiên field đã derive dưới đây. */
    snapshot: OpsHubSnapshotOutput | undefined;
    rows: readonly DerivedRow[];
    funnel: OpsFunnel;
    selling: SellingSummary;
    boundaryDrawId: string | null;
    dayFlow: readonly DayFlowColumn[];
    stuckCount: number;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    /** Tab 5A đang chọn (từ URL `gate`) — nguồn chân lý DUY NHẤT, xem `queue-types.ts`. */
    activeTab: HubGateTab;
    sortKey: QueueSortKey;
    sortDir: QueueSortDir;
    /** Bảng 5A đã filter theo `activeTab` + sort — render trực tiếp, không filter lại ở component. */
    rows5A: readonly DerivedRow[];
    /** Toàn bộ dòng `gate = Open`, CHƯA sort/filter — Zone 5B tự chọn cách hiển thị (Lớp 1/3). */
    rows5B: readonly DerivedRow[];
    tabCounts: Record<HubGateTab, number>;
    /** Top-N bất thường Zone 5B Lớp 1 (guideline §5B, logic mới §B8.1) — đã sort nặng nhất lên đầu. */
    outliers5B: readonly SellingOutlierRow[];
    /** `Set<drawId>` đã chọn, CHƯA lọc theo `rows5A` hiện tại — dùng `validSelection` để render/action. */
    selectedIds: ReadonlySet<string>;
    /** Chỉ những `drawId` VẪN còn trong `rows5A` hiện tại (plan §3.1) — dùng cho mọi hiển thị/action. */
    validSelection: ReadonlySet<string>;
    /** Lỗi bulk action per-dòng (plan §8.5) — badge lỗi tại dòng tương ứng. */
    rowErrors: ReadonlyMap<string, string>;
  };
  actions: {
    refresh: () => void;
    toggleSelect: (drawId: string) => void;
    /** Thay TOÀN BỘ selection — dùng cho "chọn tất cả kỳ đang lọc" / "bỏ chọn tất cả" (plan §8.2). */
    setSelection: (ids: ReadonlySet<string>) => void;
    clearSelection: () => void;
    setRowErrors: (errors: ReadonlyMap<string, string>) => void;
  };
  meta: {
    /** Giờ server ước tính TẠI THỜI ĐIỂM GỌI — gọi lại mỗi lần cần, không cache trong state. */
    getNowMs: () => number;
  };
}

const HubContext = createContext<HubContextValue | null>(null);

export function HubProvider({ children }: { children: ReactNode }) {
  const query = useHubQuery();
  const [urlParams] = useHubUrlParams();

  // Lệch giờ server − local (ms). Ref vì chỉ dùng để TÍNH TOÁN (đọc trong callback/derive),
  // không dùng để render trực tiếp — đổi giá trị không cần re-render (perf §5.12).
  const clockOffsetMsRef = useRef(0);
  // `serverNow` đã tính offset lần gần nhất — dùng để biết dữ liệu MỚI (khác `serverNow` cũ)
  // hay chỉ re-render vì lý do khác (tránh `Date.parse` lại mỗi render).
  const lastServerNowRef = useRef<string | undefined>(undefined);

  // BUG THẬT đã sửa (09/09 — user báo "Dải kỳ" sai kỳ hiện tại ngay sau khi bấm "Live"):
  // offset TỪNG được cập nhật trong `useEffect([query.data?.serverNow])` — effect chạy SAU
  // commit, nhưng `derived` bên dưới (tính `boundaryDrawId`/`dayFlow`) là `useMemo` chạy TRONG
  // lúc render, NGAY khi `rows`/`thresholds` đã đổi sang dữ liệu mới. Kết quả: đúng 1 lần render
  // (mỗi khi query fetch xong) `deriveHubSummary` nhận `rows` MỚI nhưng `getNowMs()` vẫn trả giờ
  // tính theo offset CŨ — nếu máy local lệch giờ server đáng kể (phổ biến khi máy chưa đồng bộ
  // NTP), "biên chốt cược" tính sai ngay lần hiển thị đầu tiên sau khi bấm "Live". Fix: tính lại
  // offset THẲNG trong render (không qua effect) — offset luôn sẵn sàng TRƯỚC khi `derived` đọc
  // `getNowMs()` trong CÙNG lần render, không còn trễ 1 tick.
  const serverNowIso = query.data?.serverNow;
  if (serverNowIso !== undefined && serverNowIso !== lastServerNowRef.current) {
    lastServerNowRef.current = serverNowIso;
    clockOffsetMsRef.current = Date.parse(serverNowIso) - Date.now();
  }

  const getNowMs = useCallback((): number => Date.now() + clockOffsetMsRef.current, []);

  // Tăng mỗi khi chạm 1 mốc đổi trạng thái đã hẹn — CHỈ dependency này (+ data mới) làm
  // `derived` tính lại, KHÔNG phải interval liên tục.
  const [boundaryTick, setBoundaryTick] = useState(0);

  const rows = query.data?.rows;
  const thresholds = query.data?.thresholds;

  const derived = useMemo(() => {
    // `boundaryTick` cố ý làm TRIGGER re-run (không dùng giá trị) — mốc hẹn giờ theo đúng
    // thời điểm đổi trạng thái, không phải tick đều mỗi giây (guideline §5.3). Đọc `void` để
    // Biome nhận diện là dependency có dùng, tránh bị coi "dependency dư".
    void boundaryTick;
    if (!rows || !thresholds) {
      return {
        rows: [] as DerivedRow[],
        funnel: EMPTY_FUNNEL,
        selling: EMPTY_SELLING,
        boundaryDrawId: null as string | null,
        dayFlow: [] as DayFlowColumn[],
        stuckCount: 0,
        nextBoundaryAtMs: Number.POSITIVE_INFINITY,
      };
    }
    return deriveHubSummary(rows, getNowMs(), thresholds);
  }, [rows, thresholds, boundaryTick, getNowMs]);

  const parsedGate = parseGateTab(urlParams.gate);
  // Đếm theo tab TRƯỚC khi biết `activeTab` — cần cho `pickDefaultTab` khi URL chưa chọn tab
  // (p1-08 §9 Q2). Tính riêng khỏi `queueTables` (không phụ thuộc tab) để tránh vòng phụ thuộc
  // "cần activeTab để tính tabCounts, cần tabCounts để tính activeTab".
  const tabCounts = useMemo(() => countRowsByTab(derived.rows), [derived.rows]);
  const activeTab = parsedGate ?? pickDefaultTab(tabCounts);
  const explicitSortKey = parseSortKey(urlParams.sort);
  const tabDefault = defaultSortForTab(activeTab);
  const sortKey = explicitSortKey ?? tabDefault.sortKey;
  const sortDir = explicitSortKey ? parseSortDir(urlParams.dir) : tabDefault.dir;

  // 1 useMemo cho CẢ HAI bảng (plan §6.1) — chia + filter + sort trong 1 lần lặp `derived.rows`,
  // KHÔNG tách `rows.filter()` rời cho 5A/5B/outlier (3-4 lần lặp, vercel-react-best-practices §7.6).
  const queueTables = useMemo(() => {
    if (derived.rows.length === 0) {
      return {
        rows5A: [] as DerivedRow[],
        rows5B: [] as DerivedRow[],
        outliers5B: [] as SellingOutlierRow[],
      };
    }
    const { rows5A, rows5B } = buildQueueTables(derived.rows, activeTab, sortKey, sortDir);
    const outliers5B = findSellingOutliers(rows5B, getNowMs());
    return { rows5A, rows5B, outliers5B };
  }, [derived.rows, activeTab, sortKey, sortDir, getNowMs]);

  // Hẹn ĐÚNG 1 setTimeout tới mốc đổi trạng thái gần nhất toàn trang — thay tick 1s.
  useEffect(() => {
    if (derived.nextBoundaryAtMs === Number.POSITIVE_INFINITY) {
      return undefined;
    }
    const delay = Math.min(
      MAX_BOUNDARY_DELAY_MS,
      Math.max(MIN_BOUNDARY_DELAY_MS, derived.nextBoundaryAtMs - getNowMs()),
    );
    const timeoutId = setTimeout(() => {
      // Non-urgent: đổi màu/nhãn trạng thái không cần chặn tương tác đang gõ/click của staff.
      startTransition(() => {
        setBoundaryTick((t) => t + 1);
      });
    }, delay);
    return () => clearTimeout(timeoutId);
  }, [derived.nextBoundaryAtMs, getNowMs]);

  // ── Selection — Set<drawId>, KHÔNG persist, KHÔNG vào URL (plan §3, §5.2) ──────────────────
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [rowErrors, setRowErrorsState] = useState<ReadonlyMap<string, string>>(() => new Map());

  // Đổi tab → bỏ chọn hết. 1 tab ≈ 1 action (p1-08); giữ selection xuyên tab khiến kỳ đã chọn
  // ở tab khác "sống lại" khi vào "Tất cả" (trộn action) và remount checkbox checked chậm hơn.
  // Skip lần mount: `prevTabRef` khởi tạo = `activeTab` → effect đầu không clear.
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevTabRef.current === activeTab) {
      return;
    }
    prevTabRef.current = activeTab;
    setSelectedIds(new Set());
    setRowErrorsState(new Map());
  }, [activeTab]);

  const toggleSelect = useCallback((drawId: string) => {
    setSelectedIds((curr) => {
      const next = new Set(curr);
      if (next.has(drawId)) {
        next.delete(drawId);
      } else {
        next.add(drawId);
      }
      return next;
    });
  }, []); // Không dependency (vercel-react-best-practices §5.9) — điều kiện để row `memo` có tác dụng.

  const setSelection = useCallback((ids: ReadonlySet<string>) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const setRowErrors = useCallback((errors: ReadonlyMap<string, string>) => {
    setRowErrorsState(new Map(errors));
  }, []);

  // DERIVED trong render, KHÔNG useEffect + setState (plan §3.1) — kỳ settle/void xong rời
  // `rows5A` phải tự rơi khỏi selection ngay lần render kế, không trễ 1 tick effect + không loop.
  const validSelection = useMemo(() => {
    const available = new Set(queueTables.rows5A.map((r) => r.drawId));
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (available.has(id)) {
        next.add(id);
      }
    }
    return next;
  }, [queueTables.rows5A, selectedIds]);

  const value = useMemo<HubContextValue>(
    () => ({
      state: {
        snapshot: query.data,
        rows: derived.rows,
        funnel: derived.funnel,
        selling: derived.selling,
        boundaryDrawId: derived.boundaryDrawId,
        dayFlow: derived.dayFlow,
        stuckCount: derived.stuckCount,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        activeTab,
        sortKey,
        sortDir,
        rows5A: queueTables.rows5A,
        rows5B: queueTables.rows5B,
        tabCounts,
        outliers5B: queueTables.outliers5B,
        selectedIds,
        validSelection,
        rowErrors,
      },
      actions: {
        refresh: () => {
          void query.refetch();
        },
        toggleSelect,
        setSelection,
        clearSelection,
        setRowErrors,
      },
      meta: { getNowMs },
    }),
    [
      query.data,
      query.isLoading,
      query.isFetching,
      query.isError,
      query.refetch,
      derived,
      getNowMs,
      activeTab,
      sortKey,
      sortDir,
      queueTables,
      tabCounts,
      selectedIds,
      validSelection,
      rowErrors,
      toggleSelect,
      setSelection,
      clearSelection,
      setRowErrors,
    ],
  );

  return <HubContext value={value}>{children}</HubContext>;
}

export function useHubContext(): HubContextValue {
  const ctx = use(HubContext);
  if (!ctx) {
    throw new Error("useHubContext phải được gọi trong <HubProvider>.");
  }
  return ctx;
}
