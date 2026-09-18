# p3-01 — Storybook + Chromatic (HOÃN — ghi nhận lý do, không thi hành)

User đã chốt: *"Chromatic và storybook sẽ để sau"*. File này **không phải plan để làm** — nó ghi lại
kết quả research để 6 tháng sau không ai phải research lại, và nêu **điều kiện** để mở lại.

---

## 1. Hiện trạng

```bash
$ grep -rn "storybook" --include=package.json . | grep -v node_modules
# → không có kết quả. Repo chưa có Storybook.
```

`packages/ui` có component shadcn nhưng **không có story nào**.

## 2. Vì sao Chromatic không dùng được ngay

Chromatic có 2 chế độ:

| Chế độ | Yêu cầu | Đánh giá cho repo này |
|---|---|---|
| **Storybook** (chính) | Phải có Storybook + story cho từng component | Chưa có gì. Viết story cho toàn bộ `packages/ui` là khối việc riêng, lớn |
| **Playwright/Cypress integration** | Gửi ảnh từ E2E lên Chromatic để duyệt | Về mặt kỹ thuật dùng được, nhưng chỉ thay phần **review UI** — Playwright HTML report đã làm việc đó, miễn phí |

→ Với 10–40 baseline ([p2-02](p2-02-rollout-and-ci.plan.md) §5), HTML report đủ. Chromatic bắt đầu
có giá trị khi cần **duyệt song song nhiều người** + **lịch sử baseline theo branch** — chưa phải bài
toán hiện tại.

Thêm nữa: Chromatic tính phí theo snapshot/tháng và cần CI để upload — mà repo **chưa có CI**
([p2-02](p2-02-rollout-and-ci.plan.md) §1).

## 3. Vì sao Storybook cũng chưa cấp thiết

Giá trị chính của Storybook là **xem component ở trạng thái cô lập**. Trong repo này:

- `cursor-ide-browser` + dev server đã cho agent **và** người xem trang thật, đúng data thật
  ([p2-01](p2-01-design-authoring-loop.plan.md) §2).
- Component backoffice phần lớn **phụ thuộc data + auth session** — dựng story cho chúng đòi mock
  nhiều tầng (fetch, session, theme provider), chi phí không nhỏ.
- Component thuần trình bày (`packages/ui`) phần lớn là shadcn primitive gần như nguyên bản — story
  cho chúng gần như trùng docs shadcn.

## 4. Điều kiện mở lại — cụ thể, đo được

Mở lại `p3-01` khi **ít nhất 2 trong 3** điều sau đúng:

1. `packages/ui` có ≥ 10 component **tự viết** (không phải shadcn primitive nguyên bản) mà nhiều app
   dùng chung → cần nơi xem/kiểm cô lập.
2. Có ≥ 2 người thường xuyên review UI và đang phải gửi screenshot qua chat để duyệt → cần workflow
   duyệt tập trung.
3. Số baseline vượt trần 40 ([p2-02](p2-02-rollout-and-ci.plan.md) §5) mà vẫn cần phủ thêm → cần
   component-level test thay vì page-level.

Điều kiện tiên quyết cứng: **repo đã có CI hoạt động** ([p2-02](p2-02-rollout-and-ci.plan.md)).

## 5. Nếu mở lại — thứ tự đúng

1. Storybook cho `packages/ui` trước (component thuần, không cần mock data/session).
2. Story chỉ cho component **tự viết**, KHÔNG viết story cho shadcn primitive nguyên bản.
3. Chỉ sau khi có story ổn định mới nối Chromatic — nối sớm là trả phí cho thứ chưa dùng.
4. Không đụng vào E2E Playwright đã có: hai lớp giải hai bài toán khác nhau (component cô lập vs
   luồng thật), không thay thế nhau.

## Không làm (ở thời điểm này)

- Không `npx storybook@latest init`.
- Không tạo account Chromatic, không thêm token.
- Không viết story "để dành".
- Không thêm dependency Storybook vào `package.json` nào.
