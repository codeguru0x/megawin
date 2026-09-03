/**
 * ResultFeed – FetchAndParseUseCase (orchestration)
 *
 * `02-fetch-parse.plan.md §4.1`. 1 instance = 1 nguồn × 1 game (VD `vietlott-detail` ×
 * `keno`). Ghép 3 tầng đã có — `FetchProvider` (thuê bytes, resolve theo `Source.providerId`),
 * `SourceAdapter` (parse pure), rule layer (`checkIntrinsic`, `canonicalizeNumbers`,
 * `computePayoutHash`/`computeDisplayHash`) — thành 1 pipeline crash-safe, KHÔNG thêm logic
 * nghiệp vụ mới ở đây.
 *
 * Pipeline ĐÚNG THỨ TỰ theo plan §4.1 (không đảo bước — thứ tự là phần của thiết kế):
 *   1. Cursor đến hạn chưa (`nextFetchAt <= now`)? Chưa ⇒ `not_due`.
 *   2. Source đang bật (`isEnabled`)? Không ⇒ `source_disabled`.
 *   2.5. `cursor.isPaused` (đã vượt ngưỡng intrinsic-fail liên tiếp, xem mục "TỰ ĐỘNG PAUSE"
 *      dưới)? Có ⇒ `paused`, KHÔNG gọi provider — chờ vận hành `resumeFromPause`.
 *   3. Cursor chưa từng seed kỳ khởi điểm (`lastConfirmedPeriod === null`, cold start thật) ⇒
 *      `awaiting_seed`, KHÔNG gọi provider — chờ vận hành `seedAnchor`. Đã có anchor ⇒
 *      `adapter.planNextFetch` dự đoán +1 như thường.
 *   4. `provider.fetch` → LƯU submission NGAY (kể cả khi lỗi) — bằng chứng trước, xử lý sau.
 *   5. `adapter.parse` lỗi:
 *      - `ResultUnavailableError` (best-effort, xem `vietlott-detail/dom-helpers.ts`) ⇒
 *        `submission.state = unavailable`, KHÔNG alert, KHÔNG backoff ⇒ `result_unavailable`.
 *        Đây là trạng thái BÌNH THƯỜNG — vừa là tín hiệu "đã bắt kịp live edge" cho vòng lặp
 *        tick bên dưới, vừa là điều kiện DỪNG backfill.
 *      - Lỗi khác ⇒ `submission.state = parse_failed` + alert Critical ⇒ thoát.
 *   6. `checkIntrinsic` — Failed vẫn LƯU observation (state=failed) + alert, KHÔNG bỏ. Đếm
 *      liên tiếp — vượt ngưỡng ⇒ TỰ ĐỘNG PAUSE nguồn (xem mục riêng dưới).
 *   7. `drawPeriod !== expectedPeriod` ⇒ alert Warning `period_gap` rồi SELF-HEAL: nhận kỳ
 *      thực tế làm anchor mới (`recordSuccess`), tiếp tục dự đoán +1 từ đó — KHÔNG block.
 *   8. Upsert observation (idempotent theo unique key).
 *   9. Cập nhật cursor: `lastConfirmedPeriod`, `nextFetchAt` (schedule-aware, xem `schedule.ts`),
 *      reset failure counter.
 *
 * ⚠️ BẤT BIẾN LỊCH CHẠY: **mọi** đường thoát sau bước 2 PHẢI ghi `nextFetchAt` (qua
 * `recordSuccess`, `recordFailure`, `recordUnavailable`, hoặc `schedulePausedRetry`). Nhánh
 * nào `return` mà không ghi thì `nextFetchAt` còn ở quá khứ ⇒ cron 1 phút gọi lại đúng URL đó
 * mãi mãi (~1.440 request/ngày trả phí cho một câu trả lời không đổi). Đây là bug đã có thật ở
 * `parse_failed` + `period_gap` và là lý do backoff gom vào đúng một helper (`nextBackoffAt`) +
 * đúng một repo method (`recordFailure`).
 *
 * CRASH-SAFE: mỗi bước ghi DB xong mới sang bước kế — crash giữa 2 bước chỉ mất tối đa
 * 1 bước, không mất bằng chứng đã lưu. IDEMPOTENT: `upsertSubmission` khoá theo
 * `{sourceId, contentHash}` (fetch lại ra đúng bytes cũ ⇒ `$inc seenCount`, không sinh doc mới
 * và KHÔNG throw duplicate key), `upsertObservation`/`recordSuccess` là upsert theo unique key.
 *
 * ⚠️ `contentHash` KHÔNG PHẢI LUÔN hash trên `body` gốc — nếu `adapter.normalizeForHash` có
 * implement (VD `vietlott-detail` — WebForms `__VIEWSTATE`/debug timestamp đổi ở MỌI lần
 * render dù dữ liệu kỳ quay không đổi, xem `vietlott-detail/dom-helpers.ts`), hash tính trên
 * bytes ĐÃ chuẩn hoá để dedup đúng. `bodyGz` LƯU vẫn luôn nguyên văn `fetchResult.body`, hàm
 * chuẩn hoá chỉ ảnh hưởng input của `createHash`, không đụng gì tới bytes lưu.
 *
 * ## BURST CATCH-UP (đuổi kịp sau outage kéo dài)
 *
 * Class kế thừa `TickLoopWorker` (không phải `SingleRunWorker` thuần) — 1 invocation có thể
 * chạy NHIỀU tick (mỗi tick = đúng 1 kỳ) liên tiếp, dừng khi `shouldStop` hoặc hết `budgetMs`.
 * Tick trả `ok`/`period_gap` (còn khả năng còn kỳ tiếp theo — `period_gap` đã self-heal, xem
 * bước 7) ⇒ tick kế tiếp chạy NGAY (sau khoảng nghỉ jitter nhỏ, xem `resolveTickMs`); MỌI
 * outcome khác (kể cả `result_unavailable` — đã đuổi tới mép dữ liệu thật) ⇒ dừng vòng lặp,
 * invocation kế tiếp (cron 1 phút) tự tiếp tục từ cursor đã persist. Không cần biết trước "kỳ
 * mới nhất là bao nhiêu" (không cần parse trang list phân trang) — `result_unavailable` TỰ nó
 * là vạch đích.
 *
 * ### Chỉ bật vòng lặp nhiều tick khi CHỦ ĐỘNG được đánh dấu có sự cố (`cursor.needsBackfill`)
 *
 * Nếu chỉ dựa vào "outcome khác `ok` thì dừng", vận hành bình thường (không backlog) vẫn tốn
 * 1 tick "dò" dư mỗi chu kỳ: tick 1 fetch thành công (`ok`) ⇒ tiếp tục; tick 2 mới thấy
 * `cursor.nextFetchAt` đã dời ra tương lai (`not_due`) rồi dừng — tốn thêm 1 round-trip DB +
 * 1 khoảng nghỉ jitter ({@link BURST_TICK_MIN_MS}–{@link BURST_TICK_MAX_MS}) mỗi lần có kỳ
 * mới, dù chẳng có gì để đuổi kịp.
 *
 * KHÔNG suy luận "có backlog hay không" bằng so sánh thời gian (`now - nextFetchAt`) — cách
 * đó phụ thuộc đồng hồ máy chủ, `minIntervalMs` cấu hình đúng/sai, và không phân biệt được
 * "vừa trễ 1 tick do cold start" với "outage thật kéo dài nhiều giờ". Thay vào đó dùng
 * `SourceCursorDoc.needsBackfill` — cờ metadata CHỦ ĐỘNG do chính pipeline set khi xảy ra sự
 * cố thật (`recordFailure`, ở bước 3/4/5: cold start chưa seed, fetch lỗi, parse lỗi/HTML đổi
 * cấu trúc — KHÔNG gồm bước 7 `period_gap`, đã self-heal qua `recordSuccess`), và tắt lại khi
 * `recordUnavailable` xác nhận đã đuổi tới đúng mép dữ liệu hiện tại (không còn gì để backfill)
 * hoặc ops `seedAnchor`/`markNeedsBackfill`.
 *
 * `beforeLoop` đọc `cursor.needsBackfill` (peek 1 lần TRƯỚC tick đầu, giá trị này giữ nguyên
 * suốt invocation kể cả khi tick giữa loop tự tắt cờ — an toàn vì tick đó cũng tự set
 * `shouldStop`). `burstEnabled = false` ⇒ `runTick` luôn `shouldStop = true` ngay sau tick
 * đầu, dù outcome là `ok` — invocation trả về đúng 1 tick, không tick dò, giống hành vi
 * `SingleRunWorker` cũ. `burstEnabled = true` (đang có sự cố ghi nhận) ⇒ tiếp tục chạy tới
 * khi hết `ok` hoặc hết `budgetMs` — đây chính là cơ chế "chạy nhanh hơn cho tới khi bắt kịp".
 *
 * ⚠️ `burstEnabled = true` KHÔNG chỉ mở vòng lặp — còn PHẢI bypass lịch bình thường ở
 * `nextFetchAt` (xem {@link resolveSuccessNextFetchAt}). Nếu bước 9/7 vẫn gọi thẳng
 * `computeNextFetchAt` (đẩy `now + minIntervalMs`, VD Keno = 2 phút), tick kế tiếp trong
 * CÙNG invocation (chạy chỉ `BURST_TICK_MIN_MS`–`BURST_TICK_MAX_MS` sau) sẽ tự thấy
 * `nextFetchAt` ở tương lai ⇒ `"not_due"` ⇒ dừng ngay sau đúng 1 tick — vô hiệu hoá hoàn toàn
 * burst dù `needsBackfill = true`. Đây là bug thật đã tồn tại (sửa 2026-09): burst mode chưa
 * từng chạy quá 1 tick/invocation trước khi vá.
 *
 * ⚠️ Cùng bug đó tái diễn ở dạng NHẸ HƠN sau bản vá vòng 1 (sửa 2026-09, vòng 3): nhánh burst
 * vẫn ghi một mốc ở TƯƠNG LAI (`now + BURST_TICK_MIN_MS`). Vì `TickLoopWorker` ngủ
 * `tickMs - elapsed` (KHÔNG ngủ đủ `tickMs`), mốc tương lai đó lại chặn tick kế tiếp mỗi khi
 * lượt fetch mất ≥ `tickMs - BURST_TICK_MIN_MS`, tức gần như luôn luôn với fetch thật. Bài học
 * chung cho cả 3 vòng: **`nextFetchAt` ghi ở nhánh burst PHẢI ở quá khứ** — nó là gate mà chính
 * tick sau của cùng invocation sẽ đọc; mọi việc điều nhịp chống-bot thuộc `resolveTickMs`, KHÔNG
 * thuộc `nextFetchAt`.
 *
 * ⚠️ BUG THỨ 2 (sửa 2026-09, vòng 2) — riêng nhánh KHÔNG burst (steady state) của game lịch
 * cố định: `resolveSuccessNextFetchAt` gọi `computeNextFetchAtAfterConfirm` (không phải
 * `computeNextFetchAt`) — dò slot lịch kế tiếp tính từ NGÀY QUAY của kỳ VỪA xác nhận
 * (`parsed.drawDateSource`), không phải từ thời điểm gọi (`now`). Lý do: nếu tick xác nhận
 * kỳ đó chạy TRỄ hơn giờ quay lý thuyết (VD do lặp `result_unavailable` nhiều ngày —
 * KHÔNG set `needsBackfill`, nên `burstEnabled` vẫn `false`), tính slot từ `now` sẽ nhảy
 * QUÁ kỳ kế tiếp (đã ở quá khứ so với `now`) sang kỳ kế-kế tiếp — bỏ sót đúng kỳ đã được site
 * công bố từ trước. Xem JSDoc `schedule.ts` mục "BUG ĐÃ SỬA (2026-09, vòng 2)" để biết chi
 * tiết + ví dụ cụ thể.
 *
 * ## TỰ ĐỘNG PAUSE khi parser đọc SAI mà không throw (silent — `needsBackfill` không bắt được)
 *
 * `needsBackfill`/backoff chỉ kích hoạt khi có gì đó THROW ở bước 4/5 (fetch lỗi, parse lỗi
 * hẳn, lệch kỳ). Có 1 kiểu lỗi nguy hiểm hơn: site đổi cấu trúc HTML khiến `adapter.parse()`
 * vẫn chạy "thành công về hình dạng" (đủ số, đúng format) nhưng ĐỌC SAI NỘI DUNG (selector
 * match nhầm phần tử) — outcome vẫn là `"ok"`, cursor vẫn tiến bình thường, KHÔNG có tín hiệu
 * dừng nào, và dữ liệu sai âm thầm chảy vào consensus suốt thời gian chưa phát hiện + fix.
 *
 * Lưới chặn riêng: `checkIntrinsic` (so khớp checksum nguồn tự công bố, xem `rules/intrinsic-check.ts`)
 * là verify độc lập DUY NHẤT có được từ 1 nguồn — parser đọc lệch cột/lệch bảng thì số và
 * checksum sẽ KHÔNG còn khớp nhau. `cursor.consecutiveIntrinsicFailures` đếm số lần `Failed`
 * LIÊN TIẾP; vượt {@link INTRINSIC_FAILURE_PAUSE_THRESHOLD} ⇒ `cursor.isPaused = true` — tick
 * kế tiếp thoát ngay ở bước 2.5, KHÔNG gọi provider thêm, alert Critical
 * (`ResultFeedAlertType.IntrinsicPaused`) đứng cho tới khi vận hành đối chiếu thủ công với
 * site gốc (hoặc deploy fix parser) rồi gọi `resumeFromPause`. `isPaused` set kèm
 * `needsBackfill = true` — resume xong burst tự chạy để đuổi phần đã tích lại trong lúc dừng.
 *
 * Ngưỡng ≥ 1 (không dừng ngay ở lần lệch đầu) vì 1 kỳ lệch ĐƠN LẺ có thể do NGUỒN nhập liệu
 * sai thật (hiếm nhưng xảy ra, không phải lỗi parser) — chỉ liên tiếp nhiều lần mới đủ bằng
 * chứng kết luận lỗi HỆ THỐNG. Đang paused mà chạm 1 kỳ `Passed` xen giữa KHÔNG tự resume
 * (gate 2.5 chặn trước khi parse chạy) — phải qua đường vận hành thủ công, máy không đủ tin
 * cậy để tự kết luận "đã hết lỗi" từ 1 quan sát.
 */

