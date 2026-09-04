/**
 * Tool eve: `renderChart` — tín hiệu vẽ chart (kế hoạch p1-05 §1.1).
 *
 * HAI CHẾ ĐỘ, phân biệt bằng field `rows` có điền hay không:
 *
 * 1. **Chế độ thường (`rows` bỏ trống)** — KHÔNG chở dữ liệu. Gọi SAU một tool dữ liệu (cùng lượt
 *    hoặc follow-up sau bảng đã hiện ở lượt trước). `execute` không truy vấn gì — tool tồn tại
 *    THUẦN để tạo ra một tool part trong message stream. FE (`registry.tsx`) bắt part này, tìm tool
 *    part dữ liệu GẦN NHẤT phía trước trong CÙNG message rồi (nếu chưa thấy) trong message assistant
 *    trước đó — chỉ nhận output chartable (`extractRows` khác `null` — xem `chart-inference.ts`),
 *    rồi tự suy luận trục/series/kind và vẽ. Model KHÔNG chép số, KHÔNG chọn field hay trục X/Y —
 *    đúng nguyên tắc "model không quyết layout" (`view-spec.ts` ranh giới cứng). Áp dụng cho MỌI số
 *    liệu lấy từ hệ thống (DB) — số tiền phải đi thẳng từ DB tới UI, không qua model.
 *
 *    ⚠️ GIỚI HẠN CỨNG: vẽ NGUYÊN output của MỘT lần gọi — không lọc dòng, không ghép nhiều lần gọi
 *    trong CÙNG lượt (chỉ lấy lần gần nhất). Nên biểu đồ nào cần một tập con (1 game trong báo cáo 7
 *    game) hoặc một chuỗi ghép từ N lần gọi (mỗi tháng 1 lần) trong cùng lượt thì chế độ này KHÔNG
 *    làm được, và cái nó vẽ ra là dữ liệu KHÁC — sai im lặng.
 *    Lỗi thật 24/08: hỏi "doanh thu 6 tháng đầu năm của Keno" → model tra `getFinancialByGame` 6 lần
 *    rồi gọi tool này ⇒ biểu đồ hiện tài chính tháng 6 của cả 6 game, trong khi nhận xét ngay dưới
 *    nói về chuỗi Keno theo tháng. Hàng rào hiện tại là instruction (`55-charts.md` §"Khi nào gọi":
 *    không khớp trọn 1 output thì CẤM gọi) — hàng rào MỀM. Muốn chặn cứng thì tool dữ liệu phải bóc
 *    sẵn theo mốc cần vẽ (thêm `groupBy` tháng / lọc `game`) để 1 lần gọi ra đúng chuỗi cần vẽ.
 *
 *    Vá 04/09: trước đây FE chỉ dò trong CÙNG message → follow-up "vẽ biểu đồ" (chỉ gọi tool này,
 *    không gọi lại báo cáo) luôn hiện "Chưa vẽ được…" trong khi `execute` trả `{ ok: true }` nên
 *    model vẫn viết "Đã vẽ…". FE giờ dò thêm message assistant trước.
 * 2. **Chế độ dữ liệu tự nhập (`rows` có điền)** — CHỈ dùng khi người dùng dán/mô tả dữ liệu KHÔNG có
 *    sẵn trong hệ thống (CSV, JSON, hay liệt kê field/giá trị trong tin nhắn) và muốn vẽ trực tiếp
 *    từ đó. Ở chế độ này, model TỰ đọc + phân loại dữ liệu thô thành `rows`, hệ thống dùng ĐÚNG
 *    `rows` model gửi (không dò lùi tool trước). Rủi ro copy sai số CHẤP NHẬN ĐƯỢC ở đây vì đây
 *    không phải số liệu tài chính chính thức của hệ thống — chỉ áp dụng cho dữ liệu ad-hoc người dùng tự
 *    cung cấp. KHÔNG dùng chế độ này để "tóm tắt lại" số liệu 1 tool đã trả — trường hợp đó luôn
 *    dùng chế độ 1 (bỏ trống `rows`) để giữ đúng nguyên tắc số liệu đi thẳng từ DB.
 *
 * `chartType` optional — CHỈ điền khi người dùng nêu rõ loại chart. Bỏ trống → FE tự chọn loại phù hợp
 * theo dữ liệu (bảng quyết định nguồn chân lý ở `chart-catalog.ts`, chép tay xuống
 * `55-charts.md` cho model đọc — 2 nơi PHẢI khớp khi sửa).
 *
 * KHÔNG gọi tool này nếu người dùng không yêu cầu vẽ chart — mọi câu hỏi số liệu vẫn hiển thị bảng/KPI
 * như cũ qua renderer sẵn có (`generic-tool-view.tsx`), không cần `renderChart`.
 */

