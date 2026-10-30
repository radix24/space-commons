// The one place the version lives. A plain script loaded before everything else, so the loading screen shows it at once.
window.SC_VERSION = 'Alpha 0.0.3a';
document.addEventListener('DOMContentLoaded', () => { for (const el of document.querySelectorAll('[data-version]')) el.textContent = el.dataset.version.replace('{v}', window.SC_VERSION); });
