"use client";

/**
 * Ops Hub — Inline Expand Panel (plan p1-03 §3, §4, §5 · viết lại theo p1-05 §B6)
 *
 * Mở dưới 1 dòng bảng 5A khi click dòng (KHÔNG phải nút, KHÔNG phải checkbox) — 0 query, chỉ
 * hiện field ĐÃ CÓ trong `DerivedRow` (đến từ `OpsHubDrawRow` — hub snapshot, plan p0-03).
 * CẤM thêm field cần query mới (nội dung alert theo playType, heatmap) — xem plan p1-03 §3.1
 * "3 thứ cấm". Cần thứ đó → mở tab mới (nút "Chi tiết ↗" dưới cùng).
 *
 * Bố cục p1-09 §2 (viết lại 08/09, thay bản 3 cột của p1-05 §B6.2): bản cũ chia 3 khối ĐỀU nhau
 * ("Vì sao" / "Dòng thời gian" / "Tiền & rủi ro" — mỗi khối 1/3 chiều rộng, CÙNG cỡ chữ, CÙNG kiểu
 * tiêu đề) nên không có tín hiệu thị giác nào nói "đọc tôi trước" → đúng phản hồi "không đúng điểm
 * nhấn". Bản mới:
 *
 * 1. **Dải A full-width trên cùng** — gộp chặng + câu "vì sao" (`text-sm`, trước `text-xs`) + tuổi
 *    trong chặng + NÚT hành động vào 1 dải, nút canh PHẢI. Trước đó nút nằm ở footer dưới cả 3
 *    khối, cách câu chẩn đoán ~120px, buộc mắt đi qua vùng toàn số `0` mới tới thứ cần bấm.
 *    `border-l-[3px]` theo `health` giữ liên tục thị giác với dòng bảng (dòng `stuck` nền đỏ nhạt,
 *    panel cũ chuyển sang xám nên tín hiệu "đang đỏ" biến mất đúng lúc đọc kỹ nhất).
 * 2. **2 cột bất đối xứng 58/42**, mỗi cột bọc khung `border rounded-lg bg-card` riêng (fix vòng
 *    4, xem thêm bên dưới) — tách biệt khỏi nền `bg-muted/30` của panel.
 * 3. **Timeline 4 mốc CỐ ĐỊNH** — mốc chưa tới hiện lý do ("Chưa có KQ") thay vì ẩn dòng → panel
 *    không nhảy chiều cao khi expand kỳ khác chặng. KHÔNG kèm `RelativeDuration` (bỏ ở fix vòng
 *    4 — trùng với dải A, xem điểm 7 dưới).
 * 4. **Cột tiền tự hạ tương phản khi kỳ chưa có cược** — trước hiện 5 dòng `0` chiếm 1/3 panel chỉ
 *    để nói "không có tiền nào ở đây"; `Cược lớn`/`Cảnh báo` gộp thành badge chỉ hiện khi > 0.
 * 5. **Thêm dòng `Hoa hồng đại lý`** — số THẬT từ `totals.commission` (rate riêng từng tenant),
 *    KHÔNG tính `revenue × defaultCommissionRate` ở FE.
 * 6. **Format ngày `07/09`** (slash), xem JSDoc `fmtTime` — trước `toLocaleString("vi-VN")` sinh
 *    dash `07-09`, lệch với `DrawIdLabel` trên cùng trang.
 *
 * Fix vòng 4 (09/09, phản hồi sau khi dùng bản p1-09 thật):
 * 7. **Bỏ `(… trước)` khỏi Dòng thời gian** — mốc bị TRÙNG với dải A phía trên: dải A đã ghi
 *    "Chờ đóng bán 1ng11h — vượt ngưỡng." (hoặc counter `· đã …` khi `health = Ok`), thêm lại
 *    "(1ng11h trước)" ngay dưới mốc "Đóng bán" là nói cùng 1 số 2 lần trong cùng panel — đúng
 *    phản hồi "không cần thiết". Giữ absolute time; bản đầy đủ (giây + năm) vẫn còn ở `title`
 *    hover (`fmtTimeFull`) cho nhu cầu audit.
 * 8. **2 khối "Dòng thời gian"/"Tiền & rủi ro" bọc `border rounded-lg bg-card`** — trước chỉ có
 *    heading `text-xs text-muted-foreground` không khung, nên 2 khối "chìm" vào nền
 *    `bg-muted/30` của panel và không tách biệt được với dải A (dải A có border + màu theo
 *    `health`, 2 khối dưới thì không). Thêm icon (`Clock`/`Wallet`) + khung card để 3 khối
 *    trong panel dùng cùng 1 ngôn ngữ hình, mắt phân được ranh giới ngay không cần đọc chữ.
 * 9. **Nút hành động đổi `items-start` → `items-center`** — khi câu "vì sao" xuống 2 dòng
 *    (chặng + `reason`), nút (1 dòng, thấp hơn cả khối text) neo theo mép TRÊN của khối 2 dòng
 *    nên trông lệch lên, không cân giữa theo trục dọc so với khối text bên trái.
 *
 * Fix vòng 5 (09/09, phản hồi thứ 2 sau khi dùng bản p1-09 thật):
 * 10. **Bỏ mốc "Kết sổ" khỏi Dòng thời gian** — trong Hub mốc này gần như LUÔN "Chưa kết sổ" (xem
 *     lý do đã xoá bên dưới `TimelineDot` cuối) nên chỉ chiếm chỗ vô nghĩa ở >99% trường hợp panel
 *     mở ra; timeline còn lại đúng 4 mốc (Mở bán/Đóng bán/Giờ quay/Công bố KQ) — tất cả đều CÓ
 *     xảy ra trong đời 1 kỳ đang nằm trong Hub (Hub chỉ query kỳ chưa `Settled`/`Void`). Case hiếm
 *     cần biết "đã kết sổ lần trước chưa" (`NeedsResettle`) đã có sẵn dữ liệu ở nút hành động
 *     ("Kết sổ lại") và ở trang `operations` chi tiết — không cần lặp lại trong panel nhanh này.
 * 11. **2 cột đổi tỷ lệ `58/42` → `1fr/1fr` (đều nhau)** — trước cột "Tiền & rủi ro" (nhiều dòng số
 *     hơn: doanh thu/hoa hồng/vé-bộ/rủi ro chi trả + badge) bị ép hẹp hơn cột "Dòng thời gian" (chỉ
 *     4 mốc cố định, nội dung ít hơn) nên 2 khối trông LỆCH chiều cao — khối tiền cao hơn hẳn khối
 *     giờ mà lại hẹp hơn, tạo cảm giác mất cân đối dù cùng 1 hàng `grid`. Bỏ mốc "Kết sổ" (điểm 10)
 *     cũng giúp giảm 1 dòng ở cột giờ, cân bằng chiều cao 2 khối tốt hơn nữa.
 *
 * Fix vòng 6 (09/09, phản hồi thứ 3 — dòng thời gian THỪA 1 dòng trắng dưới cùng so với tiền):
 * 12. **Bỏ dòng "Chưa có cược nào trong kỳ này."** — kỳ chưa có cược (case phổ biến nhất khi mở
 *     panel ở chặng `PendingClose`) khiến cột tiền có 4 `FieldRow` + 1 dòng chữ = nhiều hơn cột
 *     giờ (đúng 4 `TimelineDot`, không dòng nào ẩn/thêm) → khối tiền cao hơn 1 dòng, đúng như
 *     ảnh chụp UI thật cho thấy khối giờ có khoảng trắng dư ở dưới. 4 `FieldRow` phía trên đã tự
 *     nói "0" bằng số — câu nhắc lại bằng chữ không phải thông tin mới, bỏ để 2 cột LUÔN cùng số
 *     dòng (4 mốc = 4 field) bất kể kỳ có cược hay không.
 *
 * Action CHÍNH đồng bộ 100% với `getNextAction` (`draw-next-action.ts`, nguồn chân lý dùng ở
 * trang `operations`) — trước đó nút ở đây tự đặt nhãn/icon riêng, lệch với trang operations.
 *
 * VOID không chạy trong Hub (p1-07 §10 mục 9) — không mount dialog huỷ ở đây. Kỳ
 * `NeverOpened` hiện nút **Huỷ kỳ** dạng link sang trang `operations` (cùng `drawOperationsHref`
 * như icon header) để staff huỷ đúng chỗ có dialog 2 lớp; KHÔNG hiện "Mở bán" disabled.
 *
 * Nút "Chọn vào lô xử lý" cũng BỎ (p1-07 §4 câu 1) — dòng bảng 5A đã có checkbox riêng ngay
 * cột đầu, nút này là đường thứ 2 làm ĐÚNG 1 việc, dư thừa.
 *
 * Không animate chiều cao (plan §3.2 điểm 6) — hiện/ẩn thẳng, panel chỉ render khi đang mở
 * (component cha chỉ mount đúng 1 panel, KHÔNG render rồi `hidden`).
 */

