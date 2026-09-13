document.addEventListener('DOMContentLoaded', () => {
    const closeButton = document.getElementById('close');
    const enabledCheckbox = document.getElementById('enabled');
    const premiumCheckbox = document.getElementById('has-premium');
    const restartCheckbox = document.getElementById('restart-after-quality');

    if (closeButton) {
        closeButton.addEventListener('click', () => window.close());
    }

    const storage =
        typeof chrome !== 'undefined' && chrome.storage
            ? chrome.storage.sync || chrome.storage.local
            : typeof browser !== 'undefined' && browser.storage
              ? browser.storage.sync || browser.storage.local
              : null;

    const getStorage = (defaults, callback) => {
        try {
            const result = storage.get(defaults, callback);
            if (result && typeof result.then === 'function')
                result.then(callback);
        } catch (_error) {
            storage.get(defaults).then(callback);
        }
    };

    const setStorage = (values) => {
        try {
            const result = storage.set(values);
            if (result && typeof result.catch === 'function')
                result.catch(() => {});
        } catch (_error) {
            storage.set(values, () => {});
        }
    };

    if (storage) {
        getStorage(
            {enabled: true, hasPremium: false, restartAfterQuality: false},
            (items) => {
                if (items) {
                    if (enabledCheckbox)
                        enabledCheckbox.checked = items.enabled !== false;
                    if (premiumCheckbox)
                        premiumCheckbox.checked = !!items.hasPremium;
                    if (restartCheckbox)
                        restartCheckbox.checked = !!items.restartAfterQuality;
                }
            },
        );

        if (enabledCheckbox) {
            enabledCheckbox.addEventListener('change', () =>
                setStorage({enabled: enabledCheckbox.checked}),
            );
        }
        if (premiumCheckbox) {
            premiumCheckbox.addEventListener('change', () =>
                setStorage({hasPremium: premiumCheckbox.checked}),
            );
        }
        if (restartCheckbox) {
            restartCheckbox.addEventListener('change', () =>
                setStorage({restartAfterQuality: restartCheckbox.checked}),
            );
        }
    }
});
