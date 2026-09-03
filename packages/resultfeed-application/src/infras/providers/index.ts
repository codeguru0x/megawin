/**
 * ResultFeed – Providers barrel export.
 *
 * Import: `import { ... } from "@megawin/resultfeed-application/providers"`
 */

export {
  ContextDevProvider,
  type ContextDevProviderConfig,
} from "./context-dev-provider";
export {
  type OxylabsUnblockerConfig,
  OxylabsUnblockerProvider,
} from "./oxylabs-provider";
export { resolveProvider } from "./registry";
export type { FetchProvider, FetchRequest, FetchResult } from "./types";
