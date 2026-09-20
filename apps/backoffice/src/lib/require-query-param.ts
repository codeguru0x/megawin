/**
 * Narrow string param cho React Query `queryFn` khi hook đã `enabled: !!param`
 * (cùng pattern {@link requireDrawId}).
 *
 * Thay `param!` — cùng runtime khi enabled đúng; throw rõ nếu gọi nhầm khi thiếu.
 */
export function requireQueryParam(value: string | null | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} required when query is enabled`);
  }
  return value;
}
