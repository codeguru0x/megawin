# 11 — Bookkeeping (Kết sổ: dò trúng, tính thắng thua, redo, kết sổ thử)

**Mục đích**: đây là **lõi nghiệp vụ** — sau khi có kết quả, hệ thống dò từng ticket item xem trúng số nào, trúng bao nhiêu nháy, tính tiền thắng thua (`WinLose`) của player và **từng cấp đại lý**, rồi cập nhật báo cáo.

Đường dẫn: `server/src/services/lottery/services/bookkeeping`.

---

## A. Kiến trúc dịch vụ

Lớp cơ sở `BookKeepingService` (`infrastructure/services/winlose/bookkeeping-service.ts`) + 4 lớp con theo đài:

- `mb1-bookkeeping-service.ts` — Miền Bắc 1
- `mb2-bookkeeping-service.ts` — Miền Bắc 2 (có Thần Tài)
- `mn-bookkeeping-service.ts` — Miền Nam 18A/B/C
- `mn18avab-bookkeeping-service.ts` — Xiên ghép 18A + 18B

Helper dò kết quả: `infrastructure/common/bookkeeping-helper.ts`.

---

## B. Dò số trúng & đếm nháy — `getNumberFrequence` (`bookkeeping-helper.ts:14`)

```14:49:server/src/services/lottery/services/bookkeeping/infrastructure/common/bookkeeping-helper.ts
    getNumberFrequence: (
        lotteryResults: string[],
        numberLength: number = 2,
        numberPosition: ResultNumberPositionEnum = ResultNumberPositionEnum.Last,
    ): NumberFrequenceType[] => {
        const results: NumberFrequenceType[] = [];
        let winNumber: string = null;
        for (let number of lotteryResults) {
            // Giải thưởng lấy theo các số cuối hoặc các số đầu
            winNumber =
                numberPosition === ResultNumberPositionEnum.Last
                    ? number.slice(-numberLength)
                    : number.slice(0, numberLength);
            const result = _.find(results, (obj) => obj.Number === winNumber);
            if (_.isNil(result)) {
                results.push({ Number: winNumber, Frequence: 1 });
                continue;
            }
            result.Frequence += 1;   // đếm số lần số về = số "nháy"
        }
        return results;
    },
```

- `numberLength`: 2 (Lô/2D), 3 (3D), 4 (4D).
- `numberPosition`: `Last` (đuôi) hoặc `First` (đầu).
- `Frequence` = **số nháy** = số lần con số xuất hiện trong tập giải → dùng cho `MultiPay`.

### B.1 Lấy tập giải để dò

- **Lô Miền Bắc** (`getLoNorthernResult`, `:52`): flatten tất cả giải (Jackpot, First, Second...Seventh) → lấy 2 số cuối mỗi giải → `getNumberFrequence`.
- **Lô Live MB** (`getNorthernLiveResult`, `:75`): tập giải phụ thuộc **số giải còn lại** (`remainPrize`): 27=đủ, 26=bỏ giải nhất, 25=bỏ 1 vé giải nhì... → dò đúng theo thời điểm cược.
- **Xiên MB** (`getXienResult`, `:388`): trả danh sách 2-số-cuối distinct để kiểm tra tất cả số trong tổ hợp có cùng về.
- Miền Nam có bộ hàm tương tự.

---

## C. CÔNG THỨC TÍNH THẮNG THUA (WinLose)

### C.1 Kiểu có nháy (Lô, 2D-27Lô...) — `bookkeeping-service.ts:856`

```856:867:server/src/services/lottery/services/bookkeeping/infrastructure/services/winlose/bookkeeping-service.ts
            // Người chơi thắng
            if (_.isNil(winNr) === false) {
                item.Result = item.Payouts * item.Point * winNr.Frequence;
                item.MultiPay = winNr.Frequence;
            } else {
                // Người chơi thua
                item.Result = 0;
                item.MultiPay = 0;
            }
            // Tiền thắng thua bằng kết quả - tiền cược
            item.WinLose = item.Result - item.NetAmount;
```

- `Result = Payouts × Point × Frequence` (ăn theo số nháy).
- `MultiPay = Frequence`.
- **`WinLose = Result − NetAmount`** (NetAmount = tiền cược thực của item).

> Với Lô Live, số nháy lấy theo `PrizeNr` (số giải còn lại tại thời điểm cược) qua `Win25/26/27Numbers` (`:840-853`).

### C.2 Kiểu không nháy (Đề, đầu/đuôi 1 giải) — `bookkeeping-service.ts:1148`

```1148:1154:server/src/services/lottery/services/bookkeeping/infrastructure/services/winlose/bookkeeping-service.ts
            // Nếu trúng thưởng
            item.Result =
                item.Numbers[0] === param.winNumber
                    ? item.Payouts * item.Point
                    : 0;
            // Tiền thắng thua bằng kết quả - tiền cược
            item.WinLose = item.Result - item.NetAmount;
```

- Trúng khi số cược khớp `winNumber` → `Result = Payouts × Point`; ngược lại 0.
- `WinLose = Result − NetAmount`.

### C.3 Kiểu Trượt (DeTruot/LoTruot)

