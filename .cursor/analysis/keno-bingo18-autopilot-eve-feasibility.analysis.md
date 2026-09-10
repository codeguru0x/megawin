system: keno-bingo18-autopilot-eve-feasibility (Analysis)

> Status: discussing · Ngày tạo: 06/09/2026
> Câu hỏi gốc: có nên dùng AI Agent framework "eve" (đã cài trong `apps/backoffice`, chạy AI Panel
> "Mira") để xây tính năng Auto-Pilot tự động kết sổ cho Keno/Bingo18 không? Nên làm chung hay
> riêng với Multi-Draw Monitor đang thiết kế?

## 1. Hiện trạng thật của eve + Mira trong repo (không phải giả định)

- `eve@0.51.1` là dependency THẬT trong `apps/backoffice/package.json`, không phải công cụ ngoài
  chưa cài. `.eve/` có runtime snapshot + workflow-data thật.
- `apps/backoffice/agent/` là AI Agent "Mira" — persona đọc từ `agent/instructions.md`,
  `AI_ASSISTANT_NAME = "Mira"` (`src/config/app-config.ts:17`), chat UI ở
  `src/components/ai-chat/` + `src/components/ai-panel/`, trang `/ai`.
- 30 tool trong `agent/tools/*` — TẤT CẢ đều dạng `getXxx`/`listXxx`/`searchXxx` (query, đọc dữ
  liệu). `write_file.ts` bị **disable tường minh** ("agent CHỈ ĐỌC số liệu, không ghi gì").
  Không tool nào gọi settle/publish-result/close-sales/void.
- Chỉ 1 channel: `agent/channels/eve.ts` — HTTP request-driven, cần session staff thật qua
  better-auth. Không có cron/schedule nào kích hoạt agent tự chạy.
- `AutoPilotToggle` ("Mira Auto-Pilot") ở Keno operations là UI placeholder xác nhận rõ trong
  comment: chưa nối API, chưa có cron/worker nào.

**Kết luận nền tảng: Mira/eve hiện tại là "trợ lý tra cứu-giải thích" (copilot read-only), hoàn
toàn CHƯA có khả năng thực thi mutation hay tự chạy theo lịch.** Bất kỳ thiết kế Auto-Pilot mới đều
phải coi đây là điểm bắt đầu từ 0 cho phần "hành động", không phải mở rộng 1 khả năng đã có.

## 2. Nên xây rule engine auto-settle bằng eve (LLM) hay bằng deterministic use-case (TypeScript)?

**Khuyến nghị: KHÔNG dùng LLM/eve cho phần quyết định "kỳ này có được auto-settle không".**
Dùng use-case deterministic thông thường (giống toàn bộ pipeline settle đã có).

Lý do:

1. **Nguyên tắc tài chính đã có trong rule của repo**: "Code tài chính (settle, payout, wallet,
   financial, commission): tuyệt đối không dùng `impact` làm bằng chứng duy nhất. Đọc code + test."
   — tinh thần chung là mọi quyết định tài chính phải deterministic, test được, audit được.
   Một lời gọi LLM (không deterministic, không 100% reproducible, có thể hallucinate ở edge case)
   không đáp ứng được yêu cầu này khi đứng trực tiếp trên đường quyết định "có kết sổ tiền thật
   hay không".
2. **Rule đã có sẵn** (`error-handling-conventions.mdc`, `code-quality-standards.mdc`) đòi hỏi mọi
   nhánh nghiệp vụ có comment giải thích rõ điều kiện — logic ngưỡng (stake thấp, không có alert
   critical, đã quá N phút từ sales-closed) là các so sánh số/boolean đơn giản, không cần suy luận
   ngôn ngữ tự nhiên. Viết bằng if/switch bình thường nhanh hơn, rẻ hơn, và dễ test hơn gọi LLM.
3. **Chi phí/độ trễ**: gọi LLM cho ~119-158 lần/ngày (mỗi kỳ 1 lần đánh giá) là chi phí và latency
   không cần thiết cho 1 quyết định có thể trả lời bằng vài phép so sánh.
4. **Đã có case tương tự trong repo và bị bác đúng hướng**: rule `player-sdk-jsdoc.mdc` từng thử
   dùng type-level guard cho một việc tương tự "muốn máy tự đảm bảo đúng" và đã bỏ vì chi phí lớn
   hơn giá trị hẹp mang lại — tinh thần chung của codebase là ưu tiên cơ chế đơn giản, tường minh,
   kiểm chứng được hơn là cơ chế "thông minh" mờ đục.

