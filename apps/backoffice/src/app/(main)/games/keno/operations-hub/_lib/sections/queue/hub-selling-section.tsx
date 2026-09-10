"use client";

/**
 * Ops Hub — Zone 5B (Đang bán — guideline §5B, plan §2.2 · viết lại theo p1-05 §B8.2)
 *
 * 3 lớp thu gọn dần, KHÔNG render hàng trăm dòng cùng lúc:
 * - Lớp 1: top-N bất thường (`state.outliers5B`, tính sẵn ở context) — mặc định MỞ, luôn hiện.
 * - Lớp 2: sparkline Timeline Rail (`hub-timeline-rail.tsx`, KHÔNG lặp lại ở đây).
 * - Lớp 3: bảng đầy đủ `rows5B`, mặc định ĐÓNG — chỉ MOUNT khi `sellingTableExpanded = true`
 *   (không render rồi ẩn CSS — trả full giá mà không được gì, plan §2.2). Có ô search
 *   theo `drawNo` — cách đúng để truy cập hàng trăm dòng, không phải cuộn.
 *
 * §B8.1 — ĐÃ BỎ "kỳ chết": kỳ chưa có cược KHÔNG còn vào danh sách outlier (xem JSDoc
 * `selling-outliers.ts`). §B8.2 — mã kỳ dùng `<DrawIdLabel>` (badge ngày khi không phải hôm nay;
 * không tooltip — che click). Cột "Còn lại" đổi thành "Đóng bán sau" từ `closeAt`; Vé/Bộ tách 2 cột.
 *
 * Fix round 4 (08/09, review sau p1-08):
 * - Section để trống nhiều khoảng trắng phía dưới khi cột 5A bên trái cao hơn. Fix: alert Lớp 1
 *   tự scroll riêng (`max-h-56`, không đẩy phần dưới xuống khi nhiều cảnh báo), Lớp 3
 *   (`SellingFullTable`) đổi `max-h-96` cố định → `flex-1 min-h-0` lấp hết chiều cao còn dư của
 *   section (grid `align-items: stretch` đã kéo section cao bằng cột trái sẵn).
 */

import { useMemo, useState } from "react";

import Link from "next/link";

import { GameProduct } from "@megawin/game-core/entities";
import { formatDurationCompact, formatNumber } from "@megawin/shared/utils";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Flame, Search, TrendingUp } from "lucide-react";

import { drawOperationsHref } from "@/app/(main)/games/_lib/operations/draw-operations-link";
import { DrawIdLabel } from "@/components/games/shared/draw-id-label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { useHubPreferences } from "../../hub-preferences-store";
import type { DerivedRow } from "../../hub-types";
import { useHubContext } from "../../use-hub-context";
import { SellingOutlierReason, type SellingOutlierRow } from "./selling-outliers";

/** Nhãn + icon + tone theo lý do outlier (§B8.1 bảng) — 1 nguồn duy nhất, tránh rải if/else lặp ở JSX. */
const OUTLIER_COPY: Record<
  SellingOutlierReason,
  { label: string; icon: typeof AlertTriangle; tone: "destructive" | "amber" }
> = {
  [SellingOutlierReason.CriticalAlert]: { label: "Cảnh báo nghiêm trọng", icon: AlertTriangle, tone: "destructive" },
  [SellingOutlierReason.ExposureSpike]: { label: "Rủi ro chi trả cao", icon: AlertTriangle, tone: "destructive" },
  [SellingOutlierReason.LargeBet]: { label: "Có cược lớn", icon: Flame, tone: "amber" },
  [SellingOutlierReason.RevenueSpike]: { label: "Doanh thu cao bất thường", icon: TrendingUp, tone: "amber" },
};

const OUTLIER_TONE_CLASS: Record<"destructive" | "amber", string> = {
  destructive: "border-destructive/20 bg-destructive/5 hover:bg-destructive/10",
  amber: "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10",
};

