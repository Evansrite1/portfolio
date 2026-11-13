'use strict';
/* The connection check. No system setting is changed by these tests: every command goes to a fake runner. */
const test = require('node:test');
const assert = require('node:assert');
const nc = require('../lib/netcheck');

const fakeLan = () => [{ name: 'Wi-Fi', ip: '192.168.1.5', broadcast: '192.168.1.255', rank: 0 }];
const EXE = 'C:\\Users\\x\\AppData\\Local\\Programs\\file-share\\File Share by Evans Large.exe';

test('Windows check: rule missing gives a fix, rule present is ok, firewall off is ok', async () => {
  const mk = (out) => nc.createChecker({ platform: 'win32', execPath: EXE, lan: fakeLan, run: async () => ({ code: 0, stdout: JSON.stringify(out), stderr: '' }) });
  let r = await mk({ fw: 3, rule: [] }).check();
  const fw = r.items.find((i) => i.id === 'firewall');
  assert.strictEqual(fw.ok, false); assert.ok(fw.fix && fw.fix.label);
  r = await mk({ fw: 3, rule: [EXE.toLowerCase()] }).check(); assert.strictEqual(r.items.find((i) => i.id === 'firewall').ok, true);
  r = await mk({ fw: 3, rule: EXE }).check(); assert.strictEqual(r.items.find((i) => i.id === 'firewall').ok, true);        /* one rule comes back as a bare string */
  r = await mk({ fw: 3, rule: ['D:\\other\\app.exe'] }).check(); assert.strictEqual(r.items.find((i) => i.id === 'firewall').ok, false);
  r = await mk({ fw: 0, rule: [] }).check(); assert.strictEqual(r.items.find((i) => i.id === 'firewall').ok, true); assert.strictEqual(r.allOk, true);
  const bad = await nc.createChecker({ platform: 'win32', execPath: EXE, lan: fakeLan, run: async () => ({ code: 1, stdout: 'garbage', stderr: '' }) }).check();
  assert.strictEqual(bad.items.find((i) => i.id === 'firewall').ok, false);
});

test('Windows fix: asks for permission, builds a safe script, reports a refusal', async () => {
  const exe = "C:\\Users\\O'Brien\\File Share by Evans Large.exe";
  const calls = [];
  const run = async (cmd, args) => { calls.push({ cmd, args }); return { code: 3, stdout: 'CANCELLED', stderr: '' }; };
  const c = nc.createChecker({ platform: 'win32', execPath: exe, lan: fakeLan, run });
  const res = await c.fix('firewall');
  assert.strictEqual(res.ok, false); assert.strictEqual(res.cancelled, true);
  assert.strictEqual(calls.length, 1); assert.strictEqual(calls[0].cmd, 'powershell.exe');
  const outer = Buffer.from(calls[0].args[calls[0].args.length - 1], 'base64').toString('utf16le');
  assert.ok(/-Verb RunAs/.test(outer), 'the fix must ask the system for administrator permission');
  const inner = Buffer.from(/'([A-Za-z0-9+/=]{40,})'\s+-Verb RunAs/.exec(outer)[1], 'base64').toString('utf16le');
  assert.ok(/New-NetFirewallRule -DisplayName 'File Share by Evans Large' -Direction Inbound -Action Allow/.test(inner));
  assert.ok(inner.includes("O''Brien"), 'a quote in the folder name must be escaped');
  assert.ok(/-Profile Any/.test(inner));
  await assert.rejects(c.fix('rm -rf'), /Unknown fix/);
  const ok = await nc.createChecker({ platform: 'win32', execPath: exe, lan: fakeLan, run: async () => ({ code: 0, stdout: '', stderr: '' }) }).fix('firewall');
  assert.strictEqual(ok.ok, true);
});

test('Mac and Linux: right commands, and a successful fix is remembered', async () => {
  const mem = {}; const store = { get: (k) => mem[k], set: (k, v) => { mem[k] = v; } };
  const calls = [];
  const macRun = async (cmd, args) => { calls.push([cmd, ...args]); if (args[0] === '--getglobalstate') return { code: 0, stdout: 'Firewall is enabled. (State = 1)', stderr: '' }; return { code: 0, stdout: '', stderr: '' }; };
  const mac = nc.createChecker({ platform: 'darwin', execPath: '/Applications/File Share by Evans Large.app/Contents/MacOS/File Share by Evans Large', lan: fakeLan, run: macRun, store });
  let r = await mac.check(); assert.strictEqual(r.items.find((i) => i.id === 'firewall').ok, false);
  assert.strictEqual((await mac.fix('firewall')).ok, true);
  const osa = calls.find((c) => c[0] === 'osascript');
  assert.ok(osa && /administrator privileges/.test(osa[2]) && /--unblockapp/.test(osa[2]) && /--add/.test(osa[2]));
  r = await mac.check(); assert.strictEqual(r.items.find((i) => i.id === 'firewall').ok, true);
  assert.strictEqual(nc.macAppPath('/Applications/X.app/Contents/MacOS/X'), '/Applications/X.app');
  assert.throws(() => nc.macFixCommand('/Applications/Bad"App.app'));

  const mem2 = {}; const store2 = { get: (k) => mem2[k], set: (k, v) => { mem2[k] = v; } }; const calls2 = [];
  const linRun = async (cmd, args) => { calls2.push([cmd, ...args]); if (cmd === 'systemctl' && args[1] === 'ufw') return { code: 0, stdout: 'active\n', stderr: '' }; if (cmd === 'systemctl') return { code: 3, stdout: 'inactive\n', stderr: '' }; return { code: 0, stdout: '', stderr: '' }; };
  const lin = nc.createChecker({ platform: 'linux', execPath: '/opt/file-share/file-share', lan: fakeLan, run: linRun, store: store2 });
  r = await lin.check(); assert.strictEqual(r.items.find((i) => i.id === 'firewall').ok, false);
  assert.strictEqual((await lin.fix('firewall')).ok, true);
  const pk = calls2.find((c) => c[0] === 'pkexec');
  assert.ok(pk && /ufw allow 41873\/udp && ufw allow 41874\/tcp/.test(pk[3]));
  r = await lin.check(); assert.strictEqual(r.items.find((i) => i.id === 'firewall').ok, true);
  const none = await nc.createChecker({ platform: 'linux', execPath: '/x', lan: fakeLan, run: async () => ({ code: 3, stdout: 'inactive\n', stderr: '' }), store: store2 }).check();
  assert.strictEqual(none.items.find((i) => i.id === 'firewall').ok, true);
  const nonet = await nc.createChecker({ platform: 'linux', execPath: '/x', lan: () => [], run: async () => ({ code: 3, stdout: 'inactive', stderr: '' }), store: store2 }).check();
  assert.strictEqual(nonet.items.find((i) => i.id === 'network').ok, false);
});
