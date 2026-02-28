# Lotto 5/35 -- Postman Manual Test Reference

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
GET http://localhost:4010/player/lotto535/draws/current
```

| Mục | Giá trị |
|-----|---------|
| Method | `GET` |
| Path params | Không |
| Query params | Không |
| Body | Không |

---

## 2. Lấy thông tin Jackpot

```
GET http://localhost:4010/player/lotto535/jackpot
```

| Mục | Giá trị |
|-----|---------|
| Method | `GET` |
| Path params | Không |
| Query params | Không |
| Body | Không |

---

## 3. Danh sách vé (tickets)

```
GET http://localhost:4010/player/lotto535/tickets
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
GET http://localhost:4010/player/lotto535/tickets?page=1&size=5
```

---

## 4. Chi tiết entries của một vé

```
GET http://localhost:4010/player/lotto535/tickets/{ticketId}/entries
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
GET http://localhost:4010/player/lotto535/tickets/000000000000000000000001/entries
```

---

## 5. Danh sách lines của một entry

```
GET http://localhost:4010/player/lotto535/entries/{entryId}/lines
```

| Mục | Giá trị |
|-----|---------|
| Method | `GET` |
| Body | Không |

### Path params

| Param | Format | Ví dụ |
|-------|--------|-------|
| `entryId` | 24-char hex (MongoDB ObjectId) | `000000000000000000000001` |

### Query params

| Param | Bắt buộc | Default | Mô tả |
|-------|----------|---------|-------|
| `page` | Không | `1` | Trang |
| `size` | Không | `20` | Số lượng / trang (max 100) |

**Ví dụ:**

```
GET http://localhost:4010/player/lotto535/entries/000000000000000000000001/lines?page=1&size=10
```

---

## 6. Đặt cược (Place Bet)

```
POST http://localhost:4010/player/lotto535/bets
```

| Mục | Giá trị |
|-----|---------|
| Method | `POST` |
| Path params | Không |
| Query params | Không |

### Quy tắc body

- `drawIds`: mảng 1-6 draw ID, không trùng, format `YYYY-MM-DD.NNN`
- `boards`: mảng 1-5 board, boardNo từ `"A"` đến `"E"`, không trùng boardNo
- Mỗi board gồm: `boardNo`, `playType`, `selection` (`mainNumbers` + `specialNumbers`)
- Số chính (`mainNumbers`): `"01"` đến `"35"`, tối đa 15 số, không trùng
- Số đặc biệt (`specialNumbers`): `"01"` đến `"12"`, tối đa 12 số, không trùng

### Quy tắc theo playType

| playType | mainNumbers | specialNumbers |
|----------|-------------|----------------|
| `standard` | Đúng 5 | Đúng 1 |
| `mainCover4` | Đúng 4 | Đúng 1 |
| `mainCover` | 6 đến 15 | Đúng 1 |
| `specialCover` | Đúng 5 | 2 đến 12 |
| `quickPick` | Không cần (hệ thống random) | Không cần |

---

### 6a. Standard (5 số chính + 1 số đặc biệt)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    }
  ]
}
```

### 6b. MainCover4 (4 số chính + 1 số đặc biệt)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "mainCover4",
      "selection": {
        "mainNumbers": ["03", "12", "25", "30"],
        "specialNumbers": ["08"]
      }
    }
  ]
}
```

### 6c. MainCover (6 số chính + 1 số đặc biệt)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "mainCover",
      "selection": {
        "mainNumbers": ["02", "09", "15", "21", "28", "34"],
        "specialNumbers": ["11"]
      }
    }
  ]
}
```

### 6d. MainCover (15 số chính -- tối đa)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "mainCover",
      "selection": {
        "mainNumbers": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15"],
        "specialNumbers": ["01"]
      }
    }
  ]
}
```

### 6e. SpecialCover (5 số chính + 2 số đặc biệt)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "specialCover",
      "selection": {
        "mainNumbers": ["05", "10", "18", "27", "33"],
        "specialNumbers": ["03", "09"]
      }
    }
  ]
}
```

### 6f. SpecialCover (5 số chính + 12 số đặc biệt -- tối đa)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "specialCover",
      "selection": {
        "mainNumbers": ["05", "10", "18", "27", "33"],
        "specialNumbers": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
      }
    }
  ]
}
```

### 6g. QuickPick

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "quickPick",
      "selection": {
        "mainNumbers": [],
        "specialNumbers": []
      }
    }
  ]
}
```

### 6h. Multi-board (3 boards, các playType khác nhau)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    },
    {
      "boardNo": "B",
      "playType": "mainCover4",
      "selection": {
        "mainNumbers": ["03", "12", "25", "30"],
        "specialNumbers": ["08"]
      }
    },
    {
      "boardNo": "C",
      "playType": "quickPick",
      "selection": {
        "mainNumbers": [],
        "specialNumbers": []
      }
    }
  ]
}
```

### 6i. Multi-draw + multi-board (5 boards, 3 draws)

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.002", "2026-02-28.003"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    },
    {
      "boardNo": "B",
      "playType": "mainCover",
      "selection": {
        "mainNumbers": ["02", "09", "15", "21", "28", "34"],
        "specialNumbers": ["11"]
      }
    },
    {
      "boardNo": "C",
      "playType": "specialCover",
      "selection": {
        "mainNumbers": ["05", "10", "18", "27", "33"],
        "specialNumbers": ["03", "09", "12"]
      }
    },
    {
      "boardNo": "D",
      "playType": "mainCover4",
      "selection": {
        "mainNumbers": ["08", "16", "24", "31"],
        "specialNumbers": ["07"]
      }
    },
    {
      "boardNo": "E",
      "playType": "quickPick",
      "selection": {
        "mainNumbers": [],
        "specialNumbers": []
      }
    }
  ]
}
```

---

### Invalid cases (expect 400)

### 6j. Body rỗng

```json
{}
```

### 6k. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    }
  ]
}
```

### 6l. boards rỗng

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": []
}
```

### 6m. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    }
  ]
}
```

### 6n. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    }
  ]
}
```

### 6o. mainNumber ngoài phạm vi (36 > 35)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "36"],
        "specialNumbers": ["05"]
      }
    }
  ]
}
```

### 6p. specialNumber ngoài phạm vi (13 > 12)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["13"]
      }
    }
  ]
}
```

### 6q. Số không zero-pad

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["1", "7", "14", "22", "35"],
        "specialNumbers": ["5"]
      }
    }
  ]
}
```

### 6r. Standard sai số lượng mainNumbers (4 thay vì 5)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22"],
        "specialNumbers": ["05"]
      }
    }
  ]
}
```

### 6s. Standard sai số lượng specialNumbers (2 thay vì 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05", "08"]
      }
    }
  ]
}
```

### 6t. playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "invalidType",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    }
  ]
}
```

### 6u. boardNo trùng lặp

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    },
    {
      "boardNo": "A",
      "playType": "quickPick",
      "selection": {
        "mainNumbers": [],
        "specialNumbers": []
      }
    }
  ]
}
```

### 6v. Quá 6 drawIds

```json
{
  "drawIds": [
    "2026-02-28.001",
    "2026-02-28.002",
    "2026-02-28.003",
    "2026-02-28.004",
    "2026-02-28.005",
    "2026-02-28.006",
    "2026-02-28.007"
  ],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"],
        "specialNumbers": ["05"]
      }
    }
  ]
}
```