import { useState } from "react";

import Link from "next/link";

import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { formatNumber } from "@megawin/shared/utils";
import { Ban, Clock, ExternalLink, Wallet, X } from "lucide-react";

import { drawOperationsHref } from "@/app/(main)/games/_lib/operations/draw-operations-link";
import { getNextAction } from "@/components/games/shared/draw-next-action";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
// Dialog bulk TÁI SỬ DỤNG cho cả nhiều lô (Action Bar) và single-row (ở đây) — single-row
// không bao giờ chạy batch, dùng thẳng hằng số "idle" chung thay vì tự construct object rỗng.
import { IDLE_BATCH_STATE } from "@/hooks/use-batch-runner";
import { cn } from "@/lib/utils";

import { OpsStage, StageHealth, stageStartMs } from "../../derive-draw-state";
import type { DerivedRow } from "../../hub-types";
import { RelativeDuration } from "../../relative-duration";
import { useHubContext } from "../../use-hub-context";
import { BulkConfirmDialog, type BulkDialogActionKind } from "./bulk-confirm-dialog";
import { actionUnavailableReason, partitionByAction } from "./partition-by-action";
import { BulkActionKind, OPS_STAGE_LABEL, SALE_GATE_LABEL } from "./queue-types";
import { useBulkAction } from "./use-bulk-mutations";