import {
  IntrinsicState,
  ResultFeedAlertSeverity,
  ResultFeedAlertType,
  type ResultFeedGameKey,
  type ResultFeedSourceId,
  SubmissionState,
} from "@megawin/resultfeed/entities";
import {
  canonicalizeNumbers,
  checkIntrinsic,
  computeDisplayHash,
  computePayoutHash,
  incrementPeriod,
} from "@megawin/resultfeed/rules";
import { AppException } from "@megawin/shared/errors";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { TickLoopWorker } from "@megawin/worker-core/workers";
import { Binary } from "mongodb";

import { resolveProvider } from "../../infras/providers/registry";
import { AlertRepository } from "../../infras/repos/alert-repo";
import { ObservationRepository } from "../../infras/repos/observation-repo";
import { SourceCursorRepository } from "../../infras/repos/source-cursor-repo";
import { SourceRepository } from "../../infras/repos/source-repo";
import { SubmissionRepository } from "../../infras/repos/submission-repo";
import type { SourceAdapter } from "../../sources/types";
import { ResultUnavailableError } from "../../sources/types";
import type { GameFetchSchedule } from "./schedule";
import { computeNextFetchAtAfterConfirm } from "./schedule";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

/** ±20% — nhịp đều tăm tắp là dấu hiệu bot rõ nhất (plan §4, "Jitter bắt buộc"). */
const JITTER_RATIO = 0.2;
/** Chặn trên backoff luỹ tiến khi fetch thất bại liên tiếp — tránh khoảng nghỉ vô hạn. */
const MAX_BACKOFF_MS = 30 * 60 * 1000;
/**
 * Chu kỳ giữa 2 tick liên tiếp trong burst catch-up (1 invocation nhiều tick) — KHÔNG bắn
 * liên tục 0ms dù server trả lời rất nhanh. Nhịp hoàn toàn đều tăm tắp, lặp lại hàng chục lần
 * trong vài chục giây, là dấu hiệu bot kinh điển; ngoài ra backend ASP.NET WebForms cũ của
 * Vietlott có thể không chịu tải tốt nếu bắn liên tục không nghỉ.
 * Không liên quan chi phí (số request để đuổi kịp N kỳ luôn là N, không đổi theo tốc độ).
 *
 * ⚠️ Đây là **CHU KỲ** (khoảng cách giữa 2 lần BẮT ĐẦU request), KHÔNG phải khoảng NGHỈ giữa 2
 * request. `TickLoopWorker.runLocked` ngủ `tickMs - elapsed`, tức khoảng nghỉ thật là
 * `max(0, tickMs - elapsed)` và có thể bằng 0 khi 1 tick xử lý lâu hơn `tickMs`; cái được đảm
 * bảo ≥ sàn là `max(elapsed, tickMs)`. Vì `elapsed` của 1 lượt fetch thật (HTTP/headless render
 * + 4–6 write DB) thường đã ≥ 1s, chu kỳ thực tế còn thưa hơn sàn này — đủ an toàn.
 *
 * Lưu ý: `resolveTickMs` được base class gọi ĐÚNG 1 LẦN mỗi invocation (xem `runLocked` bước
 * 2.2), nên giá trị roll ra là CỐ ĐỊNH trong cả invocation — jitter ở đây tạo khác biệt giữa
 * các invocation, không tạo khác biệt giữa các tick trong cùng invocation.
 */
