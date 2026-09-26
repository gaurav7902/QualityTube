// YouTube Auto Quality - Content Script
//
// 1. Ads: never touches the UI while an ad state is active
//    the player; just re-checks shortly after.
// 2. Applying quality always uses the visible settings menu, so YouTube's
//    adaptive "Auto" selection is never treated as good enough.
// 3. A quality is applied once per video for the current
//    page session. A refreshed page goes through the click flow again.
// 4. A quality is recorded only after YouTube marks it selected; unavailable
//    tiers fall back to the next enabled item.

class YouTubeQualityController {
    constructor() {
        this.applyTimer = null;
        this.isClicking = false;
        this.isWaitingForSettings = false;
        this.CLICK_DELAY = 150;
        this.MENU_OPEN_DELAY = 250;
        this.MENU_RETRIES = 10;
        this.SETTINGS_READY_TIMEOUT = 1500;
        this.enabled = true;
        this.hasPremium = false;
        this.restartAfterQuality = false;
        this.storageReady = false;
        this.appliedVideos = {};
        this.rejectedQualityLabels = new Set();
        this.superResolutionQualityKeys = new Set();
        this.enhancedBitrateQualityKeys = new Set();
        this.activeVideoId = null;
        this.operationToken = 0;
        this.initStorage();
        this.initialize();
    }

    initStorage() {
        const storage = this.getStorage();
        if (storage) {
            this.storageGet(
                storage,
                {enabled: true, hasPremium: false, restartAfterQuality: false},
                (items) => {
                    if (items) {
                        this.enabled = items.enabled !== false;
                        this.hasPremium = !!items.hasPremium;
                        this.restartAfterQuality = !!items.restartAfterQuality;
                    }
                    this.storageReady = true;
                    this.queueQuality(100);
                },
            );
        } else {
            this.storageReady = true;
        }

        const storageArea =
            typeof chrome !== 'undefined' && chrome.storage
                ? chrome.storage
                : typeof browser !== 'undefined' && browser.storage
                  ? browser.storage
                  : null;

        if (storageArea && storageArea.onChanged) {
            storageArea.onChanged.addListener((changes) => {
                if (changes.hasPremium) {
                    this.hasPremium = !!changes.hasPremium.newValue;
                    this.operationToken += 1;
                    this.queueQuality(100);
                }
                if (changes.restartAfterQuality) {
                    this.restartAfterQuality =
                        !!changes.restartAfterQuality.newValue;
                }
                if (changes.enabled) {
                    if (changes.enabled)
                        this.enabled = changes.enabled.newValue !== false;
                    this.operationToken += 1;
                    this.queueQuality(100);
                }
            });
        }
    }

