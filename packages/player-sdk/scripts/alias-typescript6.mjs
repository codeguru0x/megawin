/**
 * Hook ESM resolve: khi typedoc `import "typescript"` → trả @typescript/typescript6.
 *
 * typedoc@0.28 peer chỉ tới TS 6.x; typescript@7 không còn JS compiler API
 * (`SyntaxKind` undefined → crash PropertyDeclaration).
 *
 * Tạm thời — bỏ khi TypeDoc hỗ trợ TS 7.1+ (xem player-sdk-jsdoc.mdc § TypeDoc).
 */
import { createRequire, register } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts6Url = pathToFileURL(require.resolve("@typescript/typescript6")).href;

register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "typescript") {
        return { shortCircuit: true, url: ${JSON.stringify(ts6Url)} };
      }
      return nextResolve(specifier, context);
    }
  `)}`,
  import.meta.url,
);
