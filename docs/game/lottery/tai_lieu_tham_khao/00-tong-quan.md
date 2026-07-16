# 00 — Tổng quan kiến trúc & nghiệp vụ Xổ Số Truyền Thống

## 1. Sản phẩm là gì?

Sản phẩm mô phỏng **xổ số kiến thiết truyền thống Việt Nam** cho phép người chơi (Player) đặt cược trên kết quả các đài xổ số Miền Bắc / Miền Nam, thông qua một hệ thống **đại lý phân cấp** (nhà cái nhiều tầng). Hệ thống tự động:

- Mở/đóng kỳ mở thưởng (term) theo lịch đài.
- Nhận cược (đặt phiếu), quản lý giá bán và giới hạn cược theo từng con số.
- Chia rủi ro (thầu) giữa các cấp đại lý.
- Nhập kết quả xổ số, **dò số trúng**, **tính thắng thua**, **kết sổ**, **trả thưởng**.
- Xây dựng báo cáo doanh thu/thắng thua/công nợ nhiều tầng và phát hiện gian lận.

## 2. Kiến trúc kỹ thuật (serverless)

Toàn bộ hệ thống chạy trên **AWS Serverless**:

- **Compute**: AWS Lambda (runtime `nodejs22.x`), region `ap-southeast-1`, framework Serverless Framework v4 + esbuild.
- **API**: API Gateway (HTTP), authorizer bằng **AWS Cognito User Pool** (`AWS_COGNITO_USER_POOL_ARN`).
- **Orchestration**: AWS Step Functions (state machine cho đặt cược, huỷ phiếu, huỷ số, kết sổ, build report, ETL data-lake).
- **Messaging bất đồng bộ**: Kinesis Data Streams (luồng lớn: cược mới, cược đã duyệt, huỷ số), SQS (worker rời rạc), SNS (message bus giữa service).
- **Database**: MongoDB Atlas — **2 database**: `lottery` (dữ liệu gốc) và `lottery-reporting` (báo cáo tổng hợp). Một số báo cáo cross-product ghi vào DB `reporting`.
- **Cache**: Redis Cloud (`REDIS_CLOUD_URI_CACHED`).
- **Lưu tạm payload lớn**: DynamoDB (payload phiếu cược trong lúc chạy state machine).
- **Data lake**: Kinesis Firehose → S3 → AWS Glue Crawler → Athena (bảng `one789.*`).
- **Realtime**: publish sự kiện tới các channel (general / self-user / ancestor) để client cập nhật trực tiếp.

> **Middleware**: dùng `middy`. Mọi handler bọc authorizer + phân quyền theo cấp tài khoản + `Product = Lottery`.

### Nguyên tắc thiết kế quan trọng (áp dụng lại được)

1. **Idempotency**: mỗi phiếu có `TransactionId` unique; DynamoDB `createTX` chỉ thành công nếu chưa tồn tại → chống cược trùng. Huỷ số dùng Redis Set chống trùng.
2. **Payload lớn không đi qua Step Functions** (tránh giới hạn 256KB): payload đầy đủ lưu DynamoDB, state machine chỉ chuyền một object gọn (`TicketTXStateMachine`). Mỗi state đọc lại từ DynamoDB khi cần.
3. **Rollback thủ công** (không dùng SAGA compensation tự động): ví dụ khi `save-ticket` fail thì tự `deposit` hoàn tiền.
4. **Con trỏ "kỳ mới nhất"**: dùng 1 document `_id` cố định (`ObjectId("000000000000000000000000")`) thay vì query max — tối ưu hot-path player.
5. **Số tiền lưu `Decimal128`, điểm lưu `Long`** trong MongoDB để tránh sai số / tràn số.
6. **Cache negative result**: cache cả trường hợp "không bị giới hạn" (`"null"`) để giảm tải DB.
7. **Fail-open cho rate-limit**: nếu Redis lỗi thì cho qua để không chặn cược hợp lệ.

## 3. Domain model — Đài (GameType) & Kiểu cược (BetType)

