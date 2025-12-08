class MegaSync {
    constructor() {
        this.email = null;
        this.loggedIn = false;
    }

    async login(email, password) {
        // Mock login
        console.log(`[MegaSync] Logging in as ${email}...`);
        return new Promise((resolve) => {
            setTimeout(() => {
                this.email = email;
                this.loggedIn = true;
                console.log('[MegaSync] Login success');
                resolve({ success: true });
            }, 1000);
        });
    }

    async sync(events, calendars, images) {
        if (!this.loggedIn) {
            console.warn('[MegaSync] Cannot sync: Not logged in');
            return false;
        }

        console.log('[MegaSync] Starting sync...');
        return new Promise((resolve) => {
            setTimeout(() => {
                // Here we would actually diff and upload/download
                console.log(`[MegaSync] Synced ${events.length} events, ${calendars.length} calendars, ${images.length} images.`);
                resolve(true); // Sync success
            }, 1500);
        });
    }

    isLoggedIn() {
        return this.loggedIn;
    }
}
