document.addEventListener('DOMContentLoaded', () => {
    const app = new CalendarApp();
    app.init();
});

class CalendarApp {
    constructor() {
        this.db = new Database();
        this.historyService = new HistoryService();
        this.eventService = new EventService(this.db, this.historyService);
        this.imageService = new ImageService(this.db);
        this.calendarService = new CalendarService(this.db);
        this.ui = new UI();
        this.megaSync = new MegaSync();
        this.fullCalendar = null;
    }

    async init() {
        await this.db.init();

        // Load data from services
        const { calendars, visibleCalendars } = await this.calendarService.load();
        await this.eventService.load();
        await this.imageService.load();

        this.ui.init(this);
        this.ui.renderCalendars(calendars, visibleCalendars);

        // Mark "Day" view button active by default
        const dayBtn = this.ui.elements.viewSelector.querySelector('button[data-view="timeGridDay"]');
        if (dayBtn) {
            this.ui.setActiveViewButton(dayBtn);
        }

        this.initFullCalendar();
        this.ui.setSyncStatus(false);
    }

    initFullCalendar() {
        const calendarEl = this.ui.elements.calendarEl;
        const resources = Array.from(this.calendarService.getVisible()).map(name => ({ id: name, title: name }));

        this.fullCalendar = new FullCalendar.Calendar(calendarEl, {
            schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source',
            initialView: 'resourceTimeGridDay',
            resources: resources,
            resourceAreaHeaderContent: 'Calendars',
            initialDate: new Date(),
            height: '100%',
            nowIndicator: true,
            slotMinTime: '00:00:00',
            slotMaxTime: '24:00:00',
            scrollTime: this.getScrollTimeString(),
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: ''
            },
            editable: true,
            selectable: true,
            selectMirror: true,
            eventContent: this.renderEventContent.bind(this),
            resourceLabelContent: this.renderResourceLabel.bind(this),
            eventClick: this.handleEventClick.bind(this),
            dateClick: this.handleDateClick.bind(this),
            select: this.handleSelect.bind(this),
            eventDrop: this.handleEventModify.bind(this),
            eventResize: this.handleEventModify.bind(this)
        });

