/**
 * Tool-choice: `getGameConfig` — nguồn DUY NHẤT cấu hình 7 game (mệnh giá/betCount/prizes/rates/
 * jackpot seed/ops threshold). 2 case khác `sections` để xác nhận model chọn đúng nhóm dữ liệu.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — bảng giải Keno pick 3.",
    async test(t) {
      const turn = await t.send("Bảng giải Keno pick 3 hiện trả bao nhiêu tiền mỗi hạng?");
      turn.succeeded();
      turn.requireToolCall("getGameConfig", { input: { game: "keno", sections: ["prizes"], pickSize: 3 } });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — mệnh giá vé và lịch quay Mega 6/45.",
    async test(t) {
      const turn = await t.send("Vé Mega 6/45 giá bao nhiêu, mấy giờ quay?");
      turn.succeeded();
      turn.requireToolCall("getGameConfig", { input: { game: "mega645" } });
    },
  }),
];
