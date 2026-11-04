#!/usr/bin/env node
/**
 * Point the package at its public GitHub repository and generate the
 * awesome-dsh-plugin submission file.
 *
 * Run once, after creating the repository:
 *   node scripts/configure-publish.mjs https://github.com/<you>/dsh-win-proxy
 *
 * Writes:
 *   - package.json      repository / homepage / bugs  (npm links the package to the repo)
 *   - publish/data/plugins/<owner>__<repo>.yml        (the one file the PR adds)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const EN_DESCRIPTION =
  "Adds a Windows system-proxy switch to DeepSeek Harness: toggles the HKCU Internet Settings proxy with a WinINET refresh, together with the git, npm and pip proxy settings, from chat, the /proxy command or a Settings page.";
const ZH_DESCRIPTION =
  "为 DeepSeek Harness 提供 Windows 系统代理开关：写注册表并通知 WinINET 重载，同时切换 git、npm、pip 的代理配置，支持对话、/proxy 命令和设置页三个入口。";
const CATEGORY = "dev";

function fail(message) {
  console.error(`configure-publish: ${message}`);
  process.exit(1);
}

/** YAML single-quoted scalar: quote and escape the only special character. */
function yamlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
const [owner, repo] = segments;
const repoUrl = `https://github.com/${owner}/${repo}`;

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
pkg.repository = { type: "git", url: `git+${repoUrl}.git` };
pkg.homepage = `${repoUrl}#readme`;
pkg.bugs = { url: `${repoUrl}/issues` };
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

// One file per plugin, named <owner>__<repo>.yml; no `npm:` key — the registry
// mapping is harvested automatically and a hand-written one is rejected.
const entry = [
  `url: ${repoUrl}`,
  `name: ${owner}/${repo}`,
  `category: ${CATEGORY}`,
  "description:",
  `  en: ${yamlQuote(EN_DESCRIPTION)}`,
  `  zh: ${yamlQuote(ZH_DESCRIPTION)}`,
  "",
].join("\n");

const entryDir = join(root, "publish", "data", "plugins");
await mkdir(entryDir, { recursive: true });
const entryPath = join(entryDir, `${owner}__${repo}.yml`);
await writeFile(entryPath, entry, "utf8");

console.log(`repository    -> ${repoUrl}`);
console.log(`submission    -> ${entryPath}`);
console.log("");
console.log("next:");
console.log("  1. fork awesome-dsh-plugin/awesome-dsh-plugin");
console.log(`  2. copy ${entryPath.replace(root, ".")} into data/plugins/`);
console.log("  3. open the PR with the body in publish/PR-BODY.md");
console.log("  4. optional: npm publish --access public");
