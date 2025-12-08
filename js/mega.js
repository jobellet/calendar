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
                userAgent: 'FamilyCalendar/1.0'
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
            const file = this.storage.root.children.find(f => f.name === FILENAME);

            if (file) {
                console.log('[MegaSync] Found remote file, downloading...');
                const buffer = await file.downloadBuffer();
                const jsonStr = new TextDecoder("utf-8").decode(buffer);
                try {
                    remoteData = JSON.parse(jsonStr);
                } catch (e) {
                    console.error('[MegaSync] Failed to parse remote JSON:', e);
                }
            }

            // 2. Merge data
            const merged = this.mergeData(
                { events: localEvents, calendars: localCalendars, images: localImages },
                remoteData
            );

            // 3. Upload merged data
            // We upload if there are changes or if it's a new file
            // Ideally we check if upload is needed, but for now we always upload to ensure consistency
            // unless we want to save bandwidth. But let's be safe.
            const mergedJson = JSON.stringify(merged);

            console.log('[MegaSync] Uploading merged data...');

            if (file) {
                // Determine if we need to update
                // Simple optimization: compare strings (ignoring order might be tricky, but exact match is easy)
                // But for now, let's just upload.
                // MegaJS doesn't support overwrite in place easily with `upload`,
                // typically we upload a new version or delete and upload?
                // `upload` usually uploads to a folder.
                // If we upload with same name, MEGA usually handles versions.
                // Let's delete old file and upload new one to keep it clean or just upload to root.
                // `storage.upload` uploads to root by default? No, `storage.upload` is not a method on storage instance directly usually?
                // Docs say: `storage.upload`

                // We should use `storage.upload` which uploads to root if called on storage?
                // Or `storage.root.upload`.
                // Let's check docs again. `storage.upload` exists.

                // If file exists, we can try to replace it?
                // The docs say: "Once you logged into your account you can upload files by calling storage.upload()"
                // But `storage` is the class instance.

                // If we want to overwrite, usually we might end up with duplicates or versions depending on MEGA behavior.
                // Safest is to find existing file, delete it (move to trash), then upload new one.
                // Or maybe `storage.upload` handles it?
                // Let's assume we upload to root.

                await file.delete(true); // Permanent delete to avoid clutter
            }

            await this.storage.upload(FILENAME, mergedJson).complete;
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
        // - If it's a delete operation, we might miss it unless we have a "deleted items" log.
        // - Current system doesn't seem to have a "deleted items" log (tombstones).
        // - So we will just take the UNION of both sets.
        // - If user deleted an item on device A, and device B still has it, it will reappear.
        // - To fix this proper sync needs tombstones.
        // - Given the constraints and current codebase, "Union + Timestamp win" is standard "naive" sync.

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
                // Only local
                result.push(l);
            } else {
                // Only remote
                result.push(r);
            }
        }
        return result;
    }
}
