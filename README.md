# 代理开关 · Proxy Switch

一个 DeepSeek Harness 插件：**一键开关 Windows 系统代理**，并把 git / npm / pip 的代理配置一起切换。

- **设置 → 代理开关**：看四个目标的实时状态、一键开关、改代理地址与作用对象
- **`/proxy on`、`/proxy off`、`/proxy status`**：命令直达，不经过模型、零 token
- **对话里说「开代理 / 关代理」**：模型调用 `proxy_switch` 工具

> 开发代理插件时最常见的两件事——「开代理忘了关」「关代理忘了开」——现在一条命令解决。
> 只读写本机设置，不联网、不上传任何数据。

## 要求

| 项目 | 要求 |
| --- | --- |
| 系统 | Windows 10 / 11（系统代理目标仅 Windows；git/npm/pip 目标跨平台） |
| Harness | `dsh >= 0.2.0 < 0.3.0` |
| Node | `>= 20`（随 DSH 提供） |
| 权限 | 无需管理员：系统代理写在 HKCU |

## 安装

在 DSH 里从插件市场安装（设置 → 插件 → 搜索 `Proxy Switch`），或者本地安装：

```text
plugin_manager action=install_bundle target=<本包绝对路径>
```

## 配置

设置页里改的 `proxyServer` / `targets` 会写回插件行的 `config`，立即生效且重启保留。
也可以直接改 profile 的 `cordis.patch.yml`：

```yaml
- id: dsh-win-proxy
  name: 'dsh-win-proxy'
  config:
    proxyServer: "127.0.0.1:7890"   # 你的本地代理端口
    # bypass: "localhost;127.*;10.*;192.168.*;<local>"   # 不填 = 保留系统现有绕过列表
    targets: ["system", "git", "npm", "pip"]
    probePorts: [7890, 7897, 10808, 10809, 1080, 8080, 8888]
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `proxyServer` | `127.0.0.1:7890` | 支持 `host:port`、完整 URL，或 WinINET 风格 `http=h:p;https=h:p` |
| `bypass` | 空（不改动） | 显式填写才覆盖注册表 `ProxyOverride`，手工维护的绕过列表默认保留 |
| `targets` | 四个全开 | 默认作用对象，可用工具参数 `targets` 单次覆盖 |
| `probePorts` | 常见端口 | `status` 时探测哪些本地端口在监听 |

## 它到底改了什么

| 目标 | 开启 | 关闭 |
| --- | --- | --- |
| `system` | HKCU `...\Internet Settings`：`ProxyEnable=1`、`ProxyServer`、`ProxyOverride`，再用 `InternetSetOption` 通知 WinINET 重载 | `ProxyEnable=0`，保留 `ProxyServer`（与 Windows 设置面板一致） |
| `git` | `git config --global http.proxy / https.proxy` | `--unset-all` 两个键 |
| `npm` | `~/.npmrc` 写 `proxy` / `https-proxy`，保留注释与其他行 | 删除这两个键 |
| `pip` | `%APPDATA%\pip\pip.ini` 的 `[global] proxy`，保留其他配置 | 删除该项 |

## 注意

- **不需要管理员权限**，只影响当前用户。
- **默认不动你的绕过列表**：`ProxyOverride` 里手工维护的域名只有显式配置 `bypass` 才会被覆盖。
- **不改 WinHTTP**（`netsh winhttp`，服务级代理，需要管理员），也不改 PAC。
- 开启后浏览器等 WinINET 应用立即生效；个别程序缓存旧设置，重启该程序即可。
- `status` 会探测本地常见代理端口：**开了代理但本地客户端没启动**时能一眼看出来。
- 关闭 `system` 不会清空 `ProxyServer`；git / npm / pip 没有独立开关，关闭即删除键，重新开启以 `proxyServer` 为准。
- Clash 等客户端自己也会改这些注册表键，与插件互相覆盖属预期行为。

## 开发

```powershell
npm test   # npm/pip 文件编辑器单测 + 设置页模块冒烟测试（不碰真实配置）
```

设置页是纯浏览器模块（`client.js`，无需构建），通过 `/api/dsh-win-proxy/{status,switch,config}` 与宿主通信，
写操作要求同源 + JSON + `x-dsh-win-proxy: 1` 标记。改动客户端后刷新页面即可；改动宿主代码需重启 DSH。

发布到 npm 前先指向自己的仓库：

```powershell
node scripts/configure-publish.mjs https://github.com/<you>/dsh-win-proxy
npm publish --access public
```

## 卸载

设置 → 插件 → 卸载；或 `plugin_manager action=remove_bundle target=dsh-win-proxy`。

## 许可

MIT