import { defineTool } from "eve/tools";
import { z } from "zod";

import { buildChartModel, CHART_KIND_VALUES, type ChartRow, getChartLabel } from "@/lib/chart";

/** Giới hạn số dòng model có thể gửi ở chế độ `rows` — FE vẫn tự tỉa về `MAX_POINTS` (60) khi vẽ, giới hạn này chỉ chặn payload input quá khổ. */
const MAX_INPUT_ROWS = 200;

export default defineTool({
  description:
    "Vẽ biểu đồ. CHỈ gọi khi người dùng yêu cầu vẽ biểu đồ/chart/đồ thị/vẽ hình — KHÔNG tự gọi khi " +
    "họ chỉ hỏi số (số liệu vẫn hiện bảng như bình thường, không cần tool này). HAI CÁCH DÙNG:\n" +
    "(1) Vẽ từ số liệu HỆ THỐNG: gọi tool dữ liệu TRƯỚC để có số trong tay, rồi gọi tool này NGAY " +
    "SAU, BỎ TRỐNG `rows` — hệ thống tự lấy dữ liệu từ output tool dữ liệu gần nhất (cùng lượt hoặc " +
    "lượt trước trong hội thoại nếu bạn đang vẽ lại bảng đã tra). Bạn không cần (và không được) " +
    "chép số vào `rows` ở trường hợp này. QUAN TRỌNG: hệ thống vẽ NGUYÊN output của MỘT lần gọi gần " +
    "nhất — KHÔNG lọc bớt dòng, KHÔNG ghép nhiều lần gọi trong cùng lượt lại với nhau. Nếu bạn đã " +
    "gọi tool dữ liệu nhiều lần trong CÙNG lượt (vd mỗi tháng 1 lần) thì chỉ lần CUỐI được vẽ; nếu " +
    "output có nhiều nhóm hơn câu hỏi (hỏi 1 game, báo cáo trả cả 7 game) thì biểu đồ hiện đủ cả 7. " +
    "Vì vậy CHỈ gọi khi biểu đồ cần vẽ đúng bằng TOÀN BỘ output của MỘT lần gọi; không đúng như vậy " +
    "thì ĐỪNG gọi tool này — nói rõ chưa vẽ được biểu đồ đúng ý và vì sao, rồi trả lời bằng số/" +
    "bảng. Vẽ ra một biểu đồ chứa dữ liệu khác điều được hỏi là lỗi NGHIÊM TRỌNG hơn việc không có " +
    "biểu đồ.\n" +
    "(2) Vẽ từ dữ liệu NGƯỜI DÙNG TỰ CUNG CẤP (dán CSV, JSON, hoặc liệt kê field/giá trị ngay trong " +
    "tin nhắn, KHÔNG phải kết quả tra cứu hệ thống): tự đọc và phân loại dữ liệu đó thành `rows`, " +
    "điền vào tool này, KHÔNG gọi tool dữ liệu nào cả.\n" +
    "Chỉ điền `chartType` khi họ nêu rõ loại (vd 'vẽ biểu đồ tròn', 'vẽ đường'); chỉ nói chung 'vẽ " +
    "biểu đồ'/'vẽ chart' thì BỎ TRỐNG, hệ thống tự chọn loại phù hợp với dữ liệu. Nếu loại được yêu " +
    "cầu KHÔNG phù hợp dữ liệu (vd biểu đồ tròn cho chuỗi 30 ngày, biểu đồ đường cho so sánh 5 game) " +
    "— TRẢ LỜI TEXT giải thích ngắn lý do + đề xuất loại đúng TRƯỚC khi gọi tool này, rồi gọi với " +
    "`chartType` là loại đã đề xuất (vẽ luôn, KHÔNG hỏi lại có muốn đổi loại không). Muốn biết đầy " +
    "đủ các loại chart hỗ trợ và dùng khi nào — xem bảng trong hướng dẫn vẽ chart, KHÔNG cần gọi " +
    "tool để tra.",
  inputSchema: z.object({
    chartType: z
      .enum(CHART_KIND_VALUES)
      .optional()
      .describe(
        "Loại chart được chỉ định rõ: line (đường), area (miền), bar (cột), hbar (cột ngang), " +
          "pie (tròn), donut (vành khuyên), radar, radialBar (vòng tiến độ), scatter (phân tán), " +
          "composed (kết hợp). Bỏ trống để hệ thống tự chọn loại phù hợp với dữ liệu.",
      ),
    rows: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
      .min(1)
      .max(MAX_INPUT_ROWS)
      .optional()
      .describe(
        "CHỈ điền ở cách dùng (2) — vẽ từ dữ liệu người dùng tự dán/mô tả (CSV, JSON, hay liệt kê " +
          "field/giá trị), KHÔNG PHẢI kết quả 1 tool tra cứu hệ thống. Mỗi phần tử là 1 dòng dữ " +
          "liệu (object phẳng, không nested), key là tên field, value là chuỗi/số/null — parse số " +
          "dạng chuỗi có dấu phẩy nghìn hoặc ký hiệu tiền về number thuần trước khi điền. KEY LÀ " +
          "NHÃN NGƯỜI DÙNG ĐỌC trên trục/chú giải/bảng NÊN PHẢI CÓ DẤU: header nguồn tiếng Anh " +
          "('name', 'Age') → đổi thành 'tên', 'tuổi' — CÓ dấu đầy đủ, TUYỆT ĐỐI không bỏ dấu thành " +
          "'ten', 'tuoi' (mất nghĩa, xấu trên biểu đồ). Field nhiều từ viết CÁCH NHAU BẰNG KHOẢNG " +
          "TRẮNG, có dấu đầy đủ — 'tổng tiền cược', 'số vé', 'tỷ lệ trả thưởng' — KHÔNG viết dính " +
          "liền kiểu camelCase khi có dấu ('tổngTiềnCược' hệ thống không tách được ranh giới chữ " +
          "hoa có dấu, sẽ hiển thị dính chữ sai). Header đã tiếng Việt hoặc là thuật ngữ nghiệp vụ " +
          "quen dùng, ASCII sẵn có trong hệ thống ('doanhThu', 'gameProduct', 'GGR') → giữ nguyên. " +
          "BỎ TRỐNG hoàn toàn ở cách dùng (1) — nếu vẽ từ tool dữ liệu vừa gọi, KHÔNG lặp lại số " +
          "liệu vào đây.",
      ),
    title: z
      .string()
      .optional()
      .describe(
        "Tiêu đề ngắn cho biểu đồ, BẮT BUỘC tiếng Việt tự nhiên như người Việt gọi nội dung đó " +
          "(vd 'Tuổi các thành viên trong gia đình', 'Doanh thu Keno theo tháng') — KHÔNG ghép nửa " +
          "Anh nửa Việt ('Age theo name') và KHÔNG dịch từng tên cột rồi nối bằng 'theo' ('Tuổi " +
          "theo tên'). Dùng thêm ngữ cảnh câu hỏi nếu có. CHỈ dùng khi có điền `rows` (dữ liệu " +
          "người dùng tự cung cấp không có tên báo cáo để đặt tiêu đề tự động). Bỏ trống ở cách " +
          "dùng (1), hệ thống tự đặt tên theo tool dữ liệu.",
      ),
  }),
  execute: async ({ chartType, rows, title }) => {
    // Chế độ (1) — `rows` trống: dữ liệu nằm ở output tool TRƯỚC ĐÓ (cùng lượt hoặc lượt trước).
    // Tool này không thấy được output đó nên không kiểm chứng ở đây; FE tự dò và báo nếu không tìm
    // được (xem `ChartUnavailableNote`). Trả `ok: true` ≠ chart đã hiện — model CHỈ viết "đã vẽ" /
    // nhận xét số liệu khi biết chắc đã có bảng chartable trong hội thoại (cùng lượt hoặc lượt trước).
    if (rows === undefined || rows.length === 0) {
      return {
        ok: true,
        mode: "fromPreviousTool" as const,
        reminder:
          "UI tự ghép biểu đồ từ tool dữ liệu gần nhất trong hội thoại. Nếu không có bảng nào để vẽ, " +
          "người dùng sẽ thấy ghi chú 'Chưa vẽ được biểu đồ' — khi đó CẤM viết 'đã vẽ' hay nhận xét như " +
          "thể biểu đồ đã hiện; nói chưa vẽ được và vì sao.",
      };
    }

    // Chế độ (2) — `rows` do model tự trích từ dữ liệu người dùng dán: kiểm chứng NGAY tại đây bằng CHÍNH
    // engine mà FE dùng để vẽ, để model biết kết quả THẬT.
    //
    // Trước 23/08 `execute` luôn trả `{ ok: true }` ⇒ model luôn tưởng chart đã vẽ và viết nhận xét
    // số liệu, trong khi UI chỉ hiện dòng "không vẽ được" (bug người dùng báo: dán CSV, không có chart mà
    // vẫn có đoạn phân tích như đã vẽ). Kiểm chứng ở BE là chỗ DUY NHẤT model đọc được kết quả.
    const model = buildChartModel(rows as ChartRow[], chartType, title ?? "Dữ liệu tự nhập");
    if (model === null) {
      return {
        ok: false as const,
        reason:
          "Không dựng được biểu đồ từ `rows`: cần ít nhất 2 dòng, một field làm trục (thời gian, " +
          "nhóm phân loại, hoặc mốc số) và một field số để đo. Hãy nói rõ là chưa vẽ được và thiếu " +
          "gì, KHÔNG nhận xét số liệu như thể đã vẽ. Khi trả lời, gọi người dùng là 'bạn' và KHÔNG " +
          "nhắc tên field nội bộ (`rows`) — nói 'dữ liệu', 'cột'.",
      };
    }
    return {
      ok: true as const,
      mode: "inlineRows" as const,
      kind: model.kind,
      kindLabel: getChartLabel(model.kind),
      pointCount: model.rows.length,
      xField: model.x.dataKey,
      seriesFields: model.series.map((s) => s.dataKey),
      // `rejectedKind` có giá trị khi loại người dùng yêu cầu không phù hợp dữ liệu — model dùng thông
      // tin này để nói rõ đã đổi sang loại nào và vì sao (thay vì im lặng vẽ loại khác).
      rejectedKind: model.rejectedKind,
      highlights: chartHighlights(model),
    };
  },
});

