// The one place the version lives. A plain script loaded first; scFill() runs right after each version element,
// so the number shows on the first frame instead of after the app modules download.
window.SC_VERSION = 'Alpha 0.0.5b';
window.scFill = () => { for (const el of document.querySelectorAll('[data-version]')) el.textContent = el.dataset.version.replace('{v}', window.SC_VERSION); };
document.addEventListener('DOMContentLoaded', window.scFill);
