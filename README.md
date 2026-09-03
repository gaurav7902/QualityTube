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

QualityTube is a lightweight, cross-browser (Chrome + Firefox) Manifest V3 extension that waits for the active YouTube ad to finish and then opens the player settings to choose the highest available quality for the current account mode. If the user is flagged as Premium, it only considers enhanced-bitrate entries; otherwise it ignores premium-only entries. It never treats YouTube's Auto-selected resolution as “already set” and remembers each video ID plus premium mode internally so it does not keep reopening the settings menu just to check.

## Quick install

### Firefox

Available on addon store :)

Click Here 👉
[![Firefox](https://img.shields.io/badge/Firefox-Install-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/qualitytube/)

> Firefox's `host_permissions` are opt-in. If quality isn't applied after install, open the extensions panel → this extension → _Permissions_ tab → allow `youtube.com`.

### Chrome / Edge / Brave

<!-- ### Microsoft Edge

Available on Microsoft Edge Add-ons

Click Here 👉
[![Edge](https://img.shields.io/badge/Edge-Install-0078D7?logo=microsoft-edge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/codeforces-dark-theme/ahjnagbaenbiokkmamnjblanbejepfnh) -->

1. Download [`qualitytube-chrome-1.0.2.zip`](https://github.com/gaurav7902/QualityTube/raw/main/qualitytube-chrome-1.0.2.zip) from the repo root or the [latest release](https://github.com/gaurav7902/QualityTube/releases/tag/v1.0.2).
2. Unzip the file to a local folder.
3. Open your Chromium-based browser and go to `chrome://extensions/`, `edge://extensions/`, or `brave://extensions/` as appropriate.
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select `manifest.json` from the unzipped folder.
6. Open https://www.youtube.com, play a video, and confirm the player selects the highest available resolution.

## How it works

The content script waits for YouTube's `#movie_player` to exist, then rechecks on navigation and player updates. It deliberately does nothing while an ad is active, and only after the ad ends does it open the visible settings menu, navigate to Quality, and click the highest allowed item for the current premium mode. Premium users only see enhanced-bitrate quality entries; non-premium users ignore premium-only entries. It tracks the last explicitly applied video ID plus premium state internally so it can skip re-checking without opening the UI again, even when YouTube has automatically selected a high resolution.

## Packaging

Two shell scripts at the project root build the release archives and match the names produced by the GitHub Actions workflow in `.github/workflows/release-extension.yml`:

```bash
./build-chrome.sh    # creates qualitytube-chrome-<version>.zip in the repo root
./build-firefox.sh   # creates qualitytube-firefox-<version>.zip in the repo root
```

Pushing a change to `extension/**`, `build-chrome.sh`, `build-firefox.sh`, or the workflow on `main` automatically publishes both archives to a GitHub release whose tag matches the `version` field in each manifest.

## Privacy

QualityTube requests YouTube host access and `storage` permission for the Premium setting, has no background service worker, and does not collect, transmit, or sell any data. All extension files run locally; no network requests are made by the extension itself.

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
