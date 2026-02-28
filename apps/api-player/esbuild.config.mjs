import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default (serverless) => {
  return {
    bundle: true,
    minify: true,
    sourcemap: true,
    platform: "node",
    target: "es2022",
    format: "esm",

    alias: {
      "#lib": path.resolve(__dirname, "src/lib"),
    },
    packages: "external",
  };
};
