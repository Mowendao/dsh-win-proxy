/**
 * Config resolution for the Proxy Switch plugin.
 *
 * Everything here is plain JSON that can be set in the bundle row's `config:`
 * in cordis.patch.yml, so users retune it without touching code.
 */

export const TARGET_IDS = ['system', 'git', 'npm', 'pip'];

const DEFAULT_BYPASS = [
  'localhost',
  '127.*',
  '10.*',
  '172.16.*',
  '172.17.*',
  '172.18.*',
  '172.19.*',
  '172.20.*',
  '172.21.*',
  '172.22.*',
  '172.23.*',
  '172.24.*',
  '172.25.*',
  '172.26.*',
  '172.27.*',
  '172.28.*',
  '172.29.*',
  '172.30.*',
  '172.31.*',
  '192.168.*',
  '<local>',
].join(';');

/**
 * `bypass` deliberately defaults to empty: an existing ProxyOverride list is
 * often hand-tuned (mirrors, internal services), so enabling the proxy must not
 * clobber it. Set `bypass` explicitly to overwrite it; DEFAULT_BYPASS above is
 * exported as a ready-made value for that.
 */
const DEFAULTS = {
  proxyServer: '127.0.0.1:7890',
  bypass: '',
  targets: TARGET_IDS,
  probePorts: [7890, 7897, 10808, 10809, 1080, 8080, 8888, 33210],
};

export { DEFAULT_BYPASS };

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function targetList(value) {
  if (!Array.isArray(value)) return undefined;
  const picked = [...new Set(value.filter((item) => TARGET_IDS.includes(item)))];
  return picked.length ? picked : undefined;
}

function portList(value) {
  if (!Array.isArray(value)) return undefined;
  const picked = [...new Set(value.filter((item) => Number.isInteger(item) && item > 0 && item < 65536))];
  return picked.length ? picked : undefined;
}

export function resolveConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  return {
    proxyServer: nonEmptyString(config.proxyServer) ?? DEFAULTS.proxyServer,
    bypass: typeof config.bypass === 'string' ? config.bypass : DEFAULTS.bypass,
    targets: targetList(config.targets) ?? [...DEFAULTS.targets],
    probePorts: portList(config.probePorts) ?? [...DEFAULTS.probePorts],
  };
}

/**
 * The value git / npm / pip receive. Accepts `host:port`, a full URL, or a
 * WinINET ProxyServer string such as `http=127.0.0.1:7890;https=127.0.0.1:7890`
 * (the http endpoint wins; this keeps one config for both kinds of target).
 */
export function proxyUrlOf(server) {
  const value = String(server ?? '').trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value.replace(/\/+$/, '');
  if (value.includes('=')) {
    const parts = value.split(';').map((part) => part.trim()).filter(Boolean);
    const http = parts.find((part) => part.toLowerCase().startsWith('http='));
    const picked = http ?? parts[0] ?? '';
    const endpoint = picked.slice(picked.indexOf('=') + 1).trim();
    if (!endpoint) return '';
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`;
  }
  return `http://${value}`;
}

/** The value written verbatim to the WinINET `ProxyServer` registry value. */
export function registryServerOf(server) {
  return String(server ?? '').trim();
}
