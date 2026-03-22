# Max 3D Pro -- Postman Manual Test Reference

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
GET http://localhost:4010/games/max3dpro/draws/current
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `GET`   |
| Path params  | Không   |
| Query params | Không   |
| Body         | Không   |

---

## 2. Danh sách vé đang chờ (pending tickets)

```
GET http://localhost:4010/games/max3dpro/tickets/pending
```

| Mục         | Giá trị |
| ----------- | ------- |
| Method      | `GET`   |
| Path params | Không   |
| Body        | Không   |

### Query params

| Param    | Bắt buộc | Default | Mô tả                          |
| -------- | -------- | ------- | ------------------------------ |
| `size`   | Không    | `20`    | Số lượng / trang (max 100)     |
| `cursor` | Không    | —       | ObjectId cursor cho trang tiếp |

**Ví dụ với cursor pagination:**

```
GET http://localhost:4010/games/max3dpro/tickets/pending?size=5
```

---

## 3. Danh sách vé đã hoàn thành (completed tickets)

```
GET http://localhost:4010/games/max3dpro/tickets/completed
```

| Mục         | Giá trị |
| ----------- | ------- |
| Method      | `GET`   |
| Path params | Không   |
| Body        | Không   |

### Query params

| Param    | Bắt buộc | Default   | Mô tả                          |
| -------- | -------- | --------- | ------------------------------ |
| `size`   | Không    | `20`      | Số lượng / trang (max 100)     |
| `cursor` | Không    | —         | ObjectId cursor cho trang tiếp |
| `sortBy` | Không    | `betDate` | Field sort                     |
| `from`   | Không    | —         | Ngày bắt đầu (YYYY-MM-DD)      |
| `to`     | Không    | —         | Ngày kết thúc (YYYY-MM-DD)     |

**Ví dụ:**

```
GET http://localhost:4010/games/max3dpro/tickets/completed?size=5&sortBy=betDate&from=2026-01-01&to=2026-03-01
```

---

## 4. Chi tiết entries của một vé

```
GET http://localhost:4010/games/max3dpro/tickets/{ticketId}/entries
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
GET http://localhost:4010/games/max3dpro/tickets/000000000000000000000001/entries
```

---

## 5. Danh sách lines của một entry

```
GET http://localhost:4010/games/max3dpro/entries/{entryId}/lines
```

| Mục    | Giá trị |
| ------ | ------- |
| Method | `GET`   |
| Body   | Không   |

### Path params

| Param     | Format                         | Ví dụ                      |
| --------- | ------------------------------ | -------------------------- |
| `entryId` | 24-char hex (MongoDB ObjectId) | `000000000000000000000001` |

### Query params

| Param    | Bắt buộc | Default | Mô tả                                    |
| -------- | -------- | ------- | ---------------------------------------- |
| `size`   | Không    | `20`    | Số lượng / trang (max 100)               |
| `cursor` | Không    | —       | Line index (integer >= 0) cho trang tiếp |

**Ví dụ:**

```
GET http://localhost:4010/games/max3dpro/entries/000000000000000000000001/lines?size=10&cursor=0
```

---

## 6. Đặt cược (Place Bet)

```
POST http://localhost:4010/games/max3dpro/bets
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `POST`  |
| Path params  | Không   |
| Query params | Không   |

### Quy tắc body

- `drawIds`: mảng 1-6 draw ID, không trùng, format `YYYY-MM-DD.NNN`
- `boards`: mảng 1-4 board, boardNo từ `"A"` đến `"D"`, không trùng boardNo
- Mỗi board gồm: `boardNo`, `playMode`, `playType`, và fields tùy playMode
- `playMode`: `"multiNumber"` hoặc `"multiDigit"`
- `playType`: `"straight"` hoặc `"quickPick"`
- `betCount`: **optional** (integer ≥ 1, mặc định `1`) — số lần cược nhân bội; tổng tiền = `unitPrice × betCount`

### Quy tắc theo playMode

| playMode      | playType    | Fields cần thiết                                            |
| ------------- | ----------- | ----------------------------------------------------------- |
| `multiNumber` | `straight`  | `triplets`: 3-20 bộ ba số (string "000"-"999")              |
| `multiNumber` | `quickPick` | Không cần triplets                                          |
| `multiDigit`  | `straight`  | `frontDigits`: 3 chữ số (0-9), `backDigits`: 3 chữ số (0-9) |
| `multiDigit`  | `quickPick` | Không cần digits                                            |

> **multiNumber:** chọn 3-20 bộ ba số, hệ thống tạo C(n,2) cặp.
> **multiDigit:** chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand thành các cặp.

---

### 6a. MultiNumber Straight (3 bộ ba số -- tối thiểu, betCount mặc định)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"]
    }
  ]
}
```

### 6b. MultiNumber Straight (3 bộ ba, betCount = 5)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"],
      "betCount": 5
    }
  ]
}
```

### 6c. MultiNumber Straight (5 bộ ba số, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["000", "111", "222", "333", "444"],
      "betCount": 1
    }
  ]
}
```

### 6d. MultiNumber Straight (20 bộ ba số -- tối đa, betCount = 3)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": [
        "000",
        "050",
        "100",
        "150",
        "200",
        "250",
        "300",
        "350",
        "400",
        "450",
        "500",
        "550",
        "600",
        "650",
        "700",
        "750",
        "800",
        "850",
        "900",
        "950"
      ],
      "betCount": 3
    }
  ]
}
```

### 6e. MultiNumber QuickPick (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "quickPick",
      "betCount": 1
    }
  ]
}
```