Trượt "ăn khi số **KHÔNG** về". Logic đảo: nếu không có số nào trong tổ hợp về → thắng; chỉ cần 1 số về → thua. `Result`/`WinLose` tính theo cùng khung `Result − NetAmount` nhưng điều kiện thắng ngược.

### C.4 Xiên (Xien2/3/4)

Thắng khi **tất cả** số trong tổ hợp cùng về. MB1 ăn theo nháy tối thiểu; MB2/MN có biến thể riêng (dùng `getXienResult` để kiểm tra tập số về).

---

## D. CÔNG THỨC THẮNG THUA TỪNG CẤP ĐẠI LÝ — `ancestorBookKeepingResult` (`bookkeeping-service.ts:1310`)

```1310:1320:server/src/services/lottery/services/bookkeeping/infrastructure/services/winlose/bookkeeping-service.ts
    public ancestorBookKeepingResult(
        ancestor: TicketItemShareHolder,
        playerResult: number,
    ) {
        ancestor.WinLose = _.round(
            ancestor.Income - (playerResult * ancestor.Percent) / 100,
            4,
        );
        return ancestor;
    }
```

- **`Ancestor.WinLose = Income − (PlayerResult × Percent / 100)`**
    - `Income` = tiền cấp đó thu về khi cược (file 07 mục D).
    - `PlayerResult` = tiền thắng của player cho item (`item.Result`).
    - `Percent` = % thầu thực của cấp đó.
- Áp cho cả 6 cấp: `Owner, Company, Manager, Super, Master, Agent` (mỗi cấp gọi hàm với cùng `item.Result`).

> **Ý nghĩa**: cấp đại lý lời phần `Income` đã thu, nhưng phải trả phần thắng của player theo tỷ lệ mình ôm. Tổng WinLose các cấp + WinLose player = 0 (bảo toàn tiền, trừ hoa hồng).

---

## E. Luồng kết sổ (Step Function `winlose`)

```
bookkeeping.startExecution (Agent + WriteGame)
   → term.updateTermBookKeepingStatus (Open → BookKeeping_InProcess)
   ▼ Step Function (mỗi GameType/BetType một nhánh process)
   bet-type-bookkeeping-start-process
     → bet-type-{mb1|mb2|mn18ABC|mn18AvaB}-bookkeeping-process  (dò + tính WinLose, phân trang ticketItems)
     → bet-type-bookkeeping-success (set game BookKeeping_Success)
     → bet-type-bookkeeping-fail (nếu lỗi)
   bookkeeping-end → build reports (file 13, chuỗi 7 tầng)
   bookkeeping-complete → term BookKeeping_End → Reporting
```

- Xử lý **theo lô + phân trang** ticketItems (khối lượng lớn), cập nhật bằng `updateTicketItemsByBookKeepingWorker` (bulkWrite).
- Sau khi tính WinLose, ghi `WinLose/Result/MultiPay` vào `ticketItems` + `Owner..Agent` (WinLose từng cấp).

---

## F. Redo (kết sổ lại)

`redoExecution`: dùng khi nhập sai kết quả.

```
term → BookKeeping_RedoProcess(10)
   → del-player-bet-type-report / del-bookie-bet-type-report (xoá báo cáo cũ)
   → del-cancelled-ticket-items (dọn item đã huỷ trong lần trước)
   → finance huỷ trả thưởng (Decrease balance — file 12)
   → chạy lại winlose + build report
```

## G. Kết sổ THỬ (temporary)

`temporary-statements/*`: tính thử WinLose & báo cáo vào collection `temp_*` (`temp_ticketItems`, `temp_bookieBetTypeReports`, `temp_playerBetTypeReports`) **không đụng dữ liệu thật** — để đại lý xem trước lời/lỗ. `TemporaryBookkeepingStatus` trong term (`InProcess/End/RedoProcess`).

---

## H. API endpoints

**Agent** (Company + `WriteGame`):

- `POST /agent/bookkeeping/start` — kết sổ thật.
- `POST /agent/bookkeeping/redo` — kết sổ lại.
- `POST /agent/bookkeeping/temporary` — kết sổ thử.
- `GET /agent/bookkeeping/status` — trạng thái.

---

## I. Gợi ý khi xây lại

1. **`WinLose = Result − NetAmount` (player)** và **`Ancestor.WinLose = Income − Result × Percent/100`** là 2 công thức phải copy chính xác — sai là lệch tiền toàn hệ thống.
2. **`MultiPay = Frequence`** (số nháy) chỉ áp dụng cho kiểu có nháy (Lô); Đề/2D-đầu-đuôi 1 giải không nhân nháy.
3. **`ShareHolders` đóng băng trong ticketItem lúc cược** được dùng lại nguyên vẹn khi kết sổ → không đọc cấu hình hiện tại.
4. **Redo phải đảo ngược đủ** (xoá report + huỷ trả thưởng + tính lại) — thiết kế state machine riêng.
5. **Kết sổ thử (temp\_\*)** rất hữu ích cho vận hành; nên giữ khi xây mới.
6. Xử lý **phân trang ticketItems** trong Step Function để tránh timeout/OOM với khối lượng lớn.
