import { GameProduct } from "@megawin/game-core/entities/game-core.enums";

/**
 * Tên hiển thị tiếng Việt cho từng `gameId`.
 *
 * Dùng ở mọi UI cần hiển thị "Mega 6/45" thay vì `"mega645"`:
 * Combobox filter, table cells, page headers, ...
 */
export const GAME_PRODUCT_LABELS: Record<GameProduct, string> = {
  [GameProduct.Lotto535]: "Lotto 5/35",
  [GameProduct.Power655]: "Power 6/55",
  [GameProduct.Mega645]: "Mega 6/45",
  [GameProduct.Keno]: "Keno",
  [GameProduct.Max3d]: "Max 3D",
  [GameProduct.Max3dpro]: "Max 3D Pro",
  [GameProduct.Bingo18]: "Bingo 18",
};

/** Danh sách `{ value, label }` phục vụ Select/Combobox. */
export const GAME_PRODUCT_OPTIONS: Array<{ value: GameProduct; label: string }> = (
  Object.values(GameProduct) as GameProduct[]
).map((id) => ({
  value: id,
  label: GAME_PRODUCT_LABELS[id],
}));

/** Lookup label theo string — fallback nếu gameId không khớp enum. */
export function getGameLabel(gameId: string): string {
  return GAME_PRODUCT_LABELS[gameId as GameProduct] ?? gameId;
}