/** Số cột bảng 5A (`hub-queue-table.tsx`) — panel expand `colSpan` khớp số này để full width. */
const QUEUE_TABLE_COLUMN_COUNT = 10;

/** `getNextAction` trả action THEO STATUS — map ngược sang `BulkDialogActionKind` để biết nên
 * gọi bulk API nào khi staff bấm nút chính. `SalesClosed` (Công bố kết quả) không có mutation
 * bulk ở đây — case đó gọi `onOpenPublish(row.drawId)` để mở dialog `PublishResultAction`
 * (p1-10) MOUNT Ở CẤP `hub-queue-table.tsx`, không phải ở panel này — xem JSDoc `onOpenPublish`
 * trong {@link HubExpandPanelProps} vì sao dialog KHÔNG được sống trong component này.
 * `Published` chưa `isResettleReady` — không rơi vào nhánh này (luôn có `bulkKind = Settle`,
 * xem switch dưới) nên KHÔNG có case nào khác ngoài `SalesClosed` đi qua nhánh dialog/nav
 * (p1-08 §6 — trước đây nút "biến mất" âm thầm ở case này, không chỉ là câu chữ tooltip sai). */
function bulkKindForStatus(status: DrawStatus): BulkDialogActionKind | null {
  switch (status) {
    case DrawStatus.Scheduled:
      return BulkActionKind.OpenSales;
    case DrawStatus.SalesOpen:
      return BulkActionKind.CloseSales;
    case DrawStatus.Published:
      return BulkActionKind.Settle;
    default:
      return null;
  }
}

/** Zero-pad 2 chữ số — dùng cho cả {@link fmtTime} và {@link fmtTimeFull}. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * `20:59 07/09` — giờ:phút + ngày/tháng, separator `/`.
 *
 * TỰ GHÉP, KHÔNG dùng `toLocaleString`: với locale `vi-VN`, khi chỉ có `day`+`month` mà KHÔNG có
 * `year`, Intl trả về DASH (`07-09`) — lệch với `DrawIdLabel` (`06/09`) và tooltip (`DD/MM/YYYY`)
 * đang hiện trên CÙNG trang. Intl không có option chọn separator nên không cách nào ép slash qua
 * `toLocaleString`; tự ghép là cách duy nhất giữ 1 format ngày cho toàn trang (p1-09 §1.1, §3.1.1).
 *
 * Bỏ GIÂY (p1-09 §3.2): giây không dùng để quyết định "có đóng bán kỳ này không", chỉ cần khi
 * điều tra sự cố → bản đầy đủ (có giây + năm) đưa vào `title` qua {@link fmtTimeFull}.
 */
