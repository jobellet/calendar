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

        // Also delete potential edited version
        const editedId = `${id}_edited`;
        const editedImg = this.images.find(i => i.id === editedId);
        if (editedImg) {
            editedImg.deleted = true;
            await this._save(editedImg);
        }
    }

    findEventImage(event) {
        if (!event) return null;

        // Priority 1: Specific event image
        // Check for edited version first
        const editedIdMatch = this.images.find(img => img.id === `event:${event.id}_edited`);
        if (editedIdMatch) return editedIdMatch;

        const eventIdMatch = this.images.find(img => img.id === `event:${event.id}`);
        if (eventIdMatch) return eventIdMatch;

        // Priority 2: Category image
        const normalizedName = (event.name || '').trim().toLowerCase();
        // Look for exact matches (scope: calendar or all)
        const categoryMatches = this.images.filter(img => img.category && img.category === normalizedName);

        // Helper to find edited or original match
        const findMatch = (matches, calendarScope) => {
            const scopeMatches = matches.filter(img => img.calendar === calendarScope);
            const edited = scopeMatches.find(img => img.id.endsWith('_edited'));
            if (edited) return edited;
            // Prefer non-edited if edited doesn't exist.
            // But we must be careful not to pick "edited" of WRONG scope? No, scopeMatches filters that.
            // We just need to make sure we don't return an image whose ID ends in _edited if we look for general,
            // UNLESS it IS the edited version of the match.
            // Actually, if we filter by scope, we might have `cat:foo` and `cat:foo_edited`.
            // Both are in `scopeMatches`. We want `_edited` if present.
            return scopeMatches.find(img => img.id.endsWith('_edited')) || scopeMatches.find(img => !img.id.endsWith('_edited'));
        };

        let match = findMatch(categoryMatches, event.calendar);
        if (!match) {
            match = findMatch(categoryMatches, 'all');
        }
        if (match) {
            return match;
        }

        return null;
    }

    findImageByCategoryName(name) {
        const normalized = (name || '').trim().toLowerCase();
        const matches = this.images.filter(img => img.category === normalized);

        // Prefer 'all' scope or just first match
        // Also prefer edited versions

        const preferEdited = (list) => {
            const edited = list.find(img => img.id.endsWith('_edited'));
            return edited || list.find(img => !img.id.endsWith('_edited'));
        };

        const allScope = matches.filter(img => img.calendar === 'all');
        if (allScope.length > 0) {
            const best = preferEdited(allScope);
            if (best) return best;
        }

        return preferEdited(matches) || null;
    }

    getOriginalImage(id) {
        if (!id) return null;
        // If ID is already "original" (doesn't have _edited suffix), return it.
        // If ID has _edited suffix, strip it and find original.
        // Actually, the ID passed here might be the *displayed* image ID, which could be edited or not.

        let originalId = id;
        if (id.endsWith('_edited')) {
            originalId = id.substring(0, id.length - 7); // remove "_edited"
        }

        return this.images.find(img => img.id === originalId);
    }

    async saveCalendarImage(calendarName, dataUrl, crop = {}, originalDataUrl = null) {
        const id = `calendar:${calendarName}:__self__`;
        await this._saveImageVariants(id, { calendar: calendarName, category: null }, dataUrl, crop, originalDataUrl);
    }

    async saveCategoryImage(scope, category, dataUrl, crop = {}, originalDataUrl = null) {
        const normalizedCat = category.trim().toLowerCase();
        const id = `category:${scope}:${normalizedCat}`;
        await this._saveImageVariants(id, { calendar: scope, category: normalizedCat }, dataUrl, crop, originalDataUrl);
    }

    async saveEventImage(eventId, dataUrl, crop = {}, originalDataUrl = null) {
        const id = `event:${eventId}`;
        await this._saveImageVariants(id, { calendar: null, category: null, eventId: eventId }, dataUrl, crop, originalDataUrl);
    }

    async _saveImageVariants(baseId, commonProps, dataUrl, crop, originalDataUrl) {
        // If originalDataUrl is provided, it means we have a cropped version (dataUrl) AND the original.
        // Save Original: ID = baseId
        // Save Cropped: ID = baseId + '_edited'

        if (originalDataUrl) {
            // Save Original (no crop metadata needed usually, or default)
            const origMetadata = await this._extractMetadata(originalDataUrl);
            const origEntry = {
                ...commonProps,
                id: baseId,
                url: originalDataUrl,
                cropX: 50,
                cropY: 50,
                averageColor: origMetadata.averageColor,
                deleted: false
            };
            await this._save(origEntry);

            // Save Cropped
            const cropMetadata = await this._extractMetadata(dataUrl);
            const cropEntry = {
                ...commonProps,
                id: `${baseId}_edited`,
                url: dataUrl,
                cropX: 50, // Cropped image is already centered/composed
                cropY: 50,
                averageColor: cropMetadata.averageColor,
                deleted: false
            };
            await this._save(cropEntry);
        } else {
            // No original provided (e.g. upload without crop, or just update).
            // We save to baseId.
            // IMPORTANT: If we are replacing an image, we should probably clear any existing '_edited' version
            // to avoid confusion (showing old crop for new image).

            const metadata = await this._extractMetadata(dataUrl);
            const entry = {
                ...commonProps,
                id: baseId,
                url: dataUrl,
                cropX: crop.cropX || 50,
                cropY: crop.cropY || 50,
                averageColor: metadata.averageColor,
                deleted: false
            };
            await this._save(entry);

            // Check for and delete orphaned edited version
            const editedId = `${baseId}_edited`;
            const editedImg = this.images.find(i => i.id === editedId);
            if (editedImg) {
                editedImg.deleted = true;
                await this._save(editedImg);
            }
        }
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