const BURST_TICK_MIN_MS = 1000;
const BURST_TICK_MAX_MS = 2000;

/**
 * Số lần `checkIntrinsic` liên tiếp trả `Failed` trước khi TỰ ĐỘNG dừng fetch nguồn
 * (`cursor.isPaused = true`) — bảo vệ trước rủi ro "site đổi HTML khiến parser đọc SAI nội
 * dung nhưng KHÔNG throw lỗi" (silent, không bị `ParseError`/`needsBackfill` bắt vì outcome
 * tick vẫn `"ok"`). 1 lần lệch đơn lẻ CÓ THỂ là do nguồn nhập liệu sai thật (hiếm nhưng xảy
 * ra) — không nên dừng oan vì 1 quan sát; liên tiếp {@link INTRINSIC_FAILURE_PAUSE_THRESHOLD}
 * lần mới đủ mạnh để kết luận lỗi HỆ THỐNG (parser sai), cần người xác nhận trước khi tiếp
 * tục nạp thêm dữ liệu nghi vấn vào consensus.
 */
const INTRINSIC_FAILURE_PAUSE_THRESHOLD = 3;
/** Khoảng nghỉ khi đang `isPaused` — không cần luỹ tiến như backoff lỗi thật, vì tình trạng
 * này chỉ hết khi có người can thiệp (`resumeFromPause`), không tự khỏi theo thời gian. */
