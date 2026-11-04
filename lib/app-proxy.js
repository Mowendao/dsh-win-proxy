/**
 * Per-tool proxy settings: git (~/.gitconfig), npm (~/.npmrc) and pip (pip.ini).
 *
 * git goes through the git CLI so includes and conditional config keep working;
 * npm and pip are edited in place (key-level, comment-preserving) so the plugin
 * never rewrites a file it does not need to and has no runtime dependency on
 * those CLIs being installed.
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const NPM_PROXY_KEYS = new Set(['proxy', 'https-proxy']);
const PIP_SECTION = 'global';
const PIP_PROXY_KEY = 'proxy';

export function npmrcPath() {
  const configured = process.env.npm_config_userconfig;
  if (configured && configured.trim()) return configured.trim();
  return join(process.env.USERPROFILE || homedir(), '.npmrc');
}

export function pipIniPath() {
  const configured = process.env.PIP_CONFIG_FILE;
  if (configured && configured.trim()) return configured.trim();
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'pip', 'pip.ini');
  }
  return join(homedir(), '.config', 'pip', 'pip.conf');
}

export async function readTextFile(path) {
  try {
    const text = await readFile(path, 'utf8');
    return text.replace(/^\uFEFF/, '');
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return '';
    throw error;
  }
}

export async function writeTextFile(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf8');
}

/* ------------------------------------------------------------------ lines */

function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function splitLines(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function joinLines(lines, eol) {
  return lines.length ? lines.join(eol) + eol : '';
}

function npmKeyOf(line) {
  const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
  return match ? match[1].toLowerCase() : undefined;
}

/* ------------------------------------------------------------------- npm */

export function npmrcProxyValue(text) {
  const values = {};
  for (const line of splitLines(text)) {
    const key = npmKeyOf(line);
    if (!key || !NPM_PROXY_KEYS.has(key)) continue;
    const at = line.indexOf('=');
    values[key] = line.slice(at + 1).trim();
  }
  return values;
}

export function npmrcWithProxy(text, url) {
  const eol = text ? detectEol(text) : '\n';
  const lines = splitLines(text).filter((line) => !NPM_PROXY_KEYS.has(npmKeyOf(line)));
  lines.push(`proxy=${url}`, `https-proxy=${url}`);
  return joinLines(lines, eol);
}

export function npmrcWithoutProxy(text) {
  const eol = text ? detectEol(text) : '\n';
  return joinLines(splitLines(text).filter((line) => !NPM_PROXY_KEYS.has(npmKeyOf(line))), eol);
}

/* ------------------------------------------------------------------- pip */

function walkIni(text, visit) {
  const eol = text ? detectEol(text) : '\n';
  const out = [];
  let section = '';
  let globalHeader = -1;
  for (const line of splitLines(text)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].trim().toLowerCase();
      out.push(line);
      if (section === PIP_SECTION) globalHeader = out.length - 1;
      continue;
    }
    const inGlobal = section === PIP_SECTION;
    const kept = visit(line, inGlobal, out);
    if (kept !== undefined) {
      if (kept !== null) out.push(kept);
      continue;
    }
    out.push(line);
  }
  return { lines: out, eol, hasGlobal: globalHeader >= 0, globalHeader };
}

export function pipIniProxyValue(text) {
  let found;
  walkIni(text, (line, inGlobal) => {
    if (!inGlobal || found !== undefined) return undefined;
    const match = line.match(/^\s*proxy\s*=\s*(.*)$/i);
    if (match) found = match[1].trim();
    return undefined;
  });
  return found === undefined ? {} : { [PIP_PROXY_KEY]: found };
}

export function pipIniWithProxy(text, url) {
  const { lines, eol, hasGlobal, globalHeader } = walkIni(text, (line, inGlobal) =>
    inGlobal && /^\s*proxy\s*=/i.test(line) ? null : undefined,
  );
  const entry = `${PIP_PROXY_KEY} = ${url}`;
  if (hasGlobal) {
    lines.splice(globalHeader + 1, 0, entry);
  } else {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(`[${PIP_SECTION}]`, entry);
  }
  return joinLines(lines, eol);
}

export function pipIniWithoutProxy(text) {
  const { lines, eol } = walkIni(text, (line, inGlobal) =>
    inGlobal && /^\s*proxy\s*=/i.test(line) ? null : undefined,
  );
  return joinLines(lines, eol);
}

/* ------------------------------------------------------------------- git */

function execGit(args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { windowsHide: true, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error ? error.code : 0,
          missing: Boolean(error) && error.code === 'ENOENT',
          stdout: String(stdout ?? '').trim(),
          stderr: String(stderr ?? '').trim(),
        });
      },
    );
  });
}

export async function readGitProxy() {
  const http = await execGit(['config', '--global', '--get', 'http.proxy']);
  if (http.missing) return { available: false, http: '', https: '' };
  const https = await execGit(['config', '--global', '--get', 'https.proxy']);
  return {
    available: true,
    http: http.ok ? http.stdout : '',
    https: https.ok ? https.stdout : '',
  };
}

export async function setGitProxy(url) {
  for (const key of ['http.proxy', 'https.proxy']) {
    const result = await execGit(['config', '--global', key, url]);
    if (!result.ok) {
      throw new Error(`git config ${key} 失败${result.stderr ? `：${result.stderr}` : ''}`);
    }
  }
}

export async function clearGitProxy() {
  for (const key of ['http.proxy', 'https.proxy']) {
    const result = await execGit(['config', '--global', '--unset-all', key]);
    // 5 = key not set, 1 = key not found: both mean "already off".
    if (!result.ok && result.code !== 5 && result.code !== 1) {
      throw new Error(`git config --unset ${key} 失败${result.stderr ? `：${result.stderr}` : ''}`);
    }
  }
}
