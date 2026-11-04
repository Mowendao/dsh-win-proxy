# Add `<owner>/dsh-win-proxy` — Proxy Switch

> 提交前用 `node scripts/configure-publish.mjs https://github.com/<owner>/dsh-win-proxy`
> 生成真正的条目文件，下面用 `<owner>` 占位。

## 本 PR 只做一件事

新增一个文件：`data/plugins/<owner>__dsh-win-proxy.yml`

```yaml
url: https://github.com/<owner>/dsh-win-proxy
name: <owner>/dsh-win-proxy
category: dev
description:
  en: 'Toggles the Windows system proxy (HKCU Internet Settings plus a WinINET refresh) together with the git, npm and pip proxy settings, from chat, the /proxy command or a Settings page.'
  zh: '一键开关 Windows 系统代理（写注册表并通知 WinINET 重载），同时切换 git、npm、pip 的代理配置，支持对话、/proxy 命令和设置页三个入口。'
```

没有改动任何其它条目，也没有手改生成的 README。

## 这个插件做什么

三个入口共用一套逻辑：

- **设置 → 代理开关**：四个目标的状态、总开关、代理地址与作用对象
- **`/proxy on | off | status`**：命令直达，不经过模型
- **`proxy_switch` 工具**：对话里说「开代理」即可

**系统代理**写 HKCU `Software\Microsoft\Windows\CurrentVersion\Internet Settings` 的
`ProxyEnable` / `ProxyServer`，再用 `InternetSetOption`（`INTERNET_OPTION_SETTINGS_CHANGED` +
`REFRESH`）通知 WinINET 重载，运行中的浏览器无需重启。关闭时只把 `ProxyEnable` 置 0，
`ProxyServer` 与 `ProxyOverride` 保持原样；`bypass` 默认不写，避免覆盖用户手工维护的绕过列表。

**git / npm / pip** 分别用 `git config --global http.proxy|https.proxy`、`~/.npmrc` 的
`proxy`/`https-proxy`、`pip.ini` 的 `[global] proxy`；关闭时只删这几项，文件其余内容原样保留。

写操作全部在本机：不联网、不上传数据、不需要管理员权限。

## 对照 contributing.md 的自检

- [x] `package.json` 声明 `dsh.bundle`（`{"bundle": {"patch": "./cordis.patch.yml"}}`），`dsh.client` 另有声明用于设置页
- [x] 仓库是真实可用的代码，非占位；`npm test` 覆盖配置编辑器与设置页模块
- [ ] 仓库创建满 1 天（CI 自动检查）
- [ ] 仓库已添加 `dsh-plugin` topic
- [x] 描述只陈述功能，无营销词，也不含未经核对的数量或 API 名称
- [x] 条目里不写 `npm:` 字段（规范要求：映射由 registry 自动采集）
- [ ] 可选的 npm 发布：`dsh-win-proxy` 发布后 `repository` 指回本仓库；未发布也不影响收录

## 关于分类

选了 `dev`（Development & Runtime）：插件本身是开发者的代理开关，同时改系统代理与 git/npm/pip。
如果维护者认为 `wsl`（Windows interop）更贴切，直接改即可——规范里说明分类不会被当作打回理由。

## 与已有条目的关系

目录里已有 `tonyAmadeus/dsh-proxy-switch`，它做的是「DSH 出站流量在 Clash 与直连之间选路」；
本插件改的是 **Windows 系统代理**与 git/npm/pip 的配置，是系统级开关，不是 DSH 内部的出站路由。
两者不重复，也不会互相覆盖（前者管 DSH 进程，后者管系统与开发工具）。

## 其它说明

- 平台：系统代理目标仅 Windows 10/11（HKCU 注册表 + WinINET）；git/npm/pip 目标跨平台。
- 宿主要求：`dsh >= 0.2.0 < 0.3.0`（已写入 `engines.dsh`）。
- `icon:` 暂未提供：仓库内的图标是 SVG，规范只接受 GitHub 托管的位图，因此留给作者头像回退。
