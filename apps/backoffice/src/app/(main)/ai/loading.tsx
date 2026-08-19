/**
 * Skeleton của `/ai` trong lúc RSC payload đang tải.
 *
 * VÌ SAO CẦN FILE NÀY (sửa 19/08): không có `loading.tsx` riêng, `/ai` thừa hưởng
 * `app/(main)/loading.tsx` — skeleton dashboard (4 card KPI + 2 khối lớn). Bấm "Mở rộng" từ panel
 * xong staff thấy một trang dashboard giả nhấp nháy rồi mới ra khung chat: đúng cảm giác "web tắt
 * panel rồi chờ một lúc mới load sang trang".
 *
 * Hình dạng ở đây khớp `AiWorkspace`: header 48px, vùng hội thoại `max-w-3xl` căn giữa, cột lịch sử
 * bên phải, bubble composer ở dưới. Nhờ khớp khung, lúc trang thật lên chỉ có nội dung điền vào chỗ
 * trống — không có cú nhảy layout. Phép tính chiều cao lặp lại `AiWorkspace` (`100svh` − header shell
 * − khoảng hở `SidebarInset`); ở đây KHÔNG đọc được cookie `sidebar_variant` nên dùng `1rem` của
 * variant `inset` (mặc định của app) — lệch tối đa 16px trong pha skeleton, không đáng đọc thêm cookie.
 */

import { Skeleton } from "@/components/ui/skeleton";

export default function AiLoading() {
  return (
    <div className="-m-4 flex h-[calc(100svh-3rem-1rem)] min-h-0 overflow-hidden md:-m-6">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header: khớp `ChatHeaderFrame` (h-12, px-4) — avatar + tên trợ lý. */}
        <div className="flex h-12 shrink-0 items-center gap-2 px-4">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
        {/* Vùng hội thoại: vài bubble mờ để staff thấy đây là trang chat, không phải trang trống. */}
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-4">
          <Skeleton className="ml-auto h-10 w-2/5 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <Skeleton className="ml-auto h-10 w-1/3 rounded-lg" />
        </div>
        {/* Composer: bubble nổi, khớp `AiComposer`. */}
        <div className="mx-auto w-full max-w-3xl px-4 pb-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
      {/* Cột lịch sử — `w-72 border-l`, khớp `aside` trong `AiWorkspace`. Luôn vẽ ở skeleton: cookie
          `ai_threads_panel` mặc định "open", và vẽ rồi ẩn còn đỡ giật hơn ẩn rồi vẽ thêm. */}
      <div className="hidden w-72 shrink-0 space-y-3 border-l p-3 md:block">
        <Skeleton className="h-9 w-full rounded-md" />
        {Array.from({ length: 5 }).map((_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton tĩnh, không reorder — index là key ổn định duy nhất có sẵn.
          <Skeleton className="h-8 w-full rounded-md" key={index} />
        ))}
      </div>
    </div>
  );
}
