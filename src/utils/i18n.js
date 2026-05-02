import { translations } from '../data/translations.js';

class I18nService {
    constructor() {
        // Initialize from LocalStorage or default to Portuguese
        this.currentLang = localStorage.getItem('aeroproc_lang') || 'pt';
    }

    /**
     * Set the current language, save to LocalStorage, and trigger a UI update.
     * @param {string} lang - 'en' or 'pt'
     */
    setLanguage(lang) {
        if (!translations[lang]) {
            console.warn(`[i18n] Language '${lang}' not supported.`);
            return;
        }
        
        this.currentLang = lang;
        localStorage.setItem('aeroproc_lang', lang);
        
        // Dispatch global event so active components (like map popups) can react
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
        
        // Auto-update DOM elements tagged with data-i18n
        this.updateDOM();
    }

    /**
     * Get a translation by dot-notation path.
     * @param {string} path - e.g., 'sidebar.tools.draw'
     * @returns {string} The translated string or the original path if not found.
     */
    t(path) {
        if (!path) return '';
        
        const keys = path.split('.');
        let result = translations[this.currentLang];
        
        for (const key of keys) {
            if (result === undefined || result === null) break;
            result = result[key];
        }
        
        return result !== undefined ? result : path;
    }

    /**
     * Scans the document for [data-i18n], [data-i18n-title], and [data-i18n-placeholder] 
     * and updates them with current translations.
     * @param {HTMLElement|Document} root - The root node to scan
     */
    updateDOM(root = document) {
        // Update content (using innerHTML to support <br> tags)
        const elements = root.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.innerHTML = this.t(key);
            }
        });

        // Update titles (native tooltips)
        const titles = root.querySelectorAll('[data-i18n-title]');
        titles.forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) {
                // For titles, we MUST strip HTML tags like <br> because attributes are plain text
                const translated = this.t(key);
                el.title = translated.replace(/<br\s*\/?>/gi, '\n');
            }
        });

        // Update placeholders
        const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
        placeholders.forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) {
                el.placeholder = this.t(key);
            }
        });
    }
}

// Export as a singleton
export const i18n = new I18nService();
