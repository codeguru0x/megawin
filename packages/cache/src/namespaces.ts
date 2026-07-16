/**
 * Namespace registry toàn cục — phần `{namespace}` đầu tiên của mọi cache key.
 *
 * Đây là DANH BẠ trung tâm chống va chạm/typo namespace GIỮA các package:
 * mọi domain đăng ký namespace của mình ở đây, không hard-code chuỗi rời rạc.
 * Entity + version vẫn do từng package tự quản trong `caches/keys.ts` của nó.
 *
 * Quy ước namespace: kebab-case, khớp gameKey (`keno`, `mega645`…) hoặc domain
 * (`tenant-gw`, `identity`). Thêm namespace mới = thêm 1 dòng ở đây.
 *
 * @example
 * import { cacheKey, CacheNamespace } from "@megawin/cache";
 * cacheKey(CacheNamespace.Keno, "global-config", "v1"); // "keno:global-config:v1"
 */
export const CacheNamespace = {
  Keno: "keno",
  Lotto535: "lotto535",
  Mega645: "mega645",
  Power655: "power655",
  Max3d: "max3d",
  Max3dpro: "max3dpro",
  Bingo18: "bingo18",
  TenantGw: "tenant-gw",
  Identity: "identity",
} as const;

/** Union các namespace hợp lệ — dùng để ràng buộc type khi khai key. */
export type CacheNamespace = (typeof CacheNamespace)[keyof typeof CacheNamespace];
