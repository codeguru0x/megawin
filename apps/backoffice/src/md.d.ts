declare module "*.md" {
  /** Nội dung file Markdown dạng raw string (load qua webpack `asset/source` / turbopack `raw-loader`). */
  const content: string;
  export default content;
}
