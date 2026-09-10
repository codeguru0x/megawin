"use client";

/**
 * Ops Hub — Zone 3: Timeline Rail (p1-05 §B3 — GỘP Day Flow + Focus Rail; p1-08 §11 — redesign)
 *
 * Thay thế HOÀN TOÀN `hub-day-flow.tsx` (Tầng 1 overview 24 cột giờ) và
 * `sections/queue/focus-rail.tsx` (Tầng 3, 11 card) — cả hai vẽ CÙNG dữ liệu `state.dayFlow`,
 * chỉ khác mật độ. Lý do gộp (chốt với user 07/09):
 *   - Kỳ Keno/Bingo18 mở đều mỗi 6–8 phút → "giờ này có bao nhiêu kỳ" là HẰNG SỐ biết trước
 *     (≈8 kỳ/giờ). Gom theo giờ (Day Flow cũ) không thêm thông tin, và thực đo cho thấy
 *     121/128 cột giờ trong suốt/không có bar — vô nghĩa (review 07/09 §A4).
 *   - Giữ cả 2 component là trùng lặp UI cho cùng 1 khái niệm "dòng thời gian các kỳ".
 *
 * **Redesign 08/09 (p1-08 §11) — BỎ drag-to-scroll, chuyển sang cửa sổ trượt CỐ ĐỊNH:**
 * Đo thật bằng pointer-event simulation cho thấy `scrollWidth === clientWidth` (1292px cả 2)
 * khi card dùng `flex-1` (bản p1-07) — card GIÃN lấp đầy container, KHÔNG BAO GIỜ có overflow để
 * kéo. Đây là lý do user báo "thử kéo không được" — không phải bug pointer-event, mà là bố cục
 * không tạo ra overflow. Với yêu cầu mới "9 kỳ mặc định, kỳ hiện tại LUÔN ở giữa", cửa sổ hiển
 * thị đã CỐ ĐỊNH số lượng + vị trí — kéo ngang sẽ đẩy kỳ hiện tại lệch khỏi giữa, xung đột trực
 * tiếp với yêu cầu. → Bỏ hẳn pointer-event drag, điều hướng chính = 2 nút Lùi/Tiến (đã có, nhảy
 * theo `span`) + "Về kỳ hiện tại".
 *
 * **Fix 08/09 round 4 — card co lại giữa component trên màn rộng:** Bản đầu redesign đổi
 * `flex-1` (giãn lấp đầy, gây bug overflow=0 nêu trên) → `shrink-0 w-32` (width TUYỆT ĐỐI cố
 * định 128px). Hệ quả phụ không lường trước: trên viewport rộng (>1280px khả dụng cho rail),
 * 9×128px + gap ≈ 1200px trong khi container ~1500px+ → 300px khoảng trắng chia 2 bên, nhìn như
 * "card bị co dồn vào giữa" (user báo, ảnh round 4 #1). Lý do KHÔNG cần width tuyệt đối: card đã
 * bỏ drag-to-scroll hoàn toàn (không còn rủi ro overflow phá kéo — lý do width cố định ra đời ở
 * trên), và `zoneFor` chỉ dựa vào CHỈ SỐ (`colIdx`/`boundaryIdx`), không phụ thuộc pixel — card
 * co giãn không ảnh hưởng logic 3 vùng màu. → Đổi lại `w-32 shrink-0` → `flex-1 basis-0
 * min-w-[96px] max-w-44` (giãn lấp đầy hàng, chặn trần 176px, sàn 96px).
 *
 * **Fix round 4 v2 — VẪN co dồn giữa dù đã đổi `flex-1`:** đo lại bằng CDP (`getBoundingClientRect`)
 * với đúng 9 card mặc định: card width = 176px (chạm trần `max-w-44` vì container rail full-width
 * ~2000px dư sức chia 9 card > 176px/card) → 9×176+8×gap ≈ 1632px, còn hàng rộng ~2033px →
 * `justify-center` chia đều 200px THỪA sang 2 bên = đúng bug "không fit 2 đầu" user báo lần 2.
 * `max-w-44` (176px) vốn sinh ra để "không quá to trên màn siêu rộng" — nhưng khi rail đã full-
 * width (không còn kẹt trong ô 3fr như bản Focus Rail cũ), card 176px LUÔN nhỏ hơn khả năng chia
 * đều của hàng → trần này SAI hoàn cảnh sau khi gộp thành full-width. Bỏ hẳn `max-w`, bỏ
 * `justify-center` (không còn khoảng dư để canh giữa) — card giãn đúng 100% chiều rộng hàng,
 * chạm 2 đầu thật.
 *
 * **Màu theo TRẠNG THÁI thật (`col.gate`/`col.stage`), KHÔNG chỉ theo vị trí past/future —
 * fix round 4 v2 điểm 2:** bản trước chỉ tô mờ theo `zoneFor` (chỉ số trước/sau kỳ hiện tại),
 * nên 1 card "Đang bán" (gate=Open, đang thật sự bán) và 1 card "Chờ đóng bán" (đã hết giờ cược,
 * OpsStage.PendingClose) chỉ khác nhau ở opacity — không đủ để nhận biết NGAY "kỳ nào đang bán
 * thật". Thêm tín hiệu THEO GATE: `gate=Open` → chấm xanh ngọc nhấp nháy + viền trái xanh ngọc
 * (rõ ràng "đang sống"); `stage=PendingClose` → icon đồng hồ cam (rõ ràng "hết giờ, đang chờ
 * đóng", KHÁC hẳn màu cam của `StageHealth.Warn` — 2 khái niệm khác nhau: 1 là trạng thái BÌNH
 * THƯỜNG chờ đóng, 1 là CẢNH BÁO sức khoẻ). `zoneFor` (past dim) vẫn giữ cho các chặng ĐÃ QUA xa
 * hơn nữa (`AwaitingSettle`/`Settling`/`Done`) — không xung đột, 2 lớp tín hiệu bổ sung nhau.
 *
 * Đặt Ở VỊ TRÍ Day Flow cũ (full-width, ngay dưới KPI) — cột phải (5B) được giải phóng khỏi
 * `min-content` mà Focus Rail cũ đẩy ra (593px/1146px lệch tỉ lệ, review 07/09 §A3), grid 2 cột
 * tự khỏi bug đảo tỉ lệ mà không cần hack `minmax` (xem thêm bước 5 — page.tsx layout).
 *
 * Click 1 card → scroll + highlight 2s dòng tương ứng ở bảng 5A HOẶC 5B (tuỳ `gate`) — KHÔNG
 * filter bảng: rail là công cụ điều hướng, filter sẽ ẩn mất đúng kỳ đang treo mà rail chỉ tới.
 *
 * Highlight là hiệu ứng thị giác (thêm/xoá class qua DOM, `setTimeout` 2s) — KHÔNG setState.
 *
 * p1-08 §2a: container cửa sổ card đổi `pb-1` → `py-1.5` — set `overflow-x-hidden` (không set
 * `overflow-y`) khiến trình duyệt tự quy `overflow-y` thành `auto` (CSS spec: 1 axis non-visible
 * ép axis còn lại rời `visible`), viền trên của `ring-offset-2` (kỳ hiện tại) bị hộp cha cắt mất
 * khi không có padding-top. `py-1.5` (không chỉ `pb`) cho ring đủ 4px mỗi phía. Đồng thời siết
 * padding section `p-3`→`p-2.5`, card `py-2`→`py-1.5` (p1-08 §5, "phương án nhẹ" đã chốt Q4) —
 * tiết kiệm chiều cao trang, không đổi cấu trúc layout tổng (rủi ro thấp).
 *
 * **Slide animation khi Lùi/Tiến (round 4 v3)** — user chốt GIỮ 2 nút (không đổi qua scroll tự
 * do — free-scroll xung đột với yêu cầu "kỳ hiện tại LUÔN ở giữa"), chỉ thiếu cảm giác "trượt nối
 * tiếp" giữa 2 cửa sổ 9 kỳ (cũ `windowCols` đổi tham chiếu → React unmount/mount toàn bộ, không
 * có gì để animate). Fix: bọc dải card bằng `motion/react` `AnimatePresence mode="popLayout"` +
 * `key={windowStart}` — mỗi lần đổi cửa sổ, dải CŨ trượt ra 1 hướng + mờ dần, dải MỚI trượt vào
 * từ hướng ĐỐI DIỆN + hiện dần, chồng lên nhau trong lúc transition (không phải cắt cứng). Hướng
 * animate phụ thuộc `direction` (+1 = Tiến → cũ trượt sang trái/mới vào từ phải; -1 = Lùi →
 * ngược lại) lưu bằng `useRef` vì không cần re-render khi đổi. `motion` đã là dependency có sẵn
 * (dùng ở `ai-elements/shimmer.tsx`), không thêm gói mới.
 */

