/**
 * AI Chat — view spec khai báo cho generic tool renderer (tầng 1 của 3 tầng render).
 *
 * VÌ SAO CÓ FILE NÀY: viết 1 component TSX riêng cho MỖI tool không scale (mẫu
 * `daily-overview-tool-card.tsx` ~150 dòng, trong đó ~60% là boilerplate lặp lại: guard state,
 * unwrap `AppResult`, empty state, cộng tổng, cắt số dòng, format số). Với hàng chục tool thì
 * đó là hàng nghìn dòng copy-paste. Spec dưới đây cho phép khai ~12 dòng/tool cho các dạng
 * hiển thị phổ biến; renderer chung (`generic-tool-view.tsx`) lo toàn bộ boilerplate.
 *
 * BA TẦNG (tra theo thứ tự trong `registry.tsx`):
 *   0. Không khai gì → `<Tool>` mặc định (JSON gập lại) — hợp cho tool ít dùng/debug.
 *   1. Khai `defineToolView(...)` → renderer chung dựng UI từ spec. ĐÂY LÀ MẶC ĐỊNH NÊN DÙNG.
 *   2. Component bespoke trong `toolRenderers` → toàn quyền TSX, cho chart/interaction đặc thù.
 *
 * ⚠️ RANH GIỚI CỨNG — ĐỌC TRƯỚC KHI THÊM FIELD VÀO SPEC: khi một tool cần **logic điều kiện**
 * (đổi layout theo dữ liệu, ẩn/hiện cột theo giá trị, tính toán nhiều bước), đó là tín hiệu
 * phải viết renderer BESPOKE — KHÔNG nới spec này. Schema-driven UI thất bại kinh điển ở chỗ
 * DSL phình dần thành "ngôn ngữ lập trình viết bằng object", lúc đó debug khó hơn TSX thuần.
 * Spec này chỉ được phép mô tả HÌNH DẠNG tĩnh, không mô tả HÀNH VI.
 *
 * KHÔNG để model quyết định layout: có phương án cho model gọi tool `render_table` tự chọn cột,
 * nhưng như vậy số tiền phải đi QUA model trước khi tới UI → model có thể copy sai. Số liệu tài
 * chính đi thẳng từ DB tới UI; model chỉ bình luận bằng text.
 */

import type { EveDynamicToolPart } from "eve/react";

import type { CellFormat } from "./format-cell";

/** Props mọi renderer tool nhận — dùng chung cho tầng 1 (spec) và tầng 2 (bespoke). */
export interface ToolRendererProps {
  part: EveDynamicToolPart;
}

/**
 * Một cột của `TableView`.
 *
 * `key` ràng buộc `keyof Row` — đổi tên field trong DTO backend ⇒ **compile error** ngay tại
 * spec. Đây là điểm khác biệt cốt lõi so với việc nhồi spec vào output tool (spec ở đó chỉ là
 * JSON, lệch DTO sẽ im lặng cho tới khi staff thấy ô trống).
 */
export interface ColumnSpec<Row> {
  /** Nhãn cột tiếng Việt hiển thị cho nhân viên. */
  label: string;
  /** Tên field trong `Row`. Compiler bắt sai chính tả / field đã bị xoá. */
  key: Extract<keyof Row, string>;
  /** Cách format giá trị. Mặc định `text`. */
  format?: CellFormat;
  /** Căn phải — mặc định TRUE cho cột số (`number`/`vnd`/`vndCompact`/`percent`). */
  alignRight?: boolean;
  /** Giá trị âm tô màu destructive. Dùng cho lợi nhuận/GGR, KHÔNG dùng cho cột đếm. */
  signed?: boolean;
}

/** Một ô KPI trong `KpiView` — giá trị lấy từ field, hoặc cộng tổng field trên nhiều dòng. */
export interface KpiSpec<Row> {
  label: string;
  key: Extract<keyof Row, string>;
  format?: CellFormat;
  signed?: boolean;
}

/**
 * Deep-link từ card về trang thật.
 *
 * `label` BẮT BUỘC và phải nêu ĐÚNG trang đích. Trước đây spec chỉ có `href`, nhãn nút bị
 * hardcode "Mở trong báo cáo" trong renderer chung — nên card `getGameConfig` (trỏ
 * `/games/{game}/config/game`) và `getGameJackpot` (trỏ `/dashboard`) đều mời staff "mở báo cáo"
 * trong khi đích KHÔNG phải trang báo cáo. Bắt buộc `label` làm lớp lỗi đó thành bất khả: không
 * thể thêm link mà không nói nó dẫn tới đâu.
 */
export interface DeepLinkSpec<Row> {
  /** Nhãn nút, nêu đúng đích. VD "Mở báo cáo tài chính", "Mở trang cấu hình game". */
  label: string;
  /** Dựng href. Nhận toàn bộ dòng để lấy tham số query (khoảng ngày, game…). */
  href: (rows: readonly Row[]) => string;
}

