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
        this.initialize();
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

    setQuality() {
        const player = this.getPlayer();
        if (!player) return;

        // No quality menu exists during an ad, and poking at player
        // controls mid-ad is exactly the kind of thing that causes odd
        // behavior. Skip and try again shortly after.
        if (this.isAdShowing(player)) {
            this.queueQuality(1500);
            return;
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
        if (player.classList.contains('ytp-settings-menu-visible')) return;

        const settingsButton = player.querySelector('.ytp-settings-button');
        if (!settingsButton) return;

        settingsButton.click();
        this.waitForQualityMenu(player);
    }

    waitForQualityMenu(player, retries = 5) {
        const attemptApplyQuality = () => {
            // Bail immediately if an ad started while we were waiting.
            if (this.isAdShowing(player)) return;

            const qualityItems = Array.from(
                player.querySelectorAll(
                    ".ytp-quality-menu .ytp-menuitem, [role='menuitemradio']",
                ),
            ).filter((item) => /\b\d{3,4}p\b/.test(item.textContent));

            const targetQuality = qualityItems.sort(
                (first, second) =>
                    this.getResolution(second) - this.getResolution(first),
            )[0];

            if (targetQuality) {
                targetQuality.click();
                // Close the settings menu again instead of leaving it open.
                player.querySelector('.ytp-settings-button')?.click();
                return;
            }

            const qualityEntry = Array.from(
                player.querySelectorAll('.ytp-panel-menu .ytp-menuitem'),
            ).find((item) => /\b\d{3,4}p\b/.test(item.textContent));
            if (qualityEntry) {
                qualityEntry.click();
            }

            if (retries > 0) {
                setTimeout(
                    () => this.waitForQualityMenu(player, retries - 1),
                    300,
                );
            }
        };

        setTimeout(attemptApplyQuality, 300);
    }

    getResolution(item) {
        const match = item.textContent.match(/\b(\d{3,4})p\b/);
        return match ? Number(match[1]) : 0;
    }
}

new YouTubeQualityController();