function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** Mốc ĐẦY ĐỦ (giây + năm) cho `title` hover — giữ khả năng audit theo giây (p1-09 §6.4). */
function fmtTimeFull(ms: number): string {
  const d = new Date(ms);
  const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${date}`;
}

interface TimelineDotProps {
  label: string;
  ms: number | null;
  /** Text thay chỗ khi mốc CHƯA xảy ra — nói rõ vì sao trống ("Chưa có KQ"), không để dấu `—` trần. */
  emptyText: string;
}

/**
 * 1 mốc trong khối "Dòng thời gian" — dot ĐẶC khi đã qua (`ms !== null`), RỖNG khi chưa tới.
 *
 * KHÔNG kèm `(… trước)` (bỏ ở p1-09 vòng 4, 09/09) — dải A phía trên ĐÃ nói thời lượng ở
 * chặng hiện tại (`reason` khi `warn`/`stuck`, hoặc counter `· đã …` khi `Ok`); lặp lại số đó
 * ngay dưới mốc "Đóng bán"/"Mở bán" là hiện 2 chỗ cùng 1 con số trong 1 panel — phản hồi thật
 * từ review 09/09. Absolute time (`fmtTime`) vẫn đủ để biết "lúc nào" mà không trùng "bao lâu";
 * bản đầy đủ giây+năm còn ở `title` hover ({@link fmtTimeFull}) cho nhu cầu audit.
 *
 * 4 mốc LUÔN render đủ, mốc chưa tới hiện `emptyText` — panel giữ chiều cao CỐ ĐỊNH giữa các kỳ
 * khác chặng, không nhảy layout khi expand kỳ khác (cùng nguyên tắc "đúng 1 dòng sub" của KPI).
 */
function TimelineDot({ label, ms, emptyText }: TimelineDotProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="flex min-w-0 items-baseline gap-2 text-muted-foreground">
        <span
          className={
            ms !== null
              ? "size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-primary"
              : "size-1.5 shrink-0 translate-y-[-2px] rounded-full border border-muted-foreground/40"
          }
        />
        <span className="truncate">{label}</span>
      </span>
      {ms !== null ? (
        <span className="shrink-0 whitespace-nowrap tabular-nums" title={fmtTimeFull(ms)}>
          {fmtTime(ms)}
        </span>
      ) : (
        <span className="shrink-0 whitespace-nowrap text-muted-foreground/60 text-xs">{emptyText}</span>
      )}
    </div>
  );
}

interface FieldRowProps {
  label: string;
  value: string;
  emphasize?: boolean;
  /** Class thêm cho phần VALUE — dùng tô màu theo ngưỡng (vd rủi ro > 0 → amber). */
  valueClassName?: string;
  /** Giải thích khi con số cần cảnh báo về độ chốt (vd hoa hồng chưa chốt tới khi kết sổ). */
  title?: string;
}

/**
 * 1 dòng `label ··· value` trong khối "Tiền & rủi ro".
 *
 * Label **wrap** (không `truncate`): cột panel có thể hẹp tới ~169px (grid 3 cột trong ô bảng
 * 570px) — `truncate` ở độ rộng đó cắt "Doanh thu" thành "Doa...", vô dụng. Thà label xuống 2 dòng.
 * Value `shrink-0 whitespace-nowrap` — số tiền/thời gian phải luôn đọc trọn, đó là thứ staff cần.
 */
function FieldRow({ label, value, emphasize, valueClassName, title }: FieldRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm" title={title}>
      <span className="min-w-0 wrap-break-word text-muted-foreground leading-snug">{label}</span>
      <span
        className={cn("shrink-0 whitespace-nowrap tabular-nums", emphasize ? "font-medium" : undefined, valueClassName)}
      >
        {value}
      </span>
    </div>
  );
}

export interface HubExpandPanelProps {
  row: DerivedRow;
  onClose: () => void;
  /**
   * Mở dialog nhập kết quả tuần tự (p1-10) cho `row.drawId` — dialog `PublishResultAction`
   * thật MOUNT ở `hub-queue-table.tsx` (component cha ổn định), KHÔNG mount trong panel này.
   *
   * BUG THẬT đã gặp (09/09, phản hồi UI thật): dialog từng mount ngay trong `HubExpandPanel`,
   * gate bằng `row.status === SalesClosed`. Khi staff bấm "Xác nhận & Kỳ tiếp": mutation
   * thành công → refetch → `row.status` đổi `SalesClosed → Published` → kỳ này RỜI khỏi
   * `rows5A` của tab đang chọn → effect tự-đóng-panel ở `hub-queue-table.tsx` set
   * `expandedDrawId = null` → `HubExpandPanel` UNMOUNT HOÀN TOÀN → dialog (đang mở, đang giữ
   * hàng đợi) biến mất theo — đúng hiện tượng "bấm Xác nhận, dialog tự tắt". Chuyển dialog lên
   * cấp bảng (không phụ thuộc trạng thái/tab của 1 dòng cụ thể) mới sống sót qua các lần refetch
   * giữa các kỳ trong hàng đợi.
   */
  onOpenPublish: (drawId: string) => void;
}

/**
 * Nội dung 1 dòng expand — render trong `<tr><td colSpan>` do component cha (`hub-queue-table.tsx`)
 * chèn ngay dưới dòng gốc. Tách riêng component để dễ test + panel chỉ re-render khi `row` đổi.
 */
export function HubExpandPanel({ row, onClose, onOpenPublish }: HubExpandPanelProps) {
  const { meta } = useHubContext();
  const nowMs = meta.getNowMs();

  const [openBulkDialog, setOpenBulkDialog] = useState<BulkDialogActionKind | null>(null);

  const settleMutation = useBulkAction(BulkActionKind.Settle);
  const closeSalesMutation = useBulkAction(BulkActionKind.CloseSales);
  const openSalesMutation = useBulkAction(BulkActionKind.OpenSales);

  const partition = partitionByAction([row], nowMs);
  const stageOrGateKey = row.gate === "pending_open" || row.gate === "halted" ? row.gate : row.stage;
  const stageLabel = OPS_STAGE_LABEL[stageOrGateKey] ?? SALE_GATE_LABEL[stageOrGateKey] ?? stageOrGateKey;

  // Action CHÍNH — nguồn chân lý `getNextAction` (đồng bộ nhãn/icon với trang `operations`,
  // plan §B6.2 điểm 5). `handlers` truyền rỗng: nút này KHÔNG tự trigger mutation qua
  // `getNextAction().handler` — chỉ dùng field `label`/`icon`/`className` để RENDER, hành vi
  // click do `bulkKindForStatus` + `mutationForKind` bên dưới quyết định (dùng lại đúng 1
  // đường xử lý bulk API với `drawIds: [row.drawId]`, KHÔNG viết đường riêng cho "1 kỳ").
  // `isResettleReady = true` khi `stage = NeedsResettle` — cho nhãn "Kết sổ lại" đúng chuẩn
  // trang operations, KHÔNG luôn `false` (Published thường vs Published cần kết sổ lại là 2
  // nhãn khác nhau trên CÙNG status).
  const isResettleReady = row.stage === OpsStage.NeedsResettle;
  const nextAction = getNextAction(row, {}, isResettleReady);
  const bulkKind = bulkKindForStatus(row.status);

  function mutationForKind(kind: BulkDialogActionKind) {
    switch (kind) {
      case BulkActionKind.Settle:
        return settleMutation;
      case BulkActionKind.CloseSales:
        return closeSalesMutation;
      case BulkActionKind.OpenSales:
        return openSalesMutation;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }

  function handleBulkConfirm(kind: BulkDialogActionKind) {
    mutationForKind(kind).mutate({ drawIds: [row.drawId] }, { onSuccess: () => setOpenBulkDialog(null) });
  }

  const bulkMutation = bulkKind ? mutationForKind(bulkKind) : null;
  const primaryDisabled =
    bulkKind === null ||
    (bulkKind === BulkActionKind.Settle
      ? partition.settlable.length === 0
      : bulkKind === BulkActionKind.CloseSales
        ? partition.closable.length === 0
        : partition.openable.length === 0);
  const primaryTooltip = bulkKind && primaryDisabled ? actionUnavailableReason(row, bulkKind, nowMs) : null;

  /** Kỳ đã có cược thật? Quyết định cột tiền "sáng" (số quan trọng) hay "mờ" (p1-09 §2.3). */
  const hasMoney = row.revenue > 0 || row.entries > 0;

  /** Mốc TUYỆT ĐỐI vào chặng — `null` khi chặng không có tuổi (`Selling`). Xem `stageStartMs`. */
  const stageStart = stageStartMs(row.ts, row.stage);

  return (
    <TableRow className="hover:bg-transparent" data-expand-panel-for={row.drawId}>
      {/*
        `whitespace-normal` là BẮT BUỘC, không phải tuỳ chọn: `TableCell` primitive của shadcn
        set `whitespace-nowrap` (`components/ui/table.tsx:86`) cho mọi ô. Panel này nằm TRONG
        `<td>` nên thừa hưởng nowrap → chuỗi `row.reason` dài không xuống dòng, tràn ngang và
        **đè lên chữ của cột khác** (bug §A1 đã đo được trên UI thật, đã fix).
        KHÔNG sửa primitive `table.tsx` — nó dùng ở >100 nơi và nowrap là hành vi đúng cho ô bảng.
      */}
      <TableCell colSpan={QUEUE_TABLE_COLUMN_COUNT} className="whitespace-normal bg-muted/30 p-0">
        {/* Header panel — drawId ĐẦY ĐỦ + chặng + nút đóng bằng icon X (KHÔNG phải nút text
            "Đóng" — đây chính là chỗ gây nhầm trong ảnh bạn chỉ ra: "Đóng" cạnh "Đóng bán"). */}
        <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-semibold">{row.drawId}</span>
            <span className="text-muted-foreground">·</span>
            <span>{stageLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Chỉ icon, KHÔNG chữ "Chi tiết kỳ" (p1-07 §4 — icon `ExternalLink` + `title` đã
                đủ nghĩa, chữ chỉ chiếm chỗ cạnh nút đóng). `prefetch={false}` — mở tuỳ ý theo
                yêu cầu xem, không chắc staff sẽ bấm mỗi lần mở panel (plan p1-03 §2.1 điểm 4). */}
            <Button asChild size="icon" variant="ghost" className="size-7" title="Mở trang vận hành chi tiết">
              <Link
                href={drawOperationsHref(GameProduct.Keno, row.drawId)}
                target="_blank"
                rel="noopener"
                prefetch={false}
              >
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Đóng panel">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/*
          `@container` PHẢI đặt trên `div` này, KHÔNG phải trên `<td>` — đã đo được: `td` có
          `container-type: inline-size` được set nhưng query `@md/panel` vẫn không kích hoạt, vì
          spec CSS Containment loại trừ internal table elements (`table-cell`) khỏi việc làm
          container. Bọc 1 `div` bình thường bên trong là cách duy nhất.
        */}
        <div className="@container/panel min-w-0 p-4">
          {/*
            ── Dải A: QUYẾT ĐỊNH (p1-09 §2.1) ──────────────────────────────────────────────
            Gộp 3 thứ trước đây rời rạc vào 1 dải full-width: (a) câu "vì sao" — trước ở cột 1
            hàng 1 với `text-xs`, tức câu QUAN TRỌNG NHẤT panel lại nhỏ nhất; (b) tuổi trong
            chặng; (c) NÚT hành động — trước ở footer dưới cả 3 khối, cách câu chẩn đoán ~120px
            theo trục dọc, buộc mắt đi qua vùng toàn số `0` mới tới thứ cần bấm.

            `border-l-[3px]` + nền theo `health` giữ LIÊN TỤC THỊ GIÁC với dòng bảng (§1.7): dòng
            `stuck` có nền đỏ nhạt, panel cũ đổi sang xám `bg-muted/30` nên tín hiệu "kỳ này đang
            đỏ" BIẾN MẤT đúng lúc staff đọc kỹ nhất.

            Nút canh PHẢI (`sm:ml-auto`) theo yêu cầu chốt 08/09. `flex-wrap` để ở panel hẹp nút
            xuống dòng thay vì ép câu chẩn đoán co lại.
          */}
          <div
            className={cn(
              "mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-l-[3px] p-3",
              row.health === StageHealth.Stuck
                ? "border-l-destructive bg-destructive/5"
                : row.health === StageHealth.Warn
                  ? "border-l-amber-500 bg-amber-500/5"
                  : "border-l-primary/40 bg-card",
            )}
          >
            <div className="min-w-[16rem] flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
                <span className="font-semibold text-sm">{stageLabel}</span>
                {/*
                  Counter sống CHỈ hiện khi `health = Ok` — đây là chống TRÙNG LẶP có chủ đích, đo
                  được trên UI thật: ở `warn`/`stuck`, `deriveHealth` đã nhét thời lượng vào chính
                  `reason` ("Chờ đóng bán 15h37ph — vượt ngưỡng."), nên hiện thêm "· treo 15h37ph"
                  ngay trên nó là nói CÙNG một con số hai lần, cách nhau 1 dòng. Tệ hơn: `reason`
                  chỉ cập nhật mỗi lần poll còn counter đếm mỗi giây → tại mốc chuyển đơn vị hai số
                  lệch nhau, trông y như bug dù không phải.

                  Ở `health = Ok`, `reason` KHÔNG chứa thời lượng ("Chờ đóng bán theo batch — bình
                  thường.", "Đang chờ quay kết quả.") nên counter là thông tin MỚI, giữ lại.
                  Mốc neo lấy từ {@link stageStartMs} (timestamp TUYỆT ĐỐI) — xem JSDoc ở đó để biết
                  vì sao KHÔNG được dùng `nowMs - ageInStageSec * 1000`.
                */}
                {row.health === StageHealth.Ok && stageStart !== null ? (
                  <span className="text-muted-foreground">
                    · đã <RelativeDuration sinceMs={stageStart} />
                  </span>
                ) : null}
              </div>
              {/* `break-words` — `reason` có thể chứa mã kỳ/số dài không có dấu cách để ngắt.
                  `text-sm` (trước `text-xs`): đây là câu trả lời cho "kỳ này sao". */}
              <p className="mt-1 break-words text-sm leading-snug">{row.reason}</p>
            </div>

            {/* Nút hành động — CÙNG HÀNG với chẩn đoán, canh phải. `items-center` để nút thẳng
                hàng thị giác với dòng `stageLabel`. */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
              {row.stage === OpsStage.NeverOpened ? (
                // Quá giờ mở bán: không mở bán lại được — KHÔNG hiện "Mở bán" disabled
                // (`getNextAction` vẫn trả OpenSales theo status `scheduled`). Link sang
                // trang operations để huỷ (VOID không chạy trong Hub).
                <Button asChild size="sm" variant="destructive" className="gap-1.5 font-medium">
                  <Link
                    href={drawOperationsHref(GameProduct.Keno, row.drawId)}
                    target="_blank"
                    rel="noopener"
                    prefetch={false}
                  >
                    <Ban className="size-3.5" /> Huỷ kỳ <ExternalLink className="size-3" />
                  </Link>
                </Button>
              ) : nextAction && bulkKind ? (
                primaryDisabled && primaryTooltip ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        className={cn("gap-1.5 font-medium", nextAction.className)}
                        disabled={primaryDisabled}
                        onClick={() => setOpenBulkDialog(bulkKind)}
                      >
                        <nextAction.icon className="size-3.5" /> {nextAction.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{primaryTooltip}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    className={cn("gap-1.5 font-medium", nextAction.className)}
                    disabled={primaryDisabled}
                    onClick={() => setOpenBulkDialog(bulkKind)}
                  >
                    <nextAction.icon className="size-3.5" /> {nextAction.label}
                  </Button>
                )
              ) : nextAction ? (
                row.status === DrawStatus.SalesClosed ? (
                  // Nhập kết quả NGAY TRONG Hub (p1-10) — dialog tái dùng 100% từ trang
                  // `operations` (p1-06), KHÔNG viết lại logic nhập/validate/submit. Dialog
                  // thật sống ở `hub-queue-table.tsx` (xem JSDoc `onOpenPublish`) — nút này chỉ
                  // báo "mở cho kỳ nào". Escape hatch xem đủ ngữ cảnh (financial/stats chi
                  // tiết) vẫn còn ở icon "Mở trang vận hành chi tiết" trên header panel.
                  <Button
                    size="sm"
                    className={cn("gap-1.5 font-medium", nextAction.className)}
                    onClick={() => onOpenPublish(row.drawId)}
                  >
                    <nextAction.icon className="size-3.5" /> {nextAction.label}
                  </Button>
                ) : (
                  // Fallback — status khác chưa có mutation/dialog riêng ở Hub, giữ nav như cũ
                  // (p1-08 §6: trước đây nút "biến mất" âm thầm ở case này, khiến kỳ trông như
                  // "bị khoá hoàn toàn" — bug thật, không chỉ là câu chữ tooltip).
                  <Button asChild size="sm" className={cn("gap-1.5 font-medium", nextAction.className)}>
                    <Link
                      href={drawOperationsHref(GameProduct.Keno, row.drawId)}
                      target="_blank"
                      rel="noopener"
                      prefetch={false}
                    >
                      <nextAction.icon className="size-3.5" /> {nextAction.label} <ExternalLink className="size-3" />
                    </Link>
                  </Button>
                )
              ) : (
                <span className="text-muted-foreground text-xs">Không có việc cần làm ở kỳ này.</span>
              )}
            </div>
          </div>

          {/*
            ── 2 cột ĐỀU NHAU, mỗi cột 1 KHUNG RIÊNG (p1-09 §2, fix vòng 4; tỷ lệ đổi ở fix vòng 5) ──
            Trước là 3 cột ĐỀU nhau (`@3xl:grid-cols-3`), cùng cỡ chữ, cùng kiểu tiêu đề — không
            có tín hiệu nào nói "đọc tôi trước", đó là gốc của phản hồi "không đúng điểm nhấn".
            Cột "Vì sao" đã lên dải A nên còn 2 cột.

            Tỷ lệ ĐÃ ĐỔI `58fr/42fr` → `grid-cols-2` (đều nhau, fix vòng 5, điểm 11): bản `58/42`
            cũ ép cột "Tiền & rủi ro" (nhiều dòng số hơn) hẹp lại trong khi cột "Dòng thời gian"
            (ít nội dung hơn) lại rộng — 2 khối lệch cả bề rộng lẫn chiều cao, nhìn mất cân đối.
            Cột giờ cũng vừa mất 1 dòng (bỏ mốc "Kết sổ", điểm 10) nên 2 cột giờ gần bằng số dòng.

            `border rounded-lg bg-card p-3` MỚI thêm ở fix vòng 4 (09/09) — trước 2 khối này
            không có khung, chỉ có heading `text-xs text-muted-foreground` nên "chìm" hẳn vào
            nền `bg-muted/30` của panel, không tách biệt khỏi nhau hay khỏi dải A phía trên (dải
            A có border + màu theo `health`). Icon (`Clock`/`Wallet`) cạnh heading — tín hiệu
            nhận diện nhanh không cần đọc chữ, cùng ngôn ngữ hình với heading `<h2>` các section
            khác của trang (`hub-selling-section.tsx`).
          */}
          <div className="grid min-w-0 @lg/panel:grid-cols-2 grid-cols-1 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3">
              <p className="mb-0.5 flex items-center gap-1.5 font-semibold text-foreground text-xs uppercase tracking-wide">
                <Clock className="size-3.5 text-muted-foreground" />
                Dòng thời gian
              </p>
              <TimelineDot label="Mở bán" ms={row.ts.openAtMs} emptyText="Chưa mở bán" />
              <TimelineDot
                label="Đóng bán"
                ms={row.ts.closeAtMs <= nowMs ? row.ts.closeAtMs : null}
                emptyText="Chưa hết giờ cược"
              />
              <TimelineDot
                label="Giờ quay"
                ms={row.ts.drawTimeMs <= nowMs ? row.ts.drawTimeMs : null}
                emptyText="Chưa tới giờ quay"
              />
              <TimelineDot label="Công bố KQ" ms={row.ts.publishedAtMs} emptyText="Chưa có KQ" />
            </div>

            {/*
              Cột tiền — TỰ HẠ TƯƠNG PHẢN khi kỳ chưa có cược (p1-09 §1.4, §2.3). Trên UI thật,
              kỳ `PendingClose` treo 1 ngày mà chưa ai cược hiện 5 dòng số `0` chiếm 1/3 panel chỉ
              để nói "không có tiền nào ở đây". Không XOÁ dữ liệu (staff vẫn cần biết là 0) nhưng
              làm mờ + gộp thành 1 câu để mắt bỏ qua nhanh.
            */}
            <div
              className={cn(
                // `gap-1.5` — PHẢI khớp gap của cột "Dòng thời gian" (dòng 478). Fix vòng 7
                // (09/09, phản hồi thứ 4): trước đây 2 cột dùng gap KHÁC nhau (`gap-1` ở đây vs
                // `gap-1.5` bên timeline) — lệch 2px CỘNG DỒN mỗi dòng nên dòng 1 ("Mở bán" ~
                // "Doanh thu") còn gần thẳng nhưng dòng 4 ("Công bố KQ" ~ "Rủi ro chi trả") lệch
                // rõ ~6px, đúng hiện tượng ảnh chụp UI thật cho thấy. Số dòng 2 cột đã bằng nhau
                // (fix vòng 5, 6) — chỉ cần gap bằng nhau nữa là mọi dòng thẳng hàng.
                "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3",
                hasMoney ? undefined : "text-muted-foreground/60",
              )}
            >
              <p className="mb-0.5 flex items-center gap-1.5 font-semibold text-foreground text-xs uppercase tracking-wide">
                <Wallet className="size-3.5 text-muted-foreground" />
                Tiền &amp; rủi ro
              </p>
              {/* Nhãn KHÔNG ghi "(VND)": dòng "Hoa hồng đại lý"/"Rủi ro chi trả" ngay dưới cũng là
                  VND mà không ghi đơn vị → ghi ở đúng 1 dòng làm cột trông lệch. Cả 3 dùng
                  `formatNumber` nên đơn vị đã hiểu ngầm ở tiêu đề khối "Tiền & rủi ro". */}
              <FieldRow label="Doanh thu" value={formatNumber(row.revenue)} emphasize={hasMoney} />
              {/* Hoa hồng — SỐ THẬT cộng dồn per-entry theo rate riêng từng tenant (p1-09 §2.3,
                  §4.1). KHÔNG tính `revenue × defaultCommissionRate` ở FE: sai ngay khi có tenant
                  override rate. Đặt liền dưới doanh thu để so được tỷ lệ bằng mắt. */}
              <FieldRow
                label="Hoa hồng đại lý"
                value={formatNumber(row.commission)}
                emphasize={hasMoney}
                title="Cộng dồn từ vé đã bán, theo tỷ lệ thật của từng đại lý. Số chốt chỉ có sau khi kết sổ."
              />
              <FieldRow label="Vé / Bộ" value={`${formatNumber(row.entries)} / ${formatNumber(row.sets)}`} />
              {/* "Exposure" → "Rủi ro chi trả" (Việt hoá, p1-07 §4e — đồng bộ với cột bảng 5A
                  "Rủi ro" và KPI "Rủi ro chi trả"). Tô amber khi > 0: chỉ "sáng" khi có rủi ro thật. */}
              <FieldRow
                label="Rủi ro chi trả (chưa cap)"
                value={formatNumber(row.exposureRaw)}
                valueClassName={row.exposureRaw > 0 ? "text-amber-600 dark:text-amber-500" : undefined}
              />

              {/* `Cược lớn` + `Cảnh báo` trước là 2 dòng LUÔN hiện, ở kỳ bình thường cả 2 đều `0`/
                  "Không có" — 2 dòng vô nghĩa. Giờ gộp thành badge, CHỈ hiện khi > 0 (p1-09 §2.3). */}
              {row.largeBetCount > 0 || row.alertsOpen > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  {row.largeBetCount > 0 ? (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-500">
                      {formatNumber(row.largeBetCount)} cược lớn
                    </span>
                  ) : null}
                  {row.alertsCritical > 0 ? (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                      {row.alertsCritical} cảnh báo nghiêm trọng
                    </span>
                  ) : row.alertsOpen > 0 ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {row.alertsOpen} cảnh báo mở
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Trước có thêm dòng "Chưa có cược nào trong kỳ này." khi `!hasMoney` — BỎ ở fix
                  vòng 6 (09/09, lần 3): dòng này làm cột "Tiền & rủi ro" THỪA 1 dòng so với cột
                  "Dòng thời gian" (4 dòng cố định), gây lệch chiều cao 2 khối ngay ở case phổ biến
                  nhất (kỳ chưa có cược). 4 `FieldRow` phía trên đã tự nói "0" — dòng nhắc lại bằng
                  chữ là dư, không phải thông tin mới. */}
            </div>
          </div>
        </div>
      </TableCell>

      {bulkKind ? (
        <BulkConfirmDialog
          kind={bulkKind}
          open={openBulkDialog === bulkKind}
          onOpenChange={(o) => setOpenBulkDialog(o ? bulkKind : null)}
          targetRows={[row]}
          isPending={bulkMutation?.isPending ?? false}
          batchState={IDLE_BATCH_STATE}
          onConfirm={() => handleBulkConfirm(bulkKind)}
        />
      ) : null}
    </TableRow>
  );
}
