# File Share by Evans Large (desktop app)

Send files and folders between computers over Wi-Fi or a cable network. Windows, Mac and Linux. **Both computers need the app.** Download page: `/tools/send-app/` (built from `tools_new/send_app.py`).

## How it works
- **Sender** picks files and presses Start sharing. The app starts a small HTTP server (TCP port 41874, any free port if that one is busy), makes a random 128 bit token and a 6 digit code, and announces itself by UDP broadcast (port 41873) while sharing.
- **Receiver** sees the sender in the nearby list, types the code (`POST /api/pair` returns the token), sees the files, picks a folder and downloads. If the network hides the sender, the receiver pastes the link or `ip:port` into the app.
- Files are served only by random id (never by path), with Range support. Each file is hashed (SHA-256) on the sender and verified on the receiver before the `.part` file is renamed. Downloads resume after a dropped connection.
- Five wrong codes lock the share. Sharing ends after two hours, on Stop, or on quit. The sender serves no web page, so a browser alone cannot download. Traffic is plain HTTP on the local network (not encrypted).

## The screens (v1.1.0)
Our own title bar (no system bar: `titleBarStyle: hidden`, the real minimise, maximise and close buttons are drawn over it on Windows and Linux; traffic lights inside it on Mac). A home with two big choices, Send and Receive. Each opens a guided flow with live checks: **Send** is Wi-Fi, Allow File Share, Choose files, Share the code. **Receive** is Wi-Fi, Allow File Share, Find the sender, Download. The Wi-Fi step re-checks every 2.5 seconds and turns green by itself, and shows per-system instructions plus an Open Wi-Fi settings button (it only opens the system page).

## Updates
`electron-updater` with a generic feed: `https://github.com/Evansrite1/portfolio/releases/download/send-latest/` (`latest.yml` and the installers). The workflow publishes every `send-v*` build to a versioned release and to `send-latest`, which is also what the download page links to. Windows and the AppImage download, verify (sha512) and install by themselves after the person presses Update now; Mac (unsigned) and .deb installs are sent to the download page. Checked at start and every 6 hours. Test with `FILESHARE_UPDATE_FEED` pointing at a folder that holds a newer `latest.yml` and a copy of the installer (and a temporary `dev-app-update.yml` when running from source): `FILESHARE_SMOKE_ROLE=update npx electron . --smoke`.

## The connection check (inside the app)
`lib/netcheck.js` looks for what stops another computer from reaching this one and offers a button that fixes it. Nothing is changed until the person presses the button, and the system asks for administrator permission itself.
- **Windows:** reads the firewall with PowerShell (`Get-NetFirewallProfile`, `Get-NetFirewallRule`). If the firewall is on and there is no rule for this exe, the button adds an inbound allow rule named "File Share by Evans Large" (`New-NetFirewallRule`, all profiles) through a UAC prompt.
- **Mac:** if the firewall is on, the button runs `socketfilterfw --add` and `--unblockapp` for the app through the macOS administrator prompt (`osascript`). The answer is remembered, because macOS cannot be asked.
- **Linux:** if `ufw` or `firewalld` is active, the button opens `ufw allow 41873/udp` and `41874/tcp` (or the firewalld equivalent) through `pkexec`.
- Also checks that a network is connected and that the discovery port could be opened.

## Code map
- `main.js`: window, IPC (only the app's own page may call it), keeps the computer awake during transfers.
- `preload.js`: the small API the page can use. `renderer/`: the screen (no node access, strict CSP, text set with `textContent`).
- `lib/safe.js` (names, paths, tokens), `lib/share-server.js` (sending), `lib/receiver.js` (pairing, download, resume, checksum), `lib/discovery.js` and `lib/net.js` (finding the other computer, choosing the right address and skipping VirtualBox, Docker and VPN adapters), `lib/netcheck.js` (the check and the fixes).
- `test/core.test.js`, `test/netcheck.test.js`: `npm test`. `test/smoke.js`: drives the real window (`npx electron . --smoke`).

## Develop
```
npm install
npm start
npm test
```
Two copies on one computer: set `FILESHARE_MULTI=1` and a different `FILESHARE_USERDATA` folder for each.

## Installers
Windows `File-Share-Setup.exe` (a real wizard: welcome page with side image, choose folder, progress, finish page with Open File Share; per user, no admin needed), Mac `File-Share-mac-arm64.pkg` and `File-Share-mac-x64.pkg` (installer packages; the `.dmg` files are built too), Linux `File-Share-linux-x64.deb` (installer) and `File-Share-linux-x64.AppImage` (no install). The workflow `.github/workflows/send-app.yml` builds all of them on a tag `send-v*` and attaches them to the release (never Latest, because the Presenter download uses `releases/latest`).

On a Windows PC without Developer Mode a local build fails while unpacking `winCodeSign` (symbolic links). Build locally with `npx electron-builder --win --x64 --publish never -c.win.signAndEditExecutable=false` (the exe then has no custom icon). CI does not have this problem.

## Not done yet
Encryption in transit (TLS with a pairing fingerprint), sending between different networks, code signing for Windows and Mac, a Mac and a Linux test run.
