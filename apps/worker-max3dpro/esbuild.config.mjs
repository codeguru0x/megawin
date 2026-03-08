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

    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    external: ["@aws-sdk/*"],
  };
};
