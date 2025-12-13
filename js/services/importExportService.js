class ImportExportService {
    constructor(db) {
        this.db = db;
    }

    async exportData() {
        try {
            const events = await this.db.getAll('events');
            const calendars = await this.db.getAll('calendars');
            const images = await this.db.getAll('images');

            const exportData = {
                version: 1,
                timestamp: Date.now(),
                data: {
                    events,
                    calendars,
                    images
                }
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `calendar_export_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            return true;
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed: ' + error.message);
            return false;
        }
    }

    async importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const jsonContent = e.target.result;
                    const parsedData = JSON.parse(jsonContent);

                    if (!parsedData.data) {
                        throw new Error('Invalid export file format');
                    }

                    // We merge data. Existing IDs will be overwritten (updated).
                    // New IDs will be added.

                    const { events, calendars, images } = parsedData.data;

                    if (calendars && Array.isArray(calendars)) {
                        for (const cal of calendars) {
                            await this.db.save('calendars', cal);
                        }
                    }

                    if (events && Array.isArray(events)) {
                        for (const evt of events) {
                            await this.db.save('events', evt);
                        }
                    }

                    if (images && Array.isArray(images)) {
                        for (const img of images) {
                            await this.db.save('images', img);
                        }
                    }

                    alert('Import successful! Please refresh the page if data does not appear immediately.');
                    resolve(true);

                    // Trigger a reload or UI update?
                    // Ideally, we should notify the app to reload.
                    // For now, a reload is the safest way to ensure all services refresh their cache.
                    window.location.reload();

                } catch (error) {
                    console.error('Import processing failed:', error);
                    alert('Import failed: ' + error.message);
                    reject(error);
                }
            };

            reader.onerror = (error) => {
                console.error('File reading failed:', error);
                reject(error);
            };

            reader.readAsText(file);
        });
    }
}
