class CalendarService {
    constructor(db) {
        this.db = db;
        this.calendars = [];
        this.visibleCalendars = new Set();
    }

    async load() {
        this.calendars = await this.db.getAll('calendars');

        if (!this.calendars.length) {
            const mainCal = { name: 'Main', isVisible: true };
            await this.db.save('calendars', mainCal);
            this.calendars.push(mainCal);
        }

        this.calendars.forEach(cal => {
            if (cal.isVisible !== false) {
                this.visibleCalendars.add(cal.name);
            }
        });

        return {
            calendars: this.calendars,
            visibleCalendars: this.visibleCalendars
        };
    }

    getAll(includeDeleted = false) {
        if (includeDeleted) {
            return this.calendars;
        }
        return this.calendars.filter(c => !c.deleted);
    }

    getVisible() {
        return this.visibleCalendars;
    }

    async delete(name) {
        const cal = this.calendars.find(c => c.name === name);
        if (cal) {
            cal.deleted = true;
            cal.updatedAt = Date.now();
            this.visibleCalendars.delete(name);
            await this.db.save('calendars', cal);
        }
    }

    async add(name) {
        if (this.calendars.find(c => c.name === name)) {
            return null;
        }
        const now = Date.now();
        const cal = { name, isVisible: true, createdAt: now, updatedAt: now };
        await this.db.save('calendars', cal);
        this.calendars.push(cal);
        this.visibleCalendars.add(name);
        return cal;
    }

    async setVisibility(calendarName, isVisible) {
        if (isVisible) {
            this.visibleCalendars.add(calendarName);
        } else {
            this.visibleCalendars.delete(calendarName);
        }

        const cal = this.calendars.find(c => c.name === calendarName);
        if (cal) {
            cal.isVisible = isVisible;
            cal.updatedAt = Date.now();
            await this.db.save('calendars', cal);
        }
    }
}