const PAUSED_RETRY_MS = 15 * 60 * 1000;

export interface FetchAndParseDeps {
  sourceId: ResultFeedSourceId;
  gameKey: ResultFeedGameKey;
  adapter: SourceAdapter;
  /** Lịch tính `nextFetchAt` cho nhánh thành công — xem `schedule.ts`. */
  schedule: GameFetchSchedule;
  /** = timeout Lambda của handler gọi use-case này (worker-core convention, xem `SingleRunWorker`). */
  ttlSeconds: number;
}

export type FetchAndParseOutcome =
  | { status: "not_due" }
  | { status: "source_disabled" }
  | { status: "paused" }
  | { status: "awaiting_seed" }
  | { status: "fetch_failed"; submissionId: string; failureReason: string }
  | { status: "parse_failed"; submissionId: string; reason: string }
  | { status: "result_unavailable"; submissionId: string }
  | {
      status: "period_gap";
      submissionId: string;
      expectedPeriod: string | null;
      actualPeriod: string;
    }
  | {
      status: "ok";
      submissionId: string;
      drawPeriod: string;
      intrinsicState: IntrinsicState;
    };

/** Output của cả invocation — có thể chạy nhiều tick (burst), giữ lại outcome của tick CUỐI. */
export interface FetchAndParseRunResult extends TickLoopResult {
  lastOutcome: FetchAndParseOutcome;
}

/** `Date.now() + baseMs`, baseMs đã áp jitter ±{@link JITTER_RATIO}. */
function scheduleWithJitter(baseMs: number): Date {
  const jitterFactor = 1 - JITTER_RATIO + Math.random() * (2 * JITTER_RATIO);
  return new Date(Date.now() + Math.round(baseMs * jitterFactor));
}

/**
 * Backoff luỹ tiến theo số lần thất bại LIÊN TIẾP, có trần {@link MAX_BACKOFF_MS} và jitter.
 *
 * Dùng CHUNG cho mọi loại thất bại (`fetch_failed`, `parse_failed`, `awaiting_seed`) — vì bản
 * chất giống nhau ở điểm quyết định: gọi lại NGAY cùng một URL sẽ nhận đúng câu trả lời cũ,
 * chỉ tốn thêm tiền mà không có thông tin mới. Việc phân biệt chúng thuộc alert và
 * observation, không thuộc lịch chạy. KHÔNG dùng cho `period_gap` — nhánh đó đã self-heal
 * qua `recordSuccess`/`resolveSuccessNextFetchAt` (xem bước 7), không phải sự cố cần backoff.
 */
function nextBackoffAt(minIntervalMs: number, consecutiveFailures: number): Date {
  return scheduleWithJitter(Math.min(minIntervalMs * 2 ** (consecutiveFailures + 1), MAX_BACKOFF_MS));
}

export class FetchAndParseUseCase extends TickLoopWorker<void, FetchAndParseRunResult> {
  protected readonly ttlSeconds: number;
  protected override readonly description: string;
  /**
   * Ngân sách 1 invocation — mặc định base class 55s quá ngắn cho burst catch-up (muốn tận
   * dụng gần hết Lambda timeout 120s, xem `functions/fetch.yml`). Chừa 20s buffer để
   * `finalizeAndRelease` (class cha) chắc chắn kịp chạy trước khi Lambda bị kill cứng.
   */
  protected override readonly budgetMs = 100_000;

  private readonly deps: FetchAndParseDeps;
  private readonly sourceRepo = new SourceRepository();
  private readonly cursorRepo = new SourceCursorRepository();
  private readonly submissionRepo = new SubmissionRepository();
  private readonly observationRepo = new ObservationRepository();
  private readonly alertRepo = new AlertRepository();

