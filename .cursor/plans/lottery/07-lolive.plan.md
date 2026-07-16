---
name: "Lottery 07 — Lô Live"
overview: "Lô Live Miền Bắc: LiveState/LivePrice, make-odds (payout động theo remainPrizeCount), vận hành open/closePrize/closeLive, ping chống lạm dụng, đồng bộ draw.markets, events realtime."
todos: []
isProject: false
---

# Plan 07 — Lô Live (chỉ Miền Bắc)

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 05 (place-bet), Plan 06 (settle). **Chặn bởi câu hỏi mở** #1 (hằng số minProfit/maxProfit/payout tại remain=1) — code đọc từ GlobalConfig, KHÔNG hardcode.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs & Rules

1. `docs/game/lottery/new/05-lolive.md` — TOÀN BỘ — ĐỌC ĐẦU TIÊN
2. `docs/game/lottery/new/01-domain-model.md` §5.1 — ngoại lệ loLive trong 2 lớp status
3. `.cursor/rules/operations-page-ui.mdc`, `.cursor/rules/frontend-dev.mdc` — UI vận hành
4. `.cursor/rules/code-quality-standards.mdc`

### Template

- Repos live-state/live-price đã scaffold ở plan 02.
- Event publish service (plan 02 Phase 4) — SNS topic pattern hiện có.
- UI thao tác realtime: tham khảo operations page keno (auto-refresh) + draws page bingo18.

---

## Tổng quan

Lô Live = market `loLive.last.*` trong draw MB, chơi TRONG lúc quay (draw đã `salesClosed`).
Payout động theo `remainPrizeCount` (số giải chưa mở) — tăng dần khi giải đã mở nhiều.
Staff vận hành: `makeOdds` → `openLive` → nhập từng giải (`closePrize`) → `closeLive`.
Settle CÙNG SFN settle của draw (plan 06), KHÔNG settle riêng.

---

## Phase 1: Use-cases live (`use-cases/live/`)

| Use-case | Nội dung |
|---|---|
| `make-odds.ts` | Tính bảng LivePrice per remainPrizeCount (27→1): pricePerPoint kế thừa từ Lô (05 §3.1), payout tăng theo remain theo công thức minProfit/maxProfit từ GlobalConfig (05 §3.2). Upsert `lottery_live_prices`. Guard: chỉ khi draw `salesClosed` chưa published |
| `open-live.ts` | Tạo/transition LiveState → `open`; đồng bộ `draw.markets["loLive.last.*"] = open` (reason `live_open`); publish `LOTTERY_LO_LIVE_OPENING` |
| `close-prize.ts` | Staff nhập 1 bộ số vừa mở: $push vào LiveState.openedPrizes, remainPrizeCount--; payout tự chuyển nấc; publish event kèm payout mới |
| `ping.ts` | Heartbeat staff (05 §4.1): quá hạn ping → auto-suspend market (`live_ping_lost`); resume khi ping lại |
| `close-live.ts` | Kết thúc phiên: LiveState → `closed`, market → `closed`; publish `LOTTERY_LO_LIVE_CLOSED` |
| `get-live-state.ts` | State + bảng giá hiện hành cho backoffice/player API |

Ràng buộc:
- Mọi transition LiveState có guard + audit (updatedBy).
- Đồng bộ LiveState → `draw.markets` MỘT CHIỀU (05 §4.3): LiveState là source of truth cho market loLive.
- Freeze window sau closePrize (chống trục lợi trong khoảng nhập số): config từ GlobalConfig, place-bet check.

## Phase 2: Place-bet integration

- Gỡ chặn `loLive` ở plan 05 Phase 2: khi market loLive open, resolve payout từ LivePrice theo `remainPrizeCount` hiện tại → snapshot vào board.
- Check freeze window + LiveState.status trong validation.
- Parity/sizes Lô Live: snapshot "giải kế tiếp" (index giải sắp mở) vào board để settle so đúng (05 §6.2).

## Phase 3: Worker + events

- `apps/worker-lottery/src/functions/live.yml` — handler ping-timeout sweep (EventBridge rate 1 phút): LiveState quá hạn ping → suspend.
- SNS events `LOTTERY_LO_LIVE_OPENING|PRICE_CHANGED|SUSPENDED|CLOSED` (05 §5) — payload gồm drawId, remainPrizeCount, payout hiện hành.

## Phase 4: Backoffice UI — trang vận hành Live

`(main)/games/lottery/live/`:
- Chọn kỳ MB hôm nay → panel LiveState: status, remainPrizeCount, bảng payout theo nấc, nút Make Odds / Open / Close Live.
- Form nhập giải (closePrize): input bộ số + tier, hiển thị các giải đã mở dạng timeline.
- Ping indicator (browser giữ ping khi trang mở — heartbeat interval); cảnh báo đỏ khi sắp mất ping.
- Realtime tổng cược theo pick trên market live (đọc risk data plan 08 hoặc query multikey index).
- API routes `api/lottery/live/*` mirror pattern.

## Phase 5: Verify

- [ ] Unit test make-odds: bảng payout đơn điệu tăng khi remain giảm; biên remain=1.
- [ ] Test transition matrix LiveState + đồng bộ markets.
- [ ] Test place-bet loLive: snapshot payout đúng nấc; bị chặn khi suspended/freeze.
- [ ] Settle: entry loLive dò đúng theo giải SAU điểm vào (exact) / giải kế tiếp (parity/sizes).
