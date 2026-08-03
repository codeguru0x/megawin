# p1-01 — Minh bạch combo cho player (ownership-gated)

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` §3.8, verdict #15.
> **Phase:** P1 · **Phụ thuộc:** p0-04 (combo-stats data), p0-07 (backoffice ổn) · **Blocks:** —.

## Mục tiêu

Cho player tự kiểm tra "combo tôi đã cược đang có bao nhiêu người cùng chơi" — **CHỈ combo mà account đang có entry trong draw đó** (ownership-gated). Khi cap 8/9/10 chia đều kích hoạt, con số công bố kiểm chứng được → chứng minh hệ thống không gian lận. Realtime, không cần chốt salesClosed.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Player handler | `apps/api-player/src/handlers/keno/{action}.ts` (ApiGateway, Zod input, use-case) |
| Player use-case | `packages/game-keno-application/src/use-cases/player/` (`ApiGatewayUseCase`, DTO trong `dto/player.dto.ts`) |
| Combo repo | `ComboStatsRepository.getByCombo` (p0-04) |
| Ownership check | `EntryRepository` query `{ accountId, drawId }` (index sẵn `idx_tenant_account_financialDate` sau p0-01 — hoặc index accountId+drawId hiện có; xác nhận) |
| combo key helper | helper build `comboKey` từ p0-04 (tái dùng, KHÔNG viết lại) |
| player-sdk | `packages/player-sdk/src/keno/` (types), `apis/keno.ts` (KenoApi + factory), `endpoints.ts`; rule `player-sdk-jsdoc.mdc` (Release Checklist) |

## Việc cần làm

### 1. Player use-case (`use-cases/player/get-combo-popularity.ts`)

- `GetComboPopularityUseCase extends ApiGatewayUseCase<Input, Output>`:
  - Input: `{ accountId (từ auth), drawId, numbers[] }`.
  - **Ownership gate NGHIÊM NGẶT (chốt 28/07/2026):** đọc entries của chính account trong draw (`{ accountId, drawId }`, vài doc) → so app-side xem account có board **đúng combo cần check** (playType pick8/9/10 + đúng tập số) không.
    - **Combo KHÔNG thuộc entry nào của account → luôn báo "không tồn tại"** — trả **y hệt** trường hợp combo không có trong DB (không phân biệt "chưa cược" vs "combo không tồn tại"). Mục đích: chặn player dùng endpoint để **dò ẩn** bộ số bất kỳ của hệ thống. Kẻ dò không thể phân biệt "combo này có người chơi nhưng tôi chưa cược" với "combo này chưa ai chơi" — cả hai đều trả cùng một response rỗng.
    - **Chỉ khi account THỰC SỰ có entry chứa đúng combo đó** → build `comboKey` (helper p0-04) → `getByCombo` → trả `{ found: true, sets }` (đọc §"Cập nhật sau review" — KHÔNG trả `players`, công thức chia cap dùng số bộ). **TUYỆT ĐỐI không** trả `amount`/`accountId`/`username`.
  - Không index mới (analysis §3.8). Không throw 403 (403 tự tiết lộ "combo tồn tại nhưng không phải của bạn") — dùng response rỗng đồng nhất, xem quyết định.

### 2. Player handler (`apps/api-player/src/handlers/keno/get-combo-popularity.ts`)

- ApiGateway handler, auth bắt buộc, Zod validate `drawId` + `numbers` (8–10 số `"01".."80"`).
- Delegate use-case.

### 3. player-sdk (theo Release Checklist `player-sdk-jsdoc`) — **COMMENT ĐẦY ĐỦ (bắt buộc)**

> **Nhấn mạnh:** rule `player-sdk-jsdoc.mdc` bắt buộc mọi public export có JSDoc đầy đủ vì SDK xuất bản TypeDoc cho tenant. Type/method dưới đây PHẢI có: summary rõ ràng, `@example` copy-pasteable, mô tả format từng property (không lặp tên field), `@throws` cho error đã biết. Đặc biệt giải thích **rõ ràng cơ chế ownership-gate** trong JSDoc method để tenant hiểu vì sao có combo trả rỗng (không phải bug).

1. `src/keno/types.ts`:
   - `KenoComboPopularityParams { drawId: string; numbers: string[] }` — JSDoc: `drawId` format `YYYY-MM-DD.NNN`; `numbers` là 8–10 số `"01".."80"` (zero-padded string, khớp convention hệ thống).
   - `KenoComboPopularityResponse { found: boolean; sets?: number }` — JSDoc giải thích: `found=false` khi player CHƯA cược đúng combo này (hoặc combo chưa ai chơi) — hai trường hợp cố ý không phân biệt để bảo vệ dữ liệu hệ thống; `sets` chỉ có khi `found=true`. KHÔNG có `players` (xem "Cập nhật sau review" — công thức chia cap dùng số bộ, không dùng số người).
   - `@example` cho cả hai type.
2. `endpoints.ts`: `getComboPopularity: (drawId) => `/games/keno/draws/${drawId}/combo-popularity` as const`.
3. `apis/keno.ts`: method `getComboPopularity(params)` trong `KenoApi` — JSDoc: summary, `**Endpoint:**`, `@param`, `@returns`, `@throws {@link ApiClientError}` (`UNAUTHORIZED`), `@example` hoàn chỉnh, **và 1 đoạn giải thích ownership-gate** (chỉ xem được combo mình đã cược; combo lạ luôn trả `found:false`) + impl trong `createKenoApi`.
4. `src/index.ts`: re-export type mới từ `./keno`.
5. `CHANGELOG.md`: `### Added` (không bump version).
6. Verify: `pnpm --filter @megawin/player-sdk check-types` + `pnpm --filter @megawin/player-sdk docs:build` (đảm bảo TypeDoc render sạch, không thiếu JSDoc).

