/**
 * Ops Hub — Zone 5A/5B Types (p1-02; p1-08 §7 — bỏ tab "Cần xử lý", 5 tab theo 1 trạng thái/1 action)
 *
 * `HubGateTab` là NGUỒN DUY NHẤT của 5 tab bảng 5A — PHẢI khớp `HUB_GATE_TABS` khai ở
 * `nav-registry.ts` (giá trị y hệt, `nav-registry` export lại từ đây để tránh 2 mảng lệch nhau).
 *
 * ⚠️ SỬA LẠI HỢP ĐỒNG URL so với p1-01: `hub-overview-section.tsx` (p1-01) từng viết
 * `gate: SaleGate.Ended/PendingOpen/Halted/Open` + `stage: OpsStage.xxx` thẳng vào URL — hai
 * enum RAW không khớp 5 tab id ở đây (`SaleGate.PendingOpen = "pending_open"` không phải tab
 * nào trong `HubGateTab`). Đây là bug thật phát hiện khi viết p1-02, đã sửa lại
 * `hub-overview-section.tsx` để ghi ĐÚNG 1 trong 5 tab id này — xem file đó.
 *
 * **Bỏ tab "Cần xử lý" (p1-08 §7, review 08/09 điểm 8):** tab cũ gộp `health≠ok` ∪
 * `stage∈{AwaitingSettle,NeedsResettle,NeverOpened}` ∪ `gate∈{PendingOpen,Halted}` ∪
 * `alertsCritical>0` — 4 điều kiện KHÔNG cùng action (1 dòng cần "Mở bán", dòng khác cần "Kết sổ
 * lại"), chọn nhiều dòng trong tab này rồi bấm bulk RẤT DỄ áp sai action. Thay bằng
 * **"Chờ mở bán"** (MỚI) — tab duy nhất map trực tiếp `SaleGate.PendingOpen`/`Halted`, action bulk
 * đúng 1 loại ("Mở bán"). Tín hiệu khẩn cấp KHÔNG mất — vẫn có `HubAlertBanner` (Zone 4, độc lập
 * tab) + `getRowAccent()` (tô màu dòng NGAY TRONG tab tự nhiên của nó) + KPI "Rủi ro chi trả".
 */

export const HubGateTab = {
  /** `gate ∈ {PendingOpen, Halted}` (còn kịp mở bán) ∪ `stage = NeverOpened` (quá giờ,
   * chỉ huỷ trên trang operations — badge phân biệt, không checkbox bulk). */
  PendingOpen: "pending_open",
  /** `stage = PendingClose` — hết giờ cược, chờ đóng bán theo batch. */
  Ended: "ended",
  /** `stage ∈ {AwaitingDraw, AwaitingResult}` — đã/chưa đóng bán, chưa có kết quả quay. */
  AwaitingResult: "awaiting_result",
  /** `stage ∈ {AwaitingSettle, NeedsResettle}` — có kết quả, chờ/cần kết sổ. */
  AwaitingSettle: "awaiting_settle",
  /** Toàn bộ dòng 5A (`gate ∈ {Ended, PendingOpen, Halted}`), không lọc chặng — bao cả
   * `Settling`/`Voiding` (hiếm gặp, không có tab riêng). `NeverOpened` nằm ở tab
   * `PendingOpen` (badge "Quá giờ mở bán", CTA huỷ trên trang operations). */
  All: "all",
} as const;
export type HubGateTab = (typeof HubGateTab)[keyof typeof HubGateTab];

/** Thứ tự hiển thị tab + phím tắt `1`-`5` (guideline §10, plan §4.1; p1-08 §7.1: thứ tự theo
 * pipeline vận hành — mở bán trước, đóng bán, có KQ, rồi kết sổ). */
export const HUB_GATE_TAB_ORDER: readonly HubGateTab[] = [
  HubGateTab.PendingOpen,
  HubGateTab.Ended,
  HubGateTab.AwaitingResult,
  HubGateTab.AwaitingSettle,
  HubGateTab.All,
];

/**
 * Nhãn tab — đồng bộ từ vựng với `OPS_STAGE_LABEL` và nút action của `getNextAction`.
 *
 * Tab `Ended` trước ghi "Hết giờ cược" trong khi bảng ghi "Chờ chốt sổ" và nút ghi "Đóng bán"
 * — 3 cách gọi cho cùng 1 việc. Đã thống nhất "Chờ đóng bán".
 */
export const HUB_GATE_TAB_LABELS: Record<HubGateTab, string> = {
  [HubGateTab.PendingOpen]: "Chờ mở bán",
  [HubGateTab.Ended]: "Chờ đóng bán",
  [HubGateTab.AwaitingResult]: "Chưa có KQ",
  [HubGateTab.AwaitingSettle]: "Chờ kết sổ",
  [HubGateTab.All]: "Tất cả",
};

