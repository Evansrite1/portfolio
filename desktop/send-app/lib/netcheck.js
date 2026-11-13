'use strict';
/* The connection check. It looks for the things that stop a second computer from reaching this one
   (mainly the firewall) and, where it can, fixes them with one button. Changing a firewall needs an
   administrator, so the fix asks the system for permission (the Windows or Mac permission window).
   Nothing here changes anything until the person presses a Fix button. */
const { execFile } = require('child_process');
const path = require('path');
const { lanAddresses } = require('./net');

const NAME = 'File Share by Evans Large';
const SOCKETFILTER = '/usr/libexec/ApplicationFirewall/socketfilterfw';

function defaultRun(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: opts.timeout || 30000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err || null });
    });
  });
}

const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";                 /* a PowerShell single quoted string */
const encodePS = (script) => Buffer.from(script, 'utf16le').toString('base64');

/* Run a PowerShell script as administrator. The system shows its own permission window. */
async function runElevatedPS(run, script) {
  const outer = [
    "$ErrorActionPreference='Stop'",
    'try {',
    "  $p = Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand'," + psq(encodePS(script)) + ' -Verb RunAs -Wait -PassThru -WindowStyle Hidden',
    '  exit $p.ExitCode',
    "} catch { Write-Output 'CANCELLED'; exit 3 }"
  ].join('\n');
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePS(outer)], { timeout: 180000 });
  return { ok: r.code === 0, cancelled: /CANCELLED/.test(r.stdout) || r.code === 3, code: r.code, stdout: r.stdout, stderr: r.stderr };
}

function winCheckScript() {
  return [
    "$ErrorActionPreference='Stop'",
    '$fw = @(Get-NetFirewallProfile | Where-Object { $_.Enabled -eq "True" }).Count',
    '$rule = @(Get-NetFirewallRule -DisplayName ' + psq(NAME) + ' -ErrorAction SilentlyContinue | Get-NetFirewallApplicationFilter | ForEach-Object { $_.Program })',
    'ConvertTo-Json -Compress @{ fw = $fw; rule = $rule }'
  ].join('\n');
}
function winFixScript(exe) {
  return [
    "$ErrorActionPreference='Stop'",
    'Get-NetFirewallRule -DisplayName ' + psq(NAME) + ' -ErrorAction SilentlyContinue | Remove-NetFirewallRule',
    'New-NetFirewallRule -DisplayName ' + psq(NAME) + ' -Direction Inbound -Action Allow -Program ' + psq(exe) + ' -Profile Any -Enabled True | Out-Null'
  ].join('\n');
}

/* "/Applications/X.app/Contents/MacOS/X" -> "/Applications/X.app" */
function macAppPath(execPath) { const m = /^(.*?\.app)(\/|$)/.exec(execPath); return m ? m[1] : null; }

