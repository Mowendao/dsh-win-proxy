/**
 * Proxy Switch — a host plugin that turns the Windows system proxy and the
 * git / npm / pip proxy settings on and off together.
 *
 * Surfaces:
 *   - agent tool `proxy_switch` (on | off | status | toggle)
 *   - human command `/proxy [on|off|status]`, which never reaches the model
 *
 * Design notes:
 *   - "on" writes HKCU Internet Settings and asks WinINET to reload, so running
 *     browsers pick it up without a restart. No elevation is required.
 *   - "off" only clears ProxyEnable; ProxyServer/ProxyOverride are kept, which is
 *     exactly how the Windows UI toggle behaves.
 *   - git / npm / pip "off" removes the proxy keys, because those files have no
 *     separate enabled flag; `server` in the config is the single source of truth
 *     for re-enabling.
 */

import {
  clearGitProxy,
  npmrcPath,
  npmrcProxyValue,
  npmrcWithProxy,
  npmrcWithoutProxy,
  pipIniPath,
  pipIniProxyValue,
  pipIniWithProxy,
  pipIniWithoutProxy,
  readGitProxy,
  readTextFile,
  setGitProxy,
  writeTextFile,
} from './app-proxy.js';
import { proxyUrlOf, registryServerOf, resolveConfig, TARGET_IDS } from './config.js';
import { probePort, probePorts } from './netprobe.js';
import { readSystemProxy, writeSystemProxy } from './wininet.js';

export const name = 'dsh-win-proxy';
export const inject = ['tools'];

const ACTIONS = ['on', 'off', 'status', 'toggle'];
const LABELS = { system: '系统代理', git: 'git', npm: 'npm', pip: 'pip' };
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

const PACKAGE_NAME = '@local/dsh-win-proxy';
const API_PREFIX = '/api/dsh-win-proxy';
const MUTATION_HEADER = 'x-dsh-win-proxy';
/** Bumped on every code change so a running Host can be checked for a reload. */
const BUILD = 3;

function messageOf(error) {
  if (!error) return '未知错误';
  return String(error.message ?? error);
}

function normalizeAction(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ACTIONS.includes(value) ? value : undefined;
}

function normalizeTargets(raw) {
  if (!Array.isArray(raw)) return undefined;
  const picked = [...new Set(raw.filter((item) => TARGET_IDS.includes(item)))];
  return picked.length ? picked : undefined;
}

/* ------------------------------------------------- Settings page transport */

function jsonResponse(status, payload, headOnly = false) {
  const body = JSON.stringify(payload);
  return new Response(headOnly ? null : body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': String(Buffer.byteLength(body)),
    },
  });
}

async function respond(task, headOnly = false) {
  try {
    return jsonResponse(200, { ok: true, data: await task() }, headOnly);
  } catch (caught) {
    const status = Number.isInteger(caught?.statusCode) ? caught.statusCode : 500;
    return jsonResponse(status, { ok: false, error: messageOf(caught) }, headOnly);
  }
}

async function readJsonBody(request, limit = 1 << 20) {
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) {
    throw Object.assign(new Error('request body is too large'), { statusCode: 413 });
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('request body is not valid JSON'), { statusCode: 400 });
  }
}

/** Same-origin + JSON + explicit client marker, mirroring the harness' own routes. */
function guardMutation(request) {
  if (request.headers.get(MUTATION_HEADER) !== '1') {
    return { status: 403, error: 'missing client marker header' };
  }
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const requestHost = request.headers.get('host') ?? new URL(request.url).host;
      if (new URL(origin).host !== requestHost) {
        return { status: 403, error: 'cross-origin mutation request' };
      }
    } catch {
      return { status: 403, error: 'invalid origin' };
    }
  }
  const contentType = String(request.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    return { status: 415, error: 'content-type must be application/json' };
  }
  return null;
}

async function snapshot(config) {
  const states = [];
  for (const target of TARGET_IDS) {
    const targeted = config.targets.includes(target);
    try {
      states.push({ ...(await describeTarget(target)), targeted });
    } catch (error) {
      states.push({ target, ok: false, error: messageOf(error), targeted });
    }
  }
  let listeningPorts = [];
  try {
    listeningPorts = await probePorts(config.probePorts);
  } catch {
    listeningPorts = [];
  }
  return {
    build: BUILD,
    platform: process.platform,
    config: {
      proxyServer: config.proxyServer,
      targets: config.targets,
      bypass: config.bypass,
    },
    states,
    listeningPorts,
  };
}

/**
 * The row this bundle inserted is identified by package name or its patch id;
 * `Entry` is opaque to plugins, so probe the fields it may carry.
 */