  /** Outcome của tick GẦN NHẤT trong invocation — `buildResult` đọc lại khi vòng lặp dừng. */
  private lastOutcome: FetchAndParseOutcome = { status: "not_due" };
  /**
   * Đo ĐÚNG 1 LẦN ở `beforeLoop` (trước tick đầu) — có sự cố thật hay không quyết định cả
   * invocation, không đổi giữa các tick (xem JSDoc đầu file mục "Chỉ bật vòng lặp nhiều tick
   * khi CHỦ ĐỘNG được đánh dấu có sự cố").
   */
  private burstEnabled = false;

  constructor(deps: FetchAndParseDeps) {
    super();
    this.deps = deps;
    this.ttlSeconds = deps.ttlSeconds;
    this.description = `Result Feed — fetch + parse ${deps.gameKey} từ nguồn ${deps.sourceId} (burst catch-up)`;
  }

  protected resolveLockKey(): string {
    return `resultfeed:fetch:${this.deps.sourceId}:${this.deps.gameKey}`;
  }

  /**
   * Peek cursor TRƯỚC tick đầu để quyết định `burstEnabled` từ `cursor.needsBackfill` — cờ
   * metadata CHỦ ĐỘNG (không suy luận theo thời gian, xem JSDoc đầu file). Không có cursor
   * (chưa từng chạy) ⇒ để `false`; tick đầu sẽ tự trả `awaiting_seed` và dừng ngay,
   * `burstEnabled` không ảnh hưởng gì trong trường hợp đó.
   */
  protected override async beforeLoop(): Promise<void> {
    const { sourceId, gameKey } = this.deps;
    await this.cursorRepo.ensureCursor(sourceId, gameKey);
    const cursor = await this.cursorRepo.findBySourceAndGameKey(sourceId, gameKey);
    this.burstEnabled = cursor?.needsBackfill ?? false;
  }

  /**
   * Chu kỳ tick trong burst — random {@link BURST_TICK_MIN_MS}–{@link BURST_TICK_MAX_MS}, base
   * class gọi ĐÚNG 1 LẦN mỗi invocation nên giá trị này cố định cho cả vòng lặp (jitter tạo
   * khác biệt giữa các invocation). Khoảng nghỉ thật giữa 2 request là `tickMs - elapsed` —
   * xem JSDoc {@link BURST_TICK_MIN_MS}.
   */
  protected async resolveTickMs(): Promise<number> {
    return BURST_TICK_MIN_MS + Math.random() * (BURST_TICK_MAX_MS - BURST_TICK_MIN_MS);
  }

  /**
   * 1 tick = 1 lượt fetch + parse + save cho đúng 1 kỳ. `shouldStop = true` cho MỌI outcome
   * khác `"ok"`/`"period_gap"` — kể cả `result_unavailable` (đã đuổi tới mép dữ liệu thật,
   * không còn gì để lấy thêm lượt này) và mọi lỗi thật (không hammer tiếp 1 endpoint đang lỗi
   * trong cùng invocation; để backoff + invocation kế tiếp xử lý).
   *
   * `"period_gap"` được coi NGANG `"ok"` ở đây — bước 7 đã self-heal (nhận kỳ thực tế làm
   * anchor mới, KHÔNG block), nên lệch kỳ không còn là lý do dừng vòng lặp catch-up.
   *
   * Cả 2 outcome này chỉ tiếp tục vòng lặp khi `burstEnabled` (đo 1 lần ở `beforeLoop`) —
   * KHÔNG có backlog thì dừng ngay sau tick đầu dù outcome là `ok`, tránh tick "dò" dư mỗi
   * chu kỳ vận hành bình thường (xem JSDoc đầu file). Có backlog thì đây chính là cơ chế
   * "chạy nhanh hơn cho tới khi bắt kịp".
   */
  protected async runTick(): Promise<TickOutcome> {
    const outcome = await this.fetchAndParseOnce();
    this.lastOutcome = outcome;
    const canContinue = outcome.status === "ok" || outcome.status === "period_gap";
    return { shouldStop: !(canContinue && this.burstEnabled) };
  }

  protected buildResult(loop: TickLoopResult): FetchAndParseRunResult {
    return { ticks: loop.ticks, lastOutcome: this.lastOutcome };
  }

