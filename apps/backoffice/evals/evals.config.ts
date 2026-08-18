/**
 * Config gốc cho `evals/` — Eve yêu cầu đúng 1 file này ở app-root (`node_modules/eve/docs/evals/overview.mdx`).
 *
 * Bộ eval ở đây (p1-03 §7) đo TOOL-CHOICE của model THẬT (agent dùng model cấu hình ở
 * `agent/agent.ts`, KHÔNG dùng `mockModel`) — mục tiêu là bắt lỗi model chọn sai tool/tham số
 * giữa 13 tool mới (Wave 1 + Wave 2) và các cặp dễ nhầm (§7 mục 2), không phải test runtime eve.
 *
 * Mọi case đều assert bằng `t.calledTool()`/`t.check()` xác định (deterministic) — không cần
 * `judge` (LLM-as-judge chấm điểm mờ). Bỏ trống theo đúng gợi ý overview.mdx: "a tree of fully
 * deterministic evals can omit it".
 */

import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({});
