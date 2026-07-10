# 13 — Report, Analytics, Risk-Management & Data Lake

**Mục đích**: tổng hợp báo cáo doanh thu/thắng thua/công nợ nhiều tầng, phân tích rủi ro (gian lận IP), và đẩy dữ liệu sang data lake để truy vấn phân tích.

Đường dẫn: `server/src/services/lottery/services/report`, `.../analytics`, `.../risk-management`; builder ở `bookkeeping/handlers/workers/report`.

---

## A. Hai loại thành phần báo cáo

1. **report-builders** (ghi): chạy sau kết sổ, ghi vào DB **`lottery-reporting`**. Hai kiểu:
    - **Full re-aggregation** (`$merge`): sao kê (statement) — tính lại toàn bộ.
    - **Incremental** (`$inc`): outstanding (công nợ/tiền chờ) — cộng dồn realtime khi cược/huỷ.
2. **report-analytics** (đọc): truy vấn read-only (thường từ analytics node) phục vụ API xem báo cáo.

---

## B. Chuỗi roll-up sao kê 7 tầng (statement)

```
TicketItem (đã kết sổ, có WinLose từng cấp)
   │ aggregate
   ▼
1. playerBetTypeReports        (theo Player × BetType)
   ▼
2. bookieBetTypeReports        (theo Bookie/đại lý × BetType)
   ▼
3. bookieGameTypeReports       (gộp BetType → theo GameType)
   ▼
4. bookieTermReports           (gộp GameType → theo Term)
   ▼
5. bookieDateReports           (gộp Term → theo Date/FiscalDate)
   ▼
6. bookieProductionReports     (DB `reporting`, gộp mọi sản phẩm: lottery/saba/megawin...)
```

Builder tương ứng: `player-bet-type-report-builder.ts`, `bookie-bet-type-report-builder.ts`, `bookie-game-type-report-builder.ts`, `bookie-term-report-builder.ts`, `bookie-date-report-builder.ts`, `bookie-production-report-builder.ts` (+ bản `player-*`).

> Mỗi tầng đọc kết quả tầng dưới, `$group` + sum các field tiền, `$merge` vào collection tầng trên → truy vấn báo cáo cực nhanh vì đã tính sẵn.

---

## C. Entity `BookieBetTypeReportEntity` (các field chính)

| Nhóm         | Field                                                    | Ý nghĩa                                                 |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------- |
| Định danh    | `UserId, Username, Level, Path, Term, GameType, BetType` |                                                         |
| Tiền         | `Commission`                                             | Tổng hoa hồng cấp này nhận                              |
| Tiền         | `WinLose`                                                | Thắng thua của cấp này (từ `ancestorBookKeepingResult`) |
| Tiền         | `Income`/`NetAmount`/`PayAmount`                         | Thu về / cược thực / player trả                         |
| Tổng hợp cấp | `Ancestor`                                               | Phần thuộc các cấp trên                                 |
| Tổng hợp cấp | `Parent`                                                 | Phần thuộc cha trực tiếp                                |
| Tổng hợp cấp | `Descendant`                                             | Phần thuộc các cấp con                                  |
| Player agg   | `PlayerBetAmount, PlayerWinLose, PlayerCommission...`    | Gộp số liệu player thuộc nhánh                          |

---

## D. Công thức aggregate (cấu trúc pipeline)

### D.1 Player/Bookie Bet-Type Report

```
$match { Term, GameType, BetType }              // ticketItems đã kết sổ
$group {
    _id: { UserId, Term, GameType, BetType },
    WinLose:    { $sum: "$<cấp>.WinLose" },
    Commission: { $sum: "$<cấp>.Commission" },
    NetAmount:  { $sum: "$NetAmount" },
    ...
}
$merge into <report collection>                 // ghi đè (full re-agg)
```

### D.2 Roll-up lên Game-Type / Term / Date

```
$match { Term, ... }
$group { _id: { UserId, <khóa tầng trên> }, WinLose: {$sum}, Commission: {$sum}, ... }
$merge into <report tầng trên>
```

### D.3 Production report (cross-product)

Gộp `bookieDateReports` của mọi sản phẩm → `bookieProductionReports` (DB `reporting`) theo `{UserId, FiscalDate}`, cộng WinLose/Commission mỗi sản phẩm.

---

## E. Outstanding (công nợ / tiền chưa xử lý) — incremental

