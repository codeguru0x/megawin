import type { GameProduct } from "@megawin/game-core/entities";
import type { Route } from "next";

import { buildNavHref, NavPage } from "@/lib/nav-registry";

/**
 * Href tới tab "Cấu hình quy tắc chơi" (`play`) của 1 game — dùng ở dialog công bố/sửa kết quả khi
 * cần mời staff đi cấu hình mã kỳ Vietlott (`NoAnchor`) hoặc cập nhật lại khi mã kỳ nhập
 * tay lệch gợi ý hệ thống.
 *
 * Build qua `nav-registry` (nguồn chân lý DUY NHẤT cho path `game-config` + enum tab hợp lệ theo
 * nhóm game) — thay cho hardcode `/games/{gameKey}/config/game?tab=play` từng lặp lại y nguyên ở
 * 7 file `publish-result-action.tsx`. Đổi/xoá folder route đó → lỗi lộ ra ngay ở đây (throw), KHÔNG
 * lặng lẽ 404 lúc staff bấm link.
 *
 * Dùng CHUNG cho TẤT CẢ 7 game (Keno, Bingo18, Lotto 5/35, Mega 6/45, Power 6/55, Max 3D, Max 3D Pro).
 */
export function vietlottConfigHref(gameKey: GameProduct): Route {
  const result = buildNavHref(NavPage.GameConfig, { segments: { gameKey }, params: { tab: "play" } });
  if (!result.ok) {
    // gameKey/tab ở đây luôn tĩnh và hợp lệ theo `gameConfigTabsFor` — nhánh này chỉ có thể xảy ra
    // nếu registry đổi mà quên cập nhật, throw sớm để lộ lỗi lúc dev/test thay vì trả link hỏng.
    throw new Error(`vietlottConfigHref: buildNavHref thất bại cho gameKey="${gameKey}" (lý do: ${result.reason}).`);
  }
  return result.href as Route;
}
