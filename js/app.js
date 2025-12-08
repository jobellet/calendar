document.addEventListener('DOMContentLoaded', () => {
    const app = new CalendarApp();
    app.init();
});

/**
 * Event model (logical, not enforced by TS here):
 * {
 *   id: string,                  // hash of calendar + name + original start
 *   calendar: string,
 *   name: string,
 *   start: string,               // ISO datetime
 *   end: string,                 // ISO datetime
 *   createdAt: number,
 *   updatedAt: number,
 *   recurrence: {
 *      type: "none" | "daily" | "weekly" | "biweekly" | "custom",
 *      days?: string[],
 *      intervalWeeks?: number,
 *      until?: string
 *   },
 *   hasImage: boolean
 * }
 */

class CalendarApp {
    constructor() {
        this.db = new Database();
        this.ui = new UI();
        this.megaSync = new MegaSync();
        this.fullCalendar = null;

        this.events = [];
        this.calendars = [];
        this.images = [];

        this.visibleCalendars = new Set();
    }

    async init() {
        await this.db.init();

        // Load data
        this.events = await this.db.getAll('events');
        this.calendars = await this.db.getAll('calendars');
        this.images = await this.db.getAll('images');

        // Ensure at least one calendar
        if (!this.calendars.length) {
            const mainCal = { name: 'Main', isVisible: true };
            await this.db.save('calendars', mainCal);
            this.calendars.push(mainCal);
        }

        // By default all calendars visible
        this.calendars.forEach(cal => {
            if (cal.isVisible !== false) {
                this.visibleCalendars.add(cal.name);
            }
        });

        this.ui.init(this);
        this.ui.renderCalendars(this.calendars, this.visibleCalendars);
        this.initFullCalendar();

        // Mark offline by default (no real MEGA sync yet)
        this.ui.setSyncStatus(false);
    }

    /* =======================
       Calendar & views
    ======================= */