  /**
   * `nextFetchAt` cho nhánh THÀNH CÔNG (bước 9 + self-heal `period_gap` bước 7) — bypass lịch
   * bình thường (`computeNextFetchAtAfterConfirm`/`minIntervalMs`) khi ĐANG burst.
   *
   * BUG ĐÃ SỬA (2026-09, vòng 1): trước đây luôn gọi `computeNextFetchAt`, đẩy `nextFetchAt`
   * ra `now + minIntervalMs` (VD Keno = 2 phút) NGAY SAU tick thành công đầu tiên. Vòng lặp
   * `runTick` (chạy chỉ vài trăm ms sau đó, xem `resolveTickMs`) re-check cursor ở bước 1 của
   * `fetchAndParseOnce`, thấy `nextFetchAt` đã ở tương lai ⇒ `"not_due"` ⇒ `shouldStop = true`
   * ngay sau ĐÚNG 1 tick — dù `needsBackfill = true` và còn hàng chục kỳ chưa lấy. Burst mode
   * trên thực tế chưa từng chạy quá 1 tick/invocation, worker chỉ đuổi kịp đúng nhịp
   * `minIntervalMs` như không có backfill gì cả.
   *
   * BUG ĐÃ SỬA (2026-09, vòng 2): nhánh KHÔNG burst (steady state, game `fixed` schedule) gọi
   * `computeNextFetchAt(schedule, now, ...)` — dò slot tính từ THỜI ĐIỂM GỌI, không phải từ
   * ngày quay của kỳ VỪA xác nhận. Khi tick chạy trễ hơn giờ quay lý thuyết của kỳ đó (VD
   * chờ "chưa có kết quả" — `recordUnavailable` — lặp lại nhiều ngày, KHÔNG phải sự cố cần
   * backoff), `now` đã trôi qua CẢ slot của kỳ kế tiếp ⇒ nhảy tới slot xa hơn, bỏ sót đúng kỳ
   * đã được site công bố từ trước. Đổi sang `computeNextFetchAtAfterConfirm` — dò slot tính
   * từ `parsed.drawDateSource` (ngày quay của kỳ vừa xác nhận, không phải `now`) — xem JSDoc
   * đầu `schedule.ts` mục "BUG ĐÃ SỬA (2026-09, vòng 2)".
   *
   * BUG ĐÃ SỬA (2026-09, vòng 3) — bản vá vòng 1 chưa triệt để: nhánh burst trả
   * `now + BURST_TICK_MIN_MS`, tức vẫn là một mốc **ở TƯƠNG LAI**, với lý lẽ "chừa chỗ phòng
   * đồng hồ lệch giữa lúc ghi và lúc đọc". Tiền đề đó SAI (giá trị `Date` do chính process này
   * tạo rồi đọc lại — không có đồng hồ thứ hai để lệch) và tác dụng thì NGƯỢC: chính nó là cái
   * gate chặn tick sau. `TickLoopWorker.runLocked` KHÔNG ngủ đủ `tickMs` giữa 2 tick — nó ngủ
   * `tickMs - elapsed` (trừ thời gian xử lý tick). Nên tick kế tiếp chỉ vượt được gate bước 1
   * khi `tickMs >= BURST_TICK_MIN_MS + elapsed`; với `tickMs ∈ [1000, 2000)` (roll ĐÚNG 1 LẦN
   * cho cả invocation, xem `resolveTickMs`) và `elapsed` của 1 lượt fetch thật (HTTP/headless
   * render + 4–6 write DB) thường ≥ 1000ms ⇒ xác suất vượt gate ≈ 0 ⇒ `"not_due"` ⇒
   * `shouldStop` ngay tick 2. Burst lại chỉ chạy 1 kỳ/invocation (≈ 1 kỳ/phút theo nhịp cron),
   * và vì phụ thuộc `tickMs` random nên biểu hiện THẤT THƯỜNG (có invocation chạy được vài
   * tick, có invocation dừng ngay) — khó phát hiện hơn bug vòng 1.
   *
   * Khi `burstEnabled` → trả mốc ở QUÁ KHỨ (`now - 1`): gate bước 1 do chính tick TRƯỚC ghi ra,
   * nên nó phải không bao giờ chặn tick SAU. Điều nhịp chống-bot giao TRỌN cho
   * `resolveTickMs`/`runLocked` (đã đảm bảo chu kỳ giữa 2 request ≥ {@link BURST_TICK_MIN_MS} —
   * xem JSDoc hằng số đó). Lợi thêm: invocation bị kill giữa burst thì `nextFetchAt` đã ở quá
   * khứ ⇒ invocation cron kế tiếp vào việc ngay, không mất thêm một nhịp.
   *
   * KHÔNG bypass khi KHÔNG burst — steady state (game liên tục: `now + minIntervalMs`; game giờ
   * quay cố định: nhảy thẳng tới giờ quay kế tiếp TÍNH TỪ KỲ VỪA XÁC NHẬN) phải giữ nguyên như
   * thiết kế ban đầu.
   */
  private resolveSuccessNextFetchAt(
    schedule: GameFetchSchedule,
    minIntervalMs: number,
    confirmedDrawDate: string,
  ): Date {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive — Biome không track this.burstEnabled bị gán lại true trong beforeLoop() (control-flow qua method khác cùng class).
    if (this.burstEnabled) {
      // Mốc QUÁ KHỨ, KHÔNG cộng offset: gate `nextFetchAt > now` ở bước 1 do chính tick này ghi
      // ra, cộng thêm bất kỳ ms nào cũng là tự chặn tick kế tiếp (bug vòng 3, xem JSDoc trên).
      return new Date(Date.now() - 1);
    }
    return computeNextFetchAtAfterConfirm(schedule, confirmedDrawDate, new Date(), minIntervalMs);
  }

