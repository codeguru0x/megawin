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

| Mục | Giá trị |
|-----|---------|
| Method | `GET` |
| Path params | Không |
| Query params | Không |
| Body | Không |

---

## 2. Danh sách vé (tickets)

```
GET http://localhost:4010/player/keno/tickets
```

| Mục | Giá trị |
|-----|---------|
| Method | `GET` |
| Path params | Không |
| Body | Không |

### Query params

| Param | Bắt buộc | Default | Mô tả |
|-------|----------|---------|-------|
| `page` | Không | `1` | Trang |
| `size` | Không | `20` | Số lượng / trang (max 100) |

**Ví dụ với pagination:**

```
GET http://localhost:4010/player/keno/tickets?page=1&size=5
```

---

## 3. Chi tiết entries của một vé

```
GET http://localhost:4010/player/keno/tickets/{ticketId}/entries
```

| Mục | Giá trị |
|-----|---------|
| Method | `GET` |
| Query params | Không |
| Body | Không |

### Path params

| Param | Format | Ví dụ |
|-------|--------|-------|
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

| Mục | Giá trị |
|-----|---------|
| Method | `POST` |
| Path params | Không |
| Query params | Không |

### Quy tắc body

- `drawIds`: mảng 1-30 draw ID, không trùng, format `YYYY-MM-DD.NNN`
- `boards`: mảng 0-2 board (boardNo `"A"` hoặc `"B"`), mỗi board có 1-10 số từ `"01"` đến `"80"`, không trùng số
- `sideBets`: mảng side bets
- Phải có ít nhất 1 board hoặc 1 side bet

### Side bet values

| playType | Các giá trị bet hợp lệ |
|----------|------------------------|
| `bigSmall` | `big`, `small`, `bigSmallDraw` |
| `evenOdd` | `even`, `odd`, `even1112`, `odd1112`, `evenOddDraw` |

---

### 4a. Pick 1 (chọn 1 số)

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

### 4b. Pick 5 (chọn 5 số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["03", "17", "25", "48", "72"]
    }
  ]
}
```

### 4c. Pick 10 (chọn 10 số -- tối đa)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["01", "08", "15", "22", "33", "44", "55", "66", "77", "80"]
    }
  ]
}
```

### 4d. Side bet -- Big/Small

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [
    { "playType": "bigSmall", "bet": "big" }
  ]
}
```

### 4e. Side bet -- Even/Odd

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [
    { "playType": "evenOdd", "bet": "odd" }
  ]
}
```

### 4f. Side bet -- Even 11-12

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [
    { "playType": "evenOdd", "bet": "even1112" }
  ]
}
```

### 4g. Combo: 2 boards + 2 side bets + multi-draw

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.002", "2026-02-28.003"],
  "boards": [
    {
      "boardNo": "A",
      "numbers": ["07", "14", "28", "35", "56"]
    },
    {
      "boardNo": "B",
      "numbers": ["02", "19"]
    }
  ],
  "sideBets": [
    { "playType": "bigSmall", "bet": "small" },
    { "playType": "evenOdd", "bet": "even" }
  ]
}
```

### 4h. Chỉ side bets (không board)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [
    { "playType": "bigSmall", "bet": "bigSmallDraw" },
    { "playType": "evenOdd", "bet": "evenOddDraw" }
  ]
}
```

---

### Invalid cases (expect 400)

### 4i. Body rỗng

```json
{}
```

### 4j. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [
    { "boardNo": "A", "numbers": ["05"] }
  ]
}
```

### 4k. Không có board lẫn sideBet

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [],
  "sideBets": []
}
```

### 4l. Số ngoài phạm vi (81 > 80)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "numbers": ["81"] }
  ]
}
```

### 4m. Số không zero-pad (1 thay vì 01)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "numbers": ["1"] }
  ]
}
```

### 4n. Quá 10 số trong 1 board

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

### 4o. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "numbers": ["42"] }
  ]
}
```

### 4p. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [
    { "boardNo": "A", "numbers": ["42"] }
  ]
}
```

### 4q. Side bet playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [
    { "playType": "invalidType", "bet": "big" }
  ]
}
```

### 4r. Side bet giá trị bet không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [
    { "playType": "bigSmall", "bet": "invalidBet" }
  ]
}
```
