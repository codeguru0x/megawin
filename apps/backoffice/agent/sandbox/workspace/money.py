"""Số học tiền VND cho sandbox — dùng Decimal, KHÔNG dùng float.

VÌ SAO CÓ FILE NÀY: model tính nhẩm hoặc dùng float đều sai theo hai cách khác nhau, và cả hai
đều âm thầm. Nhẩm thì sai ngẫu nhiên khi số dài; float thì sai hệ thống — `0.1 + 0.2` cho
`0.30000000000000004`, cộng dồn vài nghìn dòng doanh thu là lệch tiền thật. `decimal.Decimal`
tính đúng theo cơ số 10 nên tổng/tỷ lệ/làm tròn khớp con số kế toán.

DÙNG (cwd của sandbox đã là /workspace nên import thẳng được):
    from money import D, fmt, pct, ratio, total, vnd

    doanh_thu = total(["1234567", "89000", "45500"])
    print(fmt(doanh_thu))                 # 1.369.067 VND
    print(fmt(pct(doanh_thu, "12.5")))    # 171.133 VND — 12,5% của doanh thu
    print(f"{ratio(45500, doanh_thu):.2f}%")

Nếu chạy từ thư mục khác: `sys.path.insert(0, "/workspace")` trước khi import.
"""

from decimal import ROUND_HALF_UP, Decimal, getcontext
from typing import Iterable, Union

# 28 chữ số hữu nghĩa mặc định là ít khi nhân tỷ lệ trên số tiền hàng nghìn tỷ. 50 cho biên rộng
# mà không ảnh hưởng tốc độ ở quy mô vài nghìn dòng.
getcontext().prec = 50

Number = Union[str, int, Decimal]


def D(value: Number) -> Decimal:
    """Chuyển sang Decimal an toàn.

    CHẤP NHẬN str/int/Decimal, TỪ CHỐI float: `Decimal(0.1)` giữ nguyên sai số nhị phân của float
    (0.1000000000000000055511151231257827) — nhận float ở đây là mở lại đúng cái lỗ mà module này
    tồn tại để bịt. Truyền số thập phân dưới dạng chuỗi: `D("0.1")`.

    TỪ CHỐI LUÔN chuỗi có dấu phân tách hàng nghìn (`1.234.567`, `1,234,567`). Không phải vì khó
    parse, mà vì parse nó là ĐOÁN: `"1.234"` theo cách đọc VN là 1234, theo cú pháp số là 1,234 —
    lệch 1000 lần và không có cách nào biết caller muốn gì. Với tiền, fail rõ ràng tốt hơn đoán
    sai âm thầm. Số lấy từ tool báo cáo vốn đã là số thô không phân tách; chỉ chuỗi copy tay từ
    UI mới có dấu, và lúc đó phải tự bỏ dấu trước khi truyền vào.
    """
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        raise TypeError("money.D không nhận bool — truyền int hoặc str.")
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        raise TypeError(
            f"money.D không nhận float ({value!r}) vì float có sai số nhị phân. "
            f'Truyền dạng chuỗi: D("{value}").'
        )
    if not isinstance(value, str):
        raise TypeError(f"money.D không nhận {type(value).__name__} — dùng str/int/Decimal.")

    cleaned = value.strip().replace(" ", "").replace("_", "")
    if "," in cleaned or cleaned.count(".") > 1:
        raise ValueError(
            f"money.D không parse số đã format ({value!r}) — bỏ dấu phân tách hàng nghìn và dùng "
            'dấu chấm cho phần thập phân, ví dụ "1234567" hoặc "1234.56".'
        )
    try:
        return Decimal(cleaned)
    except Exception as err:  # InvalidOperation và mọi lỗi parse khác
        raise ValueError(f"money.D không đọc được {value!r} thành số: {err}") from err


def total(values: Iterable[Number]) -> Decimal:
    """Tổng chính xác. Cộng dồn Decimal nên không tích luỹ sai số như float."""
    result = Decimal(0)
    for value in values:
        result += D(value)
    return result


def pct(value: Number, percent: Number) -> Decimal:
    """`percent`% của `value`. `percent` là con số phần trăm (12.5), KHÔNG phải tỷ lệ (0.125)."""
    return D(value) * D(percent) / Decimal(100)


def ratio(part: Number, whole: Number) -> Decimal:
    """Tỷ lệ `part/whole` theo phần trăm. Trả 0 khi `whole == 0` — tránh vỡ giữa lúc tính báo cáo."""
    w = D(whole)
    if w == 0:
        return Decimal(0)
    return D(part) / w * Decimal(100)


def vnd(value: Number) -> Decimal:
    """Làm tròn về đồng nguyên theo HALF_UP (quy ước kế toán).

    Python mặc định ROUND_HALF_EVEN (banker's rounding) — 0,5 làm tròn về số chẵn gần nhất, lệch
    so với cách kế toán VN đọc số. Chốt HALF_UP để khớp báo cáo.
    """
    return D(value).quantize(Decimal(1), rounding=ROUND_HALF_UP)


def fmt(value: Number, unit: str = " VND") -> str:
    """Format kiểu VN: phân tách hàng nghìn bằng dấu chấm, làm tròn về đồng.

    `fmt(x, "")` để bỏ đơn vị.
    """
    rounded = vnd(value)
    sign = "-" if rounded < 0 else ""
    digits = f"{abs(rounded):,}".replace(",", ".")
    return f"{sign}{digits}{unit}"