### 4. UI player (web player app)

- Trên màn hình vé/combo của player: sau khi cược pick 8/9/10, hiển thị `sets` của combo mình, refresh realtime đến giờ đóng cược. Chỉ hiện khi `found: true`. Copy pattern hiển thị/poll hiện có của player app (xác nhận app + component mẫu khi làm).

## Quyết định cần chốt

- **Response khi combo không thuộc entry của player:** trả `{ found: false }` (200) **đồng nhất** cho cả "chưa cược combo" lẫn "combo không tồn tại" — KHÔNG dùng 403/404 phân biệt (tránh oracle tiết lộ combo hệ thống). Chốt: `{ found: false }`.
- **`sets` chính xác realtime:** vì worker cập nhật `sets` theo delta insert-stream (p0-04), giá trị chính xác realtime, KHÔNG approximate — không cần ghi chú "đang cập nhật". Field `players` KHÔNG trả — xem "Cập nhật sau review" dưới.

## Không làm

- KHÔNG cho tra combo chưa cược (chống probing — analysis §3.8). KHÔNG trả amount/accountId/username cho player. KHÔNG index mới. KHÔNG chốt salesClosed riêng cho public. KHÔNG dùng 403/404 phân biệt combo (dùng `found:false` đồng nhất).

## Verify

`check-types` application + api-player + player-sdk + `docs:build` player-sdk. Test: player cược pick10 → xem được `sets` combo đó (`found:true`); tra combo CHƯA cược HOẶC combo lạ → `found:false`, không lộ số, không phân biệt hai case.

## Định nghĩa Done

Player xem được độ đông combo **đã cược** (realtime, gated nghiêm ngặt), combo lạ luôn trả `found:false`, SDK JSDoc + CHANGELOG đầy đủ (TypeDoc render sạch), không rò dữ liệu. Cập nhật `00-overview.md`.

## Cập nhật sau review (28/07/2026)

Response ban đầu có cả `sets` VÀ `players`. Review lại quy tắc chia đều cap 8/9/10
(`apply-payout-caps.ts`: `cappedPrize = calculateCappedPrize(fixedPrize, winnerCount,
maxPerDraw, maxSetsForFixed)` — `winnerCount` đếm theo **SỐ BỘ** trúng, không theo số
người) → `players` không phải input của công thức, không cần cho player tự kiểm chứng phần
chia của mình. Đã bỏ `players` khỏi `PlayerComboPopularityOutput` và
`KenoComboPopularityResponse` (SDK) — response chỉ còn `{ found, sets? }`.

Bài học cho game khác implement minh bạch combo/số tương tự: TRƯỚC khi thiết kế response
public, đọc kỹ công thức chia thưởng thật (payout-cap/split use-case) để biết chính xác
input nào cần công khai — không suy đoán "chắc cần cả 2" rồi trả dư dữ liệu.
