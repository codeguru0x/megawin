/**
 * Async utilities dùng chung.
 */

import { AppException } from "../errors/app-exception";
import { APP_ERROR_CODES, type AppErrorCode } from "../errors/error-codes";
import { logError } from "./log";

/** Code mặc định được coi là "nguồn vắng mặt bình thường" trong {@link tryLoad}. */
const DEFAULT_ABSENT_CODES: readonly AppErrorCode[] = [APP_ERROR_CODES.NOT_FOUND];

/**
 * Dừng thực thi `ms` mili-giây (Promise wrapper của `setTimeout`).
 *
 * Dùng để giữ nhịp trong worker loop (vd stats-sync sleep giữa mỗi tick).
 * KHÔNG dùng cho retry/backoff HTTP (đã có cơ chế riêng trong `http-client`).
 *
 * @param ms - Số mili-giây cần dừng. Giá trị ≤ 0 resolve ngay.
 *
 * @example
 * ```ts
 * await sleep(10_000); // chờ 10s
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Tuỳ chọn cho {@link tryLoad}. */
export interface TryLoadOptions {
  /** Tên use-case/endpoint gọi, dùng làm label log. VD: `"ListJackpots"`. */
  scope: string;
  /** Nguồn đang load, để biết nguồn NÀO lỗi khi đọc log. VD: `"lotto535"`. */
  source: string;
  /**
   * Các `AppErrorCode` coi là "vắng mặt bình thường" → trả `undefined`, KHÔNG log.
   * Default `["NOT_FOUND"]`. Truyền `[]` nếu mọi lỗi đều là bất thường.
   */
  absentCodes?: readonly AppErrorCode[];
}

/**
 * Load 1 nguồn dữ liệu KHÔNG BẮT BUỘC cho response tổng hợp (aggregate) nhiều nguồn.
 *
 * Dùng khi 1 endpoint gộp dữ liệu từ N nguồn độc lập (nhiều game, nhiều repo) và **thiếu
 * 1 nguồn vẫn phải trả được phần còn lại** (partial degradation). Hàm này KHÔNG BAO GIỜ
 * reject, nên call site dùng `Promise.all` thuần — không cần `Promise.allSettled` +
 * `PromiseSettledResult` rải khắp tầng app.
 *
 * Phân loại kết quả — điểm quan trọng nhất:
 * - `null`/`undefined` hoặc `AppException` có code thuộc `absentCodes` (default `NOT_FOUND`)
 *   → trả `undefined`, **KHÔNG log**. Đây là trạng thái NGHIỆP VỤ bình thường (vd game
 *   đang giữa 2 jackpot cycle) — log sẽ làm nhiễu và che lỗi thật.
 * - Mọi lỗi khác (DB timeout, config sai, bug mapping) → `logError` kèm `scope`/`source`
 *   rồi mới trả `undefined`. **Tuyệt đối không nuốt im lặng**: nếu DB chết mà vẫn trả
 *   `200 { items: [] }` thì không ai biết hệ thống đang lỗi.
 *
 * Đưa cả mapping vào `load` (`.then(toSummary)`) để mọi nguồn cùng trả về 1 type chung —
 * khi đó gom kết quả chỉ là `.filter((x) => x !== undefined)`, không cần out-param.
 *
 * @param load - Hàm load (kèm mapping nếu có). Trả `null`/`undefined` = nguồn vắng mặt.
 * @param options - `scope`/`source` để trace log, `absentCodes` để tuỳ biến phân loại.
 * @returns Dữ liệu đã load, hoặc `undefined` nếu vắng mặt / lỗi.
 *
 * @example
 * ```ts
 * const SCOPE = "ListJackpots";
 * const [lotto535, mega645] = await Promise.all([
 *   tryLoad(() => this.lotto535.run().then(toLotto535Summary), { scope: SCOPE, source: "lotto535" }),
 *   tryLoad(() => this.mega645.run().then(toMega645Summary), { scope: SCOPE, source: "mega645" }),
 * ]);
 *
 * return { jackpots: [lotto535, mega645].filter((jp) => jp !== undefined) };
 * ```
 */
export async function tryLoad<T>(
  load: () => Promise<T | null | undefined>,
  options: TryLoadOptions,
): Promise<T | undefined> {
  const { scope, source, absentCodes = DEFAULT_ABSENT_CODES } = options;

  try {
    // `?? undefined` để null và undefined hội tụ về 1 giá trị — call site chỉ cần check undefined.
    return (await load()) ?? undefined;
  } catch (err) {
    // Vắng mặt theo nghiệp vụ → im lặng. Không dùng `absentCodes.length` để short-circuit:
    // `[]` nghĩa là "mọi lỗi đều bất thường", includes() tự trả false.
    if (err instanceof AppException && absentCodes.includes(err.code)) {
      return undefined;
    }

    logError(scope, err, { source });
    return undefined;
  }
}
