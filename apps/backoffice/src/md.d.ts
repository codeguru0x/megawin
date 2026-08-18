declare module "*.md" {
  /** Nội dung file Markdown dạng raw string (load qua webpack `asset/source` / turbopack `raw-loader`). */
  const content: string;
  export default content;
}

declare module "*.md?raw" {
  /**
   * Nội dung file Markdown dạng raw string — dùng trong `agent/skills/*.ts` (bundler eve/rolldown,
   * xem p1-02 §0 GATE). Suffix `?raw` khác `*.md` thường (Next raw-loader) vì eve resolve qua
   * asset-import plugin riêng, cần suffix tường minh để không lẫn với loader khác.
   */
  const content: string;
  export default content;
}
