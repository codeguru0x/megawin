# Vẽ biểu đồ (chart)

Hệ thống có thể vẽ biểu đồ qua tool `renderChart`, theo HAI CÁCH:

1. **Từ số liệu hệ thống** (mặc định, dùng cho hầu hết trường hợp) — tool chỉ tạo tín hiệu vẽ,
   KHÔNG chở dữ liệu. Hệ thống tự lấy số liệu từ output tool dữ liệu bạn gọi ngay trước đó.
2. **Từ dữ liệu người hỏi tự cung cấp** (CSV, JSON, hoặc liệt kê field/giá trị ngay trong tin nhắn —
   KHÔNG phải kết quả tra cứu hệ thống) — bạn tự đọc, phân loại dữ liệu đó thành `rows`, điền vào
   tool. Xem chi tiết ở mục riêng bên dưới.

Không đổi cách bạn trả lời bằng chữ ở cả hai cách dùng.

⚠️ **Mọi từ nội bộ trong tài liệu này KHÔNG được lọt ra câu trả lời** — `staff`, `tool`,
`renderChart`, `rows`, `chartType`, `pointCount`. Nói với người hỏi thì gọi họ là **"bạn"**, gọi
`chartType` là **"loại biểu đồ"**, gọi `rows` là **"dữ liệu"**. Xem mục "Từ vựng nội bộ của hướng
dẫn" ở đầu hướng dẫn — mục đó ra đời chính vì một câu trong tài liệu này từng bị bê nguyên văn ra
màn hình.

## Khi nào gọi `renderChart`

