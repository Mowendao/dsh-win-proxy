/**
 * Smoke test for the Settings client half, executed without a browser:
 * load client.js the way the page's module loader does, run the factory, run
 * `apply` against a stub of the host-provided `slots`/`locale` faces, and render
 * the page component once with a minimal hook shim.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "client.js"), "utf8");

let loaded;
globalThis.window = {
  __ModuleLoader__: {
    load(mod) {
      loaded = mod;
    },
  },
};
globalThis.document = { documentElement: { lang: "zh-CN" } };

new Function(source)();
assert.ok(loaded, "client.js must register itself with the module loader");
assert.equal(loaded.id, "dsh-win-proxy");

const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useCallback: (fn) => fn,
  useEffect: () => undefined,
  useRef: (value) => ({ current: value }),
  useState: (value) => [value, () => undefined],
};
const requireShim = (name) => {
  assert.equal(name, "react", `unexpected module import: ${name}`);
  return react;
};

const mod = loaded.factory(requireShim);
assert.deepEqual(mod.inject, ["slots", "locale"]);
assert.equal(typeof mod.apply, "function");

const dicts = {};
const slotRegistrations = [];
const effectLabels = [];
let localeRegisters = 0;

const ctx = {
  effect(fn) {
    effectLabels.push(typeof fn);
    fn();
    return () => undefined;
  },
  locale: {
    register(namespace, lang, dict) {
      dicts[`${namespace}:${lang}`] = dict;
      localeRegisters += 1;
      return () => undefined;
    },
    bind(namespace) {
      return (key) => dicts[`${namespace}:zh`]?.[key];
    },
  },
  slots: {
    inject(owner, fn) {
      assert.equal(owner, "settings.section");
      fn();
    },
    register(options, component) {
      slotRegistrations.push({ options, component });
      return () => undefined;
    },
  },
};

mod.apply(ctx);

assert.equal(localeRegisters, 2, "zh and en dictionaries must both register");
assert.deepEqual(Object.keys(dicts).sort(), ["proxySwitch:en", "proxySwitch:zh"]);
assert.equal(slotRegistrations.length, 1, "exactly one settings page must register");

const { options, component } = slotRegistrations[0];
assert.equal(options.name, "settings.section");
assert.equal(options.id, "proxy-switch");
assert.equal(options.locale, "proxySwitch");
assert.equal(typeof options.label, "function");
const label = options.label();
assert.ok(typeof label === "string" && label.trim().length > 0, "nav label must be non-empty");
assert.equal(label, "代理开关");
assert.equal(typeof component, "function");

// Render once: hooks are shimmed, the initial state has no snapshot yet.
const tree = component({ close: () => undefined });
const serialized = JSON.stringify(tree);
assert.ok(serialized.includes("代理开关"), "page must render its title");
assert.ok(serialized.includes("当前代理"), "page must render the current-state block");
assert.ok(serialized.includes("各目标状态"), "page must render the target list heading");
assert.ok(serialized.includes("127.0.0.1:7890"), "page must suggest the default proxy address");

// Both dictionaries must cover every key the renderer asks for.
const zhKeys = Object.keys(dicts["proxySwitch:zh"]).sort();
const enKeys = Object.keys(dicts["proxySwitch:en"]).sort();
assert.deepEqual(zhKeys, enKeys, "zh and en dictionaries must have identical keys");

console.log("client: module, apply, dictionaries and render all passed");