import { useCallback, useMemo, useRef } from "react";

import { formatNumber } from "@megawin/shared/utils";
import { ChevronLeft, ChevronRight, Clock, LocateFixed, Minus, Plus, Radio } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { DrawIdLabel } from "@/components/games/shared/draw-id-label";
import { cn } from "@/lib/utils";

import { OpsStage, SaleGate, StageHealth } from "./derive-draw-state";
import { useHubPreferences } from "./hub-preferences-store";
import type { DayFlowColumn } from "./hub-types";
import { GATE_TO_TAB, HubGateTab, OPS_STAGE_LABEL, SALE_GATE_LABEL, STAGE_TO_TAB } from "./sections/queue/queue-types";
import { useHubContext } from "./use-hub-context";
import { useHubUrlParams } from "./use-hub-url-params";

/** Mặc định 9 kỳ, kỳ hiện tại/focus LUÔN ở giữa (index `floor(span/2)`) — chốt với user 08/09 + 09/09. */
const DEFAULT_SPAN = 9;
const MIN_SPAN = 5;
const MAX_SPAN = 21;
const HIGHLIGHT_CLASS = "hub-row-highlight";
const HIGHLIGHT_DURATION_MS = 2000;

/**
 * 1 slot cửa sổ rail: kỳ thật hoặc `null` (pad ở đầu/cuối danh sách).
 *
 * Pad giữ đúng `span` cột + kỳ tâm luôn ở giữa — tránh bug cũ `slice` cụt còn 5–7 ô khi
 * `boundary`/focus sát mép (không còn "phía sau" để lấp `start + span`).
 */
