class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('FamilyCalendarDB', 2);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Events store
                if (!db.objectStoreNames.contains('events')) {
                    db.createObjectStore('events', { keyPath: 'id' });
                }

                // Calendars store
                if (!db.objectStoreNames.contains('calendars')) {
                    db.createObjectStore('calendars', { keyPath: 'name' });
                }

                // Images store: key is synthetic id "scope:calendar:category"
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                console.error('IndexedDB init error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (event) => {
                console.error(`Error reading from ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    }

    save(storeName, item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            const now = Date.now();
            if (storeName === 'events' || storeName === 'images') {
                if (!item.createdAt) {
                    item.createdAt = now;
                }
                item.updatedAt = now;
            }

            const request = store.put(item);

            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error(`Error saving to ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    }

    delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error(`Error deleting from ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    }

    clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error(`Error clearing ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    }
}
