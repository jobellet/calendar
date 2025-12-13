class EventService {
    constructor(db, historyService) {
        this.db = db;
        this.historyService = historyService;
        this.events = [];
    }

    async load() {
        this.events = await this.db.getAll('events');
        return this.events;
    }

    getAll(includeDeleted = false) {
        if (includeDeleted) {
            return this.events;
        }
        return this.events.filter(e => !e.deleted);
    }

    find(id) {
        return this.events.find(e => e.id === id);
    }

    async delete(id) {
        const event = this.find(id);
        if (!event) return;

        this.historyService.push(this.events);
        event.deleted = true;
        await this.db.save('events', event);
    }

    async save(eventData) {
        this.historyService.push(this.events);

        let eventObj;
        if (eventData.id) {
            // Update
            eventObj = this.find(eventData.id);
            if (!eventObj) throw new Error(`Event with id ${eventData.id} not found`);
        } else {
            // Create
            eventObj = this._createEmptyEvent();
            eventObj.id = this._generateId(eventData.calendar, eventData.name, eventData.start);
            this.events.push(eventObj);
        }

        // Update properties
        // Remove id from eventData to avoid overwriting the generated id with null/empty
        const { id, ...dataToUpdate } = eventData;
        Object.assign(eventObj, dataToUpdate);
        if (eventObj.hasImage === undefined) {
            eventObj.hasImage = false;
        }

        await this.db.save('events', eventObj);
        return eventObj;
    }

    checkOverlap(startISO, endISO, calendarNames, excludeEventId) {
        const start = new Date(startISO);
        const end = new Date(endISO);

        // Filter events that match the calendars and overlap
        return this.events.filter(e => {
            if (e.deleted) return false;
            // If excludeEventId is provided, ignore the event(s) being updated.
            // Note: Since we might have multiple events with same base ID (recurrence) or similar,
            // checking id is tricky if we don't have exact ID.
            // But usually excludeEventId matches `e.id`.
            if (excludeEventId && e.id === excludeEventId) return false;

            if (!calendarNames.includes(e.calendar)) return false;

            const eStart = new Date(e.start);
            const eEnd = new Date(e.end);

            return (start < eEnd && end > eStart);
        });
    }

    async undo() {
        const previousState = this.historyService.pop();
        if (!previousState) return;

        this.events = previousState;
        await this.db.clear('events');
        for (const ev of this.events) {
            await this.db.save('events', ev);
        }
    }

    _createEmptyEvent() {
        return {
            id: '',
            calendar: '',
            name: '',
            start: '',
            end: '',
            allDay: false,
            createdAt: null,
            updatedAt: null,
            recurrence: {
                type: 'none',
                days: [],
                intervalWeeks: 1,
                until: null
            },
            hasImage: false
        };
    }

    _generateId(calendar, name, startISO) {
        const base = `${calendar}|${name}|${startISO}`;
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            hash = ((hash << 5) - hash) + base.charCodeAt(i);
            hash |= 0;
        }
        return `ev_${Math.abs(hash)}`;
    }
}