type RailWindowSlot = DayFlowColumn | null;

/**
 * Variant trượt cho `motion.div` bọc dải 9 card (round 4 v3) — nhận `custom` là hướng
 * (`1` = Tiến, `-1` = Lùi/mặc định). Dịch NGANG 24px + mờ dần, KHÔNG dịch dọc — đủ để mắt thấy
 * "trượt nối tiếp" mà không cần biết chính xác pixel/card như carousel thật (tránh phải đo
 * `ResizeObserver`, giữ đơn giản — xem header comment file).
 */
const RAIL_SLIDE_VARIANTS = {
  initial: (direction: number) => ({ opacity: 0, x: direction >= 0 ? 24 : -24 }),
  animate: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction >= 0 ? -24 : 24 }),
};

/** Vùng thời gian của 1 card so với kỳ hiện tại (biên chốt cược) — quyết định nền + độ mờ. */
const RailZone = {
  Past: "past",
  Current: "current",
  Future: "future",
} as const;
type RailZone = (typeof RailZone)[keyof typeof RailZone];

/**
 * Tô đậm 1 dòng bảng 2s rồi tự xoá — DOM trực tiếp, không qua React state.
 *
 * Nhận thẳng element (không phải `drawId`) vì Zone 5B có 2 nơi có thể hiển thị cùng 1 kỳ
 * (outlier Lớp 1 dùng `data-draw-id`, bảng đầy đủ Lớp 3 dùng `id="hub-row-*"` — KHÔNG được
 * trùng `id` giữa 2 nơi, xem `scrollAndHighlight` bên dưới) — caller tự chọn đúng element.
 */
