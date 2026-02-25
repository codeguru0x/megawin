import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Megawin",
  version: packageJson.version,
  copyright: `© ${currentYear}, Megawin Agent.`,
  meta: {
    title: "Megawin Agent",
    description: "Megawin Agent portal for tenant management.",
  },
};
