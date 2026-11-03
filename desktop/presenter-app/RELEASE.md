# Presenter desktop app

An Electron app that loads the live Presenter from the website and puts the TV screen, full screen and without a window frame, on the second display by itself.

## How it fits together

- `main.js` makes the control window, finds the second display, and opens a borderless full screen TV window there. It follows the display when a screen is plugged in or removed.
- The app loads the Presenter from `config.json` (`site`), so new features reach everyone as soon as the website is updated. The app itself only needs a new release when this folder changes.
- The page talks to the app through `preload.js` (`window.presenterDesktop`).
- Updates: the Windows app downloads new releases by itself (electron-updater, GitHub releases). The unsigned Mac app only tells the user a new version exists, because macOS blocks silent updates for unsigned apps. Set `macSigned` to `true` in `config.json` once you have an Apple developer certificate.

## Try it on this computer

```
cd desktop/presenter-app
npm install
npm start
```

Use `PRESENTER_URL=http://localhost:8765 npm start` to run against a local copy of the site. The TV screen menu has "Show the TV screen in a window (for testing)" for computers with one screen.

## Make a release

1. Change `version` in `package.json` (for example 1.0.1) and commit.
2. Push a tag with the same number: `git tag v1.0.1` then `git push origin v1.0.1`.
3. The workflow in `.github/workflows/presenter-app.yml` builds Windows and Mac and attaches `Presenter-Setup.exe` and `Presenter-mac.dmg` to the release.
4. The website download button points at `releases/latest/download/`, so it picks the new files by itself.

## Build on this computer

`npm run dist:win` writes the installer to `dist/`. The Mac build needs a Mac (or the GitHub workflow).
