# Backoffice – Next.js performance review

Summary of what was done and what to consider next.

---

## Implemented (best practices)

### 1. **Loading UI (Suspense boundaries)**

- Added `loading.tsx` for:
  - `(main)/loading.tsx` – shell for all main routes
  - `(main)/default/loading.tsx` – dashboard default
  - `(main)/crm/loading.tsx` – CRM
  - `(main)/finance/loading.tsx` – finance
- Next.js shows these while the route segment is loading, improving perceived performance and avoiding layout shift.

### 2. **Package import optimization**

- In `next.config.mjs`:
  - `experimental.optimizePackageImports`: `lucide-react`, `recharts`, `date-fns`, `@radix-ui/react-icons`
- Only the icons/components you import are bundled; large barrel imports are tree-shaken.

### 3. **Dynamic imports for heavy client components**

- **Default dashboard** (`(main)/default/page.tsx`):
  - `ChartAreaInteractive` (recharts) – dynamic with SSR and a skeleton loading state
  - `DataTable` (table + DnD) – dynamic with `ssr: false` and skeleton
- First load sends less JS; charts and table load after the shell.

### 4. **Font loading**

- All `next/font/google` usages use `display: "swap"` so text is visible with a fallback font while the chosen font loads (reduces FOIT and CLS).

### 5. **Already in good shape**

- **React Compiler** enabled – automatic memoization where useful
- **removeConsole** in production – smaller and slightly faster runtime
- **Server layout** – main layout is async and uses `Promise.all` for preferences
- **Static metadata** – root layout exports `metadata` for title/description

---

## Recommended next steps

1. **Cache preference reads (optional)**  
   In `getPreference` / server actions, wrap with `unstable_cache` or use a short `revalidate` if preferences change rarely, to avoid re-running on every request.

2. **Fonts: load only the active one on first paint**  
   The registry currently loads all 12 fonts; `fontVars` applies every variable to `<body>`. For best LCP, consider:
   - Loading only the default font (e.g. Inter) in the root layout, and
   - Loading other fonts when the user opens the theme/font switcher (lazy).

3. **Images**  
   Use `next/image` for any images (e.g. in CRM, cards, avatars) so they get automatic sizing, lazy loading, and modern formats.

4. **Route segment config for heavy routes**  
   If a route is always dynamic, set `export const dynamic = 'force-dynamic'` (or the right `revalidate`) so Next doesn’t try to statically optimize it when it shouldn’t.

5. **Build cache**  
   Enable Next.js build cache (e.g. in CI) so rebuilds are faster.

---

## Quick reference

| Area              | Status / Action                                      |
|-------------------|-------------------------------------------------------|
| Loading states    | Done – `loading.tsx` for main, default, crm, finance |
| Tree-shaking      | Done – `optimizePackageImports` in next.config       |
| Heavy components  | Done – dynamic import for chart + data table         |
| Fonts             | Done – `display: "swap"`; optional: lazy-load extras |
| React Compiler    | Already on                                           |
| Console in prod   | Already stripped                                     |