### 3.1 GameType (đài)

Định nghĩa tại `server/src/services/lottery/common/types/game-type.ts:1`.

| Value | Enum              | Đài                                   |
| ----- | ----------------- | ------------------------------------- |
| 0     | `MienBac1`        | Miền Bắc 1 (27 lô)                    |
| 1     | `MienBac2`        | Miền Bắc 2 (27 lô, có Thần Tài 3D/4D) |
| 2     | `MienNam18A`      | Miền Nam 18A (18 lô)                  |
| 3     | `MienNam18B`      | Miền Nam 18B                          |
| 4     | `MienNam18C`      | Miền Nam 18C                          |
| 5     | `MienNam18Ava18B` | Xiên ghép 2 đài Miền Nam 18A + 18B    |

### 3.2 BetType (kiểu cược)

Định nghĩa tại `server/src/services/lottery/common/types/bet-type.ts:1` (enum có khoảng trống ở 26, 28).

| Value    | Enum                             | Tên                                 | Nhóm                    |
| -------- | -------------------------------- | ----------------------------------- | ----------------------- |
| 0        | `De`                             | Đề                                  | Đề (theo tiền)          |
| 1        | `Lo`                             | Lô                                  | Lô (theo điểm, có nháy) |
| 2/3/4    | `Xien2/3/4`                      | Xiên 2/3/4                          | Lô ghép                 |
| 5        | `DeTruot`                        | Đề trượt (≥10 con, ăn khi KHÔNG về) | Trượt                   |
| 6        | `LoTruot`                        | Lô trượt (≥4 con)                   | Trượt                   |
| 7/8/9    | `HaiDDau/HaiDDuoi/HaiD27Lo`      | 2D Đầu / 2D Đuôi / 2D 27 Lô         | 2 chữ số                |
| 10/11/12 | `BaDDau/BaDDuoi/BaD23Lo`         | 3D Đầu / Đuôi / 23 Lô               | 3 chữ số                |
| 13/14    | `BonDDuoi/BonD20Lo`              | 4D Đuôi / 4D 20 Lô                  | 4 chữ số                |
| 15/16    | `HaiD18Lo/HaiD7Lo`               | 2D 18 Lô / 2D 7 Lô                  | Miền Nam                |
| 17/18    | `BaD17Lo/BaD7Lo`                 | 3D 17 Lô / 3D 7 Lô                  | Miền Nam                |
| 19       | `BonD16Lo`                       | 4D 16 Lô                            | Miền Nam                |
| 20       | `LoLive`                         | Lô live                             | Live                    |
| 21/22/23 | `DeDau/DeGiaiNhat/DeDauGiaiNhat` | Đề Đầu / Đề Giải 1 / Đề Đầu Giải 1  | Đề mở rộng              |
| 24/25    | `DeThanTai4/DeDauThanTai4`       | Đề Thần Tài / Đề Đầu Thần Tài       | Đề MB2                  |
| 27       | `HaiD18LoLive`                   | 2D 18 Lô Live                       | Live Miền Nam           |
| 29/30    | `LoDau/HaiD18LoDau`              | Lô Đầu / 2D 18 Lô Đầu               | Lô đầu                  |

> `TraditionalGameTypeLists` / `TraditionalBetTypeLists` là whitelist dùng cho Joi validation ở mọi API. `GameTypeHelper.toString` / `BetTypeHelper.toString` map ra tên tiếng Việt.

### 3.3 Cấp tài khoản (UserCustomerLevel)

`server/src/lib/entities/user-level.ts`: `Owner=0`, `Company=1`, `Manager=2`, `Super=3`, `Master=4`, `Agent=5`, `Player=9`.

- Cây phân cấp: mỗi tài khoản có `Path` = chuỗi ancestor (company → ... → agent). Dùng regex `^path` để cập nhật cả cây con.
- Quyền (bitmask `SubUserAclType`): `WriteGame`, `ReadGame`, `WriteAccount`, `ReadAccount`, `WriteBetting`, `WriteLoLive`...

