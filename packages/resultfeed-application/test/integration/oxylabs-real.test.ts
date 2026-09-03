/**
 * ResultFeed – Integration test THẬT: OxylabsUnblockerProvider + vietlottDetailAdapter
 *
 * ⚠️ KHÁC với `test/infras/providers/oxylabs-provider.test.ts` (PURE, fetchImpl giả) — file
 * NÀY gọi PROXY OXYLABS THẬT (`unblock.oxylabs.io:60000`) → request THẬT tới `vietlott.vn`,
 * TỐN CREDIT thật (per-GB). Không chạy trong CI thông thường — tự `skip` nếu thiếu
 * `OXYLABS_USERNAME`/`OXYLABS_PASSWORD` trong `.env.test.local` (KHÔNG dùng cờ riêng, vì
 * "có credentials" đã LÀ tín hiệu opt-in rõ ràng — giống cách `ALLOW_DB_TESTS` xác nhận ý
 * định chạm DB thật).
 *
 * Mục đích: xác nhận Oxylabs Web Unblocker trả ĐÚNG dữ liệu cho 2 kỳ cụ thể user yêu cầu
 * verify — Bingo18 #0184369, Keno #0294129 — và `vietlottDetailAdapter.parse()` đọc đúng
 * cấu trúc DOM thật (không chỉ đúng với fixture HTML tĩnh đã lưu sẵn), qua ĐÚNG
 * `buildDetailUrl` mà `adapter.planNextFetch` dùng trong production (không tự chế URL riêng
 * trong test — nếu `urls.ts` sai, test này phải fail theo).
 *
 * ⚠️ Bằng chứng thật đã xác nhận (không phải giả định): `nocatche` hành xử KHÁC NHAU giữa 2
 * game — xem JSDoc chi tiết trong `../../src/sources/vietlott/vietlott-detail/urls.ts`. Keno
 * dùng timestamp biến thiên, Bingo18 dùng hằng số `1`. `buildDetailUrl` đã encode đúng khác
 * biệt này — test chỉ gọi qua hàm đó, không cần biết chi tiết bên trong.
 */

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { describe, expect, it } from "vitest";

import { OxylabsUnblockerProvider } from "../../src/infras/providers/oxylabs-provider";
import { vietlottDetailAdapter } from "../../src/sources/vietlott";
import { buildDetailUrl } from "../../src/sources/vietlott/vietlott-detail/urls";

const hasCredentials = Boolean(process.env.OXYLABS_USERNAME && process.env.OXYLABS_PASSWORD);

describe.skipIf(!hasCredentials)("OxylabsUnblockerProvider + vietlottDetailAdapter (REAL network)", () => {
  const provider = new OxylabsUnblockerProvider({
    username: process.env.OXYLABS_USERNAME ?? "",
    password: process.env.OXYLABS_PASSWORD ?? "",
  });

  it("Đúng logic — Bingo18 #0184369: fetch thật trả 200, parse đúng kỳ + đủ 3 số xúc xắc + checksum", async () => {
    const period = "0184369";
    const url = buildDetailUrl(ResultFeedGameKey.Bingo18, period, Date.now());

    const fetchResult = await provider.fetch({ url });

    expect(fetchResult.ok).toBe(true);
    expect(fetchResult.httpStatus).toBe(200);
    expect(fetchResult.body.length).toBeGreaterThan(0);

    const parsed = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Bingo18,
      body: fetchResult.body,
      contentType: fetchResult.contentType,
    });

    // Bingo18 chỉ có 3 số (3 xúc xắc độc lập, giữ nguyên trùng lặp) — KHÔNG phải 18.
    expect(parsed.drawPeriod).toBe(period);
    expect(parsed.numbersDisplay).toHaveLength(3);
    expect(parsed.claimedChecksums.sum).toBeDefined();

    // In ra để user tự đối chiếu bằng mắt với trang vietlott.vn thật.
    console.log("[oxylabs-real] Bingo18 #0184369 parsed:", JSON.stringify(parsed, null, 2));
  }, 30_000);

  it("Đúng logic — Keno #0294129: fetch thật trả 200, parse đúng kỳ + đủ 20 số + 4 checksum", async () => {
    const period = "0294129";
    const url = buildDetailUrl(ResultFeedGameKey.Keno, period, Date.now());

    const fetchResult = await provider.fetch({ url });

    expect(fetchResult.ok).toBe(true);
    expect(fetchResult.httpStatus).toBe(200);
    expect(fetchResult.body.length).toBeGreaterThan(0);

    const parsed = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Keno,
      body: fetchResult.body,
      contentType: fetchResult.contentType,
    });

    expect(parsed.drawPeriod).toBe(period);
    expect(parsed.numbersDisplay).toHaveLength(20);
    expect(Object.keys(parsed.claimedChecksums)).toEqual(expect.arrayContaining(["even", "odd", "big", "small"]));

    console.log("[oxylabs-real] Keno #0294129 parsed:", JSON.stringify(parsed, null, 2));
  }, 30_000);
});