    initFullCalendar() {
        const calendarEl = this.ui.elements.calendarEl;

        this.fullCalendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: ''
            },
            selectable: true,
            editable: true,
            eventClick: (info) => {
                const event = this.events.find(e => e.id === info.event.id);
                if (event) {
                    this.ui.populateEventForm(event);
                }
            },
            dateClick: (info) => {
                // Open form in create mode with this date pre-filled
                const defaultCalendar = this.calendars[0]?.name || 'Main';
                this.ui.populateEventForm({
                    calendar: defaultCalendar,
                    start: info.dateStr + 'T09:00:00',
                    end: info.dateStr + 'T10:00:00',
                    recurrence: { type: 'none' }
                });
            },
            eventDrop: async (info) => {
                // Drag & drop update
                const ev = this.events.find(e => e.id === info.event.id);
                if (ev) {
                    ev.start = info.event.start.toISOString();
                    ev.end = info.event.end ? info.event.end.toISOString() : ev.end;
                    ev.updatedAt = Date.now();
                    await this.db.save('events', ev);
                }
            },
            eventResize: async (info) => {
                const ev = this.events.find(e => e.id === info.event.id);
                if (ev) {
                    ev.start = info.event.start.toISOString();
                    ev.end = info.event.end ? info.event.end.toISOString() : ev.end;
                    ev.updatedAt = Date.now();
                    await this.db.save('events', ev);
                }
            }
        });

        this.refreshCalendarEvents();
        this.fullCalendar.render();
    }

    changeView(view) {
        if (!this.fullCalendar) return;

        if (view === 'hour') {
            // Simple approximation: use timeGridDay
            this.fullCalendar.changeView('timeGridDay');
        } else {
            this.fullCalendar.changeView(view);
        }
    }

    refreshCalendarEvents() {
        if (!this.fullCalendar) return;

        this.fullCalendar.removeAllEvents();

        const visibleEvents = this.events.filter(ev =>
            this.visibleCalendars.has(ev.calendar)
        );

        visibleEvents.forEach(ev => {
            this.fullCalendar.addEvent({
                id: ev.id,
                title: ev.name,
                start: ev.start,
                end: ev.end,
                extendedProps: { calendar: ev.calendar }
            });
        });
    }

    /* =======================
       Calendars
    ======================= */

    async addCalendar(name) {
        if (this.calendars.find(c => c.name === name)) {
            return;
        }
        const cal = { name, isVisible: true };
        await this.db.save('calendars', cal);
        this.calendars.push(cal);
        this.visibleCalendars.add(name);
        this.ui.renderCalendars(this.calendars, this.visibleCalendars);
        this.refreshCalendarEvents();
    }

    async setCalendarVisibility(calendarName, isVisible) {
        if (isVisible) {
            this.visibleCalendars.add(calendarName);
        } else {
            this.visibleCalendars.delete(calendarName);
        }

        // Persist visibility in calendar object
        const cal = this.calendars.find(c => c.name === calendarName);
        if (cal) {
            cal.isVisible = isVisible;
            await this.db.save('calendars', cal);
        }

        this.refreshCalendarEvents();
    }

    /* =======================
       Events
    ======================= */

    async saveEventFromForm() {
        const els = this.ui.elements;

        const id = els.eventId.value || null;
        const calendar = els.eventCalendar.value;
        const name = els.eventName.value.trim();
        const date = els.eventDate.value;
        const startTime = els.eventStartTime.value;
        const endTime = els.eventEndTime.value;
        const recurrenceType = els.eventRecurrence.value || 'none';

        if (!calendar || !name || !date || !startTime || !endTime) {
            alert('Please fill all required fields.');
            return;
        }

        const startISO = new Date(date + 'T' + startTime + ':00').toISOString();
        const endISO = new Date(date + 'T' + endTime + ':00').toISOString();

        let eventObj;
        if (id) {
            // Update existing
            eventObj = this.events.find(e => e.id === id);
            if (!eventObj) {
                // Should not happen, but handle gracefully
                eventObj = this.createEmptyEvent();
                eventObj.id = id;
                this.events.push(eventObj);
            }
        } else {
            // New event
            eventObj = this.createEmptyEvent();
            eventObj.id = this.generateEventId(calendar, name, startISO);
            this.events.push(eventObj);
        }

        eventObj.calendar = calendar;
        eventObj.name = name;
        eventObj.start = startISO;
        eventObj.end = endISO;
        eventObj.recurrence = {
            type: recurrenceType
        };
        if (eventObj.hasImage === undefined) {
            eventObj.hasImage = false;
        }

        await this.db.save('events', eventObj);
        this.refreshCalendarEvents();
        this.ui.populateEventForm(null);
    }

    createEmptyEvent() {
        return {
            id: '',
            calendar: '',
            name: '',
            start: '',
            end: '',
            createdAt: null,
            updatedAt: null,
            recurrence: { type: 'none' },
            hasImage: false
        };
    }

    generateEventId(calendar, name, startISO) {
        const base = calendar + '|' + name + '|' + startISO;
        // Simple hash
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            hash = ((hash << 5) - hash) + base.charCodeAt(i);
            hash |= 0;
        }
        return 'ev_' + Math.abs(hash);
    }

    resolveConflict(localEvent, remoteEvent) {
        // Last-edit-wins based on updatedAt
        if ((remoteEvent.updatedAt || 0) > (localEvent.updatedAt || 0)) {
            return remoteEvent;
        }
        return localEvent;
    }

    /* =======================
       Images
    ======================= */

    async saveCalendarImage(calendarName, dataUrl) {
        const id = `calendar:${calendarName}:__self__`;
        const imageEntry = {
            id,
            calendar: calendarName,
            category: null,
            url: dataUrl,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await this.db.save('images', imageEntry);

        // Keep in local cache
        const existingIndex = this.images.findIndex(img => img.id === id);
        if (existingIndex >= 0) {
            this.images[existingIndex] = imageEntry;
        } else {
            this.images.push(imageEntry);
        }
    }

    async saveCategoryImage(scope, category, dataUrl) {
        const normalizedCat = category.toLowerCase();
        const id = `category:${scope}:${normalizedCat}`;
        const imageEntry = {
            id,
            calendar: scope, // "all" or specific calendar
            category: normalizedCat,
            url: dataUrl,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await this.db.save('images', imageEntry);

        const existingIndex = this.images.findIndex(img => img.id === id);
        if (existingIndex >= 0) {
            this.images[existingIndex] = imageEntry;
        } else {
            this.images.push(imageEntry);
        }

        // Optionally flag existing events of that category as having an image
        this.events
            .filter(ev => ev.name.toLowerCase() === normalizedCat &&
                (scope === 'all' || ev.calendar === scope))
            .forEach(ev => {
                ev.hasImage = true;
                this.db.save('events', ev);
            });
    }
}
