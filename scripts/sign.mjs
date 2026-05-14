#!/usr/bin/env node
/**
 * Tiny zero-dep wrapper: loads `.env` (if present), then invokes
 * `web-ext sign --channel=<channel>`.
 *
 * Usage: node scripts/sign.mjs <unlisted|listed>
 *
 * Why this exists: AMO sign requires WEB_EXT_API_KEY / WEB_EXT_API_SECRET
 * in the process env. Keeping them in a gitignored `.env` is cleaner than
 * exporting them in every new shell, and this wrapper is portable across
 * PowerShell, bash, and CI without needing dotenv-cli as a devDep.
 *
 * Existing shell env vars take precedence over `.env` entries.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const channel = process.argv[2];
if (channel !== "unlisted" && channel !== "listed") {
  console.error("Usage: node scripts/sign.mjs <unlisted|listed>");
  process.exit(2);
}

const envPath = resolve(".env");
if (existsSync(envPath)) {
  try {
    const txt = readFileSync(envPath, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      let [, key, val] = m;
      // Strip optional matching single or double quotes around the value.
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Shell-set values win — never overwrite an explicit export.
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    console.warn(`[sign] could not parse .env (${e.message}); falling back to shell env`);
  }
}

if (!process.env.WEB_EXT_API_KEY || !process.env.WEB_EXT_API_SECRET) {
  console.error("[sign] WEB_EXT_API_KEY / WEB_EXT_API_SECRET not found in .env or shell env.");
  console.error("       Copy .env.example to .env and fill in your AMO credentials, or export them in this shell.");
  process.exit(3);
}

const bin = process.platform === "win32" ? "web-ext.cmd" : "web-ext";
const result = spawnSync(
  bin,
  ["sign", `--channel=${channel}`],
  { stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
