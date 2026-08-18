# Sandbox `/workspace` — nơi TÍNH TOÁN, không phải nơi lấy dữ liệu

Chạy code ở đây qua tool `bash`. Không có mạng, không có database. Dữ liệu đầu vào lấy từ tool báo
cáo rồi truyền vào code.

## Quy tắc số học — BẮT BUỘC

Mọi phép tính vượt quá cộng/trừ hai số nhỏ **phải chạy bằng `python3`**, không được nhẩm. Cụ thể:
tổng nhiều dòng, phần trăm, tỷ lệ, chênh lệch kỳ, chia bình quân, làm tròn tiền.

Dùng `money.py` thay vì tự viết số học:

```bash
python3 -c '
from money import fmt, pct, ratio, total
revenue = total(["1234567", "890000", "45500"])
print("Doanh thu:", fmt(revenue))
print("Hoa hồng 12,5%:", fmt(pct(revenue, "12.5")))
print("Tỷ trọng:", f"{ratio(45500, revenue):.2f}%")
'
```

| Hàm                  | Làm gì                                                       |
| -------------------- | ------------------------------------------------------------ |
| `total(values)`      | Tổng chính xác (Decimal, không sai số float)                 |
| `pct(value, p)`      | `p`% của `value` — `p` là 12.5, không phải 0.125             |
| `ratio(part, whole)` | `part/whole` theo phần trăm; trả 0 khi `whole == 0`          |
| `vnd(value)`         | Làm tròn về đồng nguyên, HALF_UP (quy ước kế toán)           |
| `fmt(value)`         | `1.369.067 VND` — phân tách hàng nghìn kiểu VN               |
| `D(value)`           | Ép về Decimal; **từ chối float** — truyền `"0.1"` dạng chuỗi |

Tính nhiều bước thì ghi script rồi chạy, đừng nhồi vào một dòng:

```bash
cat > calc.py <<'EOF'
from money import fmt, ratio, total
games = [("Keno", "45200000"), ("Mega 6/45", "18700000"), ("Power 6/55", "12300000")]
grand = total(amount for _, amount in games)
for name, amount in games:
    print(f"{name}: {fmt(amount)} ({ratio(amount, grand):.1f}%)")
print("Tổng:", fmt(grand))
EOF
python3 calc.py
```

## Có sẵn

`python3` (+ `pip`), `node` 24, `pnpm`, `jq`, `rg`, `git`, `awk`, `sed`, coreutils.

Ưu tiên `python3` cho tính toán. Cần JavaScript thì viết `.mjs` chạy bằng `node`; TypeScript chỉ
dùng khi thật cần (`node --experimental-strip-types file.ts`, chỉ xoá được type annotation đơn
giản — không có `enum`, không `namespace`).

## KHÔNG dùng sandbox để

- **Lấy ngày/giờ** — `date` trong đây là UTC, sai so với giờ VN. Mốc thời gian đã có trong
  `clientContext` (`now`, `today`, `financialDate`).
- **Truy vấn số liệu MegaWin** — không có kết nối database. Dùng tool báo cáo.
- **Tải nội dung web** — mọi egress bị chặn, kể cả DNS. Dùng `web_fetch`.
