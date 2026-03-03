export default (serverless) => {
  return {
    bundle: true,
    minify: true,
    sourcemap: "linked",
    platform: "node",
    target: "node24",
    format: "esm",
    treeShaking: true,

    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    external: ["@aws-sdk/*"],
  };
};
