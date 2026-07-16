# 01 — Term (Kỳ mở thưởng), City-Schedule (Lịch quay), Parameter (Tham số)

Ba service này tạo nền tảng cấu hình & "đồng hồ nghiệp vụ" cho toàn hệ thống. Mọi hoạt động cược đều phụ thuộc trạng thái term.

---

## A. Service `term` — Kỳ mở thưởng

**Mục đích**: quản lý vòng đời "kỳ mở thưởng" (term = 1 ngày mở thưởng, format `YYYY-MM-DD`). Mỗi kỳ chứa nhiều đài (GameType), mỗi đài chứa nhiều kiểu cược (game). Term điều khiển mở/đóng cược, giờ tự động đóng, và trạng thái kết sổ.

Đường dẫn: `server/src/services/lottery/services/term`.

### A.1 Entity `TermEntity` — collection `terms`

`services/term/infrastructure/entities/term.ts:12`

| Field                         | Kiểu         | Ý nghĩa                                        |
| ----------------------------- | ------------ | ---------------------------------------------- |
| `Term`                        | string       | Tên kỳ `YYYY-MM-DD`                            |
| `GameType`                    | GameType     | Đài mở thưởng                                  |
| `CityName?`                   | string       | Tên đài/thành phố (lấy từ city-schedule)       |
| `Status`                      | TermStatus   | Trạng thái kỳ                                  |
| `Games`                       | GameEntity[] | Danh sách kiểu cược trong đài                  |
| `Date`                        | Date         | Ngày mở thưởng (00:00 GMT+7)                   |
| `FiscalDate`                  | Date         | Ngày tài chính (= Date, vì xổ số mở hàng ngày) |
| `TemporaryBookkeepingStatus?` | enum         | Trạng thái kết sổ **thử**                      |

**`GameEntity`** (nested trong `Games`, term.ts:69):

| Field         | Kiểu       | Ý nghĩa                     |
| ------------- | ---------- | --------------------------- |
| `BetType`     | BetType    | Loại cược                   |
| `AutoCloseAt` | Date       | Thời điểm tự động đóng cược |
| `Status`      | GameStatus | Trạng thái từng kiểu cược   |

### A.2 Các trạng thái (state)

**`GameStatus`** (term.ts:93): `BookKeeping_Fail=-1`, `Closed=0`, `Open=1`, `BookKeeping_InProcess=2`, `BookKeeping_Success=9`.

**`TermStatus`** (term.ts:120): `Reporting_Fail=-2`, `BookKeeping_Fail=-1`, `Open=1`, `BookKeeping_InProcess=2`, `Reporting_InProcess=3`, `BookKeeping_End=9`, `BookKeeping_RedoProcess=10`.

**`TemporaryBookkeepingStatus`** (term.ts:160): `BookKeeping_RedoProcess=0`, `BookKeeping_InProcess=1`, `BookKeeping_End=9`.

Luồng trạng thái kỳ:

```
Open(1) → BookKeeping_InProcess(2) → BookKeeping_End(9) → Reporting_InProcess(3)
(redo)  → BookKeeping_RedoProcess(10)
mỗi game: Open(1) → BookKeeping_InProcess(2) → BookKeeping_Success(9)
```

### A.3 Con trỏ kỳ mới nhất — `TermLatestEntity`

`entities/term-latest.ts:10`: `{ LatestTerm: string }`. **Kỹ thuật quan trọng**: lưu chung collection `terms` với `_id` cố định `ObjectId("000000000000000000000000")` (`term-latest-repository.ts:9`) — con trỏ tới kỳ mới nhất, tránh phải query max.

### A.4 Tạo kỳ mới — `createTerms` (`services/term-service.ts:59`)

Luồng:

1. `openDateMoment = getMoment(date).startOf("day")`. Guard: ngày mở thưởng phải `>=` hôm nay.
2. Lấy `latestTerm`; nếu khác kỳ đang tạo → kiểm tra kỳ cũ đã kết sổ hết chưa (query `Status $ne BookKeeping_End`). Còn đài chưa kết sổ → throw `TermException`.
3. Lấy lịch đài từ `CityScheduleService.getSchedules({date, gameTypes})`. Rỗng → throw `CitySchedulerNotFoundException`.
4. Lấy `parameters` từ `ParameterService.getParametersByGameTypes`.
5. **Build Games từ parameter** (term-service.ts:145): mỗi parameter → tách `AutoCloseAt` ("hh:mm:ss") set vào `openDateMoment` để ra `Date`, `Status = Closed` (mặc định đóng):

```typescript
const timespan = _.split(`${p.AutoCloseAt}`, ":");
AutoCloseAt: openDateMoment.set({
    hour: _.toNumber(timespan[0]),
    minute: _.toNumber(timespan[1]),
    second: _.toNumber(timespan[2]),
}).toDate(),
Status: GameStatus.Closed,
```

