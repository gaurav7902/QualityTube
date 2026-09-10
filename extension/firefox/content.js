// YouTube Auto Quality - Content Script
//
// 1. Ads: never touches the UI while `ad-showing`/`ad-interrupting` is on
//    the player; just re-checks shortly after.
// 2. Applying quality is ALWAYS done via real clicks (Settings -> Quality
//    -> resolution), for both premium and non-premium. The legacy
//    player.setPlaybackQuality()/setPlaybackQualityRange() calls were
//    removed: YouTube no longer reliably honors them on the watch page,
//    which is what caused it to work on some videos/accounts and silently
//    do nothing on others.
// 3. "Already at highest" is checked internally (no clicking) for the
//    current page session. A refreshed page goes through the click flow
//    again, even if YouTube's own "Auto" is already rendering the top
//    resolution.
// 4. The settings menu is closed again after selecting a quality (YouTube
//    normally does this itself, but we close it explicitly as a safety
//    net), and any attempt bails out cleanly if an ad starts mid-attempt.

class YouTubeQualityController {
    constructor() {
        this.applyTimer = null;
        this.isClicking = false;
        this.CLICK_DELAY = 300;
        this.hasPremium = false;
        this.enabled = true;
        this.storageReady = false;
        this.appliedVideos = {};
        this.activeVideoId = null;
        this.operationToken = 0;
        this.initStorage();
        this.initialize();
    }

    initStorage() {
        const storage = this.getStorage();
        if (storage) {
            this.storageGet(storage, {hasPremium: false, enabled: true}, (items) => {
                if (items) {
                    this.hasPremium = !!items.hasPremium;
                    this.enabled = items.enabled !== false;
                }
                this.storageReady = true;
                this.queueQuality(100);
            });
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
                if (changes.hasPremium || changes.enabled) {
                    if (changes.hasPremium) this.hasPremium = !!changes.hasPremium.newValue;
                    if (changes.enabled) this.enabled = changes.enabled.newValue !== false;
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
            if (result && typeof result.then === 'function') result.then(callback);
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

        this.queueQuality(2500);
    }

    queueQuality(delay) {
        clearTimeout(this.applyTimer);
        this.applyTimer = setTimeout(() => this.setQuality(), delay);
    }

    getPlayer() {
        return document.querySelector('#movie_player');
    }

    isAdShowing(player) {
        return (
            !!player &&
            (player.classList.contains('ad-showing') ||
                player.classList.contains('ad-interrupting'))
        );
    }

    isPremiumItem(item) {
        if (!item) return false;
        const text = (item.textContent || '').toLowerCase();
        if (text.includes('enhanced bitrate') || text.includes('premium')) {
            return true;
        }
        if (
            item.querySelector(
                '.ytp-menuitem-premium-badge, .ytp-premium-label, [data-is-premium="true"]',
            )
        ) {
            return true;
        }
        return false;
    }

    isSuperResolutionItem(item) {
        if (!item) return false;
        const text = (item.textContent || '').toLowerCase();
        return text.includes('super resolution');
    }

    // Best-effort stable id for "which video is this", so we can remember
    // that we've already applied quality to it without re-opening the
    // settings menu just to check.
    getVideoId(player) {
        try {
            if (typeof player.getVideoData === 'function') {
                const data = player.getVideoData();
                if (data && data.video_id) return data.video_id;
            }
        } catch (_error) {
            /* ignore */
        }
        try {
            const match = location.href.match(/[?&]v=([^&]+)/);
            if (match) return match[1];
        } catch (_error) {
            /* ignore */
        }
        return null;
    }

    setQuality() {
        const player = this.getPlayer();
        if (!player || this.isClicking || !this.storageReady || !this.enabled) return;

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
            this.operationToken += 1;
        }

        // Skip repeated player-update events after this page has applied a
        // quality to this exact video and account mode.
        if (
            videoId &&
            this.appliedVideos[`${videoId}:${this.hasPremium ? 'premium' : 'standard'}`]
        ) {
            return;
        }

        this.setQualityViaUI(player, videoId);
    }

    setQualityViaUI(player, videoId) {
        if (
            this.isClicking ||
            player.classList.contains('ytp-settings-menu-visible')
        )
            return;

        const settingsButton = player.querySelector('.ytp-settings-button');
        if (!settingsButton) return;

        this.isClicking = true;
        const operationToken = this.operationToken;
        // console.log('[QualityTube] Clicking settings button');
        settingsButton.click();

        setTimeout(() => {
            this.waitForQualityMenu(player, 5, false, videoId, operationToken);
        }, this.CLICK_DELAY);
    }

    closeSettingsMenu(player) {
        if (!player.classList.contains('ytp-settings-menu-visible')) return;
        const settingsButton = player.querySelector('.ytp-settings-button');
        if (settingsButton) settingsButton.click();
    }

    waitForQualityMenu(
        player,
        retries = 5,
        subMenuOpened = false,
        videoId = null,
        operationToken = this.operationToken,
    ) {
        const attemptApplyQuality = () => {
            if (operationToken !== this.operationToken || videoId !== this.getVideoId(player)) {
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
                return;
            }

            const rawQualityItems = Array.from(
                player.querySelectorAll(
                    ".ytp-quality-menu .ytp-menuitem, [role='menuitemradio']",
                ),
            ).filter((item) => this.getResolution(item) > 0 || this.isSuperResolutionItem(item));

            const qualityItems = rawQualityItems.filter((item) => {
                if (this.isSuperResolutionItem(item)) {
                    return true;
                }
                return this.hasPremium || !this.isPremiumItem(item);
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

                // No closeSettingsMenu() here: YouTube closes the settings
                // pane on its own the moment a quality option is picked.
                // Calling it ourselves right after was just re-clicking the
                // settings button and popping the (already-closed) pane
                // back open.
                this.isClicking = false;
                if (videoId) {
                    this.appliedVideos[
                        `${videoId}:${this.hasPremium ? 'premium' : 'standard'}`
                    ] = true;
                }
                return;
            }

            if (!subMenuOpened) {
                const qualityEntry = Array.from(
                    player.querySelectorAll('.ytp-panel-menu .ytp-menuitem'),
                ).find((item) => {
                    const label = item.querySelector('.ytp-menuitem-label');
                    return label && label.textContent.trim() === 'Quality';
                });
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
            }
        };

        attemptApplyQuality();
    }

    getResolution(item) {
        const match = item.textContent.match(/\b(\d{3,4})p(?:\d+)?\b/i);
        return match ? Number(match[1]) : 0;
    }
}

new YouTubeQualityController();
