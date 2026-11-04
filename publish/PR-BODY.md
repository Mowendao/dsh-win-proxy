# Add dsh-win-proxy

## 插件

- **名称**：Proxy Switch（代理开关）
- **包名**：`dsh-win-proxy`
- **仓库**：https://github.com/YOUR_GITHUB_USERNAME/dsh-win-proxy
- **分类**：network
- **平台**：Windows 10 / 11（系统代理目标）；git / npm / pip 目标跨平台
- **宿主要求**：`dsh >= 0.2.0 < 0.3.0`

## 它做什么

一键开关 Windows 系统代理（HKCU `Internet Settings` 的 `ProxyEnable` / `ProxyServer`，并用
`InternetSetOption` 通知 WinINET 重载，运行中的浏览器无需重启），同时切换 git、npm（`~/.npmrc`）、
pip（`pip.ini`）的代理配置。三个入口共用同一套逻辑：

- 设置 → 代理开关（自带设置页：各目标状态、开关、代理地址与作用对象）
- `/proxy on | off | status` 命令（不经过模型）
- `proxy_switch` 智能体工具（对话里说「开代理」即可）

## 为什么值得收录

- 开发者的高频小痛点：本地代理客户端开着但系统代理忘了开，或反过来忘了关，逐个改 git/npm/pip 更麻烦。
- 完全本地：只读写 HKCU 注册表与三个配置文件，不联网、不上传数据、不需要管理员权限。
- 无损：关闭系统代理只清 `ProxyEnable`；默认不改动已有的 `ProxyOverride` 绕过列表；npm/pip 只增删自己那两个键。
- 有明确失败提示：代理地址指向的本地端口没在监听时会提示，避免「开了代理却上不了网」的困惑。

## 自检

- `npm test`：npm/pip 配置编辑器的纯函数测试 + 设置页模块冒烟测试
- 已在 Windows 11 + dsh 0.2.1-rc.5 上实测：系统代理开关、git 开关、pip 文件写入/回滚、设置页加载
- 系统代理关闭时只改 `ProxyEnable`，`ProxyServer` 与 `ProxyOverride` 保持原样（已实测核对注册表）

## 目录条目

```json
{
  "name": "dsh-win-proxy",
  "url": "https://github.com/YOUR_GITHUB_USERNAME/dsh-win-proxy",
  "npm": "dsh-win-proxy",
  "category": ["network"]
}
```

如目录使用其他分类 id 或字段名，请按仓库规范调整——这里的分类型号以维护者的约定为准。