/**
 * Dựng tiêu đề card từ dữ liệu, khi nhãn tĩnh không đủ phân biệt.
 *
 * VÌ SAO CẦN (feedback 17/08): `getGameConfig` gọi 1 lần/game, nên câu hỏi so sánh cross-game tạo
 * ra 7 card cùng tiêu đề `"Cấu hình game"` — giống hệt nhau, phải mở từng cái mới biết game nào.
 * `titleFrom` cho spec nói `"Cấu hình Keno"`, `"Cấu hình Mega 6/45"`.
 *
 * QUAN TRỌNG HƠN KỂ TỪ 17/08: tiêu đề giờ là NHÃN DÒNG GẠCH (`ToolResultLine`) và bảng đóng sẵn —
 * tức nhãn là thứ DUY NHẤT staff thấy nếu không bấm. Spec nào có thể fan-out (nhận `game`/`drawId`/
 * `tenantId` cụ thể ⇒ model gọi lặp trong 1 lượt) thì `titleFrom` gần như BẮT BUỘC: thiếu nó,
 * hội thoại thành N dòng chữ giống nhau, không nói được gì.
 *
 * KHÔNG phạm ranh giới cứng ở đầu file: đây là dựng NHÃN từ dữ liệu (cùng họ với `DeepLinkSpec.href`
 * đã nhận `rows`), không phải đổi layout/ẩn-hiện cột theo giá trị. Nhãn sai thì staff thấy ngay;
 * layout đổi theo dữ liệu mới là thứ làm UI khó đoán.
 *
 * Chỉ chạy ở nhánh CÓ dòng. Card rỗng/lỗi dùng `title` tĩnh — lúc đó không có `rows` nào để dựng
 * nhãn (xem `toolViewTitle` trong `generic-tool-view.ts`).
 */
export type TitleFrom<Row> = (rows: readonly Row[]) => string;

/** Bảng nhiều dòng — báo cáo theo ngày/game, danh sách kỳ quay, vé. */
export interface TableView<Row> {
  kind: "table";
  title: string;
  titleFrom?: TitleFrom<Row>;
  columns: readonly ColumnSpec<Row>[];
  /**
   * Field cần cộng tổng, hiển thị thành lưới KPI phía trên bảng. Tổng tính trên **TOÀN BỘ**
   * dòng, không chỉ dòng đang hiện (`maxRows` chỉ cắt phần hiển thị).
   */
  totals?: readonly KpiSpec<Row>[];
  /** Số dòng hiển thị tối đa; phần còn lại gộp thành dòng "+N khác". Mặc định `DEFAULT_MAX_ROWS`. */
  maxRows?: number;
  /** Deep-link về trang đầy đủ. */
  link?: DeepLinkSpec<Row>;
  /** Text khi không có dòng nào. Mặc định câu chung. */
  empty?: string;
}

/** Lưới số tổng, không có bảng — tổng quan hệ thống, outstanding. */
export interface KpiView<Row> {
  kind: "kpi";
  title: string;
  titleFrom?: TitleFrom<Row>;
  items: readonly KpiSpec<Row>[];
  link?: DeepLinkSpec<Row>;
  empty?: string;
}

/** Chi tiết MỘT record dạng nhãn–giá trị. `select` phải trả array 0 hoặc 1 phần tử. */
export interface KeyValueView<Row> {
  kind: "keyValue";
  title: string;
  titleFrom?: TitleFrom<Row>;
  fields: readonly ColumnSpec<Row>[];
  link?: DeepLinkSpec<Row>;
  empty?: string;
}

export type ToolView<Row> = KeyValueView<Row> | KpiView<Row> | TableView<Row>;

/**
 * Spec đầy đủ của một tool: cách rút dòng từ output + cách hiển thị.
 *
 * `Output` là DTO thật của tool (import từ `@megawin/*-application`), `Row` là 1 dòng dữ liệu.
 */
export interface ToolViewSpec<Output, Row> {
  /**
   * Rút danh sách dòng từ output tool.
   *
   * Trả `null` ⇒ **fallback về `<Tool>` mặc định**, KHÔNG render card. Dùng khi output ở dạng
   * mà spec này không mô tả được (vd use-case có nhánh trả raw doc khác shape) — thà để model
   * diễn giải bằng text còn hơn dựng card sai dữ liệu.
   */
  select: (output: Output) => readonly Row[] | null;
  view: ToolView<Row>;
}

/**
 * Số dòng hiển thị mặc định — panel hẹp (min 340px), quá 7 dòng là tràn và mất tính "tóm tắt".
 * Muốn xem đủ thì bấm deep-link về trang báo cáo.
 */
export const DEFAULT_MAX_ROWS = 7;

/**
 * Bọc spec, trả về đúng nó — tồn tại CHỈ để TypeScript suy ra `Row` và ràng buộc mọi `key`
 * trong `view` về `keyof Row`. Không có runtime behavior.
 *
 * Khai `Output` là `WireType<DTO>` (không phải DTO gốc) — xem ghi chú đầu `report-views.ts`.
 */
export function defineToolView<Output, Row>(spec: ToolViewSpec<Output, Row>): ToolViewSpec<Output, Row> {
  return spec;
}
