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
- `boards`: mảng 1-3 board (boardNo `"A"`, `"B"`, hoặc `"C"`), không trùng boardNo
- **TẤT CẢ loại chơi** (cơ bản pick1-pick10 và bổ sung bigSmall/evenOdd) đều nằm trong `boards[]`
- **Không còn** mảng `sideBets` riêng — bỏ hoàn toàn từ v1.0.13
- `boardNo`: **bắt buộc** cho mọi board, kể cả cược bổ sung
- `betCount`: **optional** (integer ≥ 1, mặc định `1`) — số lần cược nhân bội

### Loại chơi cơ bản (playType bắt buộc)

| playType | Số lượng `numbers` bắt buộc |
| -------- | --------------------------- |
| `pick1`  | 1 số                        |
| `pick2`  | 2 số                        |
| ...      | ...                         |
| `pick10` | 10 số                       |

### Loại chơi bổ sung (playType bắt buộc)

| playType   | Mô tả            | Fields cần thiết | Các giá trị `bet` hợp lệ                            |
| ---------- | ---------------- | ---------------- | --------------------------------------------------- |
| `bigSmall` | Cược Lớn/Nhỏ/Hòa | `bet`, `boardNo` | `big`, `small`, `bigSmallDraw`                      |
| `evenOdd`  | Cược Chẵn/Lẻ/Hòa | `bet`, `boardNo` | `even`, `odd`, `even1112`, `odd1112`, `evenOddDraw` |

---

### 4a. Pick 1 (chọn 1 số, betCount mặc định)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "pick1",
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
      "playType": "pick1",
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
      "playType": "pick5",
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
      "playType": "pick10",
      "numbers": ["01", "08", "15", "22", "33", "44", "55", "66", "77", "80"],
      "betCount": 3
    }
  ]
}
```

### 4e. Cược bổ sung -- Big/Small (big, betCount mặc định)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bigSmall",
      "bet": "big"
    }
  ]
}
```

### 4f. Cược bổ sung -- Big/Small (small, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bigSmall",
      "bet": "small",
      "betCount": 1
    }
  ]
}
```

### 4g. Cược bổ sung -- Big/Small Draw (betCount = 5)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bigSmall",
      "bet": "bigSmallDraw",
      "betCount": 5
    }
  ]
}
```

### 4h. Cược bổ sung -- Even/Odd (odd, betCount mặc định)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "evenOdd",
      "bet": "odd"
    }
  ]
}
```

### 4i. Cược bổ sung -- Even/Odd (even, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "evenOdd",
      "bet": "even",
      "betCount": 1
    }
  ]
}
```

### 4j. Cược bổ sung -- Even 11-12 (betCount = 2)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "evenOdd",
      "bet": "even1112",
      "betCount": 2
    }
  ]
}
```

### 4k. Cược bổ sung -- Odd 11-12 (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "evenOdd",
      "bet": "odd1112",
      "betCount": 1
    }
  ]
}
```

### 4l. Cược bổ sung -- Even/Odd Draw (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "evenOdd",
      "bet": "evenOddDraw",
      "betCount": 1
    }
  ]
}
```

### 4m. Combo: 2 boards chọn số + 1 cược bổ sung + multi-draw

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.002", "2026-02-28.003"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "pick5",
      "numbers": ["07", "14", "28", "35", "56"],
      "betCount": 2
    },
    {
      "boardNo": "B",
      "playType": "pick2",
      "numbers": ["02", "19"],
      "betCount": 1
    },
    {
      "boardNo": "C",
      "playType": "bigSmall",
      "bet": "small",
      "betCount": 3
    }
  ]
}
```

### 4n. Combo: 1 board chọn số + 2 cược bổ sung (tất cả boardNo "A"-"C")

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "pick3",
      "numbers": ["10", "20", "30"],
      "betCount": 1
    },
    {
      "boardNo": "B",
      "playType": "bigSmall",
      "bet": "big",
      "betCount": 1
    },
    {
      "boardNo": "C",
      "playType": "evenOdd",
      "bet": "even",
      "betCount": 1
    }
  ]
}
```

### 4o. Chỉ cược bổ sung (2 boards, không chọn số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bigSmall",
      "bet": "bigSmallDraw",
      "betCount": 5
    },
    {
      "boardNo": "B",
      "playType": "evenOdd",
      "bet": "evenOddDraw",
      "betCount": 1
    }
  ]
}
```

---

### Invalid cases (expect 400)

### 4p. Body rỗng

```json
{}
```

### 4q. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["05"] }]
}
```

### 4r. Không có board nào (boards rỗng)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": []
}
```

### 4s. Số ngoài phạm vi (81 > 80)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["81"] }]
}
```

### 4t. Số không zero-pad (1 thay vì 01)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["1"] }]
}
```

### 4u. Quá 10 số trong 1 board

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "pick10",
      "numbers": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]
    }
  ]
}
```

### 4v. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["42"] }]
}
```

### 4w. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["42"] }]
}
```

### 4x. boardNo trùng lặp

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "pick1", "numbers": ["10"] },
    { "boardNo": "A", "playType": "bigSmall", "bet": "big" }
  ]
}
```

### 4y. boardNo vượt quá "C" (không hợp lệ)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "D", "playType": "pick1", "numbers": ["42"] }]
}
```

### 4z. boardNo thiếu (bắt buộc)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "playType": "pick1", "numbers": ["42"] }]
}
```

### 4aa. bigSmall thiếu bet

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "bigSmall" }]
}
```

### 4ab. Giá trị bet không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "bigSmall", "bet": "invalidBet" }]
}
```

### 4ac. playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "invalidType", "bet": "big" }]
}
```

### 4ad. betCount = 0 (dưới phạm vi)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["42"], "betCount": 0 }]
}
```

### 4ae. betCount âm

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["42"], "betCount": -1 }]
}
```

### 4af. betCount là float

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["42"], "betCount": 1.5 }]
}
```

### 4ag. Gửi sideBets (không còn hỗ trợ — expect 400)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [{ "boardNo": "A", "playType": "pick1", "numbers": ["42"] }],
  "sideBets": [{ "playType": "bigSmall", "bet": "big" }]
}
```