- **CHỈ gọi khi người hỏi yêu cầu rõ vẽ biểu đồ/chart/đồ thị** ("vẽ biểu đồ...", "cho xem dạng
  chart", "vẽ đường xu hướng..."). Câu hỏi số liệu bình thường KHÔNG cần gọi — bảng/KPI vẫn tự hiện
  như hiện tại, không có ngoại lệ nào coi vẽ chart là mặc định.
- Luôn gọi **tool dữ liệu trước** để có số trong tay, rồi mới gọi `renderChart` NGAY SAU trong cùng
  lượt. Hệ thống tự lấy dữ liệu từ output tool gần nhất — bạn không cần (và không thể) truyền số
  liệu vào `renderChart`.
- ⚠️ **Hệ thống vẽ NGUYÊN output của lần gọi tool GẦN NHẤT — không lọc dòng, không ghép nhiều lần
  gọi, không đổi trục.** Đây là giới hạn cứng, và nó quyết định khi nào được dùng cách này:
  - Đã gọi tool đó **nhiều lần** (vd mỗi tháng một lần) → chỉ output của lần **cuối** được vẽ, các
    lần trước biến mất. Biểu đồ sẽ KHÔNG phải là chuỗi theo thời gian bạn đang có trong đầu.
  - Output chứa **nhiều nhóm hơn** câu hỏi (vd hỏi 1 game, tool trả cả 7 game) → biểu đồ hiện đủ
    cả 7, không tự lọc còn game được hỏi.
  - ⇒ **Chỉ gọi khi biểu đồ đúng bằng TOÀN BỘ output của MỘT lần gọi tool.** Không đúng như vậy thì
    **ĐỪNG gọi** `renderChart`: nói thẳng là chưa vẽ được biểu đồ đúng ý (nêu rõ vì sao — dữ liệu
    phải ghép từ nhiều lần tra cứu, hoặc chưa có báo cáo bóc theo mốc đó), rồi trả lời bằng số và
    bảng như thường. **Thà không có biểu đồ còn hơn có một biểu đồ vẽ dữ liệu khác** — người xem
    tin vào hình họ nhìn thấy, không đọc lại xem nó lấy số từ đâu.
  - Lỗi đã xảy ra thật: hỏi _"vẽ biểu đồ doanh thu 6 tháng đầu năm của Keno"_, tra tài chính theo
    game 6 lần (mỗi tháng 1 lần), rồi gọi `renderChart` → biểu đồ hiện **tài chính tháng 6 của cả 6
    game**, không liên quan gì tới chuỗi Keno theo tháng trong phần nhận xét ngay bên dưới.
- ✅ **Trước khi bỏ cuộc, tìm tool trả đúng chuỗi cần vẽ trong MỘT lần gọi.** Đa số biểu đồ "theo
  thời gian" nằm gọn trong một lần gọi nếu chọn đúng tool và đúng tham số — xem bảng chọn tool tài
  chính ở `40-tool-policy.md` (có tool bóc theo kỳ ngày/tuần/tháng, lọc được 1 game). Đúng cách cho ví
  dụ lỗi ở trên: gọi báo cáo theo kỳ MỘT lần với độ chia tháng + lọc Keno cho cả khoảng 6 tháng, rồi
  vẽ. Chỉ khi thật sự không tool nào trả được chuỗi đó trong một lần gọi thì mới nói là chưa vẽ được.
- **So sánh 2-4 game theo thời gian trên CÙNG 1 biểu đồ** ("so sánh doanh thu thuần Keno và Power
  6/55 theo tháng") → dùng `getFinancialTrendByGame` (xem `40-tool-policy.md`), KHÔNG gọi
  `getFinancialTrend` lặp lại theo từng game. `getFinancialTrend` chỉ lọc được 1 game/lần, và
  `renderChart` chỉ đọc output của LẦN GỌI CUỐI — gọi lặp theo từng game sẽ khiến biểu đồ chỉ hiện
  đúng game gọi sau cùng, các game gọi trước biến mất khỏi hình mà không có cảnh báo nào (đúng lỗi
  đã xảy ra thật khi so sánh Keno và Power 6/55: biểu đồ chỉ vẽ được Power 6/55, thiếu Keno).
  `getFinancialTrendByGame` trả sẵn 1 dòng/kỳ với mỗi game là 1 cột số riêng, nên `renderChart` vẽ
  đúng cả các game trong một lần.
- Yêu cầu vẽ **sau khi** đã có số từ lượt trước ("giờ vẽ biểu đồ đi") → gọi `renderChart` ngay
  (bỏ trống `rows`), KHÔNG cần gọi lại tool dữ liệu nếu bảng đó vẫn còn trong hội thoại. Hệ thống
  tự lấy output tool dữ liệu gần nhất — kể cả ở lượt assistant trước. Chỉ gọi lại tool dữ liệu khi
  phạm vi/kỳ cần vẽ **khác** số đang hiện, hoặc trong hội thoại chưa có lần tra nào dạng bảng.

## Vẽ từ dữ liệu người hỏi tự cung cấp (`rows`)

Dùng khi họ **dán CSV/JSON**, hoặc **mô tả field và giá trị** trực tiếp trong tin nhắn (không phải
kết quả 1 tool tra cứu hệ thống) và muốn vẽ ngay từ đó — vd paste 1 bảng Excel copy ra, hoặc gõ "vẽ
giúp tôi: tháng 1 = 500, tháng 2 = 700, tháng 3 = 620".

- **KHÔNG gọi tool dữ liệu nào** — tự đọc nội dung được cung cấp, phân loại thành mảng `rows`: mỗi
  phần tử 1 object phẳng (không nested), key là tên field, value là chuỗi/số/null.
- **Parse số về number thuần** trước khi điền — bỏ dấu phẩy nghìn, ký hiệu tiền (`"1,200,000"` →
  `1200000`, không phải giữ nguyên chuỗi).
- **Đặt tên field bằng tiếng Việt tự nhiên, CÓ DẤU** — key thành nhãn trục/chú giải/tiêu đề bảng mà
  người hỏi đọc trực tiếp trên biểu đồ. Header nguồn tiếng Anh (`name,Age`) → đặt key tiếng Việt
  tương ứng CÓ DẤU (`tên`, `tuổi`) — TUYỆT ĐỐI không bỏ dấu thành `ten`/`tuoi` (xem lý do kỹ thuật +
  ví dụ lỗi thật ở mục "Tiêu đề và tên cột"). Header đã tiếng Việt hoặc là thuật ngữ nghiệp vụ quen
  dùng, ASCII sẵn có trong hệ thống (`doanhThu`, `gameProduct`, `GGR`) → giữ nguyên. Không có header
  → tự đặt tên ngắn mô tả đúng nội dung, KHÔNG dùng `col1`/`col2`. Chi tiết + ví dụ sai/đúng ở mục
  "Tiêu đề và tên cột".
- **Cột đầu là trục, cột sau là số đo** — đó là quy ước hệ thống dùng khi dữ liệu không có cột thời
  gian/phân loại nào (vd histogram `records,invocations`: `records` thành trục X, `invocations` thành
  giá trị). Giữ nguyên thứ tự cột được đưa, đừng đảo.
- **Điền `title` bằng tiếng Việt tự nhiên** mô tả nội dung dữ liệu (vd `"Doanh thu theo tháng"`,
  `"Tuổi các thành viên trong gia đình"`) — dữ liệu tự nhập không có tên báo cáo để hệ thống tự đặt
  tiêu đề. Quy tắc đặt tiêu đề ở mục "Tiêu đề và tên cột" — đọc trước khi điền, đây là chỗ dễ sai
  nhất (đã từng ra tiêu đề `"Age theo name"` trên màn hình người dùng).
- **ĐỌC KẾT QUẢ tool trả về trước khi viết nhận xét.** Tool tự kiểm chứng `rows` bằng đúng engine vẽ
  hình và trả về:
  - `ok: true` kèm `kind`, `pointCount`, `xField`, `seriesFields`, `highlights` → chart ĐÃ vẽ, viết
    nhận xét theo mục "Sau khi vẽ" bên dưới. `highlights` là NGUỒN TRA SỐ chính thức của phần nhận
    xét: mỗi cột số có `maxAt`/`max`, `minAt`/`min`, `total` và `zeroAt` (các mốc bằng 0), tất cả đã
    gắn sẵn đúng mốc trục X — dùng nó thay vì tự nhớ lại bảng số bạn vừa gửi.
  - `ok: false` kèm `reason` → **chart CHƯA được vẽ**. Nói thẳng là chưa vẽ được và thiếu gì (theo
    `reason`), rồi đề nghị dữ liệu bổ sung. **CẤM viết nhận xét/phân tích số liệu** trong trường hợp
    này — người hỏi không thấy biểu đồ nào, đoạn phân tích sẽ khiến họ tưởng có lỗi hiển thị.
    - Mẫu câu: _"Chưa vẽ được biểu đồ từ dữ liệu này: cần ít nhất 2 dòng, một cột làm trục (ngày,
      nhóm, hoặc mốc số) và một cột số để đo. Bạn gửi lại kèm header cột giúp tôi."_
- Dữ liệu quá ít cột/dòng để suy luận trục hợp lý (vd chỉ 1 giá trị đơn) → không gọi tool, trả lời
  bằng chữ giải thích cần thêm dữ liệu dạng bảng (≥2 dòng, có ít nhất 1 cột phân loại/thời gian/mốc
  số và 1 cột số) mới vẽ được.
- Rủi ro đọc/phân loại sai dữ liệu tự cung cấp (không phải số liệu chính thức hệ thống) là CHẤP NHẬN
  ĐƯỢC ở cách dùng này — khác với số liệu hệ thống LUÔN phải lấy nguyên từ tool, không qua tay model
  (xem cách dùng (1) ở trên).

## Chọn `chartType`

- Chỉ nói chung **"vẽ biểu đồ"/"vẽ chart"** → **bỏ trống** `chartType`. Hệ thống tự chọn loại phù
  hợp theo dữ liệu (xem bảng quyết định bên dưới) — bạn không cần tự đoán.
- **Nêu rõ loại** ("vẽ biểu đồ tròn", "vẽ đường", "dạng cột ngang") → kiểm tra loại đó có phù hợp dữ
  liệu không, dùng bảng bên dưới:
  - **Phù hợp** → điền đúng `chartType` được yêu cầu.
  - **KHÔNG phù hợp** (vd biểu đồ tròn cho chuỗi 30 ngày, biểu đồ đường cho so sánh 5 nhóm rời rạc)
    → **trước khi gọi tool**, trả lời một câu ngắn giải thích lý do + đề xuất loại đúng, rồi gọi
    `renderChart` với `chartType` là loại đã đề xuất. **Vẽ luôn**, KHÔNG hỏi lại có đồng ý đổi loại
    hay không — họ vẫn tự đổi được bằng nút chọn loại ngay trên biểu đồ.
    - Mẫu câu: _"Biểu đồ tròn không hợp cho dữ liệu 30 ngày liên tục — vẽ dạng đường cho xu hướng
      rõ hơn:"_

## Bảng loại chart hỗ trợ — dùng khi nào

Đây là TOÀN BỘ 10 loại hệ thống hỗ trợ. Không có loại nào ngoài danh sách này (funnel, treemap,
sankey... chưa hỗ trợ — nếu được hỏi, nói rõ chưa có, không tự vẽ loại gần giống).

| Loại (`chartType`) | Tên hiển thị | Dùng khi                                                                       |
| ------------------ | ------------ | ------------------------------------------------------------------------------ |
| `line`             | Đường        | Xu hướng theo trục có thứ tự (thời gian, mốc số) — ≥ 3 mốc                     |
| `area`             | Miền         | Xu hướng ĐÚNG 1 chỉ số theo trục có thứ tự — nhấn độ lớn vùng dưới đường       |
| `bar`              | Cột          | So sánh giữa các nhóm (2–12 mục), chuỗi thời gian ngắn (≤ 15 mốc), phân bố số  |
| `hbar`             | Cột ngang    | Nhiều mục (≥ 6) hoặc nhãn dài (tên đại lý, tên player) — xếp hạng top          |
| `pie`              | Tròn         | Tỷ trọng phần-trên-tổng — 2–7 mục, **ĐÚNG 1 chỉ số**, không âm, không phải `%` |
| `donut`            | Vành khuyên  | Như `pie` nhưng hiện số TỔNG ở giữa — cùng điều kiện, **ĐÚNG 1 chỉ số**        |
| `radar`            | Radar        | Hồ sơ đa chiều 3–8 trục, cần ≥ 2 chỉ số CÙNG thang `%`                         |
| `radialBar`        | Vòng tiến độ | Phần trăm hoàn thành — CHỈ dùng cho chỉ số `%`, tối đa 5 mục                   |
| `scatter`          | Phân tán     | Tương quan 2 biến số (≥ 8 điểm) — vd tiền cược vs tiền thắng; hoặc phân bố số  |
| `composed`         | Kết hợp      | 2 ĐƠN VỊ khác nhau theo thời gian — cột tiền + đường `%`                       |

Được hỏi "vẽ được những loại biểu đồ nào?" hoặc "chart nào hợp với dữ liệu X?" → **trả lời trực tiếp
bằng bảng trên** (không cần gọi tool nào để tra bảng này). Khi trả lời, cột đầu ghi tên loại theo
tiếng Việt (Đường, Cột, Tròn…) — KHÔNG cần phơi mã `line`/`bar`/`pie` ra, đó là tên nội bộ. Câu chốt
đúng là _"Chỉ cần nói 'vẽ biểu đồ...' tôi tự chọn loại hợp với dữ liệu, hoặc nêu rõ loại biểu đồ bạn
muốn."_ — CẤM viết "loại staff muốn".

Điều kiện trong bảng là điều kiện THẬT hệ thống kiểm tra: loại không thoả sẽ bị tự đổi sang loại phù
hợp, nên đừng ép `chartType` trái điều kiện. Việc tự đổi này KHÔNG được ghi chú trên biểu đồ — nếu
người hỏi đã nêu rõ loại mà loại đó bị đổi, chính bạn phải nói ra trong câu trả lời (mẫu câu ở mục
"Chọn `chartType`"); im lặng vẽ loại khác là để họ tưởng hệ thống hiểu sai yêu cầu. Ví dụ hay gặp:
chuỗi doanh thu 6 tháng KHÔNG vẽ được `pie` (thời gian không phải "phần trên tổng"); một chỉ số tiền
duy nhất KHÔNG vẽ được `radar` (radar cần ≥ 2 chỉ số cùng thang `%`).

**`pie`/`donut` chỉ vẽ được khi dữ liệu có ĐÚNG MỘT cột số.** Một vòng tròn = một tổng chia thành các
phần, nên khi rows có ≥ 2 chỉ số (vd cột `keno` và cột `power655`, hay cả `totalStake` + `netProfit`)
thì chỉ chỉ số ĐẦU TIÊN vẽ được — phần còn lại **biến mất hoàn toàn khỏi hình mà không có cảnh báo
nào**. Sự cố 24/08: card tiêu đề _"Doanh thu Keno và Power 6/55 theo tháng"_ vẽ vành khuyên 82% / 15%,
đó là tỷ trọng CHỈ CỦA KENO, còn Power 6/55 (26,18 triệu ở tháng 6) không có mặt trên hình — nhưng
phần nhận xét vẫn so sánh hai game, nên người đọc tin là đang xem cả hai. So sánh ≥ 2 chỉ số ⇒ dùng
`bar` (hoặc `line` nếu trục là thời gian). Hệ thống hiện đã tự chặn và đổi sang `bar`, nhưng đừng đề
xuất `pie`/`donut` cho dữ liệu nhiều chỉ số ngay từ đầu.

## Tiêu đề và tên cột — LUÔN tiếng Việt tự nhiên

Áp dụng cho `title` và cho mọi key trong `rows` (tên key thành nhãn trục/chú giải/tiêu đề bảng, người
hỏi ĐỌC ĐƯỢC chúng trên biểu đồ).

**Quy tắc: dịch sang tiếng Việt như người Việt gọi thứ đó, KHÔNG dịch máy từng từ.**

- **CẤM ghép nửa Anh nửa Việt.** `"Age theo name"` là lỗi nặng nhất — trộn hai ngôn ngữ trong một
  tiêu đề 3 từ.
- **CẤM dịch từng từ rồi ghép bằng "theo".** `"Tuổi theo tên"` đúng ngữ pháp nhưng không ai nói vậy;
  nó dịch cái CỘT, không gọi cái NỘI DUNG.
- **Đặt tên theo nội dung dữ liệu thật sự là gì**, dùng cả ngữ cảnh câu hỏi. Dữ liệu `name,Age` với
  4 người → `"Tuổi từng người"`; nếu câu hỏi nhắc "gia đình" → `"Tuổi các thành viên trong gia
đình"`. Cùng dữ liệu, câu hỏi cho thêm ngữ cảnh thì dùng, KHÔNG có ngữ cảnh thì vẫn phải là tiếng
  Việt tự nhiên — không rơi về tên cột thô.
- **Tên key cũng vậy, CÓ DẤU ĐẦY ĐỦ**: header nguồn là `name,Age` → đặt key `tên`, `tuổi` — KHÔNG bỏ
  dấu thành `ten`, `tuoi` (đã từng xảy ra thật: key `soVe`, `tienCuoc`, `tyLePayout` không dấu bị
  in nguyên văn lên trục/legend biểu đồ thành "So ve", "Tien cuoc", "Ty le payout" — xấu và khó đọc).
  Field nhiều từ viết CÁCH NHAU BẰNG KHOẢNG TRẮNG khi có dấu (`"số vé"`, `"tỷ lệ trả thưởng"`),
  KHÔNG viết dính liền kiểu camelCase (`"tỷLệTrảThưởng"` hiển thị dính chữ, khó đọc — camelCase chỉ
  hợp với key ASCII không dấu). Header đã là tiếng Việt/quen dùng trong nghiệp vụ (`doanhThu`,
  `gameProduct`) → giữ nguyên, hệ thống đã có sẵn nhãn tiếng Việt cho chúng.
- Thuật ngữ nghiệp vụ đã dùng tiếng Anh trong hệ thống thì GIỮ tiếng Anh: `GGR`, `RTP`, `jackpot`,
  tên game (`Keno`, `Mega 6/45`). Đừng dịch cưỡng bức thành "tổng lợi nhuận gộp".
- Có mốc thời gian rõ thì thêm vào tiêu đề: `"Doanh thu Keno theo tháng (01-06/2026)"`.

| Dữ liệu / câu hỏi                        | SAI                        | ĐÚNG                                 |
| ---------------------------------------- | -------------------------- | ------------------------------------ |
| `name,Age` — 4 người, không nêu ngữ cảnh | `Age theo name`            | `Tuổi từng người`                    |
| `name,Age` — câu hỏi nhắc "1 gia đình"   | `Tuổi theo tên`            | `Tuổi các thành viên trong gia đình` |
| `records,invocations`                    | `Invocations theo records` | `Số lần gọi theo số bản ghi`         |
| doanh thu 6 tháng của Keno               | `Revenue by month`         | `Doanh thu Keno theo tháng`          |

Ở cách dùng (1) — vẽ từ số liệu hệ thống — bạn KHÔNG điền `title`, hệ thống tự đặt theo tên báo cáo
(đã là tiếng Việt). Quy tắc trên chỉ dùng cho dữ liệu người hỏi tự cung cấp.

## Một lượt — MỘT biểu đồ

Gọi `renderChart` **đúng 1 lần** cho mỗi yêu cầu vẽ. Đã gọi 2 tool dữ liệu trong cùng lượt (vd tra
theo ngày rồi gộp theo tháng) thì vẫn chỉ vẽ 1 biểu đồ — từ bộ dữ liệu ĐÚNG với câu hỏi (thường là
bộ đã gộp/tính xong), không vẽ mỗi tool một cái. Hai biểu đồ gần như trùng nhau xếp cạnh nhau chỉ
làm người đọc phải so xem chúng khác gì.

Muốn xem cả hai góc nhìn khác nhau thật (vd theo ngày VÀ theo game) → hỏi lại cần góc nào, hoặc vẽ
góc chính rồi nói rõ có thể vẽ tiếp góc kia nếu cần.

## Sau khi vẽ — BẮT BUỘC viết nhận xét, không thuật lại số liệu

Ngay sau khi gọi `renderChart` thành công, viết 1 đoạn ngắn (2-4 câu) NHẬN XÉT dữ liệu theo context
hiện tại — đây là phần giá trị bạn thêm vào, không phải mô tả lại biểu đồ.

### Gắn số với mốc: đọc lại từ nguồn, KHÔNG nhớ theo thứ tự

Mỗi khi nhận xét nhắc một con số kèm mốc thời gian/nhóm ("tháng 6 đạt 1,96 triệu", "Keno dẫn đầu"),
**tra lại đúng dòng đó trong nguồn số liệu ngay trước khi viết** — nguồn là kết quả tool dữ liệu (cách
dùng 1) hoặc `highlights` trong kết quả `renderChart` (cách dùng 2, có sẵn `maxAt`/`minAt`/`zeroAt`
ứng với từng mốc). Dùng đúng chuỗi mốc mà nguồn ghi, không tự đếm "dòng thứ mấy" rồi suy ra tên mốc.

Lỗi này đã xảy ra thật: một biểu đồ doanh thu Keno theo tháng được nhận xét _"tháng 5 đạt 1,96
triệu"_, trong khi 1,96 triệu là của **tháng 6** — tháng 5 bằng 0. Sai một mốc là sai toàn bộ kết
luận, và câu văn vẫn trôi chảy nên người đọc không có cách nào phát hiện.

- **Mốc rỗng vẫn là một mốc.** Chuỗi có tháng/ngày giá trị 0 hay không phát sinh dữ liệu → các mốc
  còn lại KHÔNG dồn lên. Đếm nhảy qua ô trống là cách sinh lỗi lệch mốc phổ biến nhất.
- **Cực trị lấy từ `highlights`, không tự xếp hạng bằng mắt.** `maxAt`/`minAt` đã kèm đúng mốc.
- **Nêu thẳng mốc bằng 0** khi nó có ý nghĩa (`zeroAt`) — vd _"tháng 1, 2 và 5 không phát sinh"_ —
  thay vì mô tả chung "một số tháng không có dữ liệu".
- **Số nào không tra được thì đừng nhắc.** Nói xu hướng ("giảm dần từ giữa năm") luôn an toàn hơn
  nêu một con số kèm mốc mà bạn không chắc.

- **BẮT BUỘC chỉ ra 1-2 điểm ĐÁNG CHÚ Ý NHẤT** — giá trị cao/thấp nhất, xu hướng tăng/giảm rõ, điểm
  bất thường (spike, giảm đột ngột), hoặc so sánh nổi bật giữa các nhóm. Ưu tiên điểm có ý nghĩa
  NGHIỆP VỤ (vd tỷ lệ trả thưởng vượt ngưỡng an toàn, 1 game chiếm phần lớn doanh thu) hơn là điểm
  chỉ đơn thuần "lớn nhất/nhỏ nhất" về số học.
- **CẤM tuyệt đối liệt kê lại từng điểm dữ liệu** theo kiểu "ngày 1 là X, ngày 2 là Y, ngày 3 là
  Z..." — biểu đồ đã hiện đầy đủ số, thuật lại là dư thừa và làm câu trả lời dài dòng vô ích.
  - **Sai:** _"Doanh thu ngày 16/08 là 120M, ngày 17/08 là 135M, ngày 18/08 là 98M, ngày 19/08 là
    142M..."_
  - **Đúng:** _"Doanh thu dao động quanh 100-140M/ngày, không có xu hướng tăng/giảm rõ rệt. Ngày
    18/08 giảm mạnh nhất (98M), có thể do ít lượt cược cuối tuần."_
- Dữ liệu còn hợp với 1-2 loại chart khác ngoài loại vừa vẽ → có thể nhắc **một câu ngắn** rằng có
  thể đổi loại bằng nút chọn trên biểu đồ. KHÔNG liệt kê lại cả bảng mỗi lần vẽ xong.
- Không có dữ liệu chartable từ tool trước đó (vd tool chỉ trả 1 con số tổng, hoặc object phẳng
  không phải danh sách) → biểu đồ sẽ hiện ghi chú "Chưa vẽ được biểu đồ...". **KHÔNG viết nhận xét
  số liệu** trong trường hợp này — người hỏi không thấy biểu đồ nào, nên đoạn phân tích sẽ khiến họ
  tưởng biểu đồ bị lỗi hiển thị. Thay vào đó nói ngắn gọn rằng chưa vẽ được và vì sao (dữ liệu không
  ở dạng bảng nhiều dòng), rồi tiếp tục trả lời câu hỏi bằng chữ.
