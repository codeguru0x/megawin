/**
 * ResultFeed – Fetch Transport Types
 *
 * `02-fetch-parse.plan.md §1`. Hợp đồng "thuê bytes" — mọi vendor unblocker (Oxylabs,
 * context.dev, …) implement `FetchProvider`. Thêm vendor mới = thêm 1 class, KHÔNG sửa
 * adapter, KHÔNG sửa domain, KHÔNG sửa use-case.
 */

import type { ResultFeedProviderId } from "@megawin/resultfeed/entities";

/** Yêu cầu lấy nội dung một URL. Cố ý nghèo nàn: mọi provider đều phải làm được. */
export interface FetchRequest {
  url: string;
  /**
   * Có yêu cầu vendor render JS không. Mặc định `false`.
   * Bật render thường đắt hơn và CHẬM hơn — chỉ bật khi đã ĐO là trang cần JS.
   * Trang server-rendered bật render là trả tiền vô ích.
   */
  render?: boolean;
  /** Quốc gia exit node, ISO-2. `"vn"` cho site Việt Nam. */
  country?: string;
  timeoutMs?: number;
  /**
   * Header tuỳ ý. ⚠️ Tránh dùng: một số vendor đòi duyệt compliance khi bật custom
   * header và có thể mất chế độ pay-per-success. Nếu adapter cần header lạ → xem lại
   * có endpoint GET thuần nào thay được không.
   */
  headers?: Record<string, string>;
}

/** Kết quả thô. Provider TUYỆT ĐỐI không được sửa `body`. */
export interface FetchResult {
  ok: boolean;
  httpStatus: number;
  contentType: string;
  /** Bytes nguyên văn. Không decode, không trim, không prettify. */
  body: Buffer;
  /** Meta thô của vendor (để debug/mở ticket). Không ai được parse field này ra logic. */
  providerMeta: Record<string, unknown>;
  elapsedMs: number;
  fetchedAt: Date;
  failureReason: string | null;
}

/**
 * Hợp đồng "thuê bytes". Thêm vendor mới = thêm 1 class implement interface này,
 * KHÔNG sửa adapter, KHÔNG sửa domain, KHÔNG sửa use-case.
 */
export interface FetchProvider {
  readonly providerId: ResultFeedProviderId;
  fetch(req: FetchRequest): Promise<FetchResult>;
}
