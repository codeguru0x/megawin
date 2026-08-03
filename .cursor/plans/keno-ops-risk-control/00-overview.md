# Keno Operations & Risk Control — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` (status `approved (P0)`)
> **Scope chốt:** 28/07/2026 — user approve toàn bộ 7 hạng mục P0 (bảng verdict §5 của analysis).
> **Feature slug:** `keno-ops-risk-control` · tuân `.cursor/plans/README.md` (thư mục hoá feature nhiều plan).

Feature này biến trang Vận hành Keno từ "dashboard tự aggregate on-demand" thành **hệ thống alert-driven đọc pre-aggregated data**: worker cập nhật stats/combo/alert async (không đụng hot path place-bet), backoffice chỉ đọc findOne O(1), staff được hệ thống chủ động báo rủi ro. Keno là bản mẫu — types chung tách vào `@megawin/game-core` để nhân rộng 6 game còn lại (analysis §8).

## Bảng trạng thái

| Plan | Phase | Status | Phụ thuộc | Ghi chú |
|---|---|---|---|---|
| p0-01-entry-indexes-fix | P0 | ✅ done | — | Bug thật, độc lập, làm trước. 3 index sửa `drawDate`→`financialDate` (key+name+purpose). Migration Atlas do DBA chạy (không có runner trong repo). |
| p0-02-game-core-ops-types | P0 | ✅ done | — | Base types shared trong `game-core/src/types/` — tách theo domain (`common.ts`, `draw.ts`, `betting-stats.ts`, `ops-alert.ts`) + barrel `index.ts` export *, tránh 1 file phình quá nhiều type không liên quan (review 28/07). |
| p0-03-draw-betting-stats | P0 | ✅ done | 02 | Collection stats + worker `SyncBettingStatsUseCase` (SingleRunWorker, loop 55s + sleep tickSeconds). Entity/repo/mapper/accumulator/handler/stats.yml. Config default (p0-05 gắn GlobalConfig). |
| p0-04-combo-stats | P0 | ✅ done | 02, 03 | Chung worker với 03. Collection combo-stats + delta accumulator + `bulkUpsertDelta` merge account + combo-lookup API (staff). **Retention đảo sang TTL index 30/07/2026** (xem mục "Review rủi ro" #11) — KHÔNG còn cleanup batch. |
| p0-05-ops-config | P0 | ✅ done | 02 | GlobalConfig.ops (alerts+stats) + merge/audit + Zod + tab "Vận hành" (tooltip 4 phần mọi field). Worker + player DTO đã gắn. **UI v2 29/07:** redesign khu vực "Bật / tắt loại alert" — bỏ list phẳng label+switch, chuyển `AlertToggleRow` giàu thông tin (icon+badge severity, tooltip ý nghĩa/ngưỡng liên quan/tác động khi tắt, summary inline, cả hàng click, hàng tắt border-dashed+mờ, header badge `N/M đang bật` + banner khi tắt hết). Guideline tách file `ops-config-page-layout.guideline.md` cho game sau follow. |
| p0-06-ops-alerts | P0 | ✅ done | 02, 03, 04, 05 | Alert collection `keno_ops_alerts` + evaluator pure (trong worker) + list/ack API (grouped default). |
| p0-07-operations-page | P0 | ✅ done | 03, 04, 06 | Snapshot endpoint (7→2 timer, ETag/304) + 2 tab (Giám sát/Phân tích) + exposure card + heatmap (chọn số tuỳ ý + action menu ⋯ + dialog tra cứu) + side-bet card gộp + alert badge/panel (đầu tab Giám sát). Dead code cleanup 28/07 (§9). UI v2 29/07: bảng số chọn tuỳ ý + tra cứu Dialog riêng + fix draw selector sort active ASC. **UI v3 29/07:** BỎ per-number liability khỏi ô heatmap + data (`KenoNumberStat.potentialWin`) — worst-case là thuộc tính board, gán per-number double-count vô nghĩa (rủi ro chi trả đo ở cấp entry); ô chỉ còn Dòng tiền + số lượt. X "Bỏ chọn" ra ngoài menu. Alerts panel format payload theo type (câu + chip, hết `[object Object]`). Bộ số phổ biến + live feed hiển thị đủ số (wrap). Layout compact: [Đại lý \| Cược gần nhất] 2 cột. Guideline layout tách file riêng `operations-page-layout.guideline.md` cho game sau follow (analysis §4.6, §4.9). |
| p1-01-combo-transparency | P1 | ✅ done | 04, 07 | Endpoint player ownership-gated (`GET /games/keno/draws/{drawId}/combo-popularity`) + player-sdk (`getComboPopularity` + types + CHANGELOG). Combo lạ luôn `{found:false}` đồng nhất. |
| p2-01-stats-worker-scale-hardening | P2 | ✅ done (Keno) | 03, 04, 06 | **Review scale 01/08/2026 → implement cùng ngày.** 11 rủi ro trên worker stats: 3 mức 🔴 (mảng `accounts` không trần chạm BSON 16MB; `$expr $size` không index được → COLLSCAN 200MB/tick; recompute không resumable → OOM/livelock kỳ lớn), 5 🟠 (lock hết hạn giữa tick → 2 writer; drift topK tích lũy tỷ lệ số người chơi; `$set` full doc 33KB × D kỳ ≈ 36GB oplog/ngày; đọc baseline không projection 25MB/phút **kể cả idle**; lock đơn toàn kỳ). **Đã sửa GỐC thay vì vá:** worker còn **1 thuật toán** (xoá `recomputeClosedDraws` ~100 dòng), accumulator **delta-only**, `$inc` theo path + watermark **per-document** (`DeltaAccumulatedDoc`), top-K derive lúc đọc từ 2 collection mới (`keno_draw_combo_accounts`, `keno_draw_account_stats`) → hết drift, `uniquePlayers` có số thật, `final` chỉ khi `Settled`/`Void`. **Còn lại:** tạo 7 index mới trên Mongo trước khi deploy. (~~gắn `resetFinal` vào flow void~~ — HUỶ 02/08: `resetFinal` đã bị xoá khỏi repo, flip `final` là no-op trong kiến trúc `$inc`; xem p2-01 §D2 + analysis stats-worker-simplification §5.3.1.) **Đã đối chiếu bingo18/max3d/max3dpro: lặp lại 8/11 rủi ro** (tránh được 2 mức 🔴 nhờ chọn `accounts: number` — xem §4); max3d/max3dpro **nặng hơn Keno** ở doc size (`tripletStakes` 1000 key ~80KB rewrite mỗi 30s) và max3dpro nặng nhất ở RAM (expand 380 ordered pair/board). §7 là **checklist bắt buộc** (24 mục) cho mọi game mới; §8 ghi những chỗ **thiết kế bị đảo khi implement** — đọc trước khi port. |
| stats-worker-simplification/ (thư mục con) | P0–P2 | ⏳ pending | p2-01 | **Refactor cấu trúc 02/08/2026** từ analysis `keno-stats-worker-simplification.analysis.md`: tách worker `ops-alerts` khỏi `stats-sync`, nâng tick loop lên `worker-core` (`TickLoopWorker`), `ensureDocs` tối giản + default phía đọc (mapper normalize), code quality Q1–Q4, KPI kỳ Settled dùng số chính thức `DrawDoc.financial` (Phương án A), + guide port 3 game. 6 file — xem `stats-worker-simplification/00-overview.md`. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

## Thứ tự thực thi đề xuất

```
p0-01 (độc lập, làm ngay)
p0-02 ──► p0-03 ──► p0-04
              │        │
              └──► p0-05 (song song được với 03/04 sau khi 02 xong)
                        │
        (03,04,05,06) ──► p0-06 ──► p0-07 ──► p1-01
```

- **p0-01** không phụ thuộc gì — có thể merge sớm nhất.
- **p0-02** là gate: mọi plan backend đọc base types từ `game-core`.
- **p0-05** (config) nên xong trước **p0-03** phần evaluator vì worker đọc ngưỡng từ `ops`; nhưng phần stats aggregation của 03 không phụ thuộc 05 → có thể làm song song, ghép evaluator sau.
- **p0-06** cần data từ 03 (stats) + 04 (combo) + ngưỡng từ 05.
- **p0-07** là tầng UI cuối, cần API/data của 03/04/06 sẵn sàng.

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

Bắt buộc tuân **§9 Kỷ luật triển khai** của analysis:

1. **KHÔNG tự sinh kiến trúc/pattern mới** — mỗi plan có mục **"Pattern tham chiếu"** trỏ file mẫu hiện hữu; copy pattern, không sáng tác.
2. **DRY qua game-core** — type dùng lại cho game khác đặt `@megawin/game-core/types`, re-export entity barrel (analysis §8). Checklist tìm-trước-khi-tạo (`code-quality-standards` §5) trước mọi type/component mới.
3. **KISS** — không abstraction logic khi mới 1 use case; chỉ types chia sẻ sớm.
4. **Không đụng hot path place-bet** — mọi thống kê đi qua worker async (analysis §3.1).
5. **UI/UX đồng nhất** — tuân `operations-page-ui.mdc` + `game-config-ui.mdc` (§14 nuqs tab, §16 tooltip 4 phần); dùng token `game-number-tokens.ts`; component thiếu lấy từ shadcn registry. **2 guideline layout bắt buộc follow:** `operations-page-layout.guideline.md` (trang Vận hành / dashboard giám sát) + `ops-config-page-layout.guideline.md` (tab "Vận hành" trong trang Config — ngưỡng cảnh báo + toggle alert giàu thông tin).
6. **MongoDB type-safe** — `docPath<TDoc>()`, entity `_id: unknown` + `{Name}Entity extends Omit<Doc,"_id">`, index khai trong `KENO_INDEXES`.
7. **Verify** mỗi plan: `pnpm --filter <package> check-types` + lint trước khi coi là done.

## Định nghĩa "Done" cho toàn feature P0

- Trang Vận hành đọc dữ liệu từ stats doc (findOne), không còn aggregation on-demand cho summary/heatmap/playtype/tenant/combos.
- Trang chạy đúng 2 timer (snapshot + live-feed), tắt poll khi draw settled, 304 khi stats chưa đổi.
- Staff nhận alert (badge + panel ack) cho large_bet / exposure_threshold / sidebet_skew / cap_sets_near / combo_concentration.
- Exposure card hiển thị worst-case + capSets; heatmap ô hiển thị Dòng tiền + số lượt (KHÔNG per-number liability — worst-case là thuộc tính board); tra cứu combo qua chọn số tuỳ ý trên bảng + action menu ⋯ → dialog riêng hoạt động.
- **UI v4 29/07:** alert account-related (large_bet) list entry + link → outstanding player kỳ này (minh bạch ai/cược gì/bao nhiêu); top risk màu (người chơi emerald / phải trả đỏ nền) + link outstanding; live feed chia 2 nhóm Pick/Side bet; đại lý card thích ứng (≤3 card giàu tt); username hiển thị nhất quán `<primary> · <tenant>` qua `PlayerName` (rule `player-display-username.mdc`, bỏ accountId dòng phụ). Xem guideline §4–6.
- **UI v5 29/07:** tách "Bộ số phổ biến" khỏi Card heatmap → **cụm 3 cột rủi ro** [Top người chơi | Top phải trả | Bộ số phổ biến] (cùng bản chất bảng xếp hạng concentration; heatmap thuần tương tác). Giữ **thứ tự macro rủi ro TRƯỚC → monitoring SAU** (bác đề xuất đưa Live feed/Đại lý lên trên: trang giám sát rủi ro, thứ giúp quyết định phải lên đầu). Xem guideline §5, analysis §4.8.
- **UI v6 30/07:** alert đã Ack KHÔNG xoá khỏi UI (mất audit trail) nhưng tách khỏi alert `new` — mỗi nhóm accordion thu gọn phần `ack` dưới disclosure "Xem N đã xử lý ▾", badge count chỉ tính phần `new`, nhóm hết `new` tự đóng lại. Tránh panel dài khi cấu hình ngưỡng quá nhạy sinh nhiều alert riêng biệt (VD `comboAccountsWarn` thấp → nhiều alert `combo_concentration`). Xem guideline §4.
- Tab "Vận hành" trên trang config sửa được ngưỡng + top-K, mọi field có tooltip 4 phần; player DTO KHÔNG lộ `ops`.
- Base types dùng chung nằm ở `game-core`, keno re-export qua barrel.
- `KENO_INDEXES` không còn index `drawDate` sai; không thêm multikey index trên entries.

## Review sau triển khai (28/07/2026) — sai sót đã sửa, ghi lại để 6 game khác KHÔNG lặp lại

Sau khi P0+P1 "done", review chi tiết phát hiện + sửa các điểm sau. Khi nhân rộng sang game
khác (analysis §8), checklist dưới đây PHẢI áp dụng ngay từ đầu, không chờ review sau:

1. **Mapper KHÔNG được định nghĩa inline trong repo file** — `mapDocToEntryForStats` từng
   nằm cuối `entry-repo.ts` (function thuần, ngoài class). Đã chuyển sang
   `infras/mappers/entry-for-stats-mapper.ts` + export qua `mappers/index.ts`. Quy tắc: MỌI
   hàm map Doc→shape (dù là entity đầy đủ qua `MongoMapper` hay projection thuần) đều sống
   trong `infras/mappers/`, không lẫn trong `infras/repos/`.
2. **DTO trả player PHẢI tối giản theo đúng công thức nghiệp vụ** — `PlayerComboPopularityOutput`
   ban đầu trả cả `sets` VÀ `players`; review lại công thức chia đều cap (`maxPerDraw /
   winnerCount`, winnerCount đếm theo SỐ BỘ) → `players` không cần cho player tự tính phần
   chia, đã bỏ. Trước khi thiết kế response cho player, luôn hỏi: "field này có phải input
   của công thức nghiệp vụ mà player cần tự kiểm chứng không?" — không phải thì bỏ.
3. **Import/export PHẢI gộp 1 khối đầu file** — `entities/types.ts` và `entities/ops-alert.ts`
   từng có `import type {...}` chèn giữa file (sau khi đã có const/interface khác). Đã fix +
   thêm rule `code-quality-standards.mdc` §6. Checklist: grep `^import |^export .* from` sau
   khi sửa file, match ở dòng số lớn (sau code khác) = vi phạm.
4. **KHÔNG indexed-access `SomeType["field"]` khi field đã có type riêng import được** —
   `PrizeContext["basic"]`, `KenoOpsAlertDoc["severity"]` từng dùng indexed-access thay vì
   import thẳng `BasicPrizes`/`OpsAlertSeverity`. Đã fix + mở rộng rule §5.1 → §5.4 (áp dụng
   MỌI type, không riêng Mongo `Doc`).
5. **`validateInput()` duplicate Zod ở use-case update-game-config — dead code, đã xoá ở
   CẢ 7 GAME** (không riêng Keno — soát lại phát hiện lotto535/mega645/power655/max3d/
   max3dpro/bingo18 đều có cùng anti-pattern). Zod schema ở route (`_lib/schema.ts`) đã
   validate chặt hơn (`positive()` vs `< 0`) → nhánh throw trong use-case không bao giờ tới.
   Rule mới: `code-quality-standards.mdc` §7 — game MỚI tuyệt đối không viết lại
   `validateInput` khi route đã có Zod cover cùng field.
6. **CHANGELOG SDK: version phải là số cụ thể tính từ `package.json`, không để `[Unreleased]`
   treo** — viết version = MINOR nếu có `### Added` (API/type mới, non-breaking), PATCH nếu
   chỉ `### Fixed`/docs, MAJOR nếu breaking. Không tự bump `package.json` (vẫn là bước
   manual), chỉ heading CHANGELOG phản ánh version dự kiến kế tiếp.
7. **Re-export base type qua barrel game (`OpsAlertStatus`/`OpsAlertSeverity`/`OpsAlertBase`
   từ `game-core/types` qua `game-{x}/entities`) là ĐÚNG và CẦN THIẾT** — xác nhận qua việc
   toàn bộ call site trong `game-keno-application` import các type này từ
   `@megawin/game-keno/entities`, không import trực tiếp `@megawin/game-core/types`. Game
   mới PHẢI làm y hệt: `import type {...} from "@megawin/game-core/types"` +
   `export {...}`/`export type {...}` lại ngay trong entity file dùng type đó — đặt ở ĐẦU
   file (không giữa file, xem điểm 3).
8. **2 use-case combo lookup (`GetComboLookupUseCase` cho staff vs `GetComboPopularityPlayerUseCase`
   cho player) KHÔNG được gộp chung** — dù cùng đọc `keno_draw_combo_stats`, response shape
   khác nhau hoàn toàn (staff thấy account/amount, player chỉ thấy `sets` sau ownership-gate).
   Đây là tách đúng vì lý do bảo mật, không phải trùng lặp cần dedupe — game khác implement
   minh bạch combo (nếu có) PHẢI tách use-case tương tự, không tái dùng use-case staff.
9. **Dead code sót lại khi migrate on-demand → pre-aggregated (p0-07)** — plan p0-07 mục 2 có
   ghi "xoá `useOpsSummary/...` cũ sau khi hết consumer" nhưng khi implement chỉ xoá được
   phần FE (hook), backend (use-case `GetOpsSummaryUseCase`/`GetTenantBreakdownUseCase`/
   `GetNumberFrequencyUseCase`/`GetPlayTypeDistributionUseCase`/`GetTopCombosUseCase`, DTO,
   5 route Next.js, 5 aggregation method nặng trong `entry-repo.ts`, 2 Zod schema, 5 query
   key) **bị bỏ sót hoàn toàn** — không lỗi compile nên không bị phát hiện qua `check-types`.
   Review riêng (yêu cầu "kiểm tra dead code sau khi áp dụng cách lấy dữ liệu mới") mới tìm
   ra + xoá (chi tiết: p0-07 §"Dead code cleanup"). **Quy tắc bắt buộc cho game sau:** sau khi
   chuyển 1 section từ on-demand aggregation → pre-aggregated snapshot, PHẢI grep tên
   use-case/method aggregation CŨ trên toàn repo trước khi đóng plan — dead code loại này
   (repo method + use-case không ai gọi) compiler KHÔNG bắt được, chỉ tìm ra bằng grep thủ công.

## Review rủi ro kỹ thuật/dữ liệu (29/07/2026) — 9 rủi ro đã sửa

Review kỹ toàn bộ code implement (worker/exposure/snapshot/UI) phát hiện + sửa 9 rủi ro
kỹ thuật & data-integrity. Chi tiết đầy đủ (triệu chứng/sửa/nơi ghi thiết kế) ở
**analysis §11** — bảng rủi ro + "Checklist rủi ro BẮT BUỘC cho worker stats game sau".
Tóm tắt để game khác KHÔNG lặp lại:

1. **Watermark per-draw, không global min** (Risk #1) — global `min(lastEntryId)` đọc lại
   entry đã cộng của draw khác → lãng phí I/O + double-count. Lặp từng draw, watermark riêng.
2. **Index `{drawId:1,_id:1}`** (Risk #2) — bắt buộc cho watermark per-draw + recompute cursor.
   Thêm vào `KENO_INDEXES` (`idx_draw_id`); KHÔNG multikey trên `boards.numbers`.
3. **Recompute mọi status hậu-chốt chưa final** (Risk #3) — không chỉ `salesClosed`; draw nhảy
   status nhanh giữa 2 tick sẽ miss. Cursor-based (`getEntriesForStatsAfter`), KHÔNG skip/limit.
4. **Exposure lưu RAW, cap ở tầng đọc** (Risk #4) — cap là hàm `min` phi tuyến; lưu đã-cap thì
   cộng dồn qua nhiều tick sẽ trừ sai. `capExposureByPlayType` (pure, idempotent) áp lúc build response.
5. **`topCombos.accounts` seed baseline** (Risk #5) — distinct count không cross-invocation →
   report `max(baselineAccounts, live.size)`. Cappable combo dùng `keno_draw_combo_stats` chính xác.
6. **Conditional write stats doc** (Risk #6) — chỉ ghi khi `applied>0`; giữ
   `updatedAt` ổn định cho ETag/304 → FE 0 re-render lúc vắng cược.
7. **`UpdateOpsInput` interface, không indexed-access** (Risk #8) — bỏ `OpsConfig["alerts"]["comboSetsWarn"]`
   inline trong DTO/use-case (vi phạm §5.4).
8. **`snapshot.thresholds` từ GlobalConfig** (Risk #9) — bỏ hardcode `EXPOSURE_WARN_PCT_DEFAULT`/
   `SIDEBET_SKEW_PCT_DEFAULT`/`maxSetsForFixed` client; server trả ngưỡng, client chỉ fallback loading.
9. **Zod `z.enum(Object.values(OpsAlertStatus))`** (Risk #11) — bỏ string literal trần (vi phạm §5.3).
10. **Loại void tại nguồn đọc, không "cộng rồi trừ bù" (chốt 30/07/2026):** query aggregation entries
    PHẢI filter `status: { $ne: void }` ngay tại nguồn (repo), KHÔNG dùng pattern "cộng mọi entry rồi
    theo dõi watermark void riêng để trừ bù sau". Pattern trừ bù có khoảng hở race: draw ở trạng thái
    "đang huỷ" (SFN void theo batch, kéo dài) mà safety-net recompute trúng tick giữa lúc đó → cộng nhầm
    entry CHƯA kịp void làm số liệu thật rồi đóng dấu `final: true` sai VĨNH VIỄN (guard `final` chặn
    recompute lại). Vì void ở Keno hiện tại LUÔN là void toàn kỳ (không có void per-entry), lọc ngay
    tại query là cách đơn giản nhất, không cần accumulator có state `subtractEntry`/`sign`.
11. **Retention combo-stats: TTL index, KHÔNG cleanup batch tự viết (chốt 30/07/2026, đảo quyết định
    p0-04 gốc):** plan gốc kết luận "không có TTL tiền lệ" mà KHÔNG grep trước — sai, `game-core`
    (`TX_INTENT_INDEXES.idx_resolvedAt_ttl`) và `audit` (`AUDIT_LOG_INDEXES.ts_ttl`) đã dùng TTL từ
    trước. Đã xoá `ComboStatsRepository.deleteOlderThan` + `SyncBettingStatsUseCase.cleanupOldCombos`,
    thêm TTL index `{createdAt:1}, expireAfterSeconds` vào `KENO_INDEXES` (đã mở rộng `IndexSpec` cả
    4 game hỗ trợ field này). Quy tắc cho game sau: **PHẢI grep `expireAfterSeconds` toàn repo TRƯỚC
    khi kết luận "không có tiền lệ TTL"**; collection có doc immutable sau 1 mốc thời gian rõ ràng
    (draw settled, tx resolved) → TTL index là lựa chọn ĐẦU TIÊN, cleanup batch chỉ dùng khi điều kiện
    xoá phức tạp hơn 1 field Date hoặc cần log số lượng đã xoá. Chi tiết: p0-04 §"Review sau triển khai".

**Ngoài ra — hiển thị account (analysis §4.5, đổi tên field 29/07/2026):** mọi bảng account (top
accounts, top potential, combo lookup) ưu tiên `username` (snapshot lúc cược), LUÔN kèm `accountId`
(dòng phụ/title) để link hồ sơ. Field đặt tên **`username`** — KHÔNG dùng `accountName` — để đồng
nhất với `TicketEntryDoc.username`/`kenoTickets.username` (nguồn dữ liệu gốc), tránh 2 tên khác nhau
cho cùng 1 khái niệm trên cùng pipeline. Component `AccountLabel` fallback `accountId` khi username
rỗng. Pipeline `EntryForStats.username` → `game-core TopAccountStat.username` → DTO → UI. Game sau:
mọi shape account stat PHẢI dùng tên field **`username`** (không phải `accountName`) + `accountId`.

**Ngoài ra — khu vực "Bật / tắt loại alert" trong tab Config Vận hành (redesign 29/07/2026):** thiết
kế đầu tiên chỉ là list phẳng `label + Switch` — không đồng nhất với các field ngưỡng (vốn có tooltip
4 phần), người vận hành không hiểu mỗi alert nghĩa gì / dựa ngưỡng nào / tắt đi mất gì. Đã redesign
thành `AlertToggleRow` giàu thông tin (icon+badge severity, tooltip ý nghĩa/ngưỡng liên quan/**tác động
khi TẮT**, summary inline, cả hàng click, hàng tắt border-dashed+mờ, header badge `N/M đang bật` +
banner amber khi tắt hết). Metadata gom 1 mảng `ALERT_META`, `severity` dùng `OpsAlertSeverity`
(game-core, không string trần §5.3), palette gom `SEVERITY_STYLES`. **Game sau PHẢI làm y hệt ngay từ
đầu — KHÔNG dùng list phẳng.** Chi tiết + checklist: `ops-config-page-layout.guideline.md` §3.
