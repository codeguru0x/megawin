import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Megawin",
  version: packageJson.version,
  copyright: `© ${currentYear}, Megawin Backoffice.`,
  meta: {
    title: "Megawin Backoffice",
    description: "Megawin Backoffice admin dashboard.",
  },
};
