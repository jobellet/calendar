class SettingsService {
    constructor() {
        this.leadTimeBounds = { min: 0, max: 1440, default: 10 };
        this.settings = this.load();
        this.translations = {
            'en-US': {
                start_now: "{event} starts now",
                start_soon: "{event} starts in {minutes} minutes"
            },
            'fr-FR': {
                start_now: "{event} commence maintenant",
                start_soon: "{event} commence dans {minutes} minutes"
            },
            'es-ES': {
                start_now: "{event} empieza ahora",
                start_soon: "{event} empieza en {minutes} minutos"
            },
            'de-DE': {
                start_now: "{event} beginnt jetzt",
                start_soon: "{event} beginnt in {minutes} Minuten"
            },
            'it-IT': {
                start_now: "{event} inizia ora",
                start_soon: "{event} inizia tra {minutes} minuti"
            }
        };
    }

    load() {
        const stored = localStorage.getItem('calendar_settings');
        const parsed = stored ? JSON.parse(stored) : {};
        return this.applyDefaults(parsed);
    }

    save(newSettings) {
        this.settings = this.applyDefaults({ ...this.settings, ...newSettings });
        localStorage.setItem('calendar_settings', JSON.stringify(this.settings));
    }

    getDefaults() {
        return {
            language: 'en-US',
            voiceEnabled: false,
            voiceLeadTime: this.leadTimeBounds.default,
            voiceAtStart: true
        };
    }

    applyDefaults(partialSettings) {
        const merged = { ...this.getDefaults(), ...partialSettings };
        merged.voiceLeadTime = this.sanitizeLeadTime(merged.voiceLeadTime);
        return merged;
    }

    sanitizeLeadTime(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return this.leadTimeBounds.default;
        const clamped = Math.min(Math.max(numeric, this.leadTimeBounds.min), this.leadTimeBounds.max);
        return Math.round(clamped);
    }

    getLeadTimeBounds() {
        return { ...this.leadTimeBounds };
    }

    get() {
        return this.settings;
    }

    getNotificationText(eventTitle, minutesBefore) {
        const lang = this.settings.language || 'en-US';
        const templates = this.translations[lang] || this.translations['en-US'];

        if (minutesBefore <= 0) {
             return templates.start_now.replace('{event}', eventTitle);
        } else {
             return templates.start_soon.replace('{event}', eventTitle).replace('{minutes}', minutesBefore);
        }
    }
}