/** Cực trị + tổng của 1 series, kèm ĐÚNG mốc trục X mà giá trị đó thuộc về. */
interface SeriesHighlight {
  field: string;
  /** Mốc trục X của giá trị lớn nhất — chuỗi nguyên văn như vẽ trên trục (vd `"06/2026"`). */
  maxAt: string;
  max: number;
  minAt: string;
  min: number;
  total: number;
  /** Mốc trục X có giá trị 0 hoặc rỗng — chỗ hay bị đọc lệch nhất vì mắt tự bỏ qua khoảng trống. */
  zeroAt: string[];
}

/**
 * Neo sự thật cho phần nhận xét: mỗi series trả về cực trị/tổng kèm ĐÚNG mốc trục X tương ứng.
 *
 * Vá lỗi thật (feedback 24/08): model vẽ doanh thu Keno theo tháng rồi viết _"tháng 5 đạt 1,96 triệu"_
 * trong khi 1,96 triệu là của **tháng 6** — tháng 5 bằng 0. Cơ chế sinh lỗi: ở chế độ `rows`, model tự
 * gộp số từ nhiều kết quả tra cứu, còn kết quả tool cũ chỉ trả `pointCount`/`xField` — KHÔNG có cặp
 * mốc–giá trị nào. Nên khi viết nhận xét, model không có gì để đối chiếu, phải dựa vào ký ức về bảng
 * số nó vừa tự gõ; các tháng rỗng (tháng 1, 2, 5) làm lệch phép đếm dòng đi 1 nhịp ⇒ gán giá trị tháng
 * 6 cho tháng 5. Đây là lỗi đọc-lệch-dòng kinh điển, và nó nguy hiểm vì câu văn vẫn rất trôi chảy.
 *
 * `zeroAt` có mặt vì chính các mốc rỗng là nguồn lệch: nêu thẳng "tháng nào bằng 0" thì model không
 * còn phải tự suy ra khoảng trống nằm ở đâu.
 *
 * Chỉ tính cho chế độ `rows`. Chế độ (1) dữ liệu nằm trong output tool trước đó — model đọc trực tiếp
 * ở đó, không đi qua đây.
 */
function chartHighlights(model: NonNullable<ReturnType<typeof buildChartModel>>): SeriesHighlight[] {
  const xKey = model.x.dataKey;
  return model.series.map((series) => {
    const key = series.dataKey;
    let maxAt = "";
    let max = Number.NEGATIVE_INFINITY;
    let minAt = "";
    let min = Number.POSITIVE_INFINITY;
    let total = 0;
    const zeroAt: string[] = [];

    for (const row of model.rows) {
      const at = String(row[xKey] ?? "");
      const raw = row[key];
      // Mốc thiếu số (null/rỗng) tính là 0 — giống hệt cách chart vẽ khoảng trống, để nhận xét không
      // mô tả một đường khác với đường người dùng đang nhìn.
      const value = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
      if (Number.isNaN(value)) {
        continue;
      }
      total += value;
      if (value > max) {
        max = value;
        maxAt = at;
      }
      if (value < min) {
        min = value;
        minAt = at;
      }
      if (value === 0) {
        zeroAt.push(at);
      }
    }

    return { field: key, max, maxAt, min, minAt, total, zeroAt };
  });
}