        this.refreshCalendarEvents();
        this.fullCalendar.render();
    }

    refreshCalendarResources() {
        if (!this.fullCalendar) return;

        const visibleCalendars = this.calendarService.getVisible();
        const currentResources = this.fullCalendar.getResources();
        const currentResourceIds = new Set(currentResources.map(r => r.id));

        // Add new resources
        visibleCalendars.forEach(calName => {
            if (!currentResourceIds.has(calName)) {
                this.fullCalendar.addResource({ id: calName, title: calName });
            }
        });

        // Remove old resources
        currentResourceIds.forEach(resId => {
            if (!visibleCalendars.has(resId)) {
                const resource = this.fullCalendar.getResourceById(resId);
                if (resource) resource.remove();
            }
        });
    }

    refreshCalendarEvents() {
        if (!this.fullCalendar) return;
        this.fullCalendar.removeAllEvents();

        const visibleEvents = this.eventService.getAll().filter(ev =>
            this.calendarService.getVisible().has(ev.calendar)
        );

        visibleEvents.forEach(ev => {
            this.fullCalendar.addEvent(this.formatEventForCalendar(ev));
        });
    }

    renderEventContent(info) {
        const eventData = this.eventService.find(info.event.id);
        const imageEntry = this.imageService.findEventImage(eventData);
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-event-content';

        if (imageEntry?.url) {
            wrapper.style.backgroundColor = imageEntry.averageColor; // Fill background for event
            const img = document.createElement('img');
            img.src = imageEntry.url;
            img.alt = info.event.title;
            img.style.objectFit = 'contain'; // Maintain aspect ratio
            img.style.objectPosition = `${imageEntry.cropX}% ${imageEntry.cropY}%`;
            wrapper.appendChild(img);
        } else {
            const titleEl = document.createElement('div');
            titleEl.className = 'event-title';
            titleEl.textContent = info.event.title;
            wrapper.appendChild(titleEl);
        }

        return { domNodes: [wrapper] };
    }

    renderResourceLabel(info) {
        // info.resource.id is the calendar name
        const calendarName = info.resource.id;
        // We need to look up if there is an image for this calendar
        // Since we don't have a direct method, we can iterate
        const image = this.imageService.images.find(img =>
            !img.category && img.calendar === calendarName
        );

        if (image) {
            const wrapper = document.createElement('div');
            wrapper.className = 'resource-header-content';
            wrapper.style.backgroundColor = image.averageColor; // Fill background

            const img = document.createElement('img');
            img.src = image.url;
            img.style.objectFit = 'contain'; // Maintain aspect ratio
            img.style.objectPosition = `${image.cropX}% ${image.cropY}%`;
            img.title = calendarName;
            wrapper.appendChild(img);
            return { domNodes: [wrapper] };
        }

        return { html: `<span>${calendarName}</span>` };
    }

    // #region FullCalendar Event Handlers
    handleEventClick(info) {
        const event = this.eventService.find(info.event.id);
        if (event) {
            this.ui.populateEventForm(event);
            this.ui.toggleModal(this.ui.elements.eventOverlay, true);
        }
    }

    handleDateClick(info) {
        if (this.fullCalendar.view.type.startsWith('dayGrid')) {
            this.fullCalendar.changeView('timeGridDay', info.date);
            const dayBtn = this.ui.elements.viewSelector.querySelector('button[data-view="timeGridDay"]');
            if (dayBtn) this.ui.setActiveViewButton(dayBtn);
        }
    }

    handleSelect(info) {
        // Ensure we handle selection correctly
        if (this.fullCalendar) {
            const calendarName = info.resource ? info.resource.id :
                (this.calendarService.getAll()[0]?.name || 'Main');

            // If the selection is just a click (start == end), ignore it (dateClick handles it)
            // But FullCalendar 'select' usually implies a range.
            this.openEventCreationFromRange(info.start, info.end, calendarName);
        }
    }

    async handleEventModify(info) {
        const event = this.eventService.find(info.event.id);
        if (event) {
            await this.eventService.save({
                ...event,
                start: info.event.start.toISOString(),
                end: info.event.end ? info.event.end.toISOString() : event.end
            });
            this.refreshCalendarEvents();
        }
    }

    changeView(view) {
        const newView = view === 'timeGridDay' ? 'resourceTimeGridDay' : view;
        this.fullCalendar.changeView(newView);
    }
    // #endregion

    // #region UI-triggered Actions
    async addCalendar(name) {
        const newCal = await this.calendarService.add(name);
        if (newCal) {
            this.ui.renderCalendars(this.calendarService.getAll(), this.calendarService.getVisible());
            this.refreshCalendarResources();
            this.refreshCalendarEvents();
        }
    }

    async setCalendarVisibility(calendarName, isVisible) {
        await this.calendarService.setVisibility(calendarName, isVisible);
        this.refreshCalendarResources();
        this.refreshCalendarEvents();
    }

    async undoLastAction() {
        await this.eventService.undo();
        this.refreshCalendarEvents();
    }

    async saveEventFromForm() {
        const formData = this.ui.getEventFormData();
        if (!formData) return;

        await this.eventService.save(formData);
        this.refreshCalendarEvents();
    }

    async saveCalendarImage(calendarName, dataUrl, crop) {
        await this.imageService.saveCalendarImage(calendarName, dataUrl, crop);
        this.refreshCalendarResources(); // Re-render headers
        this.refreshCalendarEvents();
    }

    async saveCategoryImage(scope, category, dataUrl, crop) {
        await this.imageService.saveCategoryImage(scope, category, dataUrl, crop);

        // Mark matching events as having an image
        const matchingEvents = this.eventService.getAll().filter(ev =>
            ev.name.toLowerCase() === category.trim().toLowerCase() &&
            (scope === 'all' || ev.calendar === scope)
        );
        for (const ev of matchingEvents) {
            await this.eventService.save({ ...ev, hasImage: true });
        }

        this.refreshCalendarEvents();
    }
    // #endregion

    // #region Utilities
    formatEventForCalendar(ev) {
        const isRecurring = ev.recurrence && ev.recurrence.type !== 'none';
        const fcEvent = {
            id: ev.id,
            title: ev.name,
            editable: !isRecurring,
            resourceId: ev.calendar,
            extendedProps: { calendar: ev.calendar }
        };

        if (isRecurring) {
            const { type, until, intervalWeeks, days } = ev.recurrence;
            fcEvent.duration = { milliseconds: new Date(ev.end) - new Date(ev.start) };
            fcEvent.rrule = {
                dtstart: ev.start,
                until: until || null,
                freq: type === 'daily' ? 'daily' : 'weekly',
                interval: type === 'biweekly' ? 2 : (intervalWeeks || 1),
                byweekday: type === 'custom' ? days.map(d => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]) : undefined
            };
        } else {
            fcEvent.start = ev.start;
            fcEvent.end = ev.end;
        }

        return fcEvent;
    }

    getScrollTimeString() {
        const { startMinutes } = this.getTimeStripWindow();
        const h = Math.floor(startMinutes / 60);
        const m = startMinutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
    }

    getTimeStripWindow() {
        // Return full day window to align with 00:00-24:00
        return { startMinutes: 0, endMinutes: 24 * 60 };
    }

    openEventCreationAt(hour, minute) {
        const baseDate = this.fullCalendar ? this.fullCalendar.getDate() : new Date();
        const startDate = new Date(baseDate);
        startDate.setHours(hour, minute, 0, 0);

        const endDate = new Date(startDate.getTime() + 30 * 60000); // +30 minutes

        this.openEventCreationFromRange(startDate, endDate);
    }

    openEventCreationFromRange(start, end, calendarName) {
        const defaultCalendar = calendarName || this.calendarService.getAll()[0]?.name || 'Main';
        const eventData = {
            id: '',
            calendar: defaultCalendar,
            name: '',
            start: start.toISOString(),
            end: end.toISOString(),
            recurrence: { type: 'none' }
        };
        this.ui.populateEventForm(eventData);
        this.ui.toggleModal(this.ui.elements.eventOverlay, true);
    }

    setOnlineStatus(online) {
        this.ui.setSyncStatus(online);
    }

    async loginToMega(email, password) {
        const result = await this.megaSync.login(email, password);
        if (result.success) {
            this.setOnlineStatus(true);
            this.sync();
        }
        return result;
    }

    async sync() {
        if (!this.megaSync.isLoggedIn()) return;

        this.ui.showToast('Syncing with MEGA...', 'info');

        const events = this.eventService.getAll();
        const calendars = this.calendarService.getAll();
        const images = await this.imageService.load(); // Reload to get current state if needed

        const success = await this.megaSync.sync(events, calendars, images);
        if (success) {
            this.ui.showToast('Sync complete!', 'success');
        } else {
            this.ui.showToast('Sync failed.', 'error');
        }
    }
    // #endregion
}
