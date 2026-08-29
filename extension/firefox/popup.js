document.addEventListener('DOMContentLoaded', () => {
    const closeButton = document.getElementById('close');
    const premiumCheckbox = document.getElementById('has-premium');

    if (closeButton) {
        closeButton.addEventListener('click', () => window.close());
    }

    const storage =
        typeof chrome !== 'undefined' && chrome.storage
            ? chrome.storage.sync || chrome.storage.local
            : typeof browser !== 'undefined' && browser.storage
              ? browser.storage.sync || browser.storage.local
              : null;

    if (premiumCheckbox && storage) {
        storage.get({hasPremium: false}, (items) => {
            if (items) {
                premiumCheckbox.checked = !!items.hasPremium;
            }
        });

        premiumCheckbox.addEventListener('change', () => {
            storage.set({hasPremium: premiumCheckbox.checked});
        });
    }
});