function findPluginEntry(editor) {
  const entries = typeof editor.entries === 'function' ? editor.entries() : [];
  return (Array.isArray(entries) ? entries : []).find((entry) => {
    const candidates = [entry?.name, entry?.id, entry?.patchId, entry?.key, entry?.options?.name];
    return candidates.some(
      (value) => typeof value === 'string' && value.includes('dsh-win-proxy'),
    );
  });
}

/* ------------------------------------------------------------ per target */

async function describeTarget(target) {
  if (target === 'system') {
    if (process.platform !== 'win32') return { target, ok: false, error: '系统代理仅支持 Windows' };
    const state = await readSystemProxy();
    return {
      target,
      ok: true,
      enabled: state.enabled,
      detail: state.server ? `ProxyServer=${state.server}` : '',
    };
  }

  if (target === 'git') {
    const state = await readGitProxy();
    if (!state.available) return { target, ok: false, error: '未找到 git 命令' };
    const value = state.http || state.https;
    return {
      target,
      ok: true,
      enabled: Boolean(value),
      detail: value ? `http.proxy=${state.http || '(未设置)'}` : '',
    };
  }

  if (target === 'npm') {
    const values = npmrcProxyValue(await readTextFile(npmrcPath()));
    const value = values.proxy ?? values['https-proxy'] ?? '';
    return {
      target,
      ok: true,
      enabled: Boolean(value),
      detail: value ? `${value} · ${npmrcPath()}` : '',
    };
  }

  const values = pipIniProxyValue(await readTextFile(pipIniPath()));
  const value = values.proxy ?? '';
  return {
    target,
    ok: true,
    enabled: Boolean(value),
    detail: value ? `${value} · ${pipIniPath()}` : '',
  };
}

async function applyTarget(target, action, { server, bypass }) {
  const url = proxyUrlOf(server);
  const enabling = action === 'on';

  if (target === 'system') {
    if (process.platform !== 'win32') return { target, ok: false, error: '系统代理仅支持 Windows' };
    const before = await readSystemProxy();
    const nextServer = enabling ? registryServerOf(server) : '';
    const changed = before.enabled !== enabling || (enabling && before.server !== nextServer);
    if (!changed) {
      return { target, ok: true, changed: false, enabled: enabling, detail: before.server };
    }
    const written = await writeSystemProxy({
      enabled: enabling,
      server: nextServer,
      bypass: enabling ? bypass : '',
    });
    return {
      target,
      ok: true,
      changed: true,
      enabled: enabling,
      detail: enabling ? nextServer : before.server,
      refreshed: written.refreshed,
    };
  }

  if (target === 'git') {
    const before = await readGitProxy();
    if (!before.available) return { target, ok: false, error: '未找到 git 命令' };
    if (enabling) {
      await setGitProxy(url);
      return {
        target,
        ok: true,
        changed: before.http !== url || before.https !== url,
        enabled: true,
        detail: `http.proxy / https.proxy = ${url}`,
      };
    }
    const had = Boolean(before.http || before.https);
    await clearGitProxy();
    return { target, ok: true, changed: had, enabled: false };
  }

  if (target === 'npm') {
    const path = npmrcPath();
    const text = await readTextFile(path);
    const next = enabling ? npmrcWithProxy(text, url) : npmrcWithoutProxy(text);
    const changed = next !== text;
    if (changed) await writeTextFile(path, next);
    return {
      target,
      ok: true,
      changed,
      enabled: enabling,
      detail: enabling ? `${url} · ${path}` : path,
    };
  }

  const path = pipIniPath();
  const text = await readTextFile(path);
  const next = enabling ? pipIniWithProxy(text, url) : pipIniWithoutProxy(text);
  const changed = next !== text;
  if (changed) await writeTextFile(path, next);
  return {
    target,
    ok: true,
    changed,
    enabled: enabling,
    detail: enabling ? `${url} · ${path}` : path,
  };
}

/* --------------------------------------------------------------- driving */

async function anyEnabled(targets) {
  for (const target of targets) {
    try {
      const state = await describeTarget(target);
      if (state.ok && state.enabled) return true;
    } catch {
      // an unavailable target cannot be "on"
    }
  }
  return false;
}

async function localPortWarning(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!LOOPBACK_HOSTS.has(host)) return undefined;
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    if (!Number.isInteger(port) || port <= 0) return undefined;
    if (await probePort(port)) return undefined;
    return `本机 ${host}:${port} 没有监听：开启后联网会失败。请先启动 Clash / V2Ray 等客户端，或用 server 参数改成正确端口。`;
  } catch {
    return undefined;
  }
}

