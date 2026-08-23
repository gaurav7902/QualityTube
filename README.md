# QualityTube

### Quick Navigation

- [Overview](#overview)
- [Quick install](#quick-install-developer-mode)
    - [Firefox](#firefox)
    - [Chrome / Edge / Brave](#chrome--edge--brave)
- [How it works](#how-it-works)
- [Packaging](#packaging)
- [Privacy](#privacy)
- [Authors](#authors)
- [License](#license)

## Overview

QualityTube is a lightweight, cross-browser (Chrome + Firefox) Manifest V3 extension that automatically selects the highest quality YouTube makes available for each video, including 8K when offered. It only interacts with YouTube's visible player UI — never with ads, network traffic, or page scripts — so it stays friendly to YouTube's ad-blocker heuristics.

## Quick install (developer mode)

### Firefox

1. Download [`qualitytube-firefox-1.0.0.zip`](https://github.com/gaurav7902/QualityTube/raw/main/qualitytube-firefox-1.0.0.zip) from the repo root or the [latest release](https://github.com/gaurav7902/QualityTube/releases/tag/v1.0.0).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `manifest.json` from the extracted folder.
5. Open a YouTube watch page — the player should switch to the highest available resolution.

> Firefox's `host_permissions` are opt-in. If quality isn't applied after install, open the extensions panel → this extension → _Permissions_ tab → allow `youtube.com`.

### Chrome / Edge / Brave

1. Download [`qualitytube-chrome-1.0.0.zip`](https://github.com/gaurav7902/QualityTube/raw/main/qualitytube-chrome-1.0.0.zip) from the repo root or the [latest release](https://github.com/gaurav7902/QualityTube/releases/tag/v1.0.0).
2. Unzip the file to a local folder.
3. Open your Chromium-based browser and go to `chrome://extensions/`, `edge://extensions/`, or `brave://extensions/` as appropriate.
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select `manifest.json` from the unzipped folder.
6. Open https://www.youtube.com, play a video, and confirm the player selects the highest available resolution.

## How it works

The content script waits for YouTube's `#movie_player` (`.html5-video-player`) to load, then clicks the visible settings button, opens the quality submenu, and selects the menu item whose text contains the largest `\d{3,4}p` value. It re-applies on `yt-navigate-finish`, `yt-player-updated`, and `loadedmetadata` so SPA navigation and replays are covered. No player-internal APIs, network interception, or ad DOM selectors are used.

## Packaging

Two shell scripts at the project root build the release archives and match the names produced by the GitHub Actions workflow in `.github/workflows/release-extension.yml`:

```bash
./build-chrome.sh    # creates qualitytube-chrome-<version>.zip in the repo root
./build-firefox.sh   # creates qualitytube-firefox-<version>.zip in the repo root
```

Pushing a change to `extension/**`, `build-chrome.sh`, `build-firefox.sh`, or the workflow on `main` automatically publishes both archives to a GitHub release whose tag matches the `version` field in each manifest.

## Privacy

QualityTube requests only the `https://www.youtube.com/*` host permission, has no background service worker, and does not collect, transmit, or sell any data. All extension files run locally; no network requests are made by the extension itself.

## Authors

<div align="center">
   <table><tr>
      <td><img src="https://github.com/gaurav7902.png" width="96" style="border-radius:50%; border:3px solid #000;" alt="gaurav7902"></td>
      <td style="padding-left:12px">
         <h3><a href="https://github.com/gaurav7902">gaurav7902</a></h3>
         <p>Maintainer • Open to contributions</p>
         <p><a href="https://github.com/gaurav7902"><img src="https://img.shields.io/badge/Follow-@gaurav7902-0366d6?style=flat-square&logo=github" alt="Follow" /></a></p>
      </td>
   </tr></table>
</div>

## License

[MIT License](LICENSE)
