"use client";

/**
 * Công bố "form này đang có thay đổi chưa lưu" cho AI Panel — đầu GHI của quy tắc bất biến
 * p1-04 §2.3: agent chỉ được tự `router.push` khi nguồn KHÔNG dirty.
 *
 * Vì sao tách hook riêng thay vì để mỗi form tự gọi `useAiPageContext`: hợp đồng "khoá phải là
 * `formDirty`, và phải vắng mặt khi form sạch" là thứ `navigate-tool-card.tsx` phụ thuộc vào
 * (`isAnySourceFormDirty` dò đúng khoá đó). Gói lại một chỗ để 41 form không ai chép sai tên khoá —
 * chép sai thì không có compiler nào bắt, chỉ mất im lặng dòng cảnh báo.
 *
 * MỖI FORM PHẢI CÓ `formKey` RIÊNG. `registerAiPageContext` trùng key thì GHI ĐÈ, còn một trang
 * config mount đồng thời 6 form độc lập (rates, prizes, play-rules, ops, …). Nếu tất cả dùng chung
 * một key thì form mount sau (sạch) đè lên form staff đang sửa dở ⇒ cảnh báo biến mất đúng lúc cần
 * nhất. Trang chỉ mount một tại một thời điểm nên `formKey` không cần mang tên game.
 *
 * Vì sao truyền `undefined` chứ không `false` khi form sạch: `pruneEmpty` chỉ bỏ
 * `undefined`/`null`/`""` — `false` được GIỮ. Truyền `false` ⇒ mỗi lượt chat gánh thêm 6 group
 * `{"formDirty": false}` vô nghĩa trong prompt. Với `undefined`, group bị prune sạch và prompt chỉ
 * còn đúng các form đang dirty — vừa gọn vừa đọc được bằng mắt khi debug.
 *
 * Không phát sinh re-render: mọi caller đã đọc `isDirty` ngay trong render để `disabled` nút Lưu,
 * nên subscription (react-hook-form `formState` proxy hoặc `useState`) vốn đã có. Hook này chỉ ghi
 * một hàm đọc vào store module-level — xem `use-ai-page-context.ts`.
 *
 * @example
 * ```tsx
 * const form = useForm({ ... });
 * useAiFormDirty("rates", form.formState.isDirty);
 * ```
 */

import type { AiPageContextValue } from "@/lib/ai-page-context";

import { useAiPageContext } from "./use-ai-page-context";

/**
 * @param formKey Định danh form trong trang, một từ không dấu (`"rates"`, `"prizes"`,
 *   `"tenant-config"`). Đi thẳng vào prompt nên phải đọc được: model dùng nó để nói staff đang sửa
 *   dở phần nào. Duy nhất trong phạm vi một trang — xem JSDoc file.
 * @param isDirty Form có thay đổi chưa lưu. Truyền thẳng `form.formState.isDirty` (react-hook-form)
 *   hoặc state dirty tự quản.
 */
export function useAiFormDirty(formKey: string, isDirty: boolean): void {
  // `satisfies` để lỡ ai đổi `AiPageContextValue` thành không nhận `undefined` thì vỡ ở ĐÂY (kèm
  // JSDoc giải thích vì sao cần `undefined`), chứ không vỡ rải rác ở 41 call-site.
  const value = { formDirty: isDirty ? true : undefined } satisfies AiPageContextValue;

  useAiPageContext(`form.${formKey}`, value);
}