6. `FiscalDate = openDate`.
7. Build LiveSetting nếu game hỗ trợ Live (`liveSettingHelper.buildEntity`).
8. `createTerms(terms)` (upsert `$setOnInsert` — không ghi đè kỳ đã có). Thành công → `updateLatestTerm(term)` + tạo live settings.
9. Xoá cache (`deleteLatestTermNameCached` + `deleteLatestTermsCached`) và publish realtime `LOTTERY_TERM_CREATED`.

> **Ý nghĩa thiết kế**: Parameter là "template", Term là "instance" của 1 ngày. Đổi parameter KHÔNG ảnh hưởng term đã tạo.

### A.5 Mở/đóng cược — `updateGamesStatus` (term-service.ts:330)

- Guard: chỉ khi `term.Status === Open`.
- Chỉ đổi status khi hiện tại là `Closed`/`Open` (bỏ qua nếu đang bookkeeping).
- Hỗ trợ `includeBetTypes` (chỉ update list này) hoặc `excludeBetTypes` (update tất cả trừ list). Không có gì → update tất cả.
- Repository dùng **arrayFilters** MongoDB để set từng game con (`term-repository.ts:214`).
- Sau update → xoá `LatestTerms` cache + publish `LOTTERY_GAME_CLOSED`/`LOTTERY_GAME_OPENING`.

### A.6 Đổi giờ đóng tự động — `updateGamesAutoClose` (term-service.ts:436)

- Validate `autoCloseAt` đúng format `HH:mm:ss`. Guard `term.Status === Open`.
- `autoCloseAt = getMomentFromUtc(term.Date).set({hour, minute, second})`. Publish `LOTTERY_GAME_AUTO_CLOSE_UPDATED`.

### A.7 Hàm cốt lõi cho đặt cược — `canBetNow` (term-service.ts:641)

```typescript
if (termEntity == null || termEntity.Status !== TermStatus.Open) return false;
const game = _.find(termEntity.Games, (obj) => obj.BetType === betType);
if (game == null || game.Status !== GameStatus.Open) return false;
// Live thì bỏ qua kiểm tra giờ đóng (Live có cơ chế đóng riêng ở live-setting)
if (LiveBetTypeList.includes(betType)) return true;
const now = DateHelper.getMoment().add(additionInSeconds ?? 0, "s");
return now.diff(game.AutoCloseAt) < 0; // còn thời gian trước giờ đóng
```

`additionInSeconds` được dùng khi huỷ phiếu (truyền 600s để chặn huỷ trong 10 phút trước đóng cửa).

Các hàm liên quan: `isTermAndGameOpening`, `canPerformDuringPlayingTime` (throw nếu không cho phép), `isTermOpening`, `getFiscalDateByLatestTerm`.

### A.8 Cập nhật trạng thái kết sổ

- `updateGameBookKeepingStatus` (term-service.ts:708): set từng game `BookKeeping_InProcess/Success/Fail`.
- `updateTermBookKeepingStatus` (term-service.ts:734): set Term sang trạng thái bookkeeping/reporting.
- `updateTemporaryBookKeepingStatus` (term-service.ts:759): kết sổ thử.

### A.9 Cache (`term-cached-service.ts`)

| Key                              | TTL     | Ghi chú                                                                    |
| -------------------------------- | ------- | -------------------------------------------------------------------------- |
| `lottery:term:term_latest:name`  | 5 phút  | Tên kỳ mới nhất                                                            |
| `lottery:term:term_latest:terms` | 30 giây | Toàn bộ term kỳ mới nhất — TTL cố tình ngắn để đóng/mở cược phản ánh nhanh |

### A.10 API endpoints

**Agent** (`functions/ag-endpoint.yml`):

| Method | Path                     | Handler              | Quyền                 |
| ------ | ------------------------ | -------------------- | --------------------- |
| POST   | `/agent/create`          | `create`             | Company + `WriteGame` |
| GET    | `/agent/list`            | `list-by-date`       | Agent + `ReadGame`    |
| PUT    | `/agent/game-status`     | `update-game-status` | Company + `WriteGame` |
| PUT    | `/agent/game-auto-close` | `update-auto-close`  | Company + `WriteGame` |

- `create`: body `{ Date: ISO, GameTypes: number[] }`.
- `list-by-date`: nếu `checkBookKeepingReady=true` → kiểm tra kết quả đã sẵn sàng kết sổ (theo GameType: MB1 check caishen4+northern, MB2 check northern, MN18A/B/C check southern, 18A&B check cả A và B).

**Player** (`functions/pl-endpoint.yml`):

| GET | `/player/current` | `current` (provisionedConcurrency: 2) → trả `getLatestTermsCached()` |

---

## B. Service `city-schedule` — Lịch quay đài

**Mục đích**: lưu lịch mở thưởng cố định theo **ngày trong tuần** cho từng đài. Dùng khi `term.createTerms` để xác định đài nào mở thưởng vào ngày cụ thể và lấy tên đài.

Đường dẫn: `server/src/services/lottery/services/city-schedule`.

### B.1 Entity `CityScheduleEntity` — collection `cities`

`infrastructure/entities/city-schedule.ts:5`