function highlightRow(el: HTMLElement): void {
  el.classList.add(HIGHLIGHT_CLASS);
  setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_DURATION_MS);
}

/**
 * Scroll + highlight dòng `drawId` — thử THEO THỨ TỰ 2 nơi (plan §2.2):
 * 1. `#hub-row-${drawId}` — bảng đầy đủ Lớp 3 (nguồn canonical, id DUY NHẤT/trang).
 * 2. `[data-draw-id="${drawId}"]` trong outlier Lớp 1 — kỳ bất thường đã hiện sẵn, KHÔNG cần
 *    mở bảng đầy đủ mới thấy (UX tốt hơn: outlier luôn hiện, không phải chờ mount).
 *
 * `id` KHÔNG được gắn ở cả 2 nơi cùng lúc — 1 kỳ có thể vừa là outlier vừa nằm trong bảng đầy
 * đủ khi đã mở (bug thật đã sửa 08/09: `getElementById` trả 2 phần tử trùng `id`, hành vi không
 * xác định — `hub-row-*` giờ CHỈ có ở Lớp 3, Lớp 1 dùng `data-draw-id` không cần duy nhất).
 *
 * Trả `true` nếu tìm thấy ở MỘT trong 2 nơi — dùng để phân biệt "đã scroll tới đúng dòng" vs
 * "dòng chưa render ở đâu cả" (VD kỳ không phải outlier và bảng đầy đủ Lớp 3 đang đóng).
 */
function scrollAndHighlight(drawId: string): boolean {
  const canonical = document.getElementById(`hub-row-${drawId}`);
  const target = canonical ?? document.querySelector<HTMLElement>(`[data-draw-id="${drawId}"]`);
  if (!target) {
    return false;
  }
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  highlightRow(target);
  return true;
}

/** Tab 5A tương ứng 1 cột rail — dùng để biết cần đổi tab trước khi scroll. */
function tabForColumn(col: DayFlowColumn): HubGateTab | null {
  if (col.gate === SaleGate.Open) {
    return null; // Thuộc 5B, không có tab.
  }
  return GATE_TO_TAB[col.gate] ?? STAGE_TO_TAB[col.stage] ?? HubGateTab.All;
}

/**
 * Nhãn trạng thái chi tiết trên card (plan §B7.3) — ƯU TIÊN `SALE_GATE_LABEL` cho 2 gate bất
 * thường còn cửa sổ cứu (`pending_open`/`halted`, nhãn "Chưa mở bán"/"Đã ngắt bán"), sau đó mới
 * tới `OPS_STAGE_LABEL[col.stage]` (chặng chi tiết, CÙNG nhãn với cột "Trạng thái" bảng 5A —
 * KHÔNG còn gate thô chung như "Đang bán"/"Đã hết giờ cược" của bản Focus Rail cũ).
 */
function statusLabel(col: DayFlowColumn): string {
  if (col.gate === SaleGate.PendingOpen || col.gate === SaleGate.Halted) {
    return SALE_GATE_LABEL[col.gate] ?? col.gate;
  }
  return OPS_STAGE_LABEL[col.stage] ?? col.stage;
}

/**
 * Viền sức khoẻ card — ĐỔI MÀU BORDER + nền nhạt, KHÔNG dùng `ring` (fix bug "viền đỏ hở góc",
 * plan §B7.2: `ring-1` không `ring-offset` vẽ sát `border` sẵn có → ở góc bo bị `border` che 1
 * phần). Border đổi màu không bao giờ hở góc vì nó LÀ viền của chính card, không phải lớp vẽ đè.
 */
const HEALTH_CARD_CLASS: Record<string, string> = {
  [StageHealth.Ok]: "",
  [StageHealth.Warn]: "border-amber-500/50 bg-amber-500/5",
  [StageHealth.Stuck]: "border-destructive/50 bg-destructive/5",
};

