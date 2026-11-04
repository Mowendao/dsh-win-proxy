# 代理开关 · Proxy Switch

**DSH 不跟着代理软件走：一条命令切好 Windows 系统代理，并同步 git / npm / pip 的代理配置。**

在对话里说「开代理」，输入 `/proxy on`，或者打开 **设置 → 代理开关**。

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![platform: Windows](https://img.shields.io/badge/platform-Windows-blue.svg)](#要求)

## 背景

**DSH 不受代理软件影响。** 代理客户端（Clash / v2ray）打开系统代理后，浏览器跟着走了，但 DSH 读的是 Node 自己的网络栈，根本不看 Windows 系统代理；
它替你跑的 `git`、`npm`、`pip` 也各读各的配置。于是「代理明明是开的」，DSH 里照样 `clone` 不动、装不上包。

- **DSH 自身的抓取不看系统代理**：`web_fetch` 这类请求按直连处理，代理开着也照旧直连
- **它跑的命令各有各的配置**：git 读 `git config`，npm 读 `.npmrc`，pip 读 `pip.ini`，系统代理对它们同样无效
- **忘了关更麻烦**：代理客户端退了，系统代理还指着那个端口，浏览器那一侧就断网

本插件把**系统代理与 git / npm / pip** 合成一条命令：开，全开；关，全关，DSH 里执行的命令立刻跟上。
DSH 自身的网络栈不在本插件范围内——那属于 fetch provider 的事。

## 功能

- **三个入口，一套逻辑**：设置页、`/proxy` 命令、对话里的 `proxy_switch` 工具
- **系统代理立即生效**：写完 HKCU 注册表后调用 `InternetSetOption` 通知 WinINET 重载，运行中的浏览器不必重启
- **不碰你手工维护的绕过列表**：`bypass` 默认留空，`ProxyOverride` 原样保留
- **端口没监听会提示**：开了代理却上不了网时，一眼看出是代理客户端没启动
- **只改自己那几个键**：git / npm / pip 配置里的注释、token、其它设置都原样保留
- **不需要管理员权限**：系统代理写在 HKCU，只影响当前用户
- **不联网**：只读写本机注册表与配置文件

## 安装

### 从插件市场安装（推荐）

打开 DSH 的 **设置 → 插件**，搜索 `Proxy Switch`，点安装。

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:Mowendao/dsh-win-proxy
```

### 从 npm 安装

```sh
dsh plugin --profile web add dsh-win-proxy
```

> npm 包发布后可用；在那之前请使用上一节的 GitHub 源。

### 指定其他 profile

把 `--profile web` 换成你的 profile 名：

```sh
dsh plugin --profile <profile> add github:Mowendao/dsh-win-proxy
```

### 在桌面端安装

DSH Desktop 的插件由应用自己安装：**设置 → 插件 → 安装**。
桌面端的 profile 不能用 `dsh plugin` 管理——CLI 会直接拒绝 `--profile desktop`。

安装或更新后重启 DSH（或重新加载页面），设置页才会出现。

## 使用

### `/proxy` 命令

不经过模型、不消耗 token：

```sh
/proxy on       # 开启：系统代理 + git + npm + pip
/proxy off      # 关闭
/proxy status   # 只看状态
```

### 对话

直接说「开代理」「关代理」「代理状态」，模型会调用 `proxy_switch` 工具。

### 设置页

**设置 → 代理开关**：

- 顶部总开关，一次切换全部作用对象
- 四个目标的实时状态与细节，外加本地监听端口
- 代理地址可直接修改，保存后写回插件配置、重启仍然生效
- 作用对象可单独勾选，例如只想要 git 代理

## 配置

设置页里改的 `proxyServer` / `targets` 会写回插件行的 `config`；也可以手改 profile 的 `cordis.patch.yml`：

```yaml
- id: dsh-win-proxy
  name: 'dsh-win-proxy'
  config:
    proxyServer: "127.0.0.1:7890"
    targets: ["system", "git", "npm", "pip"]
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `proxyServer` | `127.0.0.1:7890` | `host:port`、完整 URL，或 WinINET 风格 `http=h:p;https=h:p` |
| `bypass` | 空（不改动） | 显式填写才覆盖注册表 `ProxyOverride` |
| `targets` | 全部四个 | 默认作用对象，单次调用可用 `targets` 参数覆盖 |
| `probePorts` | 常见端口 | `status` 时探测哪些本地端口在监听 |

## 它改了什么

| 目标 | 开启 | 关闭 |
| --- | --- | --- |
| `system` | HKCU `...\Internet Settings`：`ProxyEnable=1`、`ProxyServer`（显式配置时还有 `ProxyOverride`），并通知 WinINET 重载 | `ProxyEnable=0`，保留 `ProxyServer` |
| `git` | `git config --global http.proxy` / `https.proxy` | `--unset-all` 两个键 |
| `npm` | `~/.npmrc` 写入 `proxy` / `https-proxy` | 删除这两个键 |
| `pip` | `%APPDATA%\pip\pip.ini` 的 `[global] proxy` | 删除该项 |

关闭 `system` 不会清空 `ProxyServer`，与 Windows 设置面板行为一致。
git / npm / pip 没有独立开关，关闭即删除键，重新开启以 `proxyServer` 为准。

## 要求

| 项目 | 要求 |
| --- | --- |
| 系统 | Windows 10 / 11（`system` 目标仅 Windows；git / npm / pip 目标跨平台） |
| DSH | `>= 0.2.0 < 0.3.0`（`engines.dsh`） |
| Node | `>= 20`（随 DSH 提供） |
| 权限 | 无需管理员 |

## 常见问题

**开了代理，浏览器却完全上不了网？**
`proxyServer` 指向的端口没有程序在监听。先启动 Clash / v2ray 等客户端；设置页的「本地监听端口」一项能直接看出来。

**会覆盖我自定义的绕过列表吗？**
不会。`bypass` 默认为空，插件不写 `ProxyOverride`，只有显式配置才覆盖。

**为什么不改 WinHTTP？**
`netsh winhttp` 是机器级代理，影响系统服务且需要管理员权限；浏览器读的是 WinINET 这份系统代理。

**Chrome / Edge 需要重启吗？**
不需要。插件写完注册表就通知 WinINET 重载了。个别程序会缓存旧设置，重启那个程序即可。

**Clash 也改这些注册表键，会打架吗？**
会互相覆盖，属预期行为——谁最后写谁生效。

**关闭后为什么 `ProxyServer` 还在？**
这是 Windows 设置面板的行为：关闭只把 `ProxyEnable` 置 0，地址留着方便下次开启。

## 开发

```sh
npm test    # 配置编辑器单测 + 设置页模块冒烟测试，不碰真实配置
```

```
lib/index.js      工具、命令、设置页接口
lib/wininet.js    HKCU 读写 + InternetSetOption
lib/app-proxy.js  git / npm / pip
lib/netprobe.js   本地端口探测
client.js         设置页（纯浏览器模块，无需构建）
```

设置页通过 `/api/dsh-win-proxy/{status,switch,config}` 与宿主通信，写操作要求同源 + JSON + `x-dsh-win-proxy: 1`。
改客户端后刷新页面即可；改宿主代码需要重启 DSH。

## 卸载

```sh
dsh plugin --profile web remove dsh-win-proxy
```

桌面端：**设置 → 插件 → 卸载**。

## 许可

[MIT](LICENSE)
