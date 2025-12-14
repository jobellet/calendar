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
        // Tasks are now treated as regular events with fixed times, but we might want to ensure they are sorted or processed if needed.
        // For now, just return all.
        // If we want to maintain legacy compatibility or "auto-schedule" flag, we can add logic here.
        // But the user requested "Place the queued task automatically within the calendar", which implies persistence.
        // So we assume tasks have valid start/end times in the DB.
        return baseEvents;
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

    /**
     * Finds the next available slot for a task of given duration.
     * Starts searching from `afterTime`.
     * Checks overlap with events on the specified calendar(s).
     */
    findAvailableSlot(durationMinutes, afterTime, calendarName) {
        const durationMs = durationMinutes * 60000;
        let searchStart = new Date(afterTime);
        // Align to next 15 minutes
        const remainder = searchStart.getMinutes() % 15;
        if (remainder !== 0) {
            searchStart.setMinutes(searchStart.getMinutes() + (15 - remainder));
        }
        searchStart.setSeconds(0, 0);

        // Limit search to 1 year ahead to avoid infinite loops
        const limit = new Date(searchStart);
        limit.setFullYear(limit.getFullYear() + 1);

        const events = this.getAll().filter(e => !e.deleted && e.calendar === calendarName);
        events.sort((a, b) => new Date(a.start) - new Date(b.start));

        while (searchStart < limit) {
            const searchEnd = new Date(searchStart.getTime() + durationMs);
            let overlap = false;

            for (const event of events) {
                const eStart = new Date(event.start);
                const eEnd = new Date(event.end);

                // If event is completely before search window, skip
                if (eEnd <= searchStart) continue;
                // If event is completely after search window, we can stop checking *this* window if events are sorted?
                // Not necessarily if events overlap each other. But we just need to check if ANY event overlaps current window.
                if (eStart >= searchEnd) break; // Since sorted, subsequent events will also be after.

                // Overlap found
                if (searchStart < eEnd && searchEnd > eStart) {
                    overlap = true;
                    // Jump searchStart to end of this event
                    searchStart = new Date(eEnd);
                    // Align to 15 min again? Maybe not strictly required but good for UI.
                    // Let's align.
                    const rem = searchStart.getMinutes() % 15;
                    if (rem !== 0) searchStart.setMinutes(searchStart.getMinutes() + (15 - rem));
                    searchStart.setSeconds(0,0);
                    break;
                }
            }

            if (!overlap) {
                return { start: searchStart, end: searchEnd };
            }
        }

        // Fallback: return original start if no slot found (shouldn't happen with limit)
        return { start: new Date(afterTime), end: new Date(afterTime.getTime() + durationMs) };
    }

    /**
     * Resolves task overlaps by pushing subsequent tasks forward.
     * @param {Object} movedTask The task that was just moved/created.
     */
    async resolveTaskOverlaps(movedTask) {
        const calendarName = movedTask.calendar;
        // Use a working set that includes the moved task and all other events
        // Clone events to avoid modifying local state before save
        let workingSet = this.getAll()
            .filter(e => !e.deleted && e.calendar === calendarName)
            .map(e => ({...e}));

        // Replace the moved task in the working set with the new version
        const existingIdx = workingSet.findIndex(e => e.id === movedTask.id);
        if (existingIdx >= 0) {
            workingSet[existingIdx] = {...movedTask};
        } else {
            workingSet.push({...movedTask});
        }

        const fixedEvents = workingSet.filter(e => (e.type || 'event') !== 'task');

        // Queue for tasks that need to be checked for overlap
        // We start with the movedTask acting as the 'pusher'
        // We use an ID queue to avoid object reference confusion
        const rippleQueue = [movedTask.id];

        // Track which tasks have been updated in this resolution pass
        const updates = new Map();
        // Also track updated tasks to save at end

        // We need to sort workingSet by time initially, but it changes dynamically.
        // It's better to just iterate.

        const MAX_ITERATIONS = 500; // Safety break
        let iterations = 0;

        while (rippleQueue.length > 0 && iterations < MAX_ITERATIONS) {
            iterations++;
            const pusherId = rippleQueue.shift();

            // Find current state of pusher
            const pusher = workingSet.find(e => e.id === pusherId);
            if (!pusher) continue;

            const pusherStart = new Date(pusher.start);
            const pusherEnd = new Date(pusher.end);

            // Find any task that overlaps with pusher
            // Exclude itself
            const potentialOverlaps = workingSet.filter(e => {
                if (e.id === pusher.id) return false;
                if ((e.type || 'event') !== 'task') return false; // Fixed events are barriers, checked later

                const eStart = new Date(e.start);
                const eEnd = new Date(e.end);

                return pusherStart < eEnd && pusherEnd > eStart;
            });

            for (const other of potentialOverlaps) {
                // Determine new position for 'other'
                // Push it to end of pusher
                const duration = new Date(other.end) - new Date(other.start);
                let newStart = new Date(pusherEnd);
                let newEnd = new Date(newStart.getTime() + duration);

                // Check if this new position overlaps a FIXED event
                let slotFound = false;
                while (!slotFound) {
                    let fixedOverlap = false;
                    for (const fe of fixedEvents) {
                         // Skip if fe is the pusher (if pusher was a fixed event?? No, pusher is task)
                         // But we filtered fixedEvents.

                         const fStart = new Date(fe.start);
                         const fEnd = new Date(fe.end);

                         if (newStart < fEnd && newEnd > fStart) {
                             // Overlap with fixed event. Jump after it.
                             newStart = new Date(fEnd);
                             newEnd = new Date(newStart.getTime() + duration);
                             fixedOverlap = true;
                             break;
                         }
                    }
                    if (!fixedOverlap) slotFound = true;
                }

                // Update 'other' in workingSet
                other.start = newStart.toISOString();
                other.end = newEnd.toISOString();
                other.updatedAt = Date.now();

                updates.set(other.id, other);

                // Add to queue to push subsequent tasks
                if (!rippleQueue.includes(other.id)) {
                    rippleQueue.push(other.id);
                }
            }
        }

        // Persist updates
        const tasksToUpdate = Array.from(updates.values());
        for (const task of tasksToUpdate) {
            // Update in-memory source of truth
            const internalEvent = this.find(task.id);
            if (internalEvent) {
                Object.assign(internalEvent, task);
                internalEvent.updatedAt = Date.now();
                await this.db.save('events', internalEvent);
            }
        }

        return tasksToUpdate;
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