### 6f. MultiNumber QuickPick (betCount = 10)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "quickPick",
      "betCount": 10
    }
  ]
}
```

### 6g. MultiDigit Straight (3 front + 3 back, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiDigit",
      "playType": "straight",
      "frontDigits": [1, 2, 3],
      "backDigits": [4, 5, 6],
      "betCount": 1
    }
  ]
}
```

### 6h. MultiDigit Straight (betCount = 5)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiDigit",
      "playType": "straight",
      "frontDigits": [0, 3, 7],
      "backDigits": [1, 5, 9],
      "betCount": 5
    }
  ]
}
```

### 6i. MultiDigit QuickPick (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiDigit",
      "playType": "quickPick",
      "betCount": 1
    }
  ]
}
```

### 6j. Multi-board (3 boards, các playMode khác nhau, betCount đa dạng)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"],
      "betCount": 2
    },
    {
      "boardNo": "B",
      "playMode": "multiDigit",
      "playType": "straight",
      "frontDigits": [0, 5, 9],
      "backDigits": [1, 3, 7],
      "betCount": 1
    },
    {
      "boardNo": "C",
      "playMode": "multiNumber",
      "playType": "quickPick",
      "betCount": 5
    }
  ]
}
```

### 6k. Multi-draw + multi-board (4 boards, 3 draws, betCount đa dạng)

```json
{
  "drawIds": ["2026-02-28.001", "2026-03-02.001", "2026-03-04.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["100", "200", "300"],
      "betCount": 1
    },
    {
      "boardNo": "B",
      "playMode": "multiDigit",
      "playType": "straight",
      "frontDigits": [2, 4, 6],
      "backDigits": [1, 3, 5],
      "betCount": 3
    },
    {
      "boardNo": "C",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["111", "222", "333", "444"],
      "betCount": 1
    },
    {
      "boardNo": "D",
      "playMode": "multiDigit",
      "playType": "quickPick",
      "betCount": 10
    }
  ]
}
```

---

### Invalid cases (expect 400)

### 6l. Body rỗng

```json
{}
```

### 6m. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"]
    }
  ]
}
```

### 6n. boards rỗng

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": []
}
```

### 6o. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"]
    }
  ]
}
```

### 6p. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"]
    }
  ]
}
```

### 6q. MultiNumber với 2 triplets (dưới tối thiểu 3)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456"]
    }
  ]
}
```

### 6r. MultiNumber với 21 triplets (vượt tối đa 20)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": [
        "000",
        "050",
        "100",
        "150",
        "200",
        "250",
        "300",
        "350",
        "400",
        "450",
        "500",
        "550",
        "600",
        "650",
        "700",
        "750",
        "800",
        "850",
        "900",
        "950",
        "999"
      ]
    }
  ]
}
```

### 6s. Triplet sai format (2 chữ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["12", "456", "789"]
    }
  ]
}
```

### 6t. MultiDigit frontDigits không đủ 3

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiDigit",
      "playType": "straight",
      "frontDigits": [1, 2],
      "backDigits": [4, 5, 6]
    }
  ]
}
```

### 6u. MultiDigit digit ngoài phạm vi (10 > 9)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiDigit",
      "playType": "straight",
      "frontDigits": [1, 2, 10],
      "backDigits": [4, 5, 6]
    }
  ]
}
```

### 6v. MultiDigit thiếu backDigits

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiDigit",
      "playType": "straight",
      "frontDigits": [1, 2, 3]
    }
  ]
}
```

### 6w. playMode không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "invalidMode",
      "playType": "straight",
      "triplets": ["123", "456", "789"]
    }
  ]
}
```

### 6x. playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "invalidType",
      "triplets": ["123", "456", "789"]
    }
  ]
}
```

### 6y. boardNo trùng lặp

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"]
    },
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "quickPick"
    }
  ]
}
```

### 6z. Quá 6 drawIds

```json
{
  "drawIds": [
    "2026-02-28.001",
    "2026-03-02.001",
    "2026-03-04.001",
    "2026-03-06.001",
    "2026-03-09.001",
    "2026-03-11.001",
    "2026-03-13.001"
  ],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"]
    }
  ]
}
```

### 6aa. Quá 4 boards (5 boards)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["111", "222", "333"]
    },
    {
      "boardNo": "B",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["444", "555", "666"]
    },
    {
      "boardNo": "C",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["777", "888", "999"]
    },
    {
      "boardNo": "D",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["100", "200", "300"]
    },
    {
      "boardNo": "E",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["400", "500", "600"]
    }
  ]
}
```

### 6ab. MultiDigit digit là string thay vì number

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiDigit",
      "playType": "straight",
      "frontDigits": ["1", "2", "3"],
      "backDigits": ["4", "5", "6"]
    }
  ]
}
```

### 6ac. betCount = 0 (dưới phạm vi)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"],
      "betCount": 0
    }
  ]
}
```

### 6ad. betCount âm

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"],
      "betCount": -1
    }
  ]
}
```

### 6ae. betCount là float

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "multiNumber",
      "playType": "straight",
      "triplets": ["123", "456", "789"],
      "betCount": 1.5
    }
  ]
}
```
