# 06 — Stop Number (Dừng số / Mở lại số)

**Mục đích**: cho phép quản lý **dừng nhận cược** một hoặc nhiều con số cụ thể (theo Term/GameType/BetType), hoặc mở lại. Là chốt chặn cuối trong luồng đặt cược để chặn số quá rủi ro.

Đường dẫn: `server/src/services/lottery/services/stop-number`.

---

## A. Entity `StopNumberEntity` — collection `stopNumbers`

`infrastructure/entities/stop-number-entity.ts`

| Field                     | Kiểu             | Ý nghĩa                                                    |
| ------------------------- | ---------------- | ---------------------------------------------------------- |
| `UserId`                  | string           | Tài khoản đặt dừng (đại lý)                                |
| `Term, GameType, BetType` |                  | Khóa                                                       |
| `Numbers`                 | string[]         | Danh sách số đang bị dừng                                  |
| `Type`                    | StopNumberType   | `Manual` (dừng tay) / `Automatic` (do worker auto đóng số) |
| `Status`                  | StopNumberStatus | `Open` / `Closed`                                          |
| `CreatedAt / UpdatedAt`   | Date             |                                                            |

> Dừng số có thể do **thủ công** (đại lý gõ) hoặc **tự động** (worker extra-price khi risk/point vượt ngưỡng `CloseAtRisk`/`CloseAtPoint`, xem file 04).

---

## B. Logic — `updateNumbers` (`services/stop-number-service.ts`)

- Nhận `{ Term, GameType, BetType, Numbers[] }`. Guard quyền + `WriteBetting`.
- Upsert danh sách số bị dừng cho user + term.
- Sau update:
    - **Xoá cache Redis** `lottery:game_play:place_betting:stop_number:{term}:{gt}:{bt}:{userId}` để lần cược sau đọc mới.
    - **Publish SNS** `STOP_NUMBER_CHANGED_EVENT` (bus) + realtime để client & các cấp con cập nhật.

---

## C. Cách áp dụng khi đặt cược (state `validate-stop-number`, file 07)

- Lấy danh sách số bị dừng của user + **tất cả cấp cha** (một số bị bất kỳ cấp nào dừng → toàn nhánh không cược được số đó).
- Cache: key trên, TTL 30 giây (đủ ngắn để dừng số phản ánh nhanh).
- Nếu số cược nằm trong danh sách dừng → phiếu bị từ chối ở state validate.

---

## D. API

| Method          | Path                                 | Ý nghĩa                                       |
| --------------- | ------------------------------------ | --------------------------------------------- |
| GET             | `/agent/{Term}/{GameType}/{BetType}` | Lấy số đang dừng                              |
| PUT             | `/agent/...`                         | Cập nhật số dừng (Agent + `WriteBetting`)     |
| DELETE / mở lại |                                      | Mở lại số (set Status=Open / bỏ khỏi Numbers) |

Player có thể xem số bị dừng để UI ẩn/khoá.

---

## E. Gợi ý khi xây lại

1. **Dừng số áp dụng theo cả nhánh cha** — cần resolve toàn bộ ancestor khi validate (giống game-limit).
2. Phân biệt `Manual` vs `Automatic` để worker auto không ghi đè lệnh dừng tay của người quản lý (và ngược lại).
3. TTL cache ngắn (30s) + xoá cache chủ động khi update là cách cân bằng tốc độ và độ trễ.
