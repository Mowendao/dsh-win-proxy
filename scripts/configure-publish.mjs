#!/usr/bin/env node
/**
 * Point the package at its public GitHub repository.
 *
 * Run once, after creating the repository:
 *   node scripts/configure-publish.mjs https://github.com/<you>/dsh-win-proxy
 *
 * Rewrites `repository` / `homepage` / `bugs` in package.json and the `url` in
 * the market catalog entry, so no placeholder can survive into a publish.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`configure-publish: ${message}`);
  process.exit(1);
}

const input = process.argv[2];
if (!input) fail("usage: node scripts/configure-publish.mjs https://github.com/<user>/<repo>");

let parsed;
try {
  parsed = new URL(input);
} catch {
  fail(`not a URL: ${input}`);
}
if (parsed.hostname !== "github.com") fail(`expected a github.com URL, got ${parsed.hostname}`);
const segments = parsed.pathname.split("/").filter(Boolean);
if (segments.length < 2) fail("expected https://github.com/<user>/<repo>");
const repoUrl = `https://github.com/${segments[0]}/${segments[1]}`;

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
pkg.repository = { type: "git", url: `git+${repoUrl}.git` };
pkg.homepage = `${repoUrl}#readme`;
pkg.bugs = { url: `${repoUrl}/issues` };
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

const entryPath = join(root, "publish", "catalog-entry.json");
const entry = JSON.parse(await readFile(entryPath, "utf8"));
entry.url = repoUrl;
entry.name = pkg.name;
entry.npm = pkg.name;
await writeFile(entryPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");

console.log(`repository -> ${repoUrl}`);
console.log(`catalog entry -> ${entryPath}`);
console.log("next: npm publish --access public");