    getStorage() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            return chrome.storage.sync || chrome.storage.local;
        }
        if (typeof browser !== 'undefined' && browser.storage) {
            return browser.storage.sync || browser.storage.local;
        }
        return null;
    }

    storageGet(storage, defaults, callback) {
        try {
            const result = storage.get(defaults, callback);
            if (result && typeof result.then === 'function')
                result.then(callback);
        } catch (_error) {
            storage.get(defaults).then(callback);
        }
    }

    initialize() {
        document.addEventListener('yt-navigate-finish', () => {
            this.operationToken += 1;
            this.queueQuality(1500);
        });

        window.addEventListener('yt-player-updated', () => {
            this.queueQuality(800);
        });

        document.addEventListener(
            'loadedmetadata',
            (event) => {
                if (event.target instanceof HTMLVideoElement) {
                    this.queueQuality(1000);
                }
            },
            true,
        );

        // YouTube can replace the player during SPA navigation without
        // dispatching every player event. Watch only for a new player root;
        // this avoids polling the whole page or reacting to ordinary UI DOM
        // updates.
        new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (
                        node.nodeType === Node.ELEMENT_NODE &&
                        node.id === 'movie_player'
                    ) {
                        this.queueQuality(800);
                        return;
                    }
                }
            }
        }).observe(document.documentElement, {childList: true, subtree: true});

        this.queueQuality(1200);
    }

    queueQuality(delay) {
        clearTimeout(this.applyTimer);
        this.applyTimer = setTimeout(() => this.setQuality(), delay);
    }

    getPlayer() {
        return document.querySelector('#movie_player');
    }

    isAdShowing(player) {
        if (!player) return false;
        if (
            player.classList.contains('ad-showing') ||
            player.classList.contains('ad-interrupting')
        ) {
            return true;
        }

        // The player classes can arrive a moment after the ad UI. Check the
        // visible, ad-specific controls as a second signal so the Settings
        // button is never clicked in that gap.
        return Array.from(
            player.querySelectorAll(
                '.ytp-ad-player-overlay, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-preview-container',
            ),
        ).some((element) => {
            const style = window.getComputedStyle(element);
            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                element.getClientRects().length > 0
            );
        });
    }

    isSuperResolutionItem(item) {
        if (!item) return false;
        if (this.getItemLabel(item).includes('super resolution')) return true;
        const match = this.getItemLabel(item).match(/\b\d{3,4}p\d*\b/i);
        return (
            !!match &&
            this.superResolutionQualityKeys.has(match[0].toLowerCase())
        );
    }

    isEnhancedBitrateItem(item) {
        if (!item) return false;
        if (this.getItemLabel(item).includes('enhanced bitrate')) return true;
        const match = this.getItemLabel(item).match(/\b\d{3,4}p\d*\b/i);
        return (
            !!match &&
            this.enhancedBitrateQualityKeys.has(match[0].toLowerCase())
        );
    }

    getItemLabel(item) {
        return [
            item.textContent,
            item.getAttribute('aria-label'),
            item.getAttribute('data-tooltip-text'),
            item.getAttribute('title'),
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
    }

    getSuperResolutionQualityKeys() {
        return this.getPaygatedQualityKeys('super resolution');
    }

    getPaygatedQualityKeys(indicator) {
        const keys = new Set();
        const escapedIndicator = indicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern =
            new RegExp(
                `key\\s*:\\s*['"]([^'"]+)['"][\\s\\S]{0,300}?paygatedIndicatorText\\s*:\\s*['"]${escapedIndicator}['"]`,
                'gi',
            );
        for (const script of document.scripts) {
            let match;
            while ((match = pattern.exec(script.textContent || ''))) {
                const quality = match[1].match(/\b\d{3,4}p\d*\b/i);
                if (quality) keys.add(quality[0].toLowerCase());
            }
        }
        return keys;
    }

    // Best-effort stable id for "which video is this", so we can remember
    // that we've already applied quality to it without re-opening the
    // settings menu just to check.
    getVideoId(player) {
        try {
            const url = new URL(location.href);
            const queryVideoId = url.searchParams.get('v');
            if (queryVideoId) return queryVideoId;
            const pathMatch = url.pathname.match(
                /\/(?:shorts|embed)\/([^/?#]+)/,
            );
            if (pathMatch) return pathMatch[1];
        } catch (_error) {
            /* ignore */
        }
        try {
            if (typeof player.getVideoData === 'function') {
                const data = player.getVideoData();
                if (data && data.video_id) return data.video_id;
            }
        } catch (_error) {
            /* ignore */
        }
        try {
            return `${location.pathname}${location.search}`;
        } catch (_error) {
            /* ignore */
        }
        return null;
    }

    setQuality() {
        const player = this.getPlayer();
        if (!player || this.isClicking || !this.storageReady || !this.enabled)
            return;

        // No quality menu exists during an ad, and poking at player
        // controls mid-ad is exactly the kind of thing that causes odd
        // behavior. Skip and try again shortly after.
        if (this.isAdShowing(player)) {
            this.queueQuality(1500);
            return;
        }

        const videoId = this.getVideoId(player);
        if (videoId !== this.activeVideoId) {
            this.activeVideoId = videoId;
            // This controller only needs to remember the video currently in
            // the player. Clearing old entries keeps a long YouTube SPA
            // session from accumulating an unbounded list of watched ids.
            this.appliedVideos = {};
            this.rejectedQualityLabels.clear();
            this.superResolutionQualityKeys =
                this.getSuperResolutionQualityKeys();
            this.enhancedBitrateQualityKeys =
                this.getPaygatedQualityKeys('enhanced bitrate');
            this.operationToken += 1;
        }

        // Skip repeated player-update events after this page has applied a
        // quality to this exact video.
        const appliedKey = `${videoId}:${this.hasPremium ? 'premium' : 'standard'}`;
        if (videoId && this.appliedVideos[appliedKey]) {
            return;
        }

        this.setQualityViaUI(player, videoId);
    }

    setQualityViaUI(player, videoId, skipReadinessCheck = false) {
        if (this.isClicking || this.isWaitingForSettings) return;

        // Do not interfere with a settings menu the viewer already opened.
        // Requeue so this is not a one-shot failure once it is closed.
        if (player.classList.contains('ytp-settings-menu-visible')) {
            this.queueQuality(1500);
            return;
        }

        // The hidden panel is normally rendered before the visible controls.
        // Waiting for its Quality row prevents opening a half-built menu just
        // to close and reopen it once YouTube finishes its async UI work.
        if (!skipReadinessCheck && !this.getQualityEntry(player)) {
            this.waitForSettingsReady(player, videoId);
            return;
        }

        const settingsButton = player.querySelector('.ytp-settings-button');
        if (!settingsButton) return;

        // Recheck at the last possible moment: an ad can start after the
        // readiness check but before this click.
        if (this.isAdShowing(player)) {
            this.queueQuality(1500);
            return;
        }

        this.isClicking = true;
        const operationToken = this.operationToken;
        // console.log('[QualityTube] Clicking settings button');
        settingsButton.click();

        setTimeout(() => {
            this.waitForQualityMenu(
                player,
                this.MENU_RETRIES,
                false,
                videoId,
                operationToken,
            );
        }, this.MENU_OPEN_DELAY);
    }

    closeSettingsMenu(player) {
        if (!player.classList.contains('ytp-settings-menu-visible')) return;
        const settingsButton = player.querySelector('.ytp-settings-button');
        if (settingsButton) settingsButton.click();
    }

    getVisibleSettingsMenu(player) {
        return Array.from(player.querySelectorAll('.ytp-settings-menu')).find(
            (menu) => {
                const style = window.getComputedStyle(menu);
                return (
                    !menu.hidden &&
                    menu.getAttribute('aria-hidden') !== 'true' &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    menu.getClientRects().length > 0
                );
            },
        );
    }

    getQualityEntry(root) {
        return Array.from(
            root.querySelectorAll(
                '.ytp-panel-menu .ytp-menuitem, .ytp-panel-menu [role="menuitem"]',
            ),
        ).find((item) => {
            const value = item.querySelector('.ytp-menuitem-content');
            return (
                value &&
                (/\b\d{3,4}p(?:\d+)?\b/i.test(value.textContent) ||
                    /\bquality\b/i.test(this.getItemLabel(item))) &&
                item.getAttribute('role') === 'menuitem' &&
                item.getAttribute('aria-haspopup') === 'true'
            );
        });
    }

    waitForSettingsReady(player, videoId) {
        this.isWaitingForSettings = true;
        const operationToken = this.operationToken;
        let settled = false;
        let observer = null;

        const finish = (callback) => {
            if (settled) return;
            settled = true;
            if (observer) observer.disconnect();
            this.isWaitingForSettings = false;
            callback();
        };

        const openOrRetry = (allowUnreadyMenu = false) => {
            if (
                operationToken !== this.operationToken ||
                videoId !== this.getVideoId(player)
            ) {
                finish(() => this.queueQuality(800));
                return;
            }
            if (this.isAdShowing(player)) {
                finish(() => this.queueQuality(1500));
                return;
            }
            if (allowUnreadyMenu || this.getQualityEntry(player)) {
                finish(() =>
                    this.setQualityViaUI(player, videoId, allowUnreadyMenu),
                );
            }
        };

        observer = new MutationObserver(() => openOrRetry());
        observer.observe(player, {childList: true, subtree: true});
        openOrRetry();

        // Some experiments lazily create the panel only after Settings is
        // opened. Fall back once, rather than permanently waiting for markup
        // that cannot exist yet.
        setTimeout(() => openOrRetry(true), this.SETTINGS_READY_TIMEOUT);
    }

    waitForQualityMenu(
        player,
        retries = this.MENU_RETRIES,
        subMenuOpened = false,
        videoId = null,
        operationToken = this.operationToken,
    ) {
        const attemptApplyQuality = () => {
            if (
                operationToken !== this.operationToken ||
                videoId !== this.getVideoId(player)
            ) {
                this.closeSettingsMenu(player);
                this.isClicking = false;
                return;
            }
            // Bail immediately if an ad started while we were waiting.
            // Don't record this video here — we haven't actually set
            // anything, so the next attempt (once the ad ends) must run
            // for real instead of being skipped as "already handled".
            if (this.isAdShowing(player)) {
                this.closeSettingsMenu(player);
                this.isClicking = false;
                this.queueQuality(1500);
                return;
            }

            const settingsMenu = this.getVisibleSettingsMenu(player);
            const rawQualityItems =
                subMenuOpened && settingsMenu
                    ? Array.from(
                          settingsMenu.querySelectorAll(
                              ".ytp-quality-menu .ytp-menuitem, .ytp-quality-menu [role='menuitemradio'], [role='menuitemradio']",
                          ),
                      ).filter(
                          (item) =>
                              this.getResolution(item) > 0 ||
                              this.isSuperResolutionItem(item),
                      )
                    : [];

            const qualityItems = rawQualityItems.filter((item) => {
                const label = item.textContent.trim();
                return (
                    !/^auto\b/i.test(label) &&
                    !this.isDisabled(item) &&
                    (this.hasPremium || !this.isEnhancedBitrateItem(item)) &&
                    !this.rejectedQualityLabels.has(label)
                );
            });

            const targetQuality = qualityItems.sort((first, second) => {
                const firstSuper = this.isSuperResolutionItem(first) ? 1 : 0;
                const secondSuper = this.isSuperResolutionItem(second) ? 1 : 0;
                if (firstSuper !== secondSuper) {
                    return secondSuper - firstSuper;
                }

                return this.getResolution(second) - this.getResolution(first);
            })[0];

            if (targetQuality) {
                const selectedQuality = targetQuality.textContent.trim();

                // console.log(
                //     `[QualityTube] Clicking quality option: ${selectedQuality}`,
                // );
                targetQuality.click();
                this.confirmQualitySelection(
                    player,
                    targetQuality,
                    selectedQuality,
                    videoId,
                    operationToken,
                );
                return;
            }

            if (!subMenuOpened && settingsMenu) {
                const qualityEntry = this.getQualityEntry(settingsMenu);
                if (qualityEntry) {
                    // console.log('[QualityTube] Clicking quality submenu entry');
                    qualityEntry.click();
                    subMenuOpened = true;
                }
            }

            if (retries > 0) {
                setTimeout(
                    () =>
                        this.waitForQualityMenu(
                            player,
                            retries - 1,
                            subMenuOpened,
                            videoId,
                            operationToken,
                        ),
                    this.CLICK_DELAY,
                );
            } else {
                // Ran out of retries without finding a quality item
                // (e.g. menu didn't render in time) — don't mark this
                // video as handled, so the next trigger tries again.
                this.closeSettingsMenu(player);
                this.isClicking = false;
                this.queueQuality(1500);
            }
        };

        attemptApplyQuality();
    }

    getResolution(item) {
        const match = item.textContent.match(/\b(\d{3,4})p(?:\d+)?\b/i);
        return match ? Number(match[1]) : 0;
    }

    isDisabled(item) {
        return (
            item.hasAttribute('disabled') ||
            item.getAttribute('aria-disabled') === 'true'
        );
    }

    confirmQualitySelection(player, item, label, videoId, operationToken) {
        setTimeout(() => {
            // Some player versions close and replace the quality submenu
            // before updating the old menu item's aria state. A closed
            // settings menu is YouTube's normal success signal after a
            // quality choice, so do not falsely blacklist that choice.
            const menuClosed = !player.classList.contains(
                'ytp-settings-menu-visible',
            );
            const wasSelected =
                item.getAttribute('aria-checked') === 'true' ||
                item.classList.contains('ytp-menuitem-selected') ||
                menuClosed;
            this.isClicking = false;

            if (
                operationToken !== this.operationToken ||
                this.isAdShowing(player)
            ) {
                this.queueQuality(1500);
                return;
            }

            if (wasSelected) {
                if (videoId) {
                    this.appliedVideos[
                        `${videoId}:${this.hasPremium ? 'premium' : 'standard'}`
                    ] = true;
                }
                if (this.restartAfterQuality) this.restartFromBeginning(player);
                return;
            }

            // A displayed tier can still be unavailable to the account.
            // Never trust the account type in storage: exclude the rejected
            // item and let the next attempt choose the next enabled quality.
            this.rejectedQualityLabels.add(label);
            this.closeSettingsMenu(player);
            this.queueQuality(500);
        }, this.MENU_OPEN_DELAY);
    }

    restartFromBeginning(player) {
        try {
            if (typeof player.seekTo === 'function') {
                player.seekTo(0, true);
                return;
            }
        } catch (_error) {
            // Fall through to the media element when the player API is not
            // available from the content-script world.
        }

        const video = player.querySelector('video');
        if (!video) return;
        try {
            if (typeof video.fastSeek === 'function') video.fastSeek(0);
            else video.currentTime = 0;
        } catch (_error) {
            // Seeking is best effort; a stream can briefly be non-seekable.
        }
    }
}

new YouTubeQualityController();
