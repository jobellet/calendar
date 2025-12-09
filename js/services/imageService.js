class ImageService {
    constructor(db) {
        this.db = db;
        this.images = [];
    }

    async load(includeDeleted = false) {
        this.images = await this.db.getAll('images');
        this.images = this._normalizeEntries(this.images);
        if (includeDeleted) return this.images;
        return this.images.filter(img => !img.deleted);
    }

    async delete(id) {
        const img = this.images.find(i => i.id === id);
        if (img) {
            img.deleted = true;
            await this._save(img);
        }
    }

    findEventImage(event) {
        if (!event) return null;

        // Priority 1: Specific event image
        const eventIdMatch = this.images.find(img => img.id === `event:${event.id}`);
        if (eventIdMatch) return eventIdMatch;

        // Priority 2: Category image
        const normalizedName = (event.name || '').trim().toLowerCase();
        const categoryMatches = this.images.filter(img => img.category && img.category === normalizedName);
        let match = categoryMatches.find(img => img.calendar === event.calendar);
        if (!match) {
            match = categoryMatches.find(img => img.calendar === 'all');
        }
        if (match) {
            return match;
        }

        // Priority 3: Calendar image (if no category match)
        // Actually, the user wants "event content" to be image if available.
        // If NO event image, NO category image, do we show calendar image?
        // Current logic says: yes, if calendar has one.
        // User request: "Ensuring Calendar Header Images Only... event content... event name OR event category image"
        // So we should REMOVE the calendar image fallback for EVENTS.
        // Wait, step 1 said "Confirming that images are exclusively displayed in calendar column headers...".
        // So if I return a calendar image here, it might be used in event content.
        // I should DELETE the fallback to calendar image here.
        return null;
    }

    findImageByCategoryName(name) {
        const normalized = (name || '').trim().toLowerCase();
        const matches = this.images.filter(img => img.category === normalized);
        // Prefer 'all' scope or just first match
        return matches.find(img => img.calendar === 'all') || matches[0] || null;
    }

    async saveCalendarImage(calendarName, dataUrl, crop = {}) {
        const id = `calendar:${calendarName}:__self__`;
        const metadata = await this._extractMetadata(dataUrl);
        const imageEntry = {
            id,
            calendar: calendarName,
            category: null,
            url: dataUrl,
            cropX: crop.cropX || 50,
            cropY: crop.cropY || 50,
            averageColor: metadata.averageColor,
        };
        await this._save(imageEntry);
    }

    async saveCategoryImage(scope, category, dataUrl, crop = {}) {
        const normalizedCat = category.trim().toLowerCase();
        const id = `category:${scope}:${normalizedCat}`;
        const metadata = await this._extractMetadata(dataUrl);
        const imageEntry = {
            id,
            calendar: scope,
            category: normalizedCat,
            url: dataUrl,
            cropX: crop.cropX || 50,
            cropY: crop.cropY || 50,
            averageColor: metadata.averageColor,
        };
        await this._save(imageEntry);
        await this._save(imageEntry);
    }

    async saveEventImage(eventId, dataUrl, crop = {}) {
        const id = `event:${eventId}`;
        const metadata = await this._extractMetadata(dataUrl);
        const imageEntry = {
            id,
            calendar: null,
            category: null,
            eventId: eventId,
            url: dataUrl,
            cropX: crop.cropX || 50,
            cropY: crop.cropY || 50,
            averageColor: metadata.averageColor,
        };
        await this._save(imageEntry);
    }

    async _save(imageEntry) {
        await this.db.save('images', imageEntry);
        const normalized = this._normalizeEntry(imageEntry);
        const existingIndex = this.images.findIndex(img => img.id === normalized.id);
        if (existingIndex >= 0) {
            this.images[existingIndex] = normalized;
        } else {
            this.images.push(normalized);
        }
    }

    _normalizeEntry(entry) {
        if (!entry) return null;
        const normalized = { ...entry };
        const parsedCropX = Number(normalized.cropX);
        const parsedCropY = Number(normalized.cropY);
        normalized.cropX = Number.isFinite(parsedCropX) ? parsedCropX : 50;
        normalized.cropY = Number.isFinite(parsedCropY) ? parsedCropY : 50;
        normalized.averageColor = normalized.averageColor || '#f5f5f5';
        return normalized;
    }

    _normalizeEntries(entries = []) {
        return entries
            .map(entry => this._normalizeEntry(entry))
            .filter(Boolean);
    }

    _extractMetadata(dataUrl) {
        if (!dataUrl) {
            return { averageColor: '#f5f5f5' };
        }
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve({ averageColor: '#f5f5f5' });
                    return;
                }
                try {
                    ctx.drawImage(img, 0, 0, 1, 1);
                    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                    const toHex = (value) => value.toString(16).padStart(2, '0');
                    resolve({ averageColor: `#${toHex(r)}${toHex(g)}${toHex(b)}` });
                } catch (error) {
                    resolve({ averageColor: '#f5f5f5' });
                }
            };
            img.onerror = () => resolve({ averageColor: '#f5f5f5' });
            img.src = dataUrl;
        });
    }
}
