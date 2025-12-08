document.addEventListener('DOMContentLoaded', () => {
    const app = new CalendarApp();
    app.init();
});

/**
 * Event model (logical):
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

        // Simple history stack for undo (Ctrl+Z)
        this.history = [];
        this.historyLimit = 20;
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

        // All calendars visible by default unless marked otherwise
        this.calendars.forEach(cal => {
            if (cal.isVisible !== false) {
                this.visibleCalendars.add(cal.name);
            }
        });

        this.ui.init(this);
        this.ui.renderCalendars(this.calendars, this.visibleCalendars);

        // Mark "Day" view button active by default
        const dayBtn = this.ui.elements.viewSelector.querySelector('button[data-view="resourceTimeGridDay"]');
        if (dayBtn) {
            this.ui.setActiveViewButton(dayBtn);
        }

        this.initFullCalendar();

        // Offline by default (no real MEGA sync yet)
        this.ui.setSyncStatus(false);
    }

    /* =======================
       Helpers
    ======================= */

    getResources() {
        // One resource (column) per calendar
        return this.calendars.map(cal => ({
            id: cal.name,
            title: cal.name
        }));
    }

    getTimeStripWindow() {
        // Visible window for right time strip: from now-1h to now+5h, clamped to [0, 24h]
        const now = new Date();
        const minutesNow = now.getHours() * 60 + now.getMinutes();
        let start = minutesNow - 60;
        let end = minutesNow + 5 * 60;
        if (start < 0) start = 0;
        if (end > 24 * 60) end = 24 * 60;
        return { startMinutes: start, endMinutes: end };
    }

    getScrollTimeString() {
        // For day view scrollTime, align with start of the same window
        const { startMinutes } = this.getTimeStripWindow();
        const h = Math.floor(startMinutes / 60);
        const m = startMinutes % 60;
        const hh = h.toString().padStart(2, '0');
        const mm = m.toString().padStart(2, '0');
        return `${hh}:${mm}:00`;
    }

    pushHistory() {
        // Save a snapshot of events before a change
        const snapshot = JSON.stringify(this.events);
        this.history.push(snapshot);
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    }

    async undoLastAction() {
        if (!this.history.length) return;
        const snapshot = this.history.pop();
        this.events = JSON.parse(snapshot);

        // Replace events in DB with snapshot
        await this.db.clear('events');
        for (const ev of this.events) {
            await this.db.save('events', ev);
        }
        this.refreshCalendarEvents();
    }

    /* =======================
       Calendar & views
    ======================= */

    initFullCalendar() {
        const calendarEl = this.ui.elements.calendarEl;
        const now = new Date();
        const scrollTime = this.getScrollTimeString();

        this.fullCalendar = new FullCalendar.Calendar(calendarEl, {
            // One column per calendar (resource)
            initialView: 'resourceTimeGridDay',
            resources: this.getResources(),
            initialDate: now,
            height: '100%',
            nowIndicator: true,
            slotMinTime: '00:00:00',
            slotMaxTime: '24:00:00',
            scrollTime,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: ''
            },
            editable: true,
            selectable: true,
            selectMirror: true,
            eventClick: (info) => {
                const event = this.events.find(e => e.id === info.event.id);
                if (event) {
                    this.ui.populateEventForm(event);
                    this.ui.elements.eventOverlay.classList.remove('hidden');
                }
            },
            // Click on day cells in other views (e.g. month) -> go to that day
            dateClick: (info) => {
                const vType = this.fullCalendar.view.type;
                if (vType.startsWith('dayGrid')) {
                    this.fullCalendar.changeView('resourceTimeGridDay', info.date);
                    const dayBtn = this.ui.elements.viewSelector.querySelector('button[data-view="resourceTimeGridDay"]');
                    if (dayBtn) {
                        this.ui.setActiveViewButton(dayBtn);
                    }
                }
            },
            // Drag-select an empty region on the calendar -> create event with start/end
            select: (info) => {
                const vType = this.fullCalendar.view.type;
                if (vType.includes('timeGrid')) {
                    this.openEventCreationFromRange(info.start, info.end, info.resource ? info.resource.id : null);
                }
            },
            eventDrop: async (info) => {
                this.pushHistory();
                const ev = this.events.find(e => e.id === info.event.id);
                if (ev) {
                    ev.start = info.event.start.toISOString();
                    ev.end = info.event.end ? info.event.end.toISOString() : ev.end;
                    // If moved to another resource/column, update calendar field
                    if (info.newResource) {
                        ev.calendar = info.newResource.id;
                    }
                    ev.updatedAt = Date.now();
                    await this.db.save('events', ev);
                    this.refreshCalendarEvents();
                }
            },
            eventResize: async (info) => {
                this.pushHistory();
                const ev = this.events.find(e => e.id === info.event.id);
                if (ev) {
                    ev.start = info.event.start.toISOString();
                    ev.end = info.event.end ? info.event.end.toISOString() : ev.end;
                    ev.updatedAt = Date.now();
                    await this.db.save('events', ev);
                    this.refreshCalendarEvents();
                }
            }
        });

        this.refreshCalendarEvents();
        this.fullCalendar.render();
    }

    changeView(view) {
        if (!this.fullCalendar) return;
        if (view === 'resourceTimeGridDay') {
            this.fullCalendar.changeView('resourceTimeGridDay');
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
                resourceId: ev.calendar, // put in the right calendar column
                extendedProps: { calendar: ev.calendar }
            });
        });

        // Also keep resources in sync with calendars
        this.fullCalendar.setOption('resources', this.getResources());
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

        this.pushHistory();

        let eventObj;
        if (id) {
            // Update existing
            eventObj = this.events.find(e => e.id === id);
            if (!eventObj) {
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
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            hash = ((hash << 5) - hash) + base.charCodeAt(i);
            hash |= 0;
        }
        return 'ev_' + Math.abs(hash);
    }

    resolveConflict(localEvent, remoteEvent) {
        if ((remoteEvent.updatedAt || 0) > (localEvent.updatedAt || 0)) {
            return remoteEvent;
        }
        return localEvent;
    }

    /**
     * Called when user clicks in the right sidebar time strip.
     * Uses current day from the calendar and a 30-min default duration.
     */
    openEventCreationAt(hour, minute) {
        const baseDate = this.fullCalendar ? this.fullCalendar.getDate() : new Date();
        const year = baseDate.getFullYear();
        const month = (baseDate.getMonth() + 1).toString().padStart(2, '0');
        const day = baseDate.getDate().toString().padStart(2, '0');
        const hh = hour.toString().padStart(2, '0');
        const mm = minute.toString().padStart(2, '0');

        const startDateStr = `${year}-${month}-${day}`;
        const startTimeStr = `${hh}:${mm}`;

        // Default duration: 30 minutes
        const totalMinutes = hour * 60 + minute + 30;
        const endHour = Math.floor(totalMinutes / 60) % 24;
        const endMinute = totalMinutes % 60;
        const ehh = endHour.toString().padStart(2, '0');
        const emm = endMinute.toString().padStart(2, '0');
        const endTimeStr = `${ehh}:${emm}`;

        const defaultCalendar = this.calendars[0]?.name || 'Main';

        this.ui.populateEventForm({
            id: '',
            calendar: defaultCalendar,
            name: '',
            start: `${startDateStr}T${startTimeStr}:00`,
            end: `${startDateStr}T${endTimeStr}:00`,
            recurrence: { type: 'none' }
        });
        this.ui.elements.eventOverlay.classList.remove('hidden');
    }

    /**
     * Called when user click-drags on empty time slots in the calendar.
     * Start = press position, End = release position.
     */
    openEventCreationFromRange(start, end, calendarName) {
        const year = start.getFullYear();
        const month = (start.getMonth() + 1).toString().padStart(2, '0');
        const day = start.getDate().toString().padStart(2, '0');

        const sh = start.getHours().toString().padStart(2, '0');
        const sm = start.getMinutes().toString().padStart(2, '0');
        const eh = end.getHours().toString().padStart(2, '0');
        const em = end.getMinutes().toString().padStart(2, '0');

        const dateStr = `${year}-${month}-${day}`;
        const startTimeStr = `${sh}:${sm}`;
        const endTimeStr = `${eh}:${em}`;

        const defaultCalendar = calendarName || this.calendars[0]?.name || 'Main';

        this.ui.populateEventForm({
            id: '',
            calendar: defaultCalendar,
            name: '',
            start: `${dateStr}T${startTimeStr}:00`,
            end: `${dateStr}T${endTimeStr}:00`,
            recurrence: { type: 'none' }
        });
        this.ui.elements.eventOverlay.classList.remove('hidden');
    }

    setOnlineStatus(online) {
        this.ui.setSyncStatus(online);
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
            calendar: scope,
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

        this.events
            .filter(ev => ev.name.toLowerCase() === normalizedCat &&
                (scope === 'all' || ev.calendar === scope))
            .forEach(ev => {
                ev.hasImage = true;
                this.db.save('events', ev);
            });
    }
}
