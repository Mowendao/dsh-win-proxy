/**
 * Windows system proxy (WinINET / Internet Options) read/write.
 *
 * The settings live in HKCU, so no elevation is needed. After writing the
 * registry, WinINET is told to reload through InternetSetOption, which is what
 * makes already-running browsers pick the change up without a restart.
 *
 * The script builders are exported so the exact production PowerShell can be
 * inspected (and exercised) without spawning a process.
 */

import { execFile } from 'node:child_process';

const REGISTRY_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

function exec(file, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error ? error.code : 0,
          missing: Boolean(error) && error.code === 'ENOENT',
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        });
      },
    );
  });
}

/** Run one PowerShell script without any quoting hazards (-EncodedCommand). */
async function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
  let result = await exec('powershell.exe', args, 25000);
  if (result.missing) result = await exec('pwsh.exe', args, 25000);
  return result;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function failure(result, what) {
  const detail = (result.stderr || result.stdout || '').trim();
  return new Error(`${what}失败${detail ? `：${detail}` : `（powershell 退出码 ${result.code}）`}`);
}

export function buildReadScript() {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$key = ${quote(REGISTRY_KEY)}
$entry = Get-ItemProperty -LiteralPath $key
$enable = 0
$server = ''
$bypass = ''
if ($null -ne $entry) {
  if ($null -ne $entry.ProxyEnable) { $enable = [int]$entry.ProxyEnable }
  if ($null -ne $entry.ProxyServer) { $server = [string]$entry.ProxyServer }
  if ($null -ne $entry.ProxyOverride) { $bypass = [string]$entry.ProxyOverride }
}
Write-Output ('ProxyEnable=' + $enable)
Write-Output ('ProxyServer=' + $server)
Write-Output ('ProxyOverride=' + $bypass)
`;
}

/**
 * @param {{ enabled: boolean, server?: string, bypass?: string }} next
 * An empty `server` / `bypass` leaves the existing registry value untouched:
 * turning the proxy off never wipes the address, and enabling never clobbers a
 * hand-maintained ProxyOverride list unless `bypass` is explicitly configured.
 */
export function buildWriteScript({ enabled, server, bypass }) {
  const lines = [
    `$ErrorActionPreference = 'Stop'`,
    `$key = ${quote(REGISTRY_KEY)}`,
    `Set-ItemProperty -LiteralPath $key -Name ProxyEnable -Value ${enabled ? 1 : 0} -Type DWord`,
  ];
  if (server) {
    lines.push(`Set-ItemProperty -LiteralPath $key -Name ProxyServer -Value ${quote(server)} -Type String`);
  }
  if (bypass) {
    lines.push(`Set-ItemProperty -LiteralPath $key -Name ProxyOverride -Value ${quote(bypass)} -Type String`);
  }
  lines.push(
    `$refreshed = 'false'`,
    `try {`,
    `  $signature = '[DllImport("wininet.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern bool InternetSetOption(System.IntPtr hInternet, int dwOption, System.IntPtr lpBuffer, int dwBufferLength);'`,
    `  $notify = Add-Type -MemberDefinition $signature -Name 'WinInetNotify' -Namespace 'DshProxySwitch' -PassThru`,
    `  [void]$notify::InternetSetOption([System.IntPtr]::Zero, 39, [System.IntPtr]::Zero, 0)`,
    `  [void]$notify::InternetSetOption([System.IntPtr]::Zero, 37, [System.IntPtr]::Zero, 0)`,
    `  $refreshed = 'true'`,
    `} catch { $refreshed = 'false' }`,
    `Write-Output ('Refreshed=' + $refreshed)`,
  );
  return lines.join('\n');
}

export async function readSystemProxy() {
  const result = await powershell(buildReadScript());
  if (!result.ok) throw failure(result, '读取系统代理');

  const state = { enabled: false, server: '', bypass: '' };
  for (const line of result.stdout.split(/\r?\n/)) {
    const at = line.indexOf('=');
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1);
    if (key === 'ProxyEnable') state.enabled = value.trim() === '1';
    else if (key === 'ProxyServer') state.server = value.trim();
    else if (key === 'ProxyOverride') state.bypass = value.trim();
  }
  return state;
}

/** @returns {Promise<{ refreshed: boolean }>} */
export async function writeSystemProxy({ enabled, server, bypass }) {
  const result = await powershell(buildWriteScript({ enabled, server, bypass }));
  if (!result.ok) throw failure(result, '写入系统代理');
  return { refreshed: /Refreshed=true/i.test(result.stdout) };
}
