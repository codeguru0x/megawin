/**
 * Trần số kỳ mỗi request bulk (settle/void/close-sales/open-sales) — DÙNG CHUNG mọi game.
 *
 * Cơ sở: 50 kỳ × 5 đồng thời = 10 chunk. Các use-case đơn chỉ CHUYỂN TRẠNG THÁI (settle chỉ
 * *start* SFN, không chờ settle xong) nên mỗi kỳ ~100-200ms → 10 chunk ≈ 2s, an toàn dưới
 * timeout Lambda route. 200 kỳ sẽ chạm timeout và mất toàn bộ kết quả.
 *
 * Batch 1 giờ của Keno (`drawIntervalMinutes = 8`) ≈ 7-8 kỳ; Bingo18 (`= 6`) ≈ 10 kỳ → 50 đủ
 * rộng cho cả batch dồn 5-6 giờ. Backlog lớn hơn thì chia nhiều lần bấm — có chủ đích, để
 * người vận hành thấy kết quả từng lô thay vì chờ một request khổng lồ.
 *
 * File này CỐ Ý chỉ chứa hằng số, KHÔNG import gì: Client Component (`hub-bulk-action-bar.tsx`)
 * import trực tiếp subpath `./use-cases/bulk-draw-action/limits` để hiển thị trần cho staff.
 * Nếu để chung với {@link runBulkDrawAction} (import `mongodb`/AWS SDK qua use-case đơn),
 * bundler Next.js sẽ kéo cả cây đó vào bundle browser → build lỗi.
 */
export const BULK_MAX_DRAWS = 50;

/**
 * Trần số kỳ chạy đồng thời trong 1 request bulk.
 *
 * Settle: mỗi kỳ = 1 SFN execution + 1 chuỗi Lambda + 1 luồng ghi rollup daily.
 * `Promise.all` trần trên 50 kỳ sẽ đấm 50 execution vào Step Functions cùng lúc. 5 giữ được
 * lợi ích song song mà vẫn đo được và không cần tăng reserved concurrency của worker.
 *
 * COUPLED với `MAX_CAS_ATTEMPTS` của `SystemPublishSettleDailyUseCase`: N kỳ settle song song
 * = N luồng tranh CAS trên cùng doc `(gameProduct, financialDate)`. Nâng hằng số này thì phải
 * xem lại số lượt retry CAS ở đó, nếu không rollup daily sẽ thua nhiều hơn và phải dựa vào
 * SFN retry để bù.
 *
 * Với close-sales/open-sales (chỉ 1 DB write, không SFN) 5 là thừa an toàn — dùng chung một
 * hằng số cho cả 4 action để không có 4 con số phải nhớ.
 */
export const BULK_CONCURRENCY = 5;
