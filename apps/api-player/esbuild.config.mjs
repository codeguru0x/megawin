import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default (serverless) => {
  const stage = serverless?.service?.provider?.stage;
  return {
    bundle: true,
    minify: true,
    sourcemap: stage === "local" || stage === undefined ? "linked" : false,
    platform: "node",
    target: "node24",
    format: "esm",
    treeShaking: true,

    alias: {
      "#lib": path.resolve(__dirname, "src/lib"),
    },
    banner: {
      js: "import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import { dirname } from 'path'; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);",
    },
    external: ["@aws-sdk/*"],
  };
};
