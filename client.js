/**
 * Proxy Switch — Settings → 代理开关 client page.
 *
 * Plain browser module: no build step and no client package imports. React comes
 * from the page's module table; the host supplies `slots` and `locale`. The page
 * talks to the host half through the plugin's own JSON routes.
 */

window.__ModuleLoader__.load({
  id: "dsh-win-proxy",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = "proxySwitch";
    const MUTATION_HEADER = "x-dsh-win-proxy";
    const TARGET_IDS = ["system", "git", "npm", "pip"];

    const ZH = {
      title: "代理开关",
      description:
        "一键开关 Windows 系统代理，并同步 git / npm / pip 的代理配置。也可以在对话里用 /proxy on | off | status。",
      current: "当前代理",
      on: "已开启",
      off: "已关闭",
      switching: "切换中…",
      stateTitle: "各目标状态",
      enabled: "已开启",
      disabled: "未开启",
      unavailable: "不可用",
      notTargeted: "未启用",
      server: "代理地址",
      serverHint: "例如 127.0.0.1:7890；保存后写入插件配置，重启仍生效。",
      save: "保存",
      saving: "保存中…",
      saved: "已保存",
      targets: "作用对象",
      listening: "本地监听端口",
      noneListening: "未检测到常见代理端口",
      hint: "关闭 git / npm / pip 会删除代理键；再次开启以这里的代理地址为准。系统代理关闭只清 ProxyEnable，不改你的绕过列表。",
      windowsOnly: "系统代理目标仅支持 Windows。",
      failed: "操作失败",
      targetSystem: "系统代理",
      targetGit: "git",
      targetNpm: "npm",
      targetPip: "pip",
      toggle: "开关代理",
      loading: "读取中…",
      needRestart: "宿主侧接口未就绪（插件刚更新过），请重启 DSH 后再打开这一页。",
    };

    const EN = {
      title: "Proxy Switch",
      description:
        "Toggle the Windows system proxy and the git / npm / pip proxy settings together. Also available from chat with /proxy on | off | status.",
      current: "Current proxy",
      on: "On",
      off: "Off",
      switching: "Switching…",
      stateTitle: "Targets",
      enabled: "Enabled",
      disabled: "Disabled",
      unavailable: "Unavailable",
      notTargeted: "not targeted",
      server: "Proxy address",
      serverHint: "e.g. 127.0.0.1:7890; saving writes the plugin config and survives a restart.",
      save: "Save",
      saving: "Saving…",
      saved: "Saved",
      targets: "Targets",
      listening: "Local listening ports",
      noneListening: "no common proxy port detected",
      hint: "Disabling git / npm / pip removes their proxy keys; enabling again uses the address above. Disabling the system proxy only clears ProxyEnable and keeps your bypass list.",
      windowsOnly: "The system proxy target is Windows-only.",
      failed: "Action failed",
      targetSystem: "System",
      targetGit: "git",
      targetNpm: "npm",
      targetPip: "pip",
      toggle: "Toggle proxy",
      loading: "Loading…",
      needRestart: "Host endpoint not ready (plugin was just updated). Restart DSH and reopen this page.",
    };

    const TARGET_LABEL_KEY = {
      system: "targetSystem",
      git: "targetGit",
      npm: "targetNpm",
      pip: "targetPip",
    };

    const CSS = `
.dshps{display:flex;flex-direction:column;gap:16px;padding:2px 0 8px}
.dshps-head{display:flex;flex-direction:column;gap:6px}
.dshps-title{font-size:15px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary)}
.dshps-sub{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);max-width:640px}
.dshps-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:14px}
.dshps-hero{display:flex;align-items:center;justify-content:space-between;gap:16px}
.dshps-hero-text{display:flex;flex-direction:column;gap:4px;min-width:0}
.dshps-hero-label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dshps-hero-state{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dshps-switch{position:relative;width:46px;height:26px;flex:none;border-radius:999px;border:none;padding:0;cursor:pointer;background:var(--dsw-alias-state-idle-primary);transition:background .16s ease}
.dshps-switch[aria-checked="true"]{background:var(--dsw-alias-state-success-primary)}
.dshps-switch:disabled{opacity:.5;cursor:default}
.dshps-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .16s ease;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.dshps-switch[aria-checked="true"] .dshps-knob{transform:translateX(20px)}
.dshps-states{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px}
.dshps-row{display:flex;align-items:center;gap:8px;font-size:12px;min-width:0}
.dshps-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.dshps-dot[data-on="true"]{background:var(--dsw-alias-state-success-primary)}
.dshps-dot[data-err="true"]{background:var(--dsw-alias-state-error-primary)}
.dshps-name{width:68px;flex:none;color:var(--dsw-alias-label-primary)}
.dshps-badge{flex:none;font-size:11px;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dshps-detail{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.dshps-field{display:flex;flex-direction:column;gap:6px}
.dshps-field-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dshps-inline{display:flex;align-items:center;gap:8px}
.dshps-input{flex:1;min-width:0;height:30px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);padding:0 10px;font-size:12px;outline:none}
.dshps-input:focus{border-color:var(--dsw-alias-brand-primary)}
.dshps-btn{height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;flex:none}
.dshps-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)}
.dshps-btn:disabled{opacity:.5;cursor:default}
.dshps-checks{display:flex;flex-wrap:wrap;gap:14px}
.dshps-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary);cursor:pointer}
.dshps-hint{margin:0;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dshps-error{margin:0;font-size:12px;color:var(--dsw-alias-state-error-primary)}
.dshps-ok{margin:0;font-size:12px;color:var(--dsw-alias-state-success-primary)}
`;

    async function api(path, init) {
      const headers = { accept: "application/json" };
      const options = { credentials: "same-origin", ...init, headers };
      if (init && init.method && init.method !== "GET") {
        headers[MUTATION_HEADER] = "1";
        headers["content-type"] = "application/json";
      }
      const response = await fetch(`/api/dsh-win-proxy${path}`, options);
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok || !body || body.ok === false) {
        const message = body && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
        throw new Error(message);
      }
      return body.data;
    }

    function safeTranslate(bound) {
      const prefersChinese = () => {
        try {
          return String(document.documentElement.lang || "").toLowerCase().startsWith("zh");
        } catch {
          return false;
        }
      };
      return (key) => {
        let value;
        try {
          value = typeof bound === "function" ? bound(key) : undefined;
        } catch {
          value = undefined;
        }
        if (typeof value === "string" && value && value !== key) return value;
        const dict = prefersChinese() ? ZH : EN;
        return dict[key] ?? EN[key] ?? key;
      };
    }

    function createPage(getT) {
      return function ProxySwitchPage() {
        const t = getT();
        const [snap, setSnap] = useState(null);
        const [server, setServer] = useState("");
        const [targets, setTargets] = useState([]);
        const [busy, setBusy] = useState("");
        const [error, setError] = useState("");
        const [notice, setNotice] = useState("");
        const [loaded, setLoaded] = useState(false);
        const alive = useRef(true);

        const applySnapshot = useCallback((next) => {
          if (!alive.current || !next) return;
          setSnap(next);
          setLoaded(true);
          setServer(next.config && typeof next.config.proxyServer === "string" ? next.config.proxyServer : "");
          setTargets(Array.isArray(next.config && next.config.targets) ? next.config.targets : []);
        }, []);

        const refresh = useCallback(async () => {
          try {
            applySnapshot(await api("/status"));
          } catch (caught) {
            if (!alive.current) return;
            setLoaded(true);
            const message = caught && caught.message ? caught.message : String(caught);
            setError(/404/.test(message) ? t("needRestart") : message);
          }
        }, [applySnapshot, t]);

        useEffect(() => {
          alive.current = true;
          refresh();
          return () => {
            alive.current = false;
          };
        }, [refresh]);

        const anyOn = Boolean(snap && Array.isArray(snap.states) && snap.states.some((s) => s.ok && s.enabled));
        const configured = snap ? snap.config || {} : {};
        const dirty =
          Boolean(snap) &&
          (server.trim() !== String(configured.proxyServer || "") ||
            [...targets].sort().join(",") !== [...(configured.targets || [])].sort().join(","));

        const toggle = async () => {
          if (!snap || busy) return;
          setBusy("switch");
          setError("");
          setNotice("");
          try {
            applySnapshot(await api("/switch", { method: "POST", body: JSON.stringify({ action: anyOn ? "off" : "on" }) }));
          } catch (caught) {
            setError(caught && caught.message ? caught.message : String(caught));
            refresh();
          } finally {
            if (alive.current) setBusy("");
          }
        };

        const save = async () => {
          if (!snap || busy) return;
          setBusy("config");
          setError("");
          setNotice("");
          try {
            await api("/config", {
              method: "POST",
              body: JSON.stringify({ proxyServer: server.trim(), targets }),
            });
            setNotice(t("saved"));
            // Editing the row config remounts the Host plugin; re-read after it settles.
            window.setTimeout(() => {
              refresh();
            }, 700);
          } catch (caught) {
            setError(caught && caught.message ? caught.message : String(caught));
          } finally {
            if (alive.current) setBusy("");
          }
        };

        const toggleTarget = (id) => {
          setTargets((current) =>
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
          );
        };

        const states = snap && Array.isArray(snap.states) ? snap.states : [];
        const ports = snap && Array.isArray(snap.listeningPorts) ? snap.listeningPorts : null;

        return h(
          "div",
          { className: "dshps" },
          h("style", null, CSS),
          h(
            "div",
            { className: "dshps-head" },
            h("h2", { className: "dshps-title" }, t("title")),
            h("p", { className: "dshps-sub" }, t("description")),
          ),
          h(
            "div",
            { className: "dshps-card" },
            h(
              "div",
              { className: "dshps-hero" },
              h(
                "div",
                { className: "dshps-hero-text" },
                h("span", { className: "dshps-hero-label" }, t("current")),
                h(
                  "span",
                  { className: "dshps-hero-state" },
                  !snap ? (loaded ? t("unavailable") : t("loading")) : anyOn ? t("on") : t("off"),
                ),
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dshps-switch",
                  role: "switch",
                  "aria-checked": anyOn,
                  "aria-label": t("toggle"),
                  title: t("toggle"),
                  disabled: !snap || busy !== "",
                  onClick: toggle,
                },
                h("span", { className: "dshps-knob" }),
              ),
            ),
            h(
              "div",
              { className: "dshps-states" },
              h("span", { className: "dshps-field-label" }, t("stateTitle")),
              states.map((state) =>
                h(
                  "div",
                  { className: "dshps-row", key: state.target },
                  h("span", {
                    className: "dshps-dot",
                    "data-on": String(Boolean(state.ok && state.enabled)),
                    "data-err": String(Boolean(state.ok === false)),
                  }),
                  h("span", { className: "dshps-name" }, t(TARGET_LABEL_KEY[state.target] || "targetSystem")),
                  h(
                    "span",
                    { className: "dshps-badge" },
                    state.ok === false
                      ? t("unavailable")
                      : state.enabled
                        ? t("enabled")
                        : t("disabled"),
                  ),
                  state.targeted === false
                    ? h("span", { className: "dshps-badge" }, t("notTargeted"))
                    : null,
                  h(
                    "span",
                    { className: "dshps-detail" },
                    state.ok === false
                      ? state.error || ""
                      : state.detail || "",
                  ),
                ),
              ),
              ports
                ? h(
                    "div",
                    { className: "dshps-row" },
                    h("span", { className: "dshps-dot", "data-on": String(ports.length > 0) }),
                    h("span", { className: "dshps-name" }, t("listening")),
                    h(
                      "span",
                      { className: "dshps-detail" },
                      ports.length ? ports.join(", ") : t("noneListening"),
                    ),
                  )
                : null,
            ),
            h(
              "div",
              { className: "dshps-field" },
              h("span", { className: "dshps-field-label" }, t("server")),
              h(
                "div",
                { className: "dshps-inline" },
                h("input", {
                  className: "dshps-input",
                  type: "text",
                  value: server,
                  spellCheck: false,
                  "aria-label": t("server"),
                  placeholder: "127.0.0.1:7890",
                  disabled: !snap || busy !== "",
                  onChange: (event) => setServer(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter" && dirty) save();
                  },
                }),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dshps-btn",
                    disabled: !snap || busy !== "" || !dirty || !server.trim(),
                    onClick: save,
                  },
                  busy === "config" ? t("saving") : t("save"),
                ),
              ),
              h("p", { className: "dshps-hint" }, t("serverHint")),
            ),
            h(
              "div",
              { className: "dshps-field" },
              h("span", { className: "dshps-field-label" }, t("targets")),
              h(
                "div",
                { className: "dshps-checks" },
                TARGET_IDS.map((id) =>
                  h(
                    "label",
                    { className: "dshps-check", key: id },
                    h("input", {
                      type: "checkbox",
                      checked: targets.includes(id),
                      disabled: !snap || busy !== "",
                      onChange: () => toggleTarget(id),
                    }),
                    h("span", null, t(TARGET_LABEL_KEY[id])),
                  ),
                ),
              ),
            ),
            error ? h("p", { className: "dshps-error" }, `${t("failed")}: ${error}`) : null,
            notice ? h("p", { className: "dshps-ok" }, notice) : null,
            h("p", { className: "dshps-hint" }, t("hint")),
            snap && snap.platform !== "win32"
              ? h("p", { className: "dshps-hint" }, t("windowsOnly"))
              : null,
          ),
        );
      };
    }

    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, "zh", ZH), "proxy-switch: zh dictionary");
        ctx.effect(() => ctx.locale.register(NS, "en", EN), "proxy-switch: en dictionary");
        const t = safeTranslate(ctx.locale.bind(NS));
        const page = createPage(() => t);
        ctx.slots.inject("settings.section", () =>
          ctx.slots.register(
            {
              name: "settings.section",
              id: "proxy-switch",
              order: 27,
              label: () => t("title"),
              locale: NS,
            },
            page,
          ),
        );
      },
    };
  },
});