**Vai trò đúng cho eve/Mira trong tính năng này: tầng GIẢI THÍCH + GIÁM SÁT, KHÔNG PHẢI tầng
QUYẾT ĐỊNH.** Ví dụ hợp lý:
- Thêm tool mới `getAutoSettleQueue`/`explainAutoSettleDecision` (read-only) cho Mira, để staff hỏi
  "vì sao kỳ 2026-09-06.045 bị auto-settle" hoặc "kỳ nào đang chờ backfill và vì sao" — Mira trả lời
  bằng cách gọi lại đúng dữ liệu/log quyết định đã có, KHÔNG tự đưa ra quyết định mới.
- Có thể dùng eve schedule cho tác vụ giám sát định kỳ THUẦN THÔNG BÁO (ví dụ tổng hợp cuối ca "hôm
  nay auto-settle N kỳ, backfill M kỳ, lý do…") — vẫn không mutation.

## 3. Thiết kế Auto-Settle Rule Engine (deterministic, không cần eve)

### 3.1. Điều kiện đề xuất (cấu hình được, không hardcode)

Một kỳ được đưa vào hàng đợi auto-settle khi TẤT CẢ đúng:

1. `status === SalesClosed` và đã có kết quả gợi ý tin cậy cao (từ nguồn Vietlott đã verify, xem
   `.cursor/analysis/system-draw-result-auto-import.analysis.md` §3.4/§3.8 — checksum nội tại +
   `drawPeriod` liên tục), HOẶC `status === Published` (đã có result, chờ settle).
2. Tổng tiền cược kỳ đó (`stats.totalSalesAmount`) dưới ngưỡng cấu hình (ví dụ X VNĐ) — "rủi ro
   thấp" đo bằng exposure tuyệt đối, không phải tỷ lệ.
3. KHÔNG có alert `severity=critical` đang mở cho kỳ đó (dùng `ListAlertsUseCase`/repo mở rộng đã
   thiết kế ở Phase 3 Monitor). Alert `warning`/`info` có thể cấu hình cho phép hoặc không.
4. Số lượng entry dưới ngưỡng cấu hình (tránh auto-settle kỳ có quá nhiều vé cần review).
5. Không phải kỳ đang trong luồng resettle (`settledAt` đã có) — auto-pilot chỉ áp dụng settle LẦN
   ĐẦU, không tự động resettle sau khi sửa kết quả (đúng ranh giới `NEVER` đã chốt ở §3.8 phân tích
   automation: "Đã settle, số đổi → NEVER, phải người quyết").

Mọi ngưỡng ở trên là field trong `OpsAutoSettleConfig` (per-game, giống cấu trúc `OpsAlertsConfig`
đã có ở Keno) — không hardcode.

### 3.2. Vị trí kỹ thuật — tái dùng tối đa Phase 0-2 đã lên kế hoạch

Auto-settle KHÔNG cần pipeline riêng — nó là **1 caller mới** gọi ĐÚNG API bulk-settle
(`TriggerSettleBatchUseCase`) đã thiết kế ở Phase 2 cho Monitor page, với `drawIds` được chọn bởi
1 use-case mới `EvaluateAutoSettleEligibilityUseCase` (deterministic, thuần rule) thay vì staff tự
tick checkbox. Về bản chất: **Monitor page = con người chọn kỳ rồi bấm bulk-settle; Auto-Pilot =
rule engine chọn kỳ rồi tự bấm bulk-settle (khi toggle ON)**. Cùng 1 API, khác nguồn chọn draw.

Cơ chế trigger cho use-case đánh giá: 1 worker/cron nhỏ (Lambda EventBridge, giống các worker khác
trong repo — KHÔNG cần eve schedule, vì đây là job chạm DB/mutation, thuộc `apps/worker-{keno|bingo18}`
theo đúng kiến trúc hiện có, không phải AI agent job) chạy mỗi N phút (ví dụ 2-5 phút, đủ nhanh so
với chu kỳ 6-8 phút/kỳ), gọi:
1. `GetAutoSettleQueueUseCase` (tái dùng `getUnfinishedDraws()` đã có) → lọc draw đủ điều kiện.
2. Nếu `OpsAutoSettleConfig.enabled === true` cho game đó → gọi `TriggerSettleBatchUseCase` với
   danh sách đủ điều kiện (concurrency cap 5 như đã chốt).
3. Ghi log quyết định vào 1 collection nhỏ (`{game}_auto_settle_decisions`) — mỗi dòng: `drawId`,
   `decision: "auto" | "backfill"`, `reasons: string[]`, `evaluatedAt` — để Monitor UI hiển thị và
   để Mira (nếu cần) trả lời câu hỏi "vì sao" bằng cách đọc lại log này (KHÔNG suy luận).

### 3.3. Backfill — kỳ không đạt điều kiện

Kỳ KHÔNG đạt (stake cao/có alert/entry nhiều) vẫn hiện trong Monitor Queue như bình thường, có
badge riêng "Cần review — Auto-Pilot bỏ qua: {reason}" lấy từ log quyết định ở trên. Staff xử lý
tay đúng luồng hiện tại (mở Detail Panel, kiểm tra, bấm kết sổ) — đây chính là "user backfill" theo
đúng ý user đã nêu.

## 4. Nên làm chung hay riêng với Multi-Draw Monitor?

**Khuyến nghị: LÀM CHUNG 1 initiative, chia phase rõ, không tách thành 2 dự án riêng.**

Bằng chứng gắn kết sâu (đúng như user nhận định):

1. Auto-Pilot và Monitor dùng **CHUNG data source** (`getUnfinishedDraws()`, alert theo nhiều
   draw) và **CHUNG action API** (`TriggerSettleBatchUseCase`/`VoidDrawBatchUseCase` ở Phase 2).
   Xây riêng sẽ trùng lặp gần như toàn bộ tầng data + action.
2. Auto-Pilot CẦN Monitor làm nơi hiển thị kết quả (audit trail "đã auto-settle gì, bỏ qua gì, vì
   sao") — không có Monitor, Auto-Pilot là 1 hộp đen không ai theo dõi được, đi ngược lại đúng nhu
   cầu gốc của user ("khó bao quát toàn hệ thống").
3. Cả hai đều PHẢI đứng sau Phase 0 (vá race daily rollup) và Phase 1 (bỏ guard tuần tự) — không
   thể làm Auto-Pilot trước khi 2 phase nền này xong, vì Auto-Pilot chạy nhiều settle liên tiếp
   càng làm lộ race đó nhanh hơn so với staff bấm tay.

**Cách chia hợp lý — 1 initiative, thêm 1 phase mới (không tách dự án):**

- Phase 0-2 (đã lên kế hoạch): vá race + bỏ guard + bulk API — nền dùng chung.
- Phase 3 (đã lên kế hoạch): Monitor page — thao tác bulk MANUAL trước, để staff làm quen UI/luồng
  mới, đồng thời là công cụ kiểm chứng bulk API ổn định trước khi giao cho máy tự bấm.
- **Phase 4 (mới, sau khi Phase 3 chạy ổn định thực tế 1-2 tuần):** Auto-Pilot rule engine +
  worker/cron + `OpsAutoSettleConfig` + tích hợp hiển thị "auto vs backfill" ngay trong Monitor
  table (không tạo UI riêng). Nối lại đúng `AutoPilotToggle` đã có (đổi từ local state sang gọi
  API cấu hình thật).
- Việc **tuần tự hoá theo thời gian** (Phase 3 trước, Phase 4 sau, không làm đồng thời) là điểm
  khác với gợi ý "làm chung" theo nghĩa 1 PR — lý do: để máy tự bấm hàng loạt (Phase 4) an toàn hơn
  khi tính năng bulk-settle đã được con người dùng thật, tìm lỗi thật (Phase 3) trước.

## 5. Việc KHÔNG làm (out of scope, dễ lạc hướng)

- Không dùng eve/LLM để đánh giá "rủi ro thấp" — dùng ngưỡng số cấu hình được (§3.1).
- Không để Auto-Pilot tự resettle sau khi sửa kết quả — luôn `NEVER`, giữ đúng ranh giới đã chốt ở
  phân tích automation trước.
- Không xây schedule bằng eve cho tác vụ mutation — schedule mutation thuộc `apps/worker-*`
  (Lambda/EventBridge, kiến trúc hiện có), eve chỉ nên đứng ở tầng giải thích/thông báo nếu dùng.
