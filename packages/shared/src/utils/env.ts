/**
 * Kiểm tra xem có phải là dev NextJS không
 */
export const isDevNextJs = (): boolean => {
  return (
    process.env.NEXT_RUNTIME !== undefined &&
    process.env.NODE_ENV === "development"
  );
};
