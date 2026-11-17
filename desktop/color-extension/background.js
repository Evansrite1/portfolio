// Clicking the toolbar icon opens the picker in its own small window. A window (not the toolbar popup) is used on purpose:
// a popup closes the moment you click anywhere else, and picking a color means clicking somewhere else.
let winId = null;

chrome.action.onClicked.addListener(async () => {
  if (winId !== null) {
    try { await chrome.windows.update(winId, { focused: true }); return; } catch (e) { winId = null; }
  }
  const w = await chrome.windows.create({ url: chrome.runtime.getURL('picker.html'), type: 'popup', width: 400, height: 680 });
  winId = w.id;
});

chrome.windows.onRemoved.addListener((id) => { if (id === winId) winId = null; });
