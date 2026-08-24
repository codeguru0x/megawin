/**
 * Tool-choice: `getFinancialTrend` (chuỗi theo kỳ, lọc 1 game) vs `getFinancialByGame` (gộp cả
 * khoảng, so sánh giữa các game). Hai tool cùng đọc một collection tài chính nên mô tả nghe rất
 * giống nhau — khác nhau ở **cái gì làm một DÒNG**: trend = 1 kỳ, byGame = 1 game.
 *
 * VÌ SAO CÓ FILE NÀY (sự cố 24/08): câu "vẽ biểu đồ doanh thu 6 tháng đầu năm của Keno" từng được
 * xử lý bằng cách gọi `getFinancialByGame` SÁU LẦN (mỗi tháng một lần) rồi `renderChart` — mà
 * `renderChart` vẽ nguyên output của lần gọi CUỐI, nên biểu đồ hiện tài chính tháng 6 của cả 7 game
 * trong khi phần nhận xét nói về chuỗi Keno theo tháng. Không có tool nào trả đúng chuỗi đó trong
 * một lần gọi, nên lỗi là tất yếu chứ không phải model bất cẩn. `getFinancialTrend` bịt lỗ đó; file
 * này là chỗ ĐO rằng model thật sự chọn nó, vì instruction một mình không đủ để tin.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description:
      "Xu hướng 1 game qua nhiều tháng — phải gọi tool theo kỳ ĐÚNG MỘT LẦN với period=month, " +
      "không gọi tool gộp-theo-game 6 lần.",
    async test(t) {
      const turn = await t.send("Doanh thu Keno 6 tháng đầu năm 2026 theo từng tháng là bao nhiêu?");
      turn.succeeded();
      turn.calledTool("getFinancialTrend", {
        input: { from: "2026-01-01", to: "2026-06-30", period: "month", game: "keno" },
        count: 1,
      });
      turn.notCalledTool("getFinancialByGame").soft();
      turn.maxToolCalls(4);
    },
  }),
  defineEval({
    description:
      "Vẽ biểu đồ chuỗi thời gian 1 game — dữ liệu phải đến từ MỘT lần gọi tool theo kỳ, " +
      "vì renderChart vẽ nguyên output của lần gọi gần nhất (sự cố 24/08).",
    async test(t) {
      const turn = await t.send("Vẽ biểu đồ doanh thu Keno 6 tháng đầu năm 2026.");
      turn.succeeded();
      turn.calledTool("getFinancialTrend", {
        input: { period: "month", game: "keno" },
        count: 1,
      });
      turn.requireToolCall("renderChart");
      turn.notCalledTool("getFinancialByGame").soft();
    },
  }),
  defineEval({
    description: "So sánh GIỮA các game trong 1 khoảng — vẫn phải là tool gộp theo game, không phải tool theo kỳ.",
    async test(t) {
      const turn = await t.send("Từ 2026-08-01 đến 2026-08-15, game nào có lợi nhuận cao nhất?");
      turn.succeeded();
      turn.requireToolCall("getFinancialByGame", { input: { from: "2026-08-01", to: "2026-08-15" } });
      turn.notCalledTool("getFinancialTrend").soft();
    },
  }),
  defineEval({
    description:
      "So sánh 2 game theo thời gian trên CÙNG 1 biểu đồ — phải dùng getFinancialTrendByGame ĐÚNG MỘT " +
      "LẦN với games=[keno,power655], KHÔNG gọi getFinancialTrend lặp lại theo từng game (sự cố 24/08: " +
      "biểu đồ chỉ vẽ được Power 6/55, thiếu Keno, vì renderChart chỉ đọc output của lần gọi tool cuối).",
    async test(t) {
      const turn = await t.send(
        "Vẽ bar chart so sánh doanh thu thuần của 2 game Keno và Power 6/55 qua mỗi tháng năm 2026.",
      );
      turn.succeeded();
      turn.calledTool("getFinancialTrendByGame", {
        input: { period: "month", metric: "ggr" },
        count: 1,
      });
      turn.notCalledTool("getFinancialTrend");
      turn.requireToolCall("renderChart");
    },
  }),
];