## 4. Các microservice & trách nhiệm

| Service                                       | Trách nhiệm                                                                        | File tài liệu |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| `term`                                        | Vòng đời kỳ mở thưởng, mở/đóng cược, trạng thái kết sổ                             | 01            |
| `city-schedule`                               | Lịch quay đài theo ngày trong tuần                                                 | 01            |
| `parameter` (dùng chung)                      | Template cấu hình mỗi (GameType, BetType): giá, payout, giờ đóng, giới hạn         | 01            |
| `user-game-setting`                           | Giới hạn điểm cược theo tài khoản + game-limit (bóp giới hạn nghi gian lận)        | 02            |
| `share-holder`                                | Chia thầu % giữa các cấp, giá mua vào cơ bản; `number-share` giới hạn thầu theo số | 03            |
| `extra-price`                                 | Giá tăng cường (tay/tự động/quan hệ MB1↔MB2), bảng thao tác giá                    | 04            |
| `live`                                        | Lô Live: giá cơ bản theo số giải còn lại, make-odds, đóng giải                     | 05            |
| `stop-number`                                 | Dừng nhận cược một/nhiều con số                                                    | 06            |
| `game-play`                                   | Đặt cược, phiếu (ticket/ticket-item), huỷ phiếu, huỷ số                            | 07, 08        |
| `single-number` / `multi-number` (dùng chung) | Thống kê điểm/tiền theo con số cho từng cấp                                        | 09            |
| `lottery-result`                              | Nhập & lưu kết quả xổ số, public xem kết quả                                       | 10            |
| `bookkeeping`                                 | Kết sổ: dò trúng, tính thắng thua, redo, kết sổ thử                                | 11            |
| `finance`                                     | Trả thưởng / thu tiền player (player-result)                                       | 12            |
| `report`                                      | Báo cáo statement/outstanding/winlose/canceled/consolidation, data-lake            | 13            |
| `analytics`                                   | Scaffold (rỗng — logic thực tế nằm ở risk-management + data-lake)                  | 13            |
| `risk-management`                             | Phát hiện nhiều player chung IP (gian lận)                                         | 13            |

## 5. Luồng nghiệp vụ end-to-end (bức tranh lớn)

```
                       ┌──────────────────── VÒNG ĐỜI 1 KỲ MỞ THƯỞNG ────────────────────┐
                       │                                                                  │
[Tạo kỳ]  city-schedule + parameter ──► term.createTerms (Games=Closed) ──► publish TERM_CREATED
   │
[Mở cược]  term.updateGamesStatus (Closed→Open)
   │
[Cấu hình giá] share-holder (%thầu + giá mua) + extra-price (giá tăng) + stop-number (dừng số)
   │
[Đặt cược]  Player ──► place-betting (API) ──► Kinesis ──► Step Function
   │            prepare → validate-stop-number ∥ validate-game-setting
   │            → withdraw-balance → save-ticket → notify
   │            (song song: tăng thống kê single/multi-number, player-ip-bet, outstanding report)
   │
[Đóng cược]  đến AutoCloseAt / thủ công ──► term.updateGamesStatus (Open→Closed)
   │
[Nhập kết quả]  lottery-result.updateResult (hoặc updateResultLive từng giải cho Lô Live)
   │
[Kết sổ]  bookkeeping.startExecution ──► Step Function winlose (dò trúng + tính WinLose từng cấp)
   │            → build report (Player → Bookie: bet-type → game-type → term → date → production)
   │
[Trả thưởng]  finance.createPlayerResultPayList ──► publish sang ví (Increase balance)
   │
[Redo (nếu sai)]  bookkeeping.redoExecution ──► dọn winlose + báo cáo ──► finance huỷ trả thưởng (Decrease) ──► tính lại
                       │                                                                  │
                       └──────────────────────────────────────────────────────────────────┘
```

## 6. Bản đồ dữ liệu

### 6.1 MongoDB — DB `lottery` (dữ liệu gốc)

