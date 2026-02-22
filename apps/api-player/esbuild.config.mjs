export default (serverless) => {
  return {
    bundle: true,
    minify: true,
    sourcemap: true,
    platform: "node",
    target: "es2022",
    format: "esm",

    packages: "external",
  };
};