  private async fetchAndParseOnce(): Promise<FetchAndParseOutcome> {
    const { sourceId, gameKey, adapter } = this.deps;

    // ── Bước 1-2: cursor đến hạn + source đang bật ────────────────────────────
    await this.cursorRepo.ensureCursor(sourceId, gameKey);
    const cursor = await this.cursorRepo.findBySourceAndGameKey(sourceId, gameKey);
    if (!cursor) {
      // ensureCursor vừa upsert — không tồn tại ở đây là lỗi hạ tầng, không phải business case.
      throw AppException.internal(`Cursor biến mất ngay sau ensureCursor (source=${sourceId}, game=${gameKey}).`);
    }
    if (cursor.nextFetchAt.getTime() > Date.now()) {
      return { status: "not_due" };
    }

    const source = await this.sourceRepo.findBySourceId(sourceId);
    if (!source?.isEnabled) {
      return { status: "source_disabled" };
    }
    const provider = resolveProvider(source.providerId);

    // ── Bước 2.5: bị TỰ ĐỘNG dừng do intrinsic-fail liên tiếp — thoát TRƯỚC KHI gọi
    // provider (0 request thêm), y hệt cách chặn `awaiting_seed`. Chỉ có
    // `resumeFromPause` (vận hành xác nhận) mới mở lại — không tự hết theo thời gian.
    if (cursor.isPaused) {
      await this.cursorRepo.schedulePausedRetry(cursor.id, new Date(Date.now() + PAUSED_RETRY_MS));
      return { status: "paused" };
    }

    // ── Bước 3: cold start thật — cursor chưa từng seed kỳ khởi điểm ──────────
    // Không đoán bằng công thức +1 trên giá trị rỗng — cần người seed
    // (`SourceCursorRepository.seedAnchor`) trước khi `planNextFetch` có gì để dự đoán.
    if (cursor.lastConfirmedPeriod === null) {
      await this.alertRepo.upsertByDedupeKey({
        type: ResultFeedAlertType.SourceStale,
        severity: ResultFeedAlertSeverity.Critical,
        payload: {
          sourceId,
          gameKey,
          reason: "cursor chưa neo kỳ khởi điểm — cần vận hành seedAnchor",
        },
        dedupeKey: `source_stale:${sourceId}:${gameKey}`,
      });
      // Vẫn phải đẩy `nextFetchAt` — không đẩy thì cron 1 phút gọi lại vô hạn (dù không
      // tốn tiền provider, vẫn tốn DB write + log rác che mất alert thật).
      await this.cursorRepo.recordFailure(cursor.id, {
        nextFetchAt: nextBackoffAt(source.minIntervalMs, cursor.consecutiveFailures),
      });
      return { status: "awaiting_seed" };
    }

    const plan = adapter.planNextFetch({ gameKey, cursor });

    // ── Bước 4: fetch → LƯU submission NGAY, kể cả lỗi ────────────────────────
    const fetchResult = await provider.fetch({
      url: plan.url,
      render: plan.render,
    });
    // `contentHash` tính trên bytes ĐÃ chuẩn hoá (nếu adapter có `normalizeForHash`) —
    // KHÔNG ảnh hưởng bytes LƯU (`bodyGz` dưới đây luôn nguyên văn `fetchResult.body`, xem
    // quy tắc bất biến ở `submission.ts`). Adapter không implement (đa số site) ⇒ hash
    // thẳng trên body gốc như trước — xem JSDoc `SourceAdapter.normalizeForHash`.
    const hashInput = adapter.normalizeForHash?.(fetchResult.body) ?? fetchResult.body;
    const contentHash = createHash("sha256").update(hashInput).digest("hex");
    const submissionId = await this.submissionRepo.upsertSubmission({
      sourceId,
      gameKey,
      requestUrl: plan.url,
      httpStatus: fetchResult.httpStatus,
      contentType: fetchResult.contentType,
      bodyGz: new Binary(gzipSync(fetchResult.body)),
      contentHash,
      bodyBytes: fetchResult.body.length,
      providerId: provider.providerId,
      elapsedMs: fetchResult.elapsedMs,
      state: fetchResult.ok ? SubmissionState.Fetched : SubmissionState.FetchFailed,
      failureReason: fetchResult.failureReason,
      fetchedAt: fetchResult.fetchedAt,
    });

    if (!fetchResult.ok) {
      const failureReason = fetchResult.failureReason ?? `HTTP ${fetchResult.httpStatus}`;
      await this.alertRepo.upsertByDedupeKey({
        type: ResultFeedAlertType.FetchFailing,
        severity: ResultFeedAlertSeverity.Warning,
        payload: {
          sourceId,
          gameKey,
          httpStatus: fetchResult.httpStatus,
          failureReason,
        },
        dedupeKey: `fetch_failing:${sourceId}:${gameKey}`,
      });
      await this.cursorRepo.recordFailure(cursor.id, {
        nextFetchAt: nextBackoffAt(source.minIntervalMs, cursor.consecutiveFailures),
      });
      return { status: "fetch_failed", submissionId, failureReason };
    }

    // ── Bước 5: parse — lỗi thì lưu state + alert rồi thoát ───────────────────
    let parsed: ReturnType<SourceAdapter["parse"]>;
    try {
      parsed = adapter.parse({
        gameKey,
        body: fetchResult.body,
        contentType: fetchResult.contentType,
      });
    } catch (err) {
      if (err instanceof ResultUnavailableError) {
        // BÌNH THƯỜNG — không phải lỗi: đã đuổi tới mép dữ liệu thật (live edge) hoặc đang
        // backfill sát tới hiện tại. KHÔNG alert, KHÔNG backoff (`recordUnavailable` reset
        // `consecutiveFailures` về 0) — nếu tính vào backoff, hiện tượng lặp lại liên tục
        // này sẽ bị hiểu nhầm thành sự cố và trì hoãn lịch fetch oan.
        await this.submissionRepo.markUnavailable(submissionId, err.message);
        await this.cursorRepo.recordUnavailable(cursor.id, scheduleWithJitter(source.minIntervalMs));
        return { status: "result_unavailable", submissionId };
      }
      const reason = err instanceof Error ? err.message : String(err);
      await this.submissionRepo.markParseFailed(submissionId, reason);
      await this.alertRepo.upsertByDedupeKey({
        type: ResultFeedAlertType.ParseFailed,
        severity: ResultFeedAlertSeverity.Critical,
        payload: { sourceId, gameKey, submissionId, reason },
        dedupeKey: `parse_failed:${sourceId}:${gameKey}`,
      });
      // BẮT BUỘC đặt lịch kế tiếp. Thiếu bước này thì `nextFetchAt` còn ở quá khứ ⇒ cron 1
      // phút gọi lại ĐÚNG URL này mãi mãi: 1.440 request/ngày trả phí cho một câu trả lời
      // không bao giờ đổi (kỳ không tồn tại, trang block). Đây là nhánh chạy NHIỀU NHẤT lúc
      // sự cố, nên nó cũng là nhánh đốt tiền nhiều nhất nếu bỏ sót.
      await this.cursorRepo.recordFailure(cursor.id, {
        nextFetchAt: nextBackoffAt(source.minIntervalMs, cursor.consecutiveFailures),
      });
      return { status: "parse_failed", submissionId, reason };
    }

    // ── Bước 6: checkIntrinsic — Failed vẫn LƯU observation, không bỏ ─────────
    const check = checkIntrinsic(gameKey, parsed.numbersDisplay, parsed.claimedChecksums);
    if (check.state === IntrinsicState.Failed) {
      await this.alertRepo.upsertByDedupeKey({
        type: ResultFeedAlertType.IntrinsicFailed,
        severity: ResultFeedAlertSeverity.Critical,
        payload: {
          sourceId,
          gameKey,
          drawPeriod: parsed.drawPeriod,
          mismatch: check.mismatch,
        },
        dedupeKey: `intrinsic_failed:${sourceId}:${gameKey}:${parsed.drawPeriod}`,
      });

      // Đếm liên tiếp — đủ ngưỡng ⇒ TỰ ĐỘNG PAUSE nguồn (xem JSDoc `INTRINSIC_FAILURE_PAUSE_THRESHOLD`
      // đầu file). Đây là lưới chặn RIÊNG cho lỗi "parse thành công nhưng SỐ SAI" — loại
      // `needsBackfill`/backoff không bắt được vì không có gì throw ở bước 5.
      const consecutiveIntrinsicFailures = cursor.consecutiveIntrinsicFailures + 1;
      const shouldPause = consecutiveIntrinsicFailures >= INTRINSIC_FAILURE_PAUSE_THRESHOLD;
      await this.cursorRepo.recordIntrinsicFailure(cursor.id, {
        consecutiveIntrinsicFailures,
        pause: shouldPause,
      });
      if (shouldPause) {
        await this.alertRepo.upsertByDedupeKey({
          type: ResultFeedAlertType.IntrinsicPaused,
          severity: ResultFeedAlertSeverity.Critical,
          payload: {
            sourceId,
            gameKey,
            consecutiveIntrinsicFailures,
            lastMismatch: check.mismatch,
            reason:
              "Checksum lệch liên tiếp ≥ ngưỡng — nghi vấn parser đọc sai do site đổi HTML. " +
              "Nguồn đã TỰ DỪNG fetch, cần vận hành đối chiếu thủ công với site gốc rồi gọi resumeFromPause.",
          },
          dedupeKey: `intrinsic_paused:${sourceId}:${gameKey}`,
        });
      }
    } else {
      // Passed/NotAvailable — reset counter. 1 kỳ đúng xen giữa không có nghĩa hệ thống đã
      // hết lỗi khi ĐANG paused (gate ở đầu chặn trước khi tới đây rồi), nhưng khi CHƯA pause
      // thì đây là tín hiệu đúng để không cộng dồn oan các lần lệch không liên tục thật.
      if (cursor.consecutiveIntrinsicFailures > 0) {
        await this.cursorRepo.recordIntrinsicPassed(cursor.id);
      }
    }

    const numbersCanonical = canonicalizeNumbers(gameKey, parsed.numbersDisplay);
    const payoutHash = computePayoutHash(gameKey, parsed.drawPeriod, parsed.numbersDisplay);
    const displayHash = computeDisplayHash(gameKey, parsed.drawPeriod, parsed.numbersDisplay);

    // ── Bước 8: upsert observation (idempotent) ───────────────────────────────
    await this.observationRepo.upsertObservation({
      sourceId,
      gameKey,
      drawPeriod: parsed.drawPeriod,
      drawDateSource: parsed.drawDateSource,
      drawTimeSource: parsed.drawTimeSource,
      numbersDisplay: parsed.numbersDisplay,
      numbersCanonical,
      displayHash,
      payoutHash,
      claimedChecksums: parsed.claimedChecksums,
      intrinsicState: check.state,
      intrinsicMismatch: check.mismatch,
      parserVersion: adapter.parserVersion,
      submissionId,
    });
    await this.submissionRepo.markParsed(submissionId);

    // ── Bước 7: kỳ nhận được có khớp kỳ kỳ vọng? Lệch ⇒ SELF-HEAL, không block ─
    if (plan.expectedPeriod !== null && parsed.drawPeriod !== plan.expectedPeriod) {
      await this.alertRepo.upsertByDedupeKey({
        type: ResultFeedAlertType.PeriodGap,
        severity: ResultFeedAlertSeverity.Warning,
        payload: {
          sourceId,
          gameKey,
          expectedPeriod: plan.expectedPeriod,
          actualPeriod: parsed.drawPeriod,
        },
        dedupeKey: `period_gap:${sourceId}:${gameKey}`,
      });
      // SELF-HEAL: nhận kỳ THỰC TẾ (không phải expected) làm anchor mới — tiếp tục dự đoán
      // +1 từ đó ở tick kế tiếp. Đây KHÔNG phải sự cố cần backoff (site không lỗi, chỉ là
      // dự đoán +1 của mình lệch so với thực tế site công bố) — dùng `recordSuccess`, không
      // `recordFailure`, để không tăng `consecutiveFailures`/`needsBackfill` oan.
      await this.cursorRepo.recordSuccess(cursor.id, {
        lastConfirmedPeriod: parsed.drawPeriod,
        nextExpectedPeriod: incrementPeriod(parsed.drawPeriod),
        nextFetchAt: this.resolveSuccessNextFetchAt(this.deps.schedule, source.minIntervalMs, parsed.drawDateSource),
      });
      return {
        status: "period_gap",
        submissionId,
        expectedPeriod: plan.expectedPeriod,
        actualPeriod: parsed.drawPeriod,
      };
    }

    // ── Bước 9: cursor thành công — neo kỳ, đặt lịch kế tiếp, reset failure ───
    await this.cursorRepo.recordSuccess(cursor.id, {
      lastConfirmedPeriod: parsed.drawPeriod,
      nextExpectedPeriod: incrementPeriod(parsed.drawPeriod),
      nextFetchAt: this.resolveSuccessNextFetchAt(this.deps.schedule, source.minIntervalMs, parsed.drawDateSource),
    });

    return {
      status: "ok",
      submissionId,
      drawPeriod: parsed.drawPeriod,
      intrinsicState: check.state,
    };
  }
}