/** Ngưỡng gộp cảnh báo Lớp 1 thành 1 dòng tổng — chốt user §10 mục 8: > 5 dòng thì gộp, tránh
 * list dọc dài che mất phần khác của trang khi nhiều kỳ cùng lúc bất thường (review 08/09 §6). */
const OUTLIER_COLLAPSE_THRESHOLD = 5;

/**
 * 1 dòng outlier Lớp 1 — không cần `memo` (≤5-10 dòng, không phải hot path).
 *
 * Zone 5B (đang bán) KHÔNG có inline expand panel (khác 5A, plan p1-03 §3) — kỳ đang bán bình
 * thường không có action nào khả dụng (`gate = Open`), mở panel action rỗng vô nghĩa. Click
 * thẳng ra tab mới `/operations?drawId=` qua `<Link>` (giữ Cmd/Ctrl+click, KHÔNG `window.open`).
 */
function OutlierRow({ outlier }: { outlier: SellingOutlierRow }) {
  const { row, reason } = outlier;
  const copy = OUTLIER_COPY[reason];
  const Icon = copy.icon;

  return (
    <Link
      data-draw-id={row.drawId}
      href={drawOperationsHref(GameProduct.Keno, row.drawId)}
      target="_blank"
      rel="noopener"
      prefetch={false}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
        OUTLIER_TONE_CLASS[copy.tone],
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <DrawIdLabel drawId={row.drawId} className="shrink-0" />
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          <Icon className="size-3 shrink-0" />
          {copy.label}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
        <span className="font-medium">{formatNumber(row.revenue)}</span>
        <span className="text-muted-foreground">{formatNumber(row.entries)} vé</span>
        {/* Icon link chỉ hiện khi hover (p1-07 §3 câu cuối) — báo trước hành vi "click → mở
            trang vận hành chi tiết", không phải chỉ dựa vào con trỏ tay mặc định của `<Link>`. */}
        <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

/** Lớp 3 — bảng đầy đủ, mount CHỈ khi mở (plan §2.2). Search theo `drawNo` (client-side, đủ nhanh cho ~300 dòng).
 *
 * `h-full flex-col` — LẤP ĐẦY chiều cao còn lại của section (round 4: trước dùng `max-h-96` cố
 * định 384px, để trống nhiều khoảng trắng phía dưới khi cột 5A bên trái cao hơn do có nhiều
 * dòng — grid mặc định `align-items: stretch` đã kéo `<section>` cao bằng cột trái, nhưng
 * children xếp theo flow thường không tự lấp phần dư). Cha (`HubSellingSection`) truyền
 * `flex-1 min-h-0` cho div bọc ngoài để phần dư thật sự chảy xuống đây.
 */
function SellingFullTable({ rows, nowMs }: { rows: readonly DerivedRow[]; nowMs: number }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (search.trim() === "") {
      return rows;
    }
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) => String(r.drawNo).includes(q) || new Date(r.ts.drawTimeMs).toLocaleTimeString("vi-VN").includes(q),
    );
  }, [rows, search]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 border-t pt-3">
      <div className="relative max-w-64 shrink-0">
        <Search className="absolute top-2.5 left-2 size-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo số kỳ hoặc giờ quay…"
          className="h-8 pl-7 text-xs"
        />
      </div>
      <div className="min-h-56 flex-1 overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Kỳ</TableHead>
              <TableHead>Giờ quay</TableHead>
              <TableHead className="text-right">Doanh thu</TableHead>
              <TableHead className="text-right">Vé</TableHead>
              <TableHead className="text-right">Bộ</TableHead>
              <TableHead className="text-right">Đóng bán sau</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.drawId} id={`hub-row-${row.drawId}`} className="group queue-row">
                {/* `p-0` trên TableCell, padding dời vào chính `<Link>` — nội dung kỳ là CON
                    trực tiếp của Link (không overlay absolute) để click chữ/badge mở operations. */}
                <TableCell className="p-0">
                  <Link
                    href={drawOperationsHref(GameProduct.Keno, row.drawId)}
                    target="_blank"
                    rel="noopener"
                    prefetch={false}
                    aria-label={`Mở chi tiết kỳ ${row.drawId}`}
                    className="flex w-full items-center gap-1.5 p-2"
                  >
                    <DrawIdLabel drawId={row.drawId} />
                    {/* Icon link chỉ hiện khi hover dòng (p1-07 §3 — đồng bộ với `OutlierRow`
                        Lớp 1, cùng hành vi "click → mở trang vận hành chi tiết"). */}
                    <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs tabular-nums">
                  {new Date(row.ts.drawTimeMs).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.revenue)}</TableCell>
                <TableCell className="text-right text-muted-foreground text-xs tabular-nums">
                  {formatNumber(row.entries)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-xs tabular-nums">
                  {formatNumber(row.sets)}
                </TableCell>
                {/* "Đóng bán sau" thay cho "Còn lại" cũ. KHÔNG dùng `row.remainingSec` — field
                    đó CỐ Ý luôn `null` ở `gate = Open` (derive-draw-state.ts §1.5: "Selling
                    không bao giờ stuck", không tính ngưỡng). Tính trực tiếp từ `ts.closeAtMs`
                    so với `nowMs` (đồng bộ server qua `getNowMs()`, không dùng `Date.now()` thô
                    — lệch giờ client sẽ sai). Luôn ≥0 vì bảng chỉ chứa `gate = Open`. */}
                <TableCell className="text-right text-xs tabular-nums">
                  {formatDurationCompact(Math.max(0, Math.round((row.ts.closeAtMs - nowMs) / 1000)))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function HubSellingSection() {
  const { state, meta } = useHubContext();
  const { rows5B, outliers5B, selling } = state;
  const { sellingTableExpanded, setSellingTableExpanded } = useHubPreferences();
  // Gộp Lớp 1 khi > 5 dòng — TÁCH khỏi `sellingTableExpanded` (đó là bảng đầy đủ Lớp 3, đây là
  // "hiện hết outlier Lớp 1" — 2 khái niệm mở/đóng độc lập, không dùng chung 1 state).
  const [showAllOutliers, setShowAllOutliers] = useState(false);

  const visibleOutliers =
    showAllOutliers || outliers5B.length <= OUTLIER_COLLAPSE_THRESHOLD
      ? outliers5B
      : outliers5B.slice(0, OUTLIER_COLLAPSE_THRESHOLD);
  const hiddenOutlierCount = outliers5B.length - visibleOutliers.length;

  return (
    // `max-h-[70vh]` — BẮT BUỘC, không phải trang trí (bug thật round 5: thiếu dòng này, section
    // không tự giới hạn intrinsic height → CSS Grid track-sizing tính "max-content" của cột này
    // dựa trên TOÀN BỘ 119 dòng bảng con (~4600px), rồi kéo CẢ grid row (và do đó cả cột 5A bên
    // cạnh, vì `align-items` mặc định là `stretch`) phình theo — đo được `sectionH: 4619px`,
    // `scrollHeight === clientHeight` (không có gì để cắt vì container chưa từng bị giới hạn
    // thật). `h-full` giữ lại để khi 5A cao hơn (nhiều dòng, tab "Tất cả") thì 5B vẫn giãn theo
    // đúng chiều cao đó (yêu cầu "cân bằng chiều cao" giữa 5A/5B) — `max-h` chỉ là TRẦN, không
    // xung đột với `h-full` (browser lấy min của 2 ràng buộc).
    //
    // `+47px` (round 5 v2 — user báo lệch, đo CDP xác nhận): bên 5A, `max-h-[70vh]` chỉ áp cho
    // BẢNG CON (`hub-queue-table.tsx`), tab bar (`role="tablist"`, đo được cao `39px` + `gap-2`
    // `8px` = `47px`) nằm NGOÀI ngân sách 70vh đó → tổng 5A = 47px + ≤70vh bảng. Bên 5B, section
    // NÀY (bọc cả header "Đang bán · N kỳ") lại là nơi áp `max-h`, nên header/alert của 5B ăn
    // luôn vào ngân sách 70vh — kết quả 5B thấp hơn 5A đúng 47px (đo: 628.6px vs 579.6px = đúng
    // 70vh không sai 1px, tức 5B đã bị chặn TRẦN trước khi tính header). Cộng thêm 47px vào TRẦN
    // của 5B để bù đúng phần chrome-ngoài-ngân-sách mà 5A đang có, 2 bên ra cùng tổng chiều cao. */}
    <section
      id="hub-selling-section"
      className="flex h-full max-h-[calc(70vh+47px)] flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground text-sm">Đang bán · {selling.count} kỳ</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatNumber(selling.revenue)} · {formatNumber(selling.entries)} vé
        </span>
      </div>

      {/* Alert Lớp 1 tự scroll RIÊNG (`max-h-56 overflow-y-auto`) — round 4: trước đây khi
          nhiều cảnh báo cùng lúc (list dọc không giới hạn), khối này ĐẨY nút "Xem toàn bộ" +
          bảng Lớp 3 xuống dưới màn hình, user phải cuộn cả section mới thấy phần còn lại.
          Giới hạn chiều cao + scroll riêng cho khối alert giữ layout ổn định: danh sách kỳ
          Lớp 3 vẫn ở vị trí cố định bất kể có 2 hay 20 dòng cảnh báo. `shrink-0` — khối alert
          không bị co lại khi Lớp 3 cần thêm chỗ (khối alert đã tự scroll nội bộ, không cần
          "nhường" chiều cao cho Lớp 3 nữa). */}
      {outliers5B.length > 0 ? (
        <div className="flex max-h-56 shrink-0 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {visibleOutliers.map((outlier) => (
            <OutlierRow key={outlier.row.drawId} outlier={outlier} />
          ))}
          {/* Gộp phần còn lại thành 1 dòng tổng (p1-07 §6, §10 mục 8) — thay vì list dọc N kỳ
              đè hết phần dưới của trang khi nhiều kỳ cùng lúc bất thường. */}
          {hiddenOutlierCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAllOutliers(true)}
              className="flex items-center gap-1.5 self-start rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"
            >
              <ChevronDown className="size-3.5" />
              và {hiddenOutlierCount} kỳ khác cần chú ý
            </button>
          ) : showAllOutliers && outliers5B.length > OUTLIER_COLLAPSE_THRESHOLD ? (
            <button
              type="button"
              onClick={() => setShowAllOutliers(false)}
              className="flex items-center gap-1.5 self-start rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"
            >
              <ChevronRight className="size-3.5 rotate-90" />
              Thu gọn
            </button>
          ) : null}
        </div>
      ) : (
        <p className="shrink-0 text-muted-foreground text-xs">Không có kỳ nào bất thường trong nhóm đang bán.</p>
      )}

      <button
        type="button"
        onClick={() => setSellingTableExpanded(!sellingTableExpanded)}
        className="flex shrink-0 items-center gap-1 self-start text-muted-foreground text-xs hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", sellingTableExpanded && "rotate-90")} />
        {sellingTableExpanded ? "Ẩn" : "Xem"} toàn bộ {rows5B.length} kỳ đang bán · {formatNumber(selling.revenue)} ·{" "}
        {formatNumber(selling.entries)} vé
      </button>

      {/* `flex-1 min-h-0` — LẤP chiều cao còn dư của section (round 4: cột bên trái bảng 5A
          thường cao hơn nhiều do nhiều dòng, khoảng trắng dư ở cột phải trước đây không được
          bảng Lớp 3 lấp hết). `min-h-0` bắt buộc trong flex container để con có `overflow-y-auto`
          thật sự co lại đúng theo không gian còn lại thay vì tự giãn theo content (mặc định
          flex item có `min-height: auto` sẽ đẩy tràn cha). */}
      {sellingTableExpanded ? (
        <div className="min-h-0 flex-1">
          <SellingFullTable rows={rows5B} nowMs={meta.getNowMs()} />
        </div>
      ) : null}
    </section>
  );
}
