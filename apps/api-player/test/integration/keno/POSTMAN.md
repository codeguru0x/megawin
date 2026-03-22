# Keno -- Postman Manual Test Reference

> File này chỉ để copy URL, headers, body vào Postman. Không chạy trực tiếp.

---

## Base URL

```
http://localhost:4010
```

---

## Authentication

Tất cả endpoint yêu cầu header:

```
Authorization: Bearer <token>
Content-Type: application/json
```

### Tạo token

Token là fake JWT dùng cho serverless-offline (local). Cấu trúc: `base64url(header).base64url(payload).integ`

**Payload mẫu** (cập nhật `exp` = Unix timestamp tương lai trước khi dùng):

```json
{
  "sub": "integ-test-sub-001",
  "iss": "https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_LOCAL",
  "aud": "local-test-client",
  "exp": 1740800000,
  "cognito:username": "integ_player",
  "custom:account_type": "player",
  "custom:account_status": "active",
  "custom:account_id": "acc-integ-001",
  "custom:tenant_id": "tenant-integ-001",
  "custom:roles": "player"
}
```

**Tạo nhanh bằng Node.js** (chạy trong terminal):

```bash
node -e "
const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const p = Buffer.from(JSON.stringify({
  sub:'integ-test-sub-001',
  iss:'https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_LOCAL',
  aud:'local-test-client',
  exp:Math.floor(Date.now()/1000)+3600,
  'cognito:username':'integ_player',
  'custom:account_type':'player',
  'custom:account_status':'active',
  'custom:account_id':'acc-integ-001',
  'custom:tenant_id':'tenant-integ-001',
  'custom:roles':'player'
})).toString('base64url');
console.log(h+'.'+p+'.integ');
"
```

---

## 1. Lấy draw hiện tại

```
GET http://localhost:4010/player/keno/draws/current
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `GET`   |
| Path params  | Không   |
| Query params | Không   |
| Body         | Không   |

---

## 2. Danh sách vé (tickets)

```
GET http://localhost:4010/player/keno/tickets
```

| Mục         | Giá trị |
| ----------- | ------- |
| Method      | `GET`   |
| Path params | Không   |
| Body        | Không   |

### Query params

| Param  | Bắt buộc | Default | Mô tả                      |
| ------ | -------- | ------- | -------------------------- |
| `page` | Không    | `1`     | Trang                      |
| `size` | Không    | `20`    | Số lượng / trang (max 100) |

**Ví dụ với pagination:**

```
GET http://localhost:4010/player/keno/tickets?page=1&size=5
```

---

## 3. Chi tiết entries của một vé

```
GET http://localhost:4010/player/keno/tickets/{ticketId}/entries
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `GET`   |
| Query params | Không   |
| Body         | Không   |

### Path params

| Param      | Format                         | Ví dụ                      |
| ---------- | ------------------------------ | -------------------------- |
| `ticketId` | 24-char hex (MongoDB ObjectId) | `000000000000000000000001` |

**Ví dụ:**

```
GET http://localhost:4010/player/keno/tickets/000000000000000000000001/entries
```

---

## 4. Đặt cược (Place Bet)

```
POST http://localhost:4010/player/keno/bets
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `POST`  |
| Path params  | Không   |
| Query params | Không   |

### Quy tắc body

- `drawIds`: mảng 1-30 draw ID, không trùng, format `YYYY-MM-DD.NNN`
- `boards`: mảng 0-2 board (boardNo `"A"` hoặc `"B"`), mỗi board có 1-10 số từ `"01"` đến `"80"`, không trùng số
- `sideBets`: mảng side bets
- Phải có ít nhất 1 board hoặc 1 side bet
- `betCount`: **optional** (integer ≥ 1, mặc định `1`) — số lần cược nhân bội; tổng tiền = `unitPrice × betCount`

### Side bet values

| playType   | Các giá trị bet hợp lệ                              |
| ---------- | --------------------------------------------------- |
| `bigSmall` | `big`, `small`, `bigSmallDraw`                      |
| `evenOdd`  | `even`, `odd`, `even1112`, `odd1112`, `evenOddDraw` |

---

### 4a. Pick 1 (chọn 1 số, betCount mặc định)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["42"]
    }
  ]
}
```