async function runSwitch({ action, targets, server, bypass, config }) {
  if (action === 'on' && !String(server ?? '').trim()) throw new Error('开启代理需要代理地址（server）');

  const effective =
    action === 'toggle' ? ((await anyEnabled(targets)) ? 'off' : 'on') : action;

  const results = [];
  for (const target of targets) {
    try {
      results.push(
        effective === 'status'
          ? await describeTarget(target)
          : await applyTarget(target, effective, { server, bypass }),
      );
    } catch (error) {
      results.push({ target, ok: false, error: messageOf(error) });
    }
  }

  const value = {
    build: BUILD,
    action: effective,
    requestedAction: action,
    server: String(server ?? ''),
    proxyUrl: proxyUrlOf(server),
    targets,
    results,
  };

  if (effective === 'status') {
    value.listeningPorts = await probePorts(config.probePorts);
  } else if (effective === 'on') {
    const warning = await localPortWarning(value.proxyUrl);
    if (warning) value.warning = warning;
  }
  return value;
}

function summary(value) {
  const lines = [];
  const isStatus = value.action === 'status';
  lines.push(isStatus ? '代理状态' : value.action === 'on' ? '已开启代理' : '已关闭代理');

  for (const item of value.results ?? []) {
    const label = LABELS[item.target] ?? item.target;
    if (!item.ok) {
      lines.push(`- ${label}：失败 — ${item.error}`);
      continue;
    }
    if (isStatus) {
      lines.push(`- ${label}：${item.enabled ? '已开启' : '未开启'}${item.detail ? `（${item.detail}）` : ''}`);
    } else {
      const verb = value.action === 'on' ? '已开启' : '已关闭';
      lines.push(`- ${label}：${item.changed ? verb : '无变化'}${item.detail ? `（${item.detail}）` : ''}`);
    }
  }

  if (Array.isArray(value.listeningPorts)) {
    lines.push(
      value.listeningPorts.length
        ? `本地监听端口：${value.listeningPorts.join(', ')}`
        : `本地监听端口：未检测到常见代理端口（${'7890 / 10809 …'}）`,
    );
  }
  if (value.proxyUrl) lines.push(`代理地址：${value.proxyUrl}`);
  if (value.warning) lines.push(`注意：${value.warning}`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ plugin */

export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);

  const request = async (args) => {
    const action = normalizeAction(args?.action);
    if (!action) {
      throw new Error(`action 必须是 ${ACTIONS.join(' / ')} 之一，收到 ${JSON.stringify(args?.action ?? null)}`);
    }
    const targets = normalizeTargets(args?.targets) ?? config.targets;
    const server =
      typeof args?.server === 'string' && args.server.trim() ? args.server.trim() : config.proxyServer;
    const bypass =
      typeof args?.bypass === 'string' && args.bypass.trim() ? args.bypass : config.bypass;
    return runSwitch({ action, targets, server, bypass, config });
  };

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'proxy_switch',
        description:
          'Turn the Windows system proxy (WinINET / Internet Settings) and the git, npm (.npmrc) and pip (pip.ini) proxy settings on or off together, or report their current state. Use action=status when the user asks whether the proxy is on; action=on/off to change it. The plugin-configured server is used unless `server` is given.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ACTIONS,
              description: 'on = enable, off = disable, status = read only, toggle = flip based on current state.',
            },
            targets: {
              type: 'array',
              items: { type: 'string', enum: TARGET_IDS },
              description:
                'Optional subset of targets for this call; omitted uses the plugin config (default: all four).',
            },
            server: {
              type: 'string',
              description:
                'Proxy address for this call: host:port or a full URL, e.g. "127.0.0.1:7890". Omitted uses the configured default.',
            },
            bypass: {
              type: 'string',
              description: 'Windows ProxyOverride list (semicolon separated). Omitted uses the configured default.',
            },
          },
          required: ['action'],
          additionalProperties: false,
        },
        output: {
          schema: { type: 'object' },
          render: (_args, value) => [{ type: 'text', text: summary(value ?? {}) }],
        },
        async execute(args) {
          return request(args);
        },
      }),
    'proxy-switch: proxy_switch tool',
  );

  const commands = typeof ctx.get === 'function' ? ctx.get('commands') : undefined;
  if (commands && typeof commands.register === 'function') {
    try {
      ctx.effect(
        () =>
          commands.register({
            name: 'proxy',
            description: '开关系统代理与 git / npm / pip 代理：/proxy on | off | status',
            input: { hint: '[on|off|status]' },
            async handler(invocation) {
              const raw = String(invocation?.rawInput ?? '').trim().toLowerCase();
              const word = raw ? raw.split(/\s+/)[0] : 'status';
              const action = normalizeAction(word);
              if (!action) {
                return { kind: 'error', text: `未知参数 “${word}”。用法：/proxy on | /proxy off | /proxy status` };
              }
              try {
                const value = await runSwitch({
                  action,
                  targets: config.targets,
                  server: config.proxyServer,
                  bypass: config.bypass,
                  config,
                });
                return { kind: 'success', text: summary(value) };
              } catch (error) {
                return { kind: 'error', text: messageOf(error) };
              }
            },
          }),
        'proxy-switch: /proxy command',
      );
    } catch {
      // The commands service is optional in this deployment; the tool still works.
    }
  }

  const routes = [
    {
      path: `${API_PREFIX}/status`,
      methods: ['GET', 'HEAD'],
      fetch: (request) => respond(() => snapshot(config), request.method === 'HEAD'),
    },
    {
      path: `${API_PREFIX}/switch`,
      methods: ['POST'],
      fetch: (request) => {
        const rejected = guardMutation(request);
        if (rejected) return Promise.resolve(jsonResponse(rejected.status, { ok: false, error: rejected.error }));
        return respond(async () => {
          const body = await readJsonBody(request);
          const action = body?.action === 'on' || body?.action === 'off' ? body.action : undefined;
          if (!action) {
            throw Object.assign(new Error('action must be "on" or "off"'), { statusCode: 400 });
          }
          await runSwitch({
            action,
            targets: config.targets,
            server: config.proxyServer,
            bypass: config.bypass,
            config,
          });
          return snapshot(config);
        });
      },
    },
    {
      path: `${API_PREFIX}/config`,
      methods: ['POST'],
      fetch: (request) => {
        const rejected = guardMutation(request);
        if (rejected) return Promise.resolve(jsonResponse(rejected.status, { ok: false, error: rejected.error }));
        return respond(async () => {
          const body = await readJsonBody(request);
          const editor = typeof ctx.get === 'function' ? ctx.get('configEditor') : undefined;
          if (!editor || typeof editor.edit !== 'function' || typeof editor.entries !== 'function') {
            throw Object.assign(new Error('当前环境没有 configEditor，请修改 profile 的 cordis.patch.yml'), {
              statusCode: 409,
            });
          }
          const entry = findPluginEntry(editor);
          if (!entry) {
            throw Object.assign(new Error('没有找到插件配置行，请检查 profile 的 cordis.patch.yml'), {
              statusCode: 409,
            });
          }
          const nextServer =
            typeof body?.proxyServer === 'string' && body.proxyServer.trim()
              ? body.proxyServer.trim()
              : config.proxyServer;
          const nextTargets = Array.isArray(body?.targets)
            ? (normalizeTargets(body.targets) ?? config.targets)
            : config.targets;
          await editor.edit(entry, (current) => ({
            ...(current && typeof current === 'object' ? current : {}),
            proxyServer: nextServer,
            targets: nextTargets,
          }));
          return { saved: true, proxyServer: nextServer, targets: nextTargets };
        });
      },
    },
  ];

  /**
   * Mounts the settings routes against a live `connection` service. Declared
   * through `ctx.inject` instead of `inject` so a deployment without a web
   * carrier (CLI, tests) still gets the tool and the /proxy command.
   */
  const mountRoutes = (owner) => {
    const connection = typeof owner.get === 'function' ? owner.get('connection') : undefined;
    const registerRoute = connection?.fetch?.register;
    if (typeof registerRoute !== 'function') return;
    owner.effect(() => {
      const disposers = routes.map((route) =>
        registerRoute({
          path: route.path,
          methods: route.methods,
          requestBody: 'buffered',
          fetch: route.fetch,
        }),
      );
      return () => {
        for (const dispose of disposers) {
          try {
            const pending = dispose();
            if (pending && typeof pending.catch === 'function') pending.catch(() => undefined);
          } catch {
            // already disposed
          }
        }
      };
    }, 'proxy-switch: settings routes');
  };

  try {
    // Direct mount is the known-good path (same one the shipped web plugins use);
    // `ctx.inject` only covers a carrier that is mounted after this plugin.
    const mounted = typeof ctx.get === 'function' ? ctx.get('connection') : undefined;
    if (mounted?.fetch?.register) {
      mountRoutes(ctx);
    } else if (typeof ctx.inject === 'function') {
      ctx.inject(['connection'], (scope) => mountRoutes(scope));
    }
  } catch {
    // The settings page degrades to its own "restart DSH" hint without routes.
  }
}
