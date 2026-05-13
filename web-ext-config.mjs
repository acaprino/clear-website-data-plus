import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  verbose: false,
  sourceDir: __dirname,
  artifactsDir: "./web-ext-artifacts",
  ignoreFiles: [
    "package.json",
    "package-lock.json",
    "node_modules",
    "web-ext-config.mjs",
    "web-ext-artifacts",
    "docs",
    "amo-metadata.json",
    "README.md",
    ".webextignore",
    ".git",
    ".gitignore",
    ".amo-upload-uuid",
    ".env",
    ".env.example",
    "icons/_make-pngs.py",
    ".deep-dive",
    ".team-review",
  ],
  run: {
    firefox: "firefox",
    startUrl: ["about:debugging#/runtime/this-firefox"],
  },
  build: {
    overwriteDest: true,
  },
};
