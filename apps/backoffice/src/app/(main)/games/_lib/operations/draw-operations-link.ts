import type { GameProduct } from "@megawin/game-core/entities";
import type { Route } from "next";

import { buildNavHref, NavPage } from "@/lib/nav-registry";

/**
 * Href tới trang vận hành 1 kỳ cụ thể — dùng ở Ops Hub để mở chi tiết kỳ trong tab mới.
 *
 * Build qua `nav-registry` (nguồn chân lý DUY NHẤT cho path + urlKey của param kỳ), KHÔNG nội suy
 * `/games/${gameKey}/operations?drawId=${drawId}`. Registry khai `urlKey: "drawId"`
 * (`DRAW_ID_PARAM`, `nav-registry.ts`); nội suy tay là chỗ dễ viết nhầm `?draw=` — trang chi tiết
 * sẽ mở đúng nhưng KHÔNG chọn kỳ nào, staff tưởng kỳ biến mất.
 *
 * Dùng chung cho Keno + Bingo18 (và các game khác nếu port tiếp Ops Hub — plan p1-04 §10).
 */
export function drawOperationsHref(gameKey: GameProduct, drawId: string): Route {
  const result = buildNavHref(NavPage.GameOperations, {
    segments: { gameKey },
    params: { drawId },
  });
  if (!result.ok) {
    // gameKey/drawId ở đây luôn hợp lệ theo dữ liệu hub thật — nhánh này chỉ có thể xảy ra nếu
    // registry đổi mà quên cập nhật, throw sớm để lộ lỗi lúc dev/test thay vì trả link hỏng.
    throw new Error(
      `drawOperationsHref: buildNavHref thất bại cho gameKey="${gameKey}" drawId="${drawId}" (lý do: ${result.reason}).`,
    );
  }
  return result.href as Route;
}