/** Cột sort khả dụng cho bảng 5A (plan §4.2, §5.1). */
export const QueueSortKey = {
  Health: "health",
  AgeInStage: "ageInStage",
  Revenue: "revenue",
  DrawTime: "drawTime",
} as const;
export type QueueSortKey = (typeof QueueSortKey)[keyof typeof QueueSortKey];

export const QueueSortDir = {
  Asc: "asc",
  Desc: "desc",
} as const;
export type QueueSortDir = (typeof QueueSortDir)[keyof typeof QueueSortDir];

/** Tô màu dòng — tối đa 1 màu/dòng, ưu tiên destructive > warn > none (guideline §5.4). */
export const RowAccent = {
  None: "none",
  Warn: "warn",
  Destructive: "destructive",
} as const;
export type RowAccent = (typeof RowAccent)[keyof typeof RowAccent];

/** 4 bulk action khả dụng trên bảng 5A (p0-04). */
export const BulkActionKind = {
  Settle: "settle",
  Void: "void",
  CloseSales: "close_sales",
  OpenSales: "open_sales",
} as const;
export type BulkActionKind = (typeof BulkActionKind)[keyof typeof BulkActionKind];

/**
 * Nhãn tiếng Việt cho `OpsStage` — dùng ở badge cột "Trạng thái".
 *
 * ⚠️ NGUỒN CHÂN LÝ là `getNextAction` (`components/games/shared/draw-next-action.ts`) — nhãn ở
 * đây PHẢI cùng từ vựng với nút action mà staff sẽ bấm ngay sau đó. Trước p1-05 có 3 phương
 * ngữ cho cùng 1 việc: bảng ghi "Chờ chốt sổ", tab ghi "Hết giờ cược", nút ghi "Đóng bán" →
 * staff không biết 3 chỗ đó nói về cùng một hành động. Đã thống nhất về "đóng bán".
 *
 * `never_opened` KHÔNG được đặt là "Chưa mở bán" — đã trùng `SALE_GATE_LABEL.pending_open`
 * bên dưới, và hai thứ này **đối lập nhau về khả năng cứu**: `pending_open` còn cửa sổ mở bán,
 * `never_opened` đã qua `closeAt` nên chỉ còn VOID. Trùng nhãn = staff mất dấu hiệu phân biệt
 * "còn kịp" vs "mất kỳ".
 */
export const OPS_STAGE_LABEL: Record<string, string> = {
  selling: "Đang bán",
  pending_close: "Chờ đóng bán",
  awaiting_draw: "Chờ tới giờ quay",
  awaiting_result: "Chờ kết quả",
  awaiting_settle: "Chờ kết sổ",
  settling: "Đang kết sổ",
  voiding: "Đang huỷ",
  needs_resettle: "Cần kết sổ lại",
  never_opened: "Quá giờ mở bán",
};

/**
 * Nhãn tiếng Việt cho `SaleGate.PendingOpen`/`Halted` (2 gate còn cửa sổ cứu được).
 *
 * "Chưa mở bán" ở đây hàm ý **còn kịp** — đối lập `OPS_STAGE_LABEL.never_opened`
 * ("Quá giờ mở bán" = đã mất kỳ). Không đổi 2 nhãn này thành giống nhau.
 */
export const SALE_GATE_LABEL: Record<string, string> = {
  pending_open: "Chưa mở bán",
  halted: "Đã ngắt bán",
};

/**
 * `OpsStage` → tab 5A tương ứng (guideline §3.1) — dùng ở `HubTimelineRail` để nhảy đúng tab
 * trước khi scroll. Key là string thô (giá trị `OpsStage`, vd `"awaiting_settle"`) để tránh
 * import `derive-draw-state.ts` vào file types thuần — tra bằng `row.stage` trực tiếp.
 * Đồng bộ 1:1 với `matchesTab` (`filter-sort-rows.ts`) — KHÔNG viết lại điều kiện này lần 2.
 *
 * `settling`/`voiding` → `All` (hiếm gặp, không có tab riêng).
 * `never_opened` → `PendingOpen` (cùng nhóm "chưa/không bán được"; action thật là huỷ kỳ
 * trên trang `operations`, không phải bulk "Mở bán").
 */
export const STAGE_TO_TAB: Partial<Record<string, HubGateTab>> = {
  pending_close: HubGateTab.Ended,
  awaiting_draw: HubGateTab.AwaitingResult,
  awaiting_result: HubGateTab.AwaitingResult,
  awaiting_settle: HubGateTab.AwaitingSettle,
  needs_resettle: HubGateTab.AwaitingSettle,
  settling: HubGateTab.All,
  voiding: HubGateTab.All,
  never_opened: HubGateTab.PendingOpen,
};

/** `SaleGate.PendingOpen`/`Halted` → tab "Chờ mở bán" (guideline §3.1, p1-08 §7.1) — 2 gate
 * cùng dẫn tới cùng 1 hành động ("Mở bán"), gộp 1 tab thay vì tách riêng. */
export const GATE_TO_TAB: Partial<Record<string, HubGateTab>> = {
  pending_open: HubGateTab.PendingOpen,
  halted: HubGateTab.PendingOpen,
};
