export default (serverless) => {
  return {
    bundle: true,
    minify: true,
    sourcemap: true,
    platform: "node",
    target: "es2024",
    format: "esm",

    packages: "external",
  };
};
