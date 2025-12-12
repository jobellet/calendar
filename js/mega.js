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
            // 1. Try to find the file
            let remoteData = null;
            // Ensure we have the latest file list if keepalive didn't catch it yet (though keepalive should)
            const file = this.storage.root.children.find(f => f.name === FILENAME);

            if (file) {
                console.log('[MegaSync] Found remote file, downloading...');
                try {
                    const buffer = await file.downloadBuffer();
                    const jsonStr = new TextDecoder("utf-8").decode(buffer);
                    try {
                        remoteData = JSON.parse(jsonStr);
                    } catch (e) {
                        console.error('[MegaSync] Failed to parse remote JSON:', e);
                    }
                } catch (err) {
                    console.error('[MegaSync] Error downloading/decrypting remote file:', err);
                    if (err.message && err.message.includes('MAC verification failed')) {
                        console.warn('[MegaSync] Remote file is corrupted (MAC verification failed). Treating as empty and will overwrite.');
                        // remoteData remains null, so we will sync local -> remote (overwriting corrupted file)
                    } else {
                        throw err; // Re-throw other errors
                    }
                }
            }

            // 2. Merge data
            const merged = this.mergeData(
                { events: localEvents, calendars: localCalendars, images: localImages },
                remoteData
            );

            // 3. Upload merged data
            const mergedJson = JSON.stringify(merged);
            const encoder = new TextEncoder();
            const buffer = encoder.encode(mergedJson);

            console.log('[MegaSync] Uploading merged data...');

            // Robust upload with retries and explicit size
            const uploadStream = this.storage.upload({
                name: FILENAME,
                size: buffer.byteLength,
                allowUploadBuffering: true,
                handleRetries: (tries, error, cb) => {
                    if (error.code === -3 || tries < 8) { // -3 is EAGAIN
                        const delay = Math.pow(2, tries) * 1000;
                        console.log(`[MegaSync] Retrying upload (attempt ${tries + 1})...`);
                        setTimeout(cb, delay);
                    } else {
                        cb(error);
                    }
                }
            });

            uploadStream.end(buffer);
            await uploadStream.complete; // Await the .complete Promise as per tutorial

            console.log('[MegaSync] Sync complete.');

            return merged;

        } catch (error) {
            console.error('[MegaSync] Sync error:', error);
            return null;
        }
    }

    mergeData(local, remote) {
        if (!remote) {
            // Nothing on server, local is master
            return local;
        }

        // Merge logic:
        // We use IDs.
        // If an item exists in both, we take the one with later `updatedAt`.
        // If an item exists in one but not the other:
        // - Since we now implement soft deletes (tombstones) with the `deleted` flag and `updatedAt` maintenance
        //   in the services, checking existence + timestamp is sufficient.
        // - A missing item in `remote` (and present in `local`) implies it is new in `local`.
        // - If an item was deleted in `remote`, it will be present in `remote` with `deleted: true`.

        const mergedEvents = this.mergeCollections(local.events, remote.events);
        const mergedCalendars = this.mergeCollections(local.calendars, remote.calendars, 'name'); // calendars use 'name' as key
        const mergedImages = this.mergeCollections(local.images, remote.images);

        return {
            events: mergedEvents,
            calendars: mergedCalendars,
            images: mergedImages
        };
    }

    mergeCollections(localList, remoteList, key = 'id') {
        const localMap = new Map(localList.map(i => [i[key], i]));
        const remoteMap = new Map((remoteList || []).map(i => [i[key], i]));

        const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()]);
        const result = [];

        for (const k of allKeys) {
            const l = localMap.get(k);
            const r = remoteMap.get(k);

            if (l && r) {
                // Both exist, check timestamp
                const lTime = l.updatedAt || 0;
                const rTime = r.updatedAt || 0;
                if (lTime >= rTime) {
                    result.push(l);
                } else {
                    result.push(r);
                }
            } else if (l) {
                // Only local: it's either new locally or was deleted on remote (and remote deleted it before we started using tombstones?)
                // With tombstones, if it was deleted remotely, it would exist in 'r' as {deleted: true}
                // So if 'r' is missing, it implies 'l' is new.
                result.push(l);
            } else {
                // Only remote: implies new on remote.
                result.push(r);
            }
        }
        return result;
    }
}