Collection `bookieBetTypeOutstandingReports`. Khác statement ở chỗ cập nhật **realtime** khi cược/huỷ (không đợi kết sổ):

```
Đặt cược  → $inc { OutstandingAmount: +PayAmount, ... }
Huỷ cược  → $inc { OutstandingAmount: -PayAmount, ... }
```

Analytic: `aggTotalOutstandingAmountByUserTerm` — gộp outstanding theo user + term để xem tổng tiền đang "treo".

---

## F. Các loại báo cáo khác

| Loại          | Collection                                                     | Nội dung                               |
| ------------- | -------------------------------------------------------------- | -------------------------------------- |
| Winlose       | (từ statement)                                                 | Thắng thua theo player/bet-type/term   |
| Canceled      | `playerCanceledBetTypeReports`, `bookieCanceledBetTypeReports` | Phần đã huỷ (tách khỏi doanh thu thực) |
| Tickets       | (query `ticketItems`)                                          | Chi tiết phiếu                         |
| Temporary     | `temp_bookieBetTypeReports`, `temp_playerBetTypeReports`       | Kết sổ thử (file 11)                   |
| Consolidation | (aggregate cho user tagged)                                    | Gộp báo cáo cho tài khoản được gắn thẻ |
| Data-lake     | S3/Athena                                                      | Phân tích ngoài                        |

**Player-WinLose analytics**: `aggMyPlayersReportGroupByUser`, `aggReportGroupByBetType`, `aggReportGroupByUserTerm`.

**Consolidation**: aggregate cho các user được tag để gộp báo cáo nhiều tài khoản/nhánh.

---

## G. Analytics service

Hiện là **scaffold rỗng** (không có function deploy) — logic phân tích thực tế đã chuyển sang **risk-management** và **data-lake**. Khi xây mới có thể bỏ qua hoặc dùng làm nơi tập trung query read-only.

---

## H. Risk-Management — phát hiện nhiều player chung IP

### H.1 Entity `PlayerIpBetEntity` — collection `playerIPBet`

`{ Ip, UserId, Level, Term, GameType, BetType, Path, TicketCount, TotalAmount, CreatedAt, UpdatedAt }` — thống kê lượt cược theo IP + player.

### H.2 Luồng

```
Đặt cược → Kinesis → builder player-ip-bet
   → $inc { TicketCount, TotalAmount } theo {Ip, UserId, Term...}
Analytic: aggDuplicationIpBet
   → $group theo Ip → đếm distinct UserId
   → lọc IP có nhiều player  → cảnh báo gian lận (nhiều tài khoản cùng IP)
```

---

## I. Data Lake (ETL → S3 → Athena)

Hai luồng Kinesis:

1. **`ticket-item`** (sau kết sổ): đẩy ticketItems đã có WinLose → Firehose → S3 → Glue Crawler → Athena bảng `one789.*` (phân tích lịch sử).
2. **`new-ticket-item`** (realtime): đẩy phiếu ngay khi cược → Athena truy vấn gần realtime.

- Cursor phân trang worker lưu ở `workerMetaData` (đảm bảo không bỏ sót / trùng khi ETL theo lô).

---

## J. API endpoints (tiêu biểu)

**Agent**: statement (bet-type/game-type/term/date), outstanding, winlose, canceled, consolidation, tickets — theo `Term/GameType/BetType/UserId`, phân trang.
**Player**: winlose/lịch sử của chính mình.

---

## K. Gợi ý khi xây lại

1. **Chuỗi roll-up 7 tầng với `$merge`** là điểm then chốt cho báo cáo nhanh — giữ nguyên mô hình, chỉ đổi hạ tầng chạy builder.
2. **Tách statement (full re-agg) vs outstanding (incremental)**: statement chính xác sau kết sổ; outstanding phản ánh realtime — hai mục đích khác nhau, đừng gộp.
3. **Production report ở DB `reporting`** cho phép gộp nhiều sản phẩm (lottery, saba, megawin) về một cây báo cáo chung — quan trọng khi Megawin muốn báo cáo tổng.
4. **Data-lake tách khỏi DB giao dịch** giúp phân tích nặng không ảnh hưởng vận hành.
5. **Risk theo IP** (`aggDuplicationIpBet`) là công cụ chống gian lận cơ bản, dễ tái dụng.