| Collection                                                                     | Nội dung                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------- |
| `terms`                                                                        | Kỳ mở thưởng + con trỏ term mới nhất (`_id=0...0`) |
| `cities`                                                                       | Lịch quay đài theo ngày trong tuần                 |
| `parameters`                                                                   | Template cấu hình theo (GameType, BetType)         |
| `userGameSettings`                                                             | Giới hạn điểm cược từng tài khoản                  |
| `gameLimits`, `gameLimitSettings`, `gameLimitUsers`                            | Danh sách giới hạn (nghi gian lận)                 |
| `shareHolders`, `numberShares`                                                 | Cấu hình chia thầu + thầu theo số                  |
| `extraPrices`, `priceAutoSettings`, `priceAutoExceptions`, `priceAutoProfiles` | Giá tăng cường                                     |
| `liveSettings`, `liveBasePrices`                                               | Lô Live                                            |
| `stopNumbers`                                                                  | Dừng số                                            |
| `tickets`, `ticketItems`, `counters`                                           | Phiếu cược, đơn cược, bộ đếm mã phiếu              |
| `ticketCancelTasks`, `numberCancelTasks`, `numberCancelTaskDetails`            | Task huỷ phiếu / huỷ số                            |
| `singleNumbers`, `multiNumbers`                                                | Thống kê điểm/tiền theo số                         |
| `lotteryResults`                                                               | Kết quả xổ số (phân biệt bằng `Type`)              |

### 6.2 MongoDB — DB `lottery-reporting` (báo cáo)

| Collection                                                                                   | Nội dung                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `playerBetTypeReports`                                                                       | Sao kê cấp player (theo bet-type)        |
| `bookieBetTypeReports` / `bookieGameTypeReports` / `bookieTermReports` / `bookieDateReports` | Sao kê đại lý roll-up nhiều tầng         |
| `bookieBetTypeOutstandingReports`                                                            | Công nợ / tiền chưa xử lý (incremental)  |
| `bookieCanceledBetTypeReports` / `playerCanceledBetTypeReports`                              | Báo cáo huỷ                              |
| `temp_ticketItems`, `temp_bookieBetTypeReports`, `temp_playerBetTypeReports`                 | Kết sổ thử                               |
| `playerResults`                                                                              | Danh sách trả thưởng player              |
| `playerIPBet`                                                                                | Thống kê IP (risk-management)            |
| `workerMetaData`                                                                             | Cursor phân trang cho worker (data-lake) |

DB `reporting` (cross-product): `bookieProductionReports` (gộp báo cáo mọi sản phẩm: lottery, saba, megawin...).

### 6.3 DynamoDB

- Bảng payload phiếu cược tạm (`DYNAMODB_TABLE_LOTTERY_GAME_PLAY_PLACE_BETTING_TX`), TTL `ExpiredAt` = +7 ngày. GSI theo `term_game_bet_ticketnr`, `term_game_bet`.

### 6.4 Redis keys chính

| Key pattern                                                                    | TTL     | Ý nghĩa                                                |
| ------------------------------------------------------------------------------ | ------- | ------------------------------------------------------ |
| `lottery:term:term_latest:name`                                                | 5 phút  | Tên kỳ mới nhất                                        |
| `lottery:term:term_latest:terms`                                               | 30 giây | Toàn bộ term kỳ mới nhất (đóng/mở cược phản ánh nhanh) |
| `lottery:user_game_setting:game_limit:game_limit_setting:{limitId}:{gt}:{bt}`  | 10 phút | Cấu hình giới hạn                                      |
| `lottery:user_game_setting:game_limit:player_limit_setting:{userId}:{gt}:{bt}` | 10 phút | Giới hạn user (cache cả `"null"`)                      |
| `lottery:game_play:place_betting:player_share_holder:{userId}:{gt}:{bt}`       | 5 phút  | Cache cấu hình thầu                                    |
| `lottery:game_play:place_betting:player_user_game_setting:{userId}:{gt}:{bt}`  | 5 phút  | Cache giới hạn cược                                    |
| `lottery:game_play:place_betting:parameter:{gt}:{bt}`                          | 5 phút  | Cache parameter                                        |
| `lottery:game_play:guard:player_bet_rate_limit:user:{userId}`                  | 5 giây  | Rate limit theo user                                   |
| `lottery:game_play:guard:player_bet_rate_limit:ip:{ip}`                        | 5 giây  | Rate limit theo IP                                     |
| `lottery:game_play:place_betting:stop_number:{term}:{gt}:{bt}:{userId}`        | 30 giây | Số bị dừng                                             |
| `lottery:extra_price:price_auto_setting:{gt}:{bt}:{userId}`                    | 5 phút  | Cấu hình tăng giá auto                                 |
| `lotto:lottery-result:all-lottery-results-by-date:{date}`                      | 3 phút  | Kết quả theo ngày                                      |

