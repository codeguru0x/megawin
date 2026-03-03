import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default (serverless) => {
  return {
    bundle: true,
    minify: true,
    sourcemap: "linked",
    platform: "node",
    target: "node24",
    format: "esm",
    treeShaking: true,

    alias: {
      "#lib": path.resolve(__dirname, "src/lib"),
    },
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    external: ["@aws-sdk/*"],
  };
};
