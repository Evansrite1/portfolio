'use strict';
/* In-app updates with a skip limit, shared by every Evans Large app.
   When the computer is online and a newer version exists, the app asks once each time it opens.
   The first two times the person can skip. The third time there is no Skip button: the update is required.
   Windows (and signed Mac builds) download and install by themselves. An unsigned Mac build opens the download page instead. */
const fs = require('fs');
const path = require('path');

const MAX_SKIPS = 2;

module.exports = function updateGate(o) {
  const { app, dialog, shell } = o;
  if (!app.isPackaged || o.disabled) return;
  let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { return; }

  const file = path.join(app.getPath('userData'), 'update-skips.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; } };
  const write = (v) => { try { fs.writeFileSync(file, JSON.stringify(v)); } catch (e) { /* not saved: the next prompt still works */ } };
  const used = () => { const s = read(); return s.from === app.getVersion() ? (s.n || 0) : 0; }; /* the count starts again after each update */
  const win = () => { const w = o.getWindow && o.getWindow(); return w && !w.isDestroyed() ? w : undefined; };
  const canInstall = process.platform !== 'darwin' || !!o.macSigned;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  let asked = false, downloading = false;

  autoUpdater.on('download-progress', (p) => {
    const w = win(); if (w) { w.setProgressBar(Math.max(0, Math.min(1, (p.percent || 0) / 100))); w.setTitle(o.name + ' - downloading the update ' + Math.round(p.percent || 0) + '%'); }
  });
  autoUpdater.on('update-downloaded', () => {
    const w = win(); if (w) { w.setProgressBar(-1); w.setTitle(o.name); }
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
  autoUpdater.on('error', () => {
    downloading = false;
    const w = win(); if (w) { w.setProgressBar(-1); w.setTitle(o.name); }
    /* offline or no release yet: nothing to show, it is tried again next time */
  });

  autoUpdater.on('update-available', async (info) => {
    if (asked || downloading) return;
    asked = true;
    const n = used(), canSkip = n < MAX_SKIPS, left = MAX_SKIPS - n;
    const buttons = canSkip ? ['Update now', 'Skip for now'] : ['Update now'];
    const res = await dialog.showMessageBox(win(), {
      type: 'info', title: o.name, noLink: true, defaultId: 0, cancelId: canSkip ? 1 : 0, buttons,
      message: 'A new version of ' + o.name + ' is ready (version ' + info.version + ').',
      detail: canSkip
        ? 'Update now to get the newest features and fixes. You can skip this ' + left + (left > 1 ? ' more times' : ' more time') + '. After that the update is required.'
        : 'You have skipped this update before, so it is required now. It takes about a minute.'
    });
    if (res.response === 0) {
      if (!canInstall) { shell.openExternal(o.downloadPage); return; }
      downloading = true;
      const w = win(); if (w) w.setProgressBar(2); /* shows a busy bar until the first progress arrives */
      autoUpdater.downloadUpdate().catch(() => { downloading = false; });
    } else {
      write({ from: app.getVersion(), n: n + 1 });
    }
  });

  const check = () => { autoUpdater.checkForUpdates().catch(() => { /* offline */ }); };
  setTimeout(check, o.firstCheckMs || 6000);
  /* later checks only matter if the first one found nothing, because the prompt is shown once per opening */
  setInterval(() => { if (!asked) check(); }, 4 * 60 * 60 * 1000);
};
