class EventService {
    constructor(db, historyService) {
        this.db = db;
        this.historyService = historyService;
        this.events = [];
    }

    async load() {
        this.events = await this.db.getAll('events');
        await this._migrateLegacyAndDuplicateIds();
        return this.events;
    }

    getAll(includeDeleted = false) {
        if (includeDeleted) {
            return this.events;
        }
        return this.events.filter(e => !e.deleted);
    }

    getScheduled(includeDeleted = false, referenceTime = new Date()) {
        const baseEvents = this.getAll(includeDeleted);
        const tasks = [];
        const nonTasks = [];

        for (const event of baseEvents) {
            const type = event.type || 'event';
            if (type === 'task') {
                tasks.push(event);
            } else {
                nonTasks.push(event);
            }
        }

        const scheduledTasks = this._scheduleTasks(tasks, referenceTime);
        return [...nonTasks, ...scheduledTasks];
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
            eventObj.id = this._generateUniqueId();
            while (this.find(eventObj.id)) {
                eventObj.id = this._generateUniqueId();
            }
            this.events.push(eventObj);
        }

        // Update properties
        // Remove id from eventData to avoid overwriting the generated id with null/empty
        const { id, ...dataToUpdate } = eventData;
        Object.assign(eventObj, dataToUpdate);
        if (eventObj.hasImage === undefined) {
            eventObj.hasImage = false;
        }
        if (!eventObj.type) {
            eventObj.type = 'event';
        }
        if (!eventObj.durationMinutes) {
            eventObj.durationMinutes = Math.max(1, Math.round((new Date(eventObj.end) - new Date(eventObj.start)) / 60000));
        }
        if (eventObj.type === 'task' && (eventObj.orderIndex === undefined || eventObj.orderIndex === null)) {
            eventObj.orderIndex = this.getNextOrderIndex();
        }

        eventObj.updatedAt = Date.now();

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
            type: 'event',
            durationMinutes: 60,
            done: false,
            orderIndex: 0,
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

    _generateUniqueId() {
        const randomPart = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 16);

        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `ev_${crypto.randomUUID()}`;
        }

        const timestampPart = Date.now().toString(16);
        return `ev_${timestampPart}_${randomPart}`;
    }

    async _migrateLegacyAndDuplicateIds() {
        const seenIds = new Set();
        const updates = [];

        for (const event of this.events) {
            const originalId = event.id;
            let needsUpdate = false;

            if (!event.id || this._isLegacyId(event.id) || seenIds.has(event.id)) {
                let newId = this._generateUniqueId();
                while (seenIds.has(newId)) {
                    newId = this._generateUniqueId();
                }
                event.id = newId;
                needsUpdate = true;
            }

            seenIds.add(event.id);

            if (needsUpdate) {
                updates.push({ event, originalId });
            }
        }

        for (const { event, originalId } of updates) {
            if (originalId && originalId !== event.id) {
                await this.db.delete('events', originalId);
            }
            await this.db.save('events', event);
        }
    }

    _isLegacyId(id) {
        return /^ev_\d+$/.test(id);
    }

    _scheduleTasks(tasks, referenceTime) {
        const now = new Date(referenceTime);
        const readyTasks = tasks.filter(t => !t.deleted && !t.done && new Date(t.start) <= now);
        const futureTasks = tasks
            .filter(t => !t.deleted && !t.done && new Date(t.start) > now)
            .sort((a, b) => new Date(a.start) - new Date(b.start));
        const completedTasks = tasks.filter(t => t.done && !t.deleted);

        readyTasks.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        completedTasks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        let cursor = new Date(now);
        const scheduled = [];

        for (const task of readyTasks) {
            const durationMs = this._getDurationMs(task);
            const scheduledTask = { ...task };
            scheduledTask.start = cursor.toISOString();
            scheduledTask.end = new Date(cursor.getTime() + durationMs).toISOString();
            scheduled.push(scheduledTask);
            cursor = new Date(cursor.getTime() + durationMs);
        }

        for (const task of futureTasks) {
            scheduled.push({ ...task });
        }

        for (const task of completedTasks) {
            scheduled.push({ ...task });
        }

        return scheduled;
    }

    _getDurationMs(event) {
        if (event.durationMinutes && Number.isFinite(event.durationMinutes)) {
            return event.durationMinutes * 60000;
        }
        const duration = new Date(event.end) - new Date(event.start);
        return duration > 0 ? duration : 3600000; // default 1h
    }

    getNextOrderIndex() {
        const tasks = this.events.filter(ev => (ev.type || 'event') === 'task');
        if (tasks.length === 0) return 0;
        return Math.max(...tasks.map(t => t.orderIndex || 0)) + 1;
    }

    async updateTaskOrder(orderIds) {
        this.historyService.push(this.events);
        for (let idx = 0; idx < orderIds.length; idx++) {
            const id = orderIds[idx];
            const task = this.find(id);
            if (task) {
                task.orderIndex = idx;
                await this.db.save('events', task);
            }
        }
    }
}
