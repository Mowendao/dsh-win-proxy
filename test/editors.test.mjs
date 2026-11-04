/**
 * Pure-function tests for the npm / pip file editors. They never touch the
 * real ~/.npmrc or pip.ini; the live switch is verified through the tool.
 */

import assert from 'node:assert/strict';

import {
  npmrcProxyValue,
  npmrcWithProxy,
  npmrcWithoutProxy,
  pipIniProxyValue,
  pipIniWithProxy,
  pipIniWithoutProxy,
} from '../lib/app-proxy.js';

const URL_ = 'http://127.0.0.1:7890';

// --- npm: empty file -------------------------------------------------------
assert.equal(npmrcWithProxy('', URL_), `proxy=${URL_}\nhttps-proxy=${URL_}\n`);
assert.equal(npmrcWithoutProxy(`proxy=${URL_}\nhttps-proxy=${URL_}\n`), '');

// --- npm: keeps unrelated lines and comments, replaces an old proxy --------
const npmSource = [
  '# my registry',
  'registry=https://registry.npmmirror.com',
  'proxy=http://10.0.0.1:8080',
  '//registry.npmjs.org/:_authToken=secret',
  '',
].join('\r\n');

const npmOn = npmrcWithProxy(npmSource, URL_);
assert.ok(npmOn.includes('registry=https://registry.npmmirror.com'));
assert.ok(npmOn.includes('//registry.npmjs.org/:_authToken=secret'));
assert.ok(npmOn.includes('# my registry'));
assert.ok(!npmOn.includes('10.0.0.1'));
assert.equal(npmOn.split(/\r?\n/).filter((line) => /^\s*proxy\s*=/.test(line)).length, 1);
assert.equal(npmOn.split(/\r?\n/).filter((line) => /^\s*https-proxy\s*=/.test(line)).length, 1);
assert.deepEqual(npmrcProxyValue(npmOn), { proxy: URL_, 'https-proxy': URL_ });

const npmOff = npmrcWithoutProxy(npmOn);
assert.ok(npmOff.includes('registry=https://registry.npmmirror.com'));
assert.ok(!/^\s*https?-?proxy\s*=/m.test(npmOff));
assert.deepEqual(npmrcProxyValue(npmOff), {});

// --- npm: idempotent -------------------------------------------------------
assert.equal(npmrcWithProxy(npmOn, URL_), npmOn);

// --- pip: creates [global] in an empty file --------------------------------
const pipOn = pipIniWithProxy('', URL_);
assert.equal(pipOn, `[global]\nproxy = ${URL_}\n`);
assert.deepEqual(pipIniProxyValue(pipOn), { proxy: URL_ });

// --- pip: keeps other settings and their section ---------------------------
const pipSource = [
  '[global]',
  'index-url = https://pypi.tuna.tsinghua.edu.cn/simple',
  'proxy = http://10.0.0.1:8080',
  '',
  '[install]',
  'trusted-host = pypi.tuna.tsinghua.edu.cn',
  '',
].join('\r\n');

const pipUpdated = pipIniWithProxy(pipSource, URL_);
assert.equal(pipUpdated.split(/\r?\n/).filter((line) => /^\s*proxy\s*=/.test(line)).length, 1);
assert.ok(pipUpdated.includes('index-url = https://pypi.tuna.tsinghua.edu.cn/simple'));
assert.ok(pipUpdated.includes('[install]\r\ntrusted-host = pypi.tuna.tsinghua.edu.cn'));
assert.ok(!pipUpdated.includes('10.0.0.1'));
assert.deepEqual(pipIniProxyValue(pipUpdated), { proxy: URL_ });

const pipCleared = pipIniWithoutProxy(pipUpdated);
assert.ok(!/^\s*proxy\s*=/m.test(pipCleared));
assert.ok(pipCleared.includes('[global]'));
assert.ok(pipCleared.includes('[install]'));
assert.deepEqual(pipIniProxyValue(pipCleared), {});

// --- pip: a second [global]-less file gets the section appended ------------
const pipNoGlobal = pipIniWithProxy('[install]\ntrusted-host = x\n', URL_);
assert.ok(pipNoGlobal.includes('[global]'));
assert.ok(pipNoGlobal.includes(`proxy = ${URL_}`));

console.log('editors: all assertions passed');
