/**
 * Narrow `drawId` cho React Query `queryFn` / `mutationFn` khi hook đã `enabled: !!drawId`
 * (hoặc caller chỉ gọi mutate khi có kỳ).
 *
 * Thay `drawId!` — cùng runtime khi enabled đúng; throw rõ nếu gọi nhầm khi thiếu id
 * (unreachable trong luồng bình thường).
 */
export function requireDrawId(drawId: string | undefined): string {
  if (!drawId) {
    throw new Error("drawId required when query/mutation is enabled");
  }
  return drawId;
}