| Field       | Kiểu         | Ý nghĩa                              |
| ----------- | ------------ | ------------------------------------ |
| `GameType`  | GameType     | Đài mở thưởng                        |
| `CityName`  | string       | Tên đài/thành phố                    |
| `DayOfWeek` | IsoDayOfWeek | Ngày trong tuần (ISO: 1=Mon...7=Sun) |

Không có field tính toán.

### B.2 Service (`city-service.ts`)

- `getSchedule({gameType, date})`: convert date → dayOfWeek → query.
- `getSchedules({date, gameTypes})`: cho nhiều game — **dùng bởi term.createTerms**.
- `getCitySchedulesByGameType`: tất cả lịch 1 đài (7 ngày).

### B.3 API

| GET | `/agent/{GameType}` | trả list `{ DayOfWeek, CityName }` |

---

## C. Service `parameter` (dùng chung) — Tham số cấu hình

**Mục đích**: "template" cấu hình mỗi cặp (GameType, BetType). Term đọc để build Games; game-play đọc để tính tiền; user-game-setting đọc để khởi tạo giới hạn mặc định.

Entity `ParameterEntity` — collection `parameters` (`parameter/infrastructure/entities/parameter.ts:8`):

| Field                       | Kiểu                                | Ý nghĩa / liên quan công thức                                 |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `GameType`/`BetType`        | enum                                | Khóa cấu hình                                                 |
| `MaxItemPerTicket`          | number                              | Số item tối đa/phiếu (Xiên 128, khác 100)                     |
| `MinItemPerTicket`          | number                              | Số item tối thiểu (Lô trượt 4, Đề trượt 10, khác 1)           |
| `BetTimes`                  | number                              | Số lần tiền cược player phải trả (hệ số nhân tiền)            |
| `AwardNumber`               | number                              | Số giải thưởng (dùng khi cap tiền Live)                       |
| `Probability`               | number                              | Xác suất trúng (dùng công thức giá quan hệ MB1↔MB2)           |
| `MultiPay`                  | boolean                             | Cho trúng nhiều lần (nháy lô)                                 |
| `MaxExtraPrice`             | number                              | Chênh lệch giá tối đa so với giá gốc (giới hạn COM trên cùng) |
| `MaxExtraPricePerLevel`     | number                              | Chênh lệch giá mỗi cấp tài khoản                              |
| `ManualIncPoint`            | number                              | Điểm tăng mỗi lần bấm tăng tay                                |
| `MaxManualIncPointPerLevel` | number                              | Điểm tăng tối đa/cấp                                          |
| `CancelLimit`               | number                              | Thời gian cho huỷ cược (giây)                                 |
| `AutoCloseAt`               | string                              | Giờ đóng tự động "hh:mm:ss" → **term dùng build Games**       |
| `Price`                     | number                              | Giá bán cơ bản                                                |
| `Payouts`                   | number                              | Tỷ lệ trả thưởng (ứng với Price)                              |
| `MinProfit?`/`MaxProfit?`   | number                              | Lô Live MB1 (nội suy lợi nhuận theo giải)                     |
| `RemoveExtraPrice?`         | `{Manual, Automatic, Relationship}` | Xoá giá tăng khi số đã về (chỉ Lô Live)                       |
| `MaxPointForNoShare`        | number                              | Điểm tối đa/số nếu **công ty thầu 100%**                      |
| `MaxPointForMaxShare`       | number                              | Điểm tối đa/số nếu **công ty thầu 0%**                        |
| `MaxPointForNumberGroup`    | number                              | Điểm tối đa/nhóm số (Xiên 2/3/4)                              |

`ParameterService.updateParameter` (`parameter-service.ts:117`) guard: MaxItemPerTicket không vượt hard-limit (Xiên≤128, khác≤100); `RemoveExtraPrice` chỉ cho Lô Live.

---

## D. Serverless & quan hệ

- Service `lotto-term-service`, `lotto-city-schedule`... đều nodejs22.x, region ap-southeast-1, env từ SSM (`MONGODB_URI_ATLAS`, `REDIS_CLOUD_URI_CACHED`, `AWS_CREDENTIAL_*`, `AWS_COGNITO_USER_POOL_ARN`).
- Quan hệ: term ← city-schedule (đài + tên) + parameter (giờ đóng, bet types) + live (build LiveSetting) + lottery-result (kiểm tra sẵn sàng kết sổ). game-play & bookkeeping đọc trạng thái term qua `canBetNow` / cập nhật khi kết sổ.

## E. Gợi ý khi xây lại

1. **Term-latest pattern** (doc `_id` cố định) rất đáng giữ cho hot-path player.
2. **Tách Parameter (template) ↔ Term (instance)**: cho phép chỉnh cấu hình mà không phá kỳ đang chạy.
3. **TTL 30s cho terms cache** là cân bằng có chủ đích giữa performance và độ trễ đóng/mở cược.
4. `canBetNow` là chốt chặn duy nhất kiểm tra "có được cược không" — đảm bảo mọi đường vào cược đều đi qua nó.
