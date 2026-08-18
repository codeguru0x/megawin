/**
 * Tool-choice: TRUNCATION — khi output có `total` lớn hơn `limit` (dữ liệu bị cắt), câu trả lời
 * PHẢI nói rõ theo `instructions.md` rule 12, KHÔNG trình bày như danh sách đầy đủ (p1-03 §7 mục 3).
 *
 * BEST-EFFORT có chủ đích: `total > limit` phụ thuộc dữ liệu THẬT trong DB dev/staging lúc chạy
 * eval (không có fixture seed riêng cho evals) — nếu Keno chưa có đủ kỳ đã settle trong range hỏi,
 * `wasTruncated` sẽ là `false` và case tự bỏ qua check nội dung (`t.log` ghi rõ lý do) thay vì
 * fail giả. Chọn Keno (tần suất cao nhất, ~30 kỳ/giờ) + `limit: 1` để tối đa hoá khả năng trigger
 * truncation thật trên dữ liệu có sẵn.
 */

import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Truncation — hỏi danh sách kỳ Keno đã settle nhưng chỉ giới hạn 1 kết quả.",
  async test(t) {
    const turn = await t.send(
      "3 ngày qua (2026-08-14 đến 2026-08-17) Keno settle bao nhiêu kỳ rồi, chỉ cần cho tôi xem đúng 1 kỳ làm ví dụ thôi.",
    );
    turn.succeeded();
    const call = turn.requireToolCall("getDrawSettleReport", { input: { game: "keno" } });

    const output = call.output as { success?: boolean; data?: { result?: unknown } } | undefined;
    const result = output?.success
      ? (output.data?.result as { total?: unknown; limit?: unknown } | undefined)
      : undefined;
    const total = typeof result?.total === "number" ? result.total : undefined;
    const limit = typeof result?.limit === "number" ? result.limit : undefined;
    const wasTruncated = total !== undefined && limit !== undefined && total > limit;

    if (!wasTruncated) {
      t.log(
        `Bỏ qua check nội dung truncation — dữ liệu Keno thật trong range hỏi không đủ để trigger ` +
          `(total=${String(total)}, limit=${String(limit)}). Case chỉ xác nhận tool/tham số đúng.`,
      );
      return;
    }
    t.check(turn.message, includes(/cắt|giới hạn|còn|thu hẹp|trang tiếp|toàn bộ/i)).soft();
  },
});