### 4b. Pick 1 (betCount = 5 -- nhân 5 lần)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["42"],
      "betCount": 5
    }
  ]
}
```

### 4c. Pick 5 (chọn 5 số, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["03", "17", "25", "48", "72"],
      "betCount": 1
    }
  ]
}
```

### 4d. Pick 10 (chọn 10 số -- tối đa, betCount = 3)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["01", "08", "15", "22", "33", "44", "55", "66", "77", "80"],
      "betCount": 3
    }
  ]
}
```

### 4e. Side bet -- Big/Small (big, betCount mặc định)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmall", "bet": "big" }]
}
```

### 4f. Side bet -- Big/Small (small, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmall", "bet": "small", "betCount": 1 }]
}
```

### 4g. Side bet -- Big/Small Draw (betCount = 5)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmall", "bet": "bigSmallDraw", "betCount": 5 }]
}
```

### 4h. Side bet -- Even/Odd (odd, betCount mặc định)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "evenOdd", "bet": "odd" }]
}
```

### 4i. Side bet -- Even/Odd (even, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "evenOdd", "bet": "even", "betCount": 1 }]
}
```

### 4j. Side bet -- Even 11-12 (betCount = 2)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "evenOdd", "bet": "even1112", "betCount": 2 }]
}
```

### 4k. Side bet -- Odd 11-12 (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "evenOdd", "bet": "odd1112", "betCount": 1 }]
}
```

### 4l. Side bet -- Even/Odd Draw (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "evenOdd", "bet": "evenOddDraw", "betCount": 1 }]
}
```

### 4m. Combo: 2 boards + 2 side bets + multi-draw (betCount đa dạng)

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.002", "2026-02-28.003"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["07", "14", "28", "35", "56"],
      "betCount": 2
    },
    {
      "boardNo": "B",
      "numbers": ["02", "19"],
      "betCount": 1
    }
  ],
  "sideBets": [
    { "playType": "bigSmall", "bet": "small", "betCount": 3 },
    { "playType": "evenOdd", "bet": "even", "betCount": 1 }
  ]
}
```

### 4n. Chỉ side bets (không board, betCount đa dạng)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [
    { "playType": "bigSmall", "bet": "bigSmallDraw", "betCount": 5 },
    { "playType": "evenOdd", "bet": "evenOddDraw", "betCount": 1 }
  ]
}
```

---

### Invalid cases (expect 400)

### 4o. Body rỗng

```json
{}
```

### 4p. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [{ "boardNo": "A", "numbers": ["05"] }]
}
```

### 4q. Không có board lẫn sideBet

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [],
  "sideBets": []
}
```

### 4r. Số ngoài phạm vi (81 > 80)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "numbers": ["81"] }]
}
```

### 4s. Số không zero-pad (1 thay vì 01)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "numbers": ["1"] }]
}
```

### 4t. Quá 10 số trong 1 board

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]
    }
  ]
}
```

### 4u. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [{ "boardNo": "A", "numbers": ["42"] }]
}
```

### 4v. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [{ "boardNo": "A", "numbers": ["42"] }]
}
```

### 4w. Side bet playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "invalidType", "bet": "big" }]
}
```

### 4x. Side bet giá trị bet không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmall", "bet": "invalidBet" }]
}
```

### 4y. betCount = 0 (dưới phạm vi)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "numbers": ["42"], "betCount": 0 }]
}
```

### 4z. betCount âm

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "numbers": ["42"], "betCount": -1 }]
}
```

### 4aa. betCount là float

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "numbers": ["42"], "betCount": 1.5 }]
}
```

### 4ab. betCount cho side bet không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmall", "bet": "big", "betCount": 0 }]
}
```