/**
 * Vùng thời gian của `col` so với kỳ hiện tại `boundaryDrawId`, dựa trên chỉ số trong
 * `dayFlow` gốc (không phải vị trí trong cửa sổ hiển thị — cửa sổ có thể lệch khi gần đầu/cuối
 * ngày). Dùng để quyết định nền quá khứ (p1-08 §11.2).
 */
function zoneFor(colIdx: number, boundaryIdx: number): RailZone {
  if (boundaryIdx < 0 || colIdx < boundaryIdx) {
    return RailZone.Past;
  }
  if (colIdx === boundaryIdx) {
    return RailZone.Current;
  }
  return RailZone.Future;
}

interface RailCardProps {
  col: DayFlowColumn;
  isBoundary: boolean;
  zone: RailZone;
  medianRevenue: number;
  onNavigate: (col: DayFlowColumn) => void;
}

/** Ô trống giữ layout `flex-1` — không click, không đua màu với card thật. */
function RailCardPlaceholder() {
  return (
    <div
      aria-hidden
      className="min-w-[96px] flex-1 basis-0 rounded-lg border border-muted-foreground/20 border-dashed bg-muted/10"
    />
  );
}

function RailCard({ col, isBoundary, zone, medianRevenue, onNavigate }: RailCardProps) {
  const barPct = medianRevenue > 0 ? Math.min(100, (col.revenue / (medianRevenue * 2)) * 100) : 0;
  // 2 tín hiệu THEO GATE thật (round 4 v2 — không chỉ dựa zone past/future, xem header comment).
  const isSelling = col.gate === SaleGate.Open;
  const isPendingClose = col.stage === OpsStage.PendingClose;

  return (
    <button
      type="button"
      onClick={() => onNavigate(col)}
      className={cn(
        // Width GIÃN LẤP ĐẦY hàng, KHÔNG trần `max-w` (round 4 v2 — trần cũ gây "co dồn giữa"
        // khi rail đã full-width, xem header comment file). Sàn `min-w` vẫn giữ để chữ không
        // bị bóp khi `span` kéo lên MAX_SPAN=21.
        "flex min-w-[96px] flex-1 basis-0 flex-col gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-muted/50",
        HEALTH_CARD_CLASS[col.health],
        // Vùng quá khứ XA (đã qua chặng chờ đóng, đang settle/done) — mờ hơn, báo "ít quan
        // trọng hơn". KHÔNG áp cho `isPendingClose` (dù zone=Past, card đó vẫn cần NỔI để thấy
        // "cần đóng bán ngay" — mờ đi sẽ phản tác dụng).
        zone === RailZone.Past && !isPendingClose && "bg-muted/20 opacity-75",
        // Đang bán THẬT (gate=Open) — viền trái xanh ngọc, tín hiệu "đang sống" độc lập với
        // zone (round 4 v2 điểm 2: trước đây chỉ có opacity phân biệt past/future, không đủ rõ
        // "kỳ nào đang bán thật" khi nhìn lướt).
        isSelling && !isBoundary && "border-l-2 border-l-emerald-500/70",
        // Chờ đóng bán (hết giờ cược, OpsStage.PendingClose) — viền trái cam, KHÁC màu cam của
        // `StageHealth.Warn` về Ý NGHĨA (trạng thái bình thường "đang chờ xử lý", không phải
        // cảnh báo sức khoẻ) nhưng dùng cùng hue cam vì cùng "cần chú ý sớm".
        isPendingClose && !isBoundary && "border-l-2 border-l-orange-500/70 bg-orange-500/5",
        // Vạch phân chia quá khứ/hiện tại — viền trái đậm màu, ranh giới "NGAY BÂY GIỜ" bổ sung
        // cho ring (Tailwind không có utility border-style riêng theo từng cạnh nên dùng màu
        // đậm thay dashed để tránh ảnh hưởng 3 cạnh còn lại).
        zone === RailZone.Current && "border-l-2 border-l-muted-foreground/40",
        // Kỳ hiện tại (biên chốt cược) — `ring-2` + `ring-offset-2` (không đè border, bo góc
        // liền mạch 4 phía) CỘNG nền `primary/10` nhẹ — 2 tín hiệu cùng lúc để "sống động" hơn
        // ring đơn thuần (p1-07 §2b, không đụng `HEALTH_CARD_CLASS` vì kỳ hiện tại hiếm khi
        // đồng thời stuck/warn).
        isBoundary && "bg-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1">
          {isBoundary ? (
            <Radio className="size-3 shrink-0 animate-pulse text-primary" />
          ) : isSelling ? (
            // Chấm nhấp nháy xanh ngọc — tín hiệu "đang bán thật" (round 4 v2), tách biệt hẳn
            // với chấm xanh dương của kỳ hiện tại (`isBoundary`) để không nhầm "kỳ hiện tại" và
            // "kỳ đang bán" là 1 (thực tế nhiều kỳ Đang bán cùng lúc, chỉ 1 kỳ là "hiện tại").
            <span className="relative flex size-3 shrink-0 items-center justify-center">
              <span className="absolute size-1.5 animate-pulse rounded-full bg-emerald-500" />
            </span>
          ) : isPendingClose ? (
            <Clock className="size-3 shrink-0 text-orange-600" />
          ) : null}
          <DrawIdLabel drawId={col.drawId} className="text-xs" />
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {new Date(col.drawTimeMs).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <span
        className={cn(
          "truncate text-[10px]",
          isSelling ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
          isPendingClose && "font-medium text-orange-700 dark:text-orange-400",
        )}
      >
        {statusLabel(col)}
      </span>
      <div className="h-6 w-full rounded bg-muted/40">
        <div
          className={cn(
            "h-full rounded",
            col.health === StageHealth.Stuck ? "bg-destructive" : isSelling ? "bg-emerald-500/70" : "bg-primary/60",
          )}
          style={{ width: `${Math.max(4, barPct)}%` }}
        />
      </div>
      {/* Dòng tiền + vé (câu 3 user 07/09) — `col.entries` đã có sẵn trong `DayFlowColumn`. */}
      <div className="flex items-center justify-between gap-1 text-[10px] tabular-nums">
        <span className="font-medium">{formatNumber(col.revenue)}</span>
        <span className="text-muted-foreground">{formatNumber(col.entries)} vé</span>
      </div>
    </button>
  );
}

export function HubTimelineRail() {
  const { state } = useHubContext();
  const [params, setUrlParams] = useHubUrlParams();
  const { setSellingTableExpanded } = useHubPreferences();
  const { dayFlow, boundaryDrawId, activeTab } = state;
  // Hướng trượt cho animation Lùi/Tiến (round 4 v3) — `useRef` vì chỉ đọc lúc animate, đổi giá
  // trị không cần re-render (khác `windowStart` vốn đã kéo re-render qua URL param `focus`).
  const directionRef = useRef(0);

  const span = params.span !== null ? Math.min(MAX_SPAN, Math.max(MIN_SPAN, params.span)) : DEFAULT_SPAN;
  const isFollowing = params.focus === null;

  // Median doanh thu TRONG CÙNG gate — kỳ mới mở bán 2 phút không so được với kỳ đã bán 8 tiếng.
  // Tính riêng cho `Open` và `Ended` (2 quần thể khác bản chất).
  //
  // Cửa sổ: đúng `span` slot, tâm (= focus hoặc boundary) LUÔN ở giữa. Index âm / vượt length
  // → pad `null` (placeholder) — không `slice` cụt như bản cũ (mép cuối chỉ còn 5 ô).
  const { windowSlots, medianOpen, medianEnded, boundaryIdx, windowStart, centerHalf } = useMemo(() => {
    const half = Math.floor(span / 2);
    if (dayFlow.length === 0) {
      return {
        windowSlots: [] as RailWindowSlot[],
        medianOpen: 0,
        medianEnded: 0,
        boundaryIdx: -1,
        windowStart: 0,
        centerHalf: half,
      };
    }
    const focusId = params.focus ?? boundaryDrawId;
    const centerIdx = focusId ? dayFlow.findIndex((c) => c.drawId === focusId) : dayFlow.length - 1;
    const safeCenter = centerIdx >= 0 ? centerIdx : dayFlow.length - 1;
    // Có thể âm khi tâm gần đầu ngày — placeholder lấp phía trái, tâm vẫn ở slot `half`.
    const start = safeCenter - half;
    const windowSlotsResult: RailWindowSlot[] = [];
    for (let i = 0; i < span; i++) {
      const absIdx = start + i;
      windowSlotsResult.push(absIdx >= 0 && absIdx < dayFlow.length ? (dayFlow[absIdx] ?? null) : null);
    }

    const openRevenues = dayFlow
      .filter((c) => c.gate === SaleGate.Open)
      .map((c) => c.revenue)
      .toSorted((a, b) => a - b);
    const endedRevenues = dayFlow
      .filter((c) => c.gate !== SaleGate.Open)
      .map((c) => c.revenue)
      .toSorted((a, b) => a - b);
    const median = (arr: number[]) => (arr.length === 0 ? 0 : (arr[Math.floor((arr.length - 1) / 2)] ?? 0));

    // Chỉ số TUYỆT ĐỐI trong `dayFlow` của kỳ hiện tại — `zoneFor` so với index tuyệt đối
    // (kể cả khi `windowStart` âm nhờ pad).
    const boundaryIdxResult = boundaryDrawId ? dayFlow.findIndex((c) => c.drawId === boundaryDrawId) : -1;

    return {
      windowSlots: windowSlotsResult,
      medianOpen: median(openRevenues),
      medianEnded: median(endedRevenues),
      boundaryIdx: boundaryIdxResult,
      windowStart: start,
      centerHalf: half,
    };
  }, [dayFlow, params.focus, boundaryDrawId, span]);

  const handleNavigate = useCallback(
    (col: DayFlowColumn) => {
      const targetTab = tabForColumn(col);
      if (targetTab === null) {
        // Thuộc 5B — dòng có thể chưa render (ngoài outlier Lớp 1, bảng đầy đủ Lớp 3 đang đóng).
        // Thử scroll trước; nếu không thấy, MỞ bảng đầy đủ rồi thử lại sau 1 tick (chờ mount).
        if (!scrollAndHighlight(col.drawId)) {
          setSellingTableExpanded(true);
          setTimeout(() => scrollAndHighlight(col.drawId), 60);
        }
        return;
      }
      if (targetTab !== activeTab) {
        void setUrlParams({ gate: targetTab });
        // Chờ 1 tick cho bảng re-render với tab mới rồi mới scroll.
        setTimeout(() => scrollAndHighlight(col.drawId), 50);
        return;
      }
      scrollAndHighlight(col.drawId);
    },
    [activeTab, setUrlParams, setSellingTableExpanded],
  );

  function shiftWindow(deltaDraws: number): void {
    if (windowSlots.length === 0) {
      return;
    }
    // Tâm cửa sổ luôn ở slot `centerHalf` (pad giữ kỳ tâm giữa) — không `floor(length/2)` trên
    // mảng cụt như bản cũ.
    const centerCol = windowSlots[centerHalf];
    if (!centerCol) {
      return;
    }
    const idx = dayFlow.findIndex((c) => c.drawId === centerCol.drawId);
    const nextIdx = Math.min(dayFlow.length - 1, Math.max(0, idx + deltaDraws));
    const nextCol = dayFlow[nextIdx];
    if (nextCol) {
      // Lùi (delta<0) → dải cũ trượt sang PHẢI/mới vào từ TRÁI; Tiến → ngược lại. Gán TRƯỚC
      // `setUrlParams` vì `AnimatePresence` đọc `directionRef.current` ngay khi React commit
      // `windowStart` mới (đồng bộ, không lệch 1 frame).
      directionRef.current = deltaDraws > 0 ? 1 : -1;
      void setUrlParams({ focus: nextCol.drawId });
    }
  }

  /**
   * Nút "Về kỳ hiện tại" (plan §B3 điểm 2) — xoá `focus`, cửa sổ tự tính lại quanh biên chốt cược.
   * Hướng trượt suy ra từ vị trí kỳ hiện tại (`boundaryIdx`) so với TÂM cửa sổ đang xem — kỳ hiện
   * tại nằm SAU tâm → cửa sổ cần trượt TỚI (giống bấm Tiến nhiều lần), và ngược lại.
   */
  function goToCurrent(): void {
    if (boundaryIdx >= 0) {
      const currentCenterIdx = windowStart + centerHalf;
      directionRef.current = boundaryIdx >= currentCenterIdx ? 1 : -1;
    }
    void setUrlParams({ focus: null });
  }

  function adjustSpan(delta: number): void {
    const next = Math.min(MAX_SPAN, Math.max(MIN_SPAN, span + delta));
    void setUrlParams({ span: next === DEFAULT_SPAN ? null : next });
  }

  if (windowSlots.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-center text-muted-foreground text-xs shadow-sm">
        Chưa có kỳ nào trong ngày.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground text-sm">Dải kỳ · {dayFlow.length} kỳ hôm nay</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftWindow(-span)}
            className="rounded p-1.5 hover:bg-muted"
            aria-label="Lùi"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={goToCurrent}
            disabled={isFollowing}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
              isFollowing ? "cursor-default text-muted-foreground/40" : "text-primary hover:bg-primary/10",
            )}
          >
            <LocateFixed className="size-3.5" />
            Về kỳ hiện tại
          </button>
          <button
            type="button"
            onClick={() => shiftWindow(span)}
            className="rounded p-1.5 hover:bg-muted"
            aria-label="Tiến"
          >
            <ChevronRight className="size-3.5" />
          </button>
          <div className="ml-1 flex items-center gap-0.5 border-l pl-1.5">
            <button
              type="button"
              onClick={() => adjustSpan(-2)}
              className="rounded p-1 hover:bg-muted"
              aria-label="Thu hẹp cửa sổ"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-11 text-center text-[10px] text-muted-foreground tabular-nums">{span} kỳ</span>
            <button
              type="button"
              onClick={() => adjustSpan(2)}
              className="rounded p-1 hover:bg-muted"
              aria-label="Mở rộng cửa sổ"
            >
              <Plus className="size-3" />
            </button>
          </div>
        </div>
      </div>
      {/* Container clip theo NGANG (giữ overflow-x-hidden cũ) + `relative` để `mode="popLayout"`
          định vị dải CŨ tuyệt đối trong lúc trượt ra, tránh đẩy layout khi 2 dải chồng nhau. */}
      <div className="relative overflow-x-hidden py-1.5">
        <AnimatePresence custom={directionRef.current} initial={false} mode="popLayout">
          <motion.div
            key={windowStart}
            animate="animate"
            className="flex justify-center gap-1.5"
            custom={directionRef.current}
            exit="exit"
            initial="initial"
            transition={{ duration: 0.22, ease: "easeOut" }}
            variants={RAIL_SLIDE_VARIANTS}
          >
            {windowSlots.map((col, idx) => {
              const absIdx = windowStart + idx;
              if (col) {
                return (
                  <RailCard
                    key={col.drawId}
                    col={col}
                    isBoundary={col.drawId === boundaryDrawId}
                    zone={zoneFor(absIdx, boundaryIdx)}
                    medianRevenue={col.gate === SaleGate.Open ? medianOpen : medianEnded}
                    onNavigate={handleNavigate}
                  />
                );
              }
              // Key = toạ độ tuyệt đối trên trục dayFlow (âm = pad trái) — ổn định khi slide cửa sổ.
              return <RailCardPlaceholder key={`pad@${absIdx}`} />;
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/** Skeleton khớp chiều cao thật (header ~28px + card 88px + gap) — tránh layout shift. */
export function HubTimelineRailSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="flex h-[88px] items-stretch justify-center gap-1.5">
        {Array.from({ length: 9 }, (_, i) => i).map((i) => (
          <div key={i} className="min-w-[96px] flex-1 basis-0 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    </div>
  );
}