function macFixCommand(app) {
  if (/["\\\n]/.test(app)) throw new Error('This app is in a folder whose name cannot be used here.');
  const q = (s) => '\\"' + s + '\\"';
  const cmd = q(SOCKETFILTER) + ' --add ' + q(app) + ' ; ' + q(SOCKETFILTER) + ' --unblockapp ' + q(app);
  return 'do shell script "' + cmd + '" with administrator privileges';
}

function createChecker(opts = {}) {
  const platform = opts.platform || process.platform;
  const run = opts.run || defaultRun;
  const execPath = opts.execPath || process.execPath;
  const ports = opts.ports || { udp: 41873, tcp: 41874 };
  const lan = opts.lan || lanAddresses;
  const store = opts.store || { get() { return null; }, set() {} };
  const discoveryOk = opts.discoveryOk || (() => true);

  async function check() {
    const items = [];
    const nets = lan();
    items.push(nets.length
      ? { id: 'network', ok: true, title: 'Connected to a network', detail: nets[0].name + ', ' + nets[0].ip }
      : { id: 'network', ok: false, title: 'No network found', detail: 'Connect to Wi-Fi or plug in a network cable. Both computers must be on the same network.' });
    items.push(discoveryOk()
      ? { id: 'listen', ok: true, title: 'Listening for other computers', detail: 'Port ' + ports.udp + ' is ready.' }
      : { id: 'listen', ok: false, title: 'Cannot listen for other computers', detail: 'Another program is using port ' + ports.udp + '. You can still connect with a link or an address.' });

    if (platform === 'win32') {
      const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePS(winCheckScript())]);
      let j = null; try { j = JSON.parse(r.stdout.trim()); } catch (e) {}
      if (!j) items.push({ id: 'firewall', ok: false, title: 'Could not read the Windows Firewall settings', detail: 'You can still try. If the other computer cannot connect, press Allow File Share.', fix: { label: 'Allow File Share' } });
      else if (!j.fw) items.push({ id: 'firewall', ok: true, title: 'Windows Firewall is off', detail: 'Nothing is blocking the connection.' });
      else {
        const rules = [].concat(j.rule || []).map((x) => String(x).toLowerCase());
        const have = rules.includes(path.normalize(execPath).toLowerCase());
        items.push(have
          ? { id: 'firewall', ok: true, title: 'Windows Firewall allows File Share', detail: 'A rule named "' + NAME + '" is in place.' }
          : { id: 'firewall', ok: false, title: 'Windows Firewall is blocking other computers', detail: 'Windows is on and has no rule for File Share, so the other computer cannot reach this one.', fix: { label: 'Allow File Share' } });
      }
    } else if (platform === 'darwin') {
      const app = macAppPath(execPath);
      const r = await run(SOCKETFILTER, ['--getglobalstate']);
      const m = /State\s*=\s*(\d)/.exec(r.stdout);
      const on = m ? m[1] !== '0' : null;
      if (on === false) items.push({ id: 'firewall', ok: true, title: 'The Mac firewall is off', detail: 'Nothing is blocking the connection.' });
      else if (!app) items.push({ id: 'firewall', ok: true, title: 'Running from source', detail: 'The firewall check applies to the installed app.' });
      else if (store.get('firewall')) items.push({ id: 'firewall', ok: true, title: 'The Mac firewall allows File Share', detail: 'You allowed it earlier.' });
      else items.push({ id: 'firewall', ok: false, title: on ? 'The Mac firewall may block other computers' : 'The Mac firewall status is unknown', detail: 'Allow File Share to receive connections so the other computer can reach this one.', fix: { label: 'Allow File Share' } });
      items.push({ id: 'localnet', ok: true, title: 'Local network permission', detail: 'If macOS asks to let File Share find devices on your local network, choose Allow.' });
    } else {
      const ufw = (await run('systemctl', ['is-active', 'ufw'])).stdout.trim() === 'active';
      const fwd = !ufw && (await run('systemctl', ['is-active', 'firewalld'])).stdout.trim() === 'active';
      if (!ufw && !fwd) items.push({ id: 'firewall', ok: true, title: 'No firewall detected', detail: 'Nothing is blocking the connection.' });
      else if (store.get('firewall')) items.push({ id: 'firewall', ok: true, title: 'The firewall allows File Share', detail: 'You allowed ports ' + ports.udp + ' and ' + ports.tcp + ' earlier.' });
      else items.push({ id: 'firewall', ok: false, title: (ufw ? 'The ufw firewall' : 'The firewalld firewall') + ' may block other computers', detail: 'Allow ports ' + ports.udp + ' (UDP) and ' + ports.tcp + ' (TCP) so the other computer can reach this one.', fix: { label: 'Allow File Share' } });
    }
    return { items, allOk: items.every((i) => i.ok), platform };
  }

  async function fix(id) {
    if (id !== 'firewall') throw new Error('Unknown fix');
    if (platform === 'win32') {
      const r = await runElevatedPS(run, winFixScript(execPath));
      if (r.cancelled) return { ok: false, cancelled: true, message: 'You chose not to allow it. File Share needs this permission to receive files.' };
      if (!r.ok) return { ok: false, message: 'Windows could not add the rule (' + (r.stderr.trim().split('\n')[0] || 'code ' + r.code) + ').' };
      return { ok: true };
    }
    if (platform === 'darwin') {
      const app = macAppPath(execPath);
      if (!app) return { ok: false, message: 'Install the app first. This fix applies to the installed app.' };
      const r = await run('osascript', ['-e', macFixCommand(app)], { timeout: 180000 });
      if (/User canceled|-128/.test(r.stderr)) return { ok: false, cancelled: true, message: 'You chose not to allow it. File Share needs this permission to receive files.' };
      if (r.code !== 0) return { ok: false, message: 'macOS could not change the firewall (' + (r.stderr.trim().split('\n')[0] || 'code ' + r.code) + ').' };
      store.set('firewall', true);
      return { ok: true };
    }
    const ufw = (await run('systemctl', ['is-active', 'ufw'])).stdout.trim() === 'active';
    const cmd = ufw
      ? 'ufw allow ' + ports.udp + '/udp && ufw allow ' + ports.tcp + '/tcp'
      : 'firewall-cmd --permanent --add-port=' + ports.udp + '/udp --add-port=' + ports.tcp + '/tcp && firewall-cmd --reload';
    const r = await run('pkexec', ['sh', '-c', cmd], { timeout: 180000 });
    if (r.code === 126 || r.code === 127) return { ok: false, cancelled: r.code === 126, message: r.code === 126 ? 'You chose not to allow it. File Share needs this permission to receive files.' : 'This computer has no pkexec. Run in a terminal: sudo sh -c "' + cmd + '"' };
    if (r.code !== 0) return { ok: false, message: 'The firewall could not be changed (' + (r.stderr.trim().split('\n')[0] || 'code ' + r.code) + ').' };
    store.set('firewall', true);
    return { ok: true };
  }

  return { check, fix };
}

module.exports = { createChecker, NAME, macAppPath, macFixCommand, winFixScript, winCheckScript, runElevatedPS, psq };
