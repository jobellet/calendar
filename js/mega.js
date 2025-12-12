class MegaSync {
    constructor() {
        this.storage = null;
        this.email = null;
    }

    isLoggedIn() {
        return !!this.storage;
    }

    async login(email, password) {
        if (!window.mega) {
            console.error('MegaJS library not loaded');
            return { success: false, error: 'Library not loaded' };
        }

        try {
            console.log(`[MegaSync] Logging in as ${email}...`);
            this.storage = new window.mega.Storage({
                email: email,
                password: password,
                userAgent: 'FamilyCalendar/1.0',
                keepalive: true,
                forceHttps: true
            });

            await this.storage.ready;
            this.email = email;
            console.log('[MegaSync] Login success');
            return { success: true };
        } catch (error) {
            console.error('[MegaSync] Login failed:', error);
            this.storage = null;
            return { success: false, error: error.message };
        }
    }

    async sync(localEvents, localCalendars, localImages) {
        if (!this.storage) {
            console.warn('[MegaSync] Cannot sync: Not logged in');
            return null;
        }

        console.log('[MegaSync] Starting sync...');
        const FILENAME = 'calendar_data_v2.json';

        try {
            // 1. Download Metadata (JSON)
            let remoteData = null;
            // Ensure we have the latest file list
            const jsonFile = this.storage.root.children.find(f => f.name === FILENAME);

            if (jsonFile) {
                console.log('[MegaSync] Found remote file, downloading...');
                try {
                    const buffer = await jsonFile.downloadBuffer();
                    const jsonStr = new TextDecoder("utf-8").decode(buffer);
                    try {
                        remoteData = JSON.parse(jsonStr);
                    } catch (e) {
                        console.error('[MegaSync] Failed to parse remote JSON:', e);
                    }
                } catch (err) {
                    console.error('[MegaSync] Error downloading/decrypting remote file:', err);
                    if (err.message && err.message.includes('MAC verification failed')) {
                        console.warn('[MegaSync] Remote file is corrupted. Treating as empty.');
                    } else {
                        throw err;
                    }
                }
            }

            // 2. Merge Data (Events, Calendars, Images Metadata)
            const merged = this.mergeData(
                { events: localEvents, calendars: localCalendars, images: localImages },
                remoteData
            );

            // 3. Upload New Images (Renamed by Category)
            await this.uploadNewImages(merged.images, merged.events);

            // 4. Download Needed Images (Current Week)
            await this.downloadNeededImages(merged.images, merged.events);

            // 5. Upload Merged Metadata (Strip URLs)
            const dataToSave = {
                events: merged.events,
                calendars: merged.calendars,
                images: merged.images.map(img => ({
                    ...img,
                    url: null // Strip URL for storage
                }))
            };

            const mergedJson = JSON.stringify(dataToSave);
            const encoder = new TextEncoder();
            const buffer = encoder.encode(mergedJson);

            console.log('[MegaSync] Uploading merged metadata...');

            if (jsonFile) {
                 try {
                     await jsonFile.delete();
                 } catch (e) {
                     console.warn('[MegaSync] Failed to delete old JSON file:', e);
                 }
            }

            const uploadStream = this.storage.upload({
                name: FILENAME,
                size: buffer.byteLength,
                allowUploadBuffering: true
            });

            uploadStream.end(buffer);
            await uploadStream.complete;

            console.log('[MegaSync] Sync complete.');

            // Return the merged data WITH URLs (so the app can display them)
            return merged;

        } catch (error) {
            console.error('[MegaSync] Sync error:', error);
            return null;
        }
    }

    async uploadNewImages(images, events) {
        console.log('[MegaSync] Checking for images to upload...');
        for (const img of images) {
            // Upload if we have data (url) but no filename (implies new/modified locally)
            if (img.url && img.url.startsWith('data:') && !img.filename) {
                const category = this.getCategoryForImage(img, events);
                const safeCat = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const ext = this.getExtensionFromDataUrl(img.url);
                // Renamed by category, ensure uniqueness with ID and Timestamp
                const timestamp = Date.now();
                const safeId = img.id.replace(/[^a-z0-9]/gi, '-');
                const filename = `${safeCat}_${safeId}_${timestamp}.${ext}`;

                console.log(`[MegaSync] Uploading image: ${filename}`);

                try {
                    const buffer = this.dataUrlToBuffer(img.url);
                    const uploadStream = this.storage.upload({
                        name: filename,
                        size: buffer.byteLength,
                        allowUploadBuffering: true
                    });

                    uploadStream.end(buffer);
                    await uploadStream.complete;

                    img.filename = filename; // Update metadata
                } catch (e) {
                    console.error(`[MegaSync] Failed to upload image ${filename}:`, e);
                }
            }
        }
    }

    async downloadNeededImages(images, events) {
        console.log('[MegaSync] Checking for needed images (Current Week)...');

        // 1. Determine Current Week Range
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
        startOfWeek.setHours(0,0,0,0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7); // Next Sunday

        // 2. Find Events in Range
        const currentEvents = events.filter(e => {
            if (e.deleted) return false;
            const start = new Date(e.start);
            const end = new Date(e.end || e.start);
            return end >= startOfWeek && start < endOfWeek;
        });

        // 3. Identify Needed Image IDs
        const neededIds = new Set();
        for (const ev of currentEvents) {
            neededIds.add(`event:${ev.id}_edited`);
            neededIds.add(`event:${ev.id}`);
            const normalizedName = (ev.name || '').trim().toLowerCase();
            const catImages = images.filter(i => i.category === normalizedName);
            catImages.forEach(i => neededIds.add(i.id));
        }

        // 4. Download
        for (const id of neededIds) {
            const img = images.find(i => i.id === id);
            if (img && img.filename && !img.url) {
                console.log(`[MegaSync] Downloading needed image: ${img.filename}`);
                try {
                    const file = this.storage.root.children.find(f => f.name === img.filename);
                    if (file) {
                        const buffer = await file.downloadBuffer();
                        const mime = this.getMimeFromFilename(img.filename);
                        const base64 = this.bufferToBase64(buffer);
                        img.url = `data:${mime};base64,${base64}`;
                    } else {
                        console.warn(`[MegaSync] File not found on remote: ${img.filename}`);
                    }
                } catch (e) {
                    console.error(`[MegaSync] Failed to download image ${img.filename}:`, e);
                }
            }
        }
    }

    getCategoryForImage(img, events) {
        if (img.category) return img.category;
        if (img.eventId) {
            const ev = events.find(e => e.id === img.eventId);
            if (ev && ev.name) return ev.name.trim();
        }
        return 'uncategorized';
    }

    mergeData(local, remote) {
        if (!remote) {
            return local;
        }

        const mergedEvents = this.mergeCollections(local.events, remote.events);
        const mergedCalendars = this.mergeCollections(local.calendars, remote.calendars, 'name');

        // Use true to preserve local URLs if filenames match
        const mergedImages = this.mergeCollections(local.images, remote.images, 'id', true);

        return {
            events: mergedEvents,
            calendars: mergedCalendars,
            images: mergedImages
        };
    }

    mergeCollections(localList, remoteList, key = 'id', preserveLocalUrl = false) {
        const localMap = new Map(localList.map(i => [i[key], i]));
        const remoteMap = new Map((remoteList || []).map(i => [i[key], i]));

        const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()]);
        const result = [];

        for (const k of allKeys) {
            const l = localMap.get(k);
            const r = remoteMap.get(k);

            if (l && r) {
                const lTime = l.updatedAt || 0;
                const rTime = r.updatedAt || 0;

                let winner;
                if (lTime >= rTime) {
                    winner = { ...l };
                } else {
                    winner = { ...r };
                }

                if (preserveLocalUrl) {
                    // Only preserve local URL if the filename hasn't changed (implies content is same version)
                    // If filenames differ, it means a new version exists (likely on remote if remote won, or we have new local if local won)
                    // If local won and has no filename (new upload needed), we keep local URL.

                    const filenamesMatch = (l.filename === winner.filename);
                    const localHasUrl = !!l.url;

                    if (localHasUrl) {
                        if (winner === l) {
                            // Local won. Keep URL.
                            // (If local was modified, filename is null, so we keep URL).
                        } else {
                            // Remote won.
                            // Only keep local URL if filename matches.
                            if (filenamesMatch) {
                                if (!winner.url) winner.url = l.url;
                            }
                            // If filenames don't match, remote is newer version.
                            // We discard local URL and let downloader fetch new file.
                        }
                    }
                }

                result.push(winner);
            } else if (l) {
                result.push(l);
            } else {
                result.push(r);
            }
        }
        return result;
    }

    // Helpers
    getExtensionFromDataUrl(url) {
        const match = url.match(/^data:image\/(\w+);base64,/);
        return match ? match[1] : 'png';
    }

    getMimeFromFilename(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
        if (ext === 'png') return 'image/png';
        if (ext === 'gif') return 'image/gif';
        if (ext === 'webp') return 'image/webp';
        return 'application/octet-stream';
    }

    dataUrlToBuffer(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    bufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}
