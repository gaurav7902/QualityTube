// YouTube Auto Quality - Content Script (corrected)
//
// Key changes from the original:
// 1. Prefers the player's built-in API (same methods as YouTube's IFrame
//    Player API) instead of simulating clicks through the settings menu.
//    This avoids touching the visible UI at all in the common case.
// 2. Explicitly detects and skips ad playback, so it never tries to open
//    a quality menu that doesn't exist mid-ad.
// 3. Skips work entirely if the video is already at the best quality.
// 4. UI-click path (only used as a fallback) closes the settings menu
//    again afterward instead of leaving it open, and bails immediately
//    if an ad starts mid-attempt.

class YouTubeQualityController {
    constructor() {
        this.applyTimer = null;
        this.isClicking = false;
        this.CLICK_DELAY = 300;
        this.hasPremium = false;
        this.initStorage();
        this.initialize();
    }

    initStorage() {
        const storage = this.getStorage();
        if (storage) {
            storage.get({hasPremium: false}, (items) => {
                if (items) {
                    this.hasPremium = !!items.hasPremium;
                }
            });
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

    initialize() {
        document.addEventListener('yt-navigate-finish', () => {
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

    setQuality() {
        const player = this.getPlayer();
        if (!player || this.isClicking) return;

        // No quality menu exists during an ad, and poking at player
        // controls mid-ad is exactly the kind of thing that causes odd
        // behavior. Skip and try again shortly after.
        if (this.isAdShowing(player)) {
            this.queueQuality(1500);
            return;
        }

        if (typeof player.getAvailableQualityData === 'function') {
            const qualityData = player.getAvailableQualityData();
            const hasPaygatedOption =
                Array.isArray(qualityData) &&
                qualityData.some(
                    (item) =>
                        item.paygatedQualityDetails ||
                        (item.qualityLabel &&
                            /premium|enhanced bitrate/i.test(
                                item.qualityLabel,
                            )),
                );

            if (this.hasPremium && hasPaygatedOption) {
                const currentLabel =
                    typeof player.getPlaybackQualityLabel === 'function'
                        ? player.getPlaybackQualityLabel()
                        : null;
                if (
                    currentLabel &&
                    /premium|enhanced bitrate/i.test(currentLabel)
                ) {
                    return; // already on Enhanced Bitrate, nothing to do
                }
                this.setQualityViaUI(player);
                return;
            }
        }

        // Preferred path: call the player's own API directly. This is the
        // same interface YouTube's IFrame Player API uses, so it's stable
        // and doesn't require simulating any clicks.
        if (typeof player.getAvailableQualityLevels === 'function') {
            const levels = player.getAvailableQualityLevels();
            if (!levels || levels.length === 0) return;

            const best = levels[0]; // YouTube returns levels best-first
            const current =
                typeof player.getPlaybackQuality === 'function'
                    ? player.getPlaybackQuality()
                    : null;

            if (current === best) return; // already at best, nothing to do

            if (typeof player.setPlaybackQualityRange === 'function') {
                player.setPlaybackQualityRange(best, best);
            } else if (typeof player.setPlaybackQuality === 'function') {
                player.setPlaybackQuality(best);
            }
            return;
        }

        // Fallback only: the API wasn't available for some reason.
        this.setQualityViaUI(player);
    }

    setQualityViaUI(player) {
        if (
            this.isClicking ||
            player.classList.contains('ytp-settings-menu-visible')
        )
            return;

        const settingsButton = player.querySelector('.ytp-settings-button');
        if (!settingsButton) return;

        this.isClicking = true;
        settingsButton.click();

        setTimeout(() => {
            this.waitForQualityMenu(player);
        }, this.CLICK_DELAY);
    }

    waitForQualityMenu(player, retries = 5, subMenuOpened = false) {
        const attemptApplyQuality = () => {
            // Bail immediately if an ad started while we were waiting.
            if (this.isAdShowing(player)) {
                this.isClicking = false;
                return;
            }

            const rawQualityItems = Array.from(
                player.querySelectorAll(
                    ".ytp-quality-menu .ytp-menuitem, [role='menuitemradio']",
                ),
            ).filter((item) => /\b\d{3,4}p\b/.test(item.textContent));

            let qualityItems = rawQualityItems;

            if (!this.hasPremium) {
                qualityItems = qualityItems.filter(
                    (item) => !this.isPremiumItem(item),
                );
            }

            const targetQuality = qualityItems.sort((first, second) => {
                const resFirst = this.getResolution(first);
                const resSecond = this.getResolution(second);
                if (resSecond !== resFirst) {
                    return resSecond - resFirst;
                }
                if (this.hasPremium) {
                    const isPremFirst = this.isPremiumItem(first) ? 1 : 0;
                    const isPremSecond = this.isPremiumItem(second) ? 1 : 0;
                    return isPremSecond - isPremFirst;
                }
                return 0;
            })[0];

            if (targetQuality) {
                const isAlreadySelected =
                    targetQuality.getAttribute('aria-checked') === 'true' ||
                    targetQuality.ariaChecked === 'true';

                if (!isAlreadySelected) {
                    targetQuality.click();
                }

                setTimeout(() => {
                    this.isClicking = false;
                }, this.CLICK_DELAY);
                return;
            }

            if (!subMenuOpened) {
                const qualityEntry = Array.from(
                    player.querySelectorAll('.ytp-panel-menu .ytp-menuitem'),
                ).find((item) => /\b\d{3,4}p\b/.test(item.textContent));
                if (qualityEntry) {
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
                        ),
                    this.CLICK_DELAY,
                );
            } else {
                this.isClicking = false;
            }
        };

        attemptApplyQuality();
    }

    getResolution(item) {
        const match = item.textContent.match(/\b(\d{3,4})p\b/);
        return match ? Number(match[1]) : 0;
    }
}

new YouTubeQualityController();