## 7. Sự kiện & message bus

- **Realtime** (`common/events/publish-event-service.ts`): `publishEventToGeneralChannel` (broadcast), `publishEventToSelfChannel(userId)`, `publishEventToAncestorChannel(ancestorId)`. Message `{ Event: RealtimeEventCode, Data }`.
- **SNS message bus** (`internal-events/lottery-message-bus.ts`): `publishSNS` với `MessageAttributes` (`CorrelationId`, `Event`, tuỳ chọn `BetType`, `GameType`).
- **Internal events** (`internal-events/types/lottery-internal-event.ts`): `EXTRA_PRICE_CHANGED_EVENT`, `STOP_NUMBER_CHANGED_EVENT`, `LO_LIVE_PRIZE_CLOSED_EVENT`, `LO_LIVE_CLOSED_EVENT`, `LO_LIVE_OPENING_EVENT`.

## 8. Hằng số toàn cục (`common/types/constants.ts`)

| Hằng số                                     | Giá trị                         | Ý nghĩa                                                                    |
| ------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| `MinItemPerTicket`                          | LoTruot=4, DeTruot=10, Others=1 | Số con tối thiểu mỗi phiếu                                                 |
| `MaxItemPerTicket`                          | Xien234=128, Others=100         | Hard limit số con mỗi phiếu                                                |
| `TicketCancelLimitInSeconds`                | 300                             | Sau 5 phút mới được huỷ (thực chất: `CancelLimit` = thời điểm cược + 300s) |
| `TicketCancelLimitBeforeAutoCloseInSeconds` | 600                             | Không huỷ được trong 10 phút trước giờ đóng                                |
| `MaxPingInSecondsForLoLive`                 | 5                               | Delay ping tối đa cho Lô Live                                              |
| `DefaultLoLive27PrizeNr`                    | 27                              | Số giải Lô Live Miền Bắc                                                   |
| `DefaultLoLive18PrizeNr`                    | 18                              | Số giải Lô Live Miền Nam                                                   |
| `DefaultLoLiveLastPrizeNr`                  | 1                               | Giải cuối cùng                                                             |
| `MaxSafeNumber`                             | 9000000000000000                | Giới hạn số an toàn JS                                                     |

## 9. Gợi ý khi xây lại cho Megawin

- Giữ nguyên **mô hình 2 DB** (gốc + reporting) và **chuỗi roll-up báo cáo 7 tầng** — đây là điểm giúp báo cáo nhanh mà không đụng dữ liệu giao dịch.
- Cân nhắc thay Kinesis + Step Functions bằng hạ tầng tương đương ở Megawin (ví dụ queue + worker orchestration), nhưng **giữ nguyên các ranh giới state** (prepare → validate → withdraw → save → notify) vì nó bảo đảm tính nhất quán tài chính.
- **Công thức tính tiền/điểm/thầu/thắng thua** (file 03, 04, 07, 11) nên copy chính xác — đây là phần khó và dễ sai nhất, ảnh hưởng trực tiếp tới tiền của khách.
- Các file 03 (chia thầu), 04 (giá), 07 (đặt cược), 11 (kết sổ) là **lõi bắt buộc**. Live (05), risk (13), data-lake là **nâng cao** có thể làm sau.
