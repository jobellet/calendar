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
        this.hoursViewMode = 'auto'; // 'auto' or 'manual'
        this.hoursViewCenterTime = null;
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
        this.setupKeyboardShortcuts();
        this.ui.setSyncStatus(false);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if input/textarea is focused
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) {
                return;
            }

            if (!this.fullCalendar) return;

            switch (e.key) {
                case 'ArrowLeft':
                    this.fullCalendar.prev();
                    break;
                case 'ArrowRight':
                    this.fullCalendar.next();
                    break;
                case 'ArrowUp':
                    if (this.fullCalendar.view.type === 'hoursView') {
                        e.preventDefault(); // Prevent page scroll
                        this.shiftHoursView(-30);
                    }
                    break;
                case 'ArrowDown':
                    if (this.fullCalendar.view.type === 'hoursView') {
                        e.preventDefault(); // Prevent page scroll
                        this.shiftHoursView(30);
                    }
                    break;
            }
        });
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
            selectLongPressDelay: 300,
            eventLongPressDelay: 300,
            eventDrop: this.handleEventModify.bind(this),
            eventResize: this.handleEventModify.bind(this),
            views: {
                hoursView: {
                    type: 'resourceTimeGridDay', // Use resource view to show calendars
                    duration: { days: 1 },
                    buttonText: 'Hours',
                    // The range will be dynamic, but we start regular
                }
            },
            datesSet: (info) => {
                if (info.view.type === 'hoursView') { // Should match view name
                    this.enableHoursViewUpdates(true);
                } else {
                    this.enableHoursViewUpdates(false);
                }
            }
        });

        this.refreshCalendarEvents();
        this.fullCalendar.render();
    }

    enableHoursViewUpdates(enable) {
        // Toggle the stretched view class
        if (this.ui.elements.calendarEl) {
            this.ui.elements.calendarEl.classList.toggle('view-hours-stretched', enable);
        }

        if (this.hoursViewInterval) {
            clearInterval(this.hoursViewInterval);
            this.hoursViewInterval = null;
        }

        // Reset to full day if disabling (optional, but good for other views)
        if (!enable && this.fullCalendar) {
            this.fullCalendar.setOption('slotMinTime', '00:00:00');
            this.fullCalendar.setOption('slotMaxTime', '24:00:00');

            // Remove resize listener if it exists
            if (this.hoursResizeListener) {
                window.removeEventListener('resize', this.hoursResizeListener);
                this.hoursResizeListener = null;
            }
            return;
        }

        if (enable) {
            this.updateHoursViewWindow();
            // Update every minute to keep the window moving
            this.hoursViewInterval = setInterval(() => this.updateHoursViewWindow(), 60000);

            // Add resize listener to keep stretching correct
            if (!this.hoursResizeListener) {
                this.hoursResizeListener = () => requestAnimationFrame(() => this.updateHoursViewWindow());
                window.addEventListener('resize', this.hoursResizeListener);
            }
        }
    }

    updateHoursViewWindow() {
        if (!this.fullCalendar) return;

        let centerMs;
        if (this.hoursViewMode === 'manual' && this.hoursViewCenterTime) {
            const d = this.hoursViewCenterTime;
            centerMs = d.getHours() * 3600000 + d.getMinutes() * 60000 + d.getSeconds() * 1000;
        } else {
            const now = new Date();
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            centerMs = now.getTime() - startOfDay.getTime();

            // Keep center time synced in case we switch to manual
            this.hoursViewCenterTime = now;
        }

        // Window: -15 minutes to +90 minutes
        const START_OFFSET_MS = 15 * 60 * 1000;
        const END_OFFSET_MS = 90 * 60 * 1000;
        const DURATION_MS = START_OFFSET_MS + END_OFFSET_MS; // 105 minutes

        let startMs = centerMs - START_OFFSET_MS;
        let endMs = centerMs + END_OFFSET_MS;

        // Clamp to 0-24h
        if (startMs < 0) {
            startMs = 0;
            // Cap at 24h if needed, or maintain duration if possible but usually 0 start implies we shift.
            endMs = Math.min(DURATION_MS, 24 * 60 * 60 * 1000);
        }
        if (endMs > 24 * 60 * 60 * 1000) {
            endMs = 24 * 60 * 60 * 1000;
            startMs = Math.max(0, endMs - DURATION_MS);
        }

        const formatDuration = (ms) => {
            const totalSeconds = Math.floor(ms / 1000);
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        const minTime = formatDuration(startMs);
        const maxTime = formatDuration(endMs);

        // ---------------------------------------------------------
        // Calculate dynamic slot height to stretch to full view height
        // ---------------------------------------------------------
        if (this.ui.elements.calendarEl) {
            // Get the view content element (scroller) or approximate available space
            // Best approximation: Calendar Client Height - Header Height
            // Header height is roughly ~100px (Title bar + Day headers)
            // But we can measure them dynamically if possible, or just use the container.

            // Let's try to measure the container and assume we want the *slots* to fill it.
            // FullCalendar structure: .fc-header-toolbar (top), .fc-view-harness (content)
            // .fc-view-harness usually fills the rest.
            // Inside, .fc-scrollgrid etc.

            const calendarHeight = this.ui.elements.calendarEl.clientHeight;
            // Measure toolbar if possible
            const toolbar = this.ui.elements.calendarEl.querySelector('.fc-toolbar');
            const header = this.ui.elements.calendarEl.querySelector('.fc-col-header');

            const toolbarHeight = toolbar ? toolbar.offsetHeight : 50;
            const headerHeight = header ? header.offsetHeight : 30; // approx if not rendered yet

            const availableHeight = calendarHeight - toolbarHeight - headerHeight - 20; // -20 buffer

            // Duration is 105 minutes. Slot duration is 30 mins (default).
            // Slots count = 105 / 30 = 3.5 slots.
            const slotsCount = DURATION_MS / (30 * 60 * 1000);

            // We want the total height to cover 'slotsCount' slots.
            // newSlotHeight * slotsCount = availableHeight
            const newSlotHeight = Math.max(20, availableHeight / slotsCount);

            this.ui.elements.calendarEl.style.setProperty('--fc-slot-height', `${newSlotHeight}px`);
        }

        this.fullCalendar.setOption('slotMinTime', minTime);
        this.fullCalendar.setOption('slotMaxTime', maxTime);
        // this.fullCalendar.scrollToTime(minTime); // Not needed if we stretch perfectly, but good safety
    }

    shiftHoursView(minutes) {
        this.hoursViewMode = 'manual';
        if (!this.hoursViewCenterTime) {
            this.hoursViewCenterTime = new Date();
        }
        // Shift
        this.hoursViewCenterTime = new Date(this.hoursViewCenterTime.getTime() + minutes * 60000);
        this.updateHoursViewWindow();
    }

    resetHoursView() {
        this.hoursViewMode = 'auto';
        this.hoursViewCenterTime = new Date();
        this.updateHoursViewWindow();
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
        wrapper.dataset.eventId = info.event.id; // Store ID for Context Menu

        if (imageEntry?.url) {
            wrapper.style.backgroundColor = imageEntry.averageColor; // Fill background for event
            const img = document.createElement('img');
            img.src = imageEntry.url;
            img.alt = info.event.title;
            // Let CSS handle size (height: 100%, aspect-ratio: 1)
            img.style.objectPosition = `${imageEntry.cropX}% ${imageEntry.cropY}%`;
            wrapper.appendChild(img);
        }

        const titleEl = document.createElement('div');
        titleEl.className = 'event-title';
        titleEl.textContent = info.event.title;
        wrapper.appendChild(titleEl);

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

            // Check if it is a single day selection in Month view (start + 1 day = end)
            // In dayGridMonth, select info usually has start at 00:00 and end at 00:00 next day.
            // If the difference is exactly 24 hours, it's a single day click.
            // The user wants single taps to open Day View.
            // FullCalendar's dateClick handles single taps on cells.
            // FullCalendar's select handles drags.
            // However, depending on config, select might fire on click too.
            // We check duration.
            const diffTime = Math.abs(info.end - info.start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // If it's effectively 1 day (or less, though select usually snaps to days in month view)
            // AND we are in month view
            if (this.fullCalendar.view.type === 'dayGridMonth' && diffDays <= 1) {
                 // Single day selection -> Ignore here, let dateClick handle it
                 // OR manually switch view if dateClick isn't firing (but it should be)
                 // Actually, if we return here, dateClick should have fired or will fire.
                 // But wait, if 'selectable' is true, does 'dateClick' still fire? Yes.
                 // But if we select, we might want to unselect.
                 this.fullCalendar.unselect();
                 return;
            }

            // Otherwise, it's a multi-day selection or a time-range selection in other views.
            this.openEventCreationFromRange(info.start, info.end, calendarName, info.allDay);
        }
    }

    async handleEventModify(info) {
        const event = this.eventService.find(info.event.id);
        if (event) {
            const updates = {
                ...event,
                start: info.event.start.toISOString(),
                end: info.event.end ? info.event.end.toISOString() : event.end
            };

            // Handle Resource (Calendar) Change
            if (info.newResource && info.newResource.id !== event.calendar) {
                updates.calendar = info.newResource.id;
            }

            await this.eventService.save(updates);
            this.refreshCalendarEvents();
        }
    }

    copyEvent(eventId) {
        const event = this.eventService.find(eventId);
        if (event) {
            this.clipboard = JSON.parse(JSON.stringify(event));
            this.ui.showToast(`Copied "${event.name}"`, 'info');
        }
    }

    async pasteEvent(date, calendarId) {
        if (!this.clipboard) {
            this.ui.showToast('Clipboard empty', 'error');
            return;
        }

        const duration = new Date(this.clipboard.end) - new Date(this.clipboard.start);
        const newStart = new Date(date);
        const newEnd = new Date(newStart.getTime() + duration);

        const newEvent = {
            ...this.clipboard,
            id: '', // New ID will be generated
            calendar: calendarId || this.clipboard.calendar,
            start: newStart.toISOString(),
            end: newEnd.toISOString()
        };

        // Remove recurrence from copy or keep? Usually copy logic keeps it, but maybe better to prompt?
        // Let's keep it simple: exact clone.

        await this.eventService.save(newEvent);
        this.refreshCalendarEvents();
        this.ui.showToast('Event pasted', 'success');
    }

    changeView(view) {
        // If switching to hoursView, fullCalendar treats it as custom view if defined in views
        // We defined 'hoursView' in views config.
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

        // Save (create or update) event
        const savedEvent = await this.eventService.save(formData);

        // Handle Image
        if (formData.imageFile && savedEvent) {
            const crop = { cropX: 50, cropY: 50 }; // Default center
            const reader = new FileReader();
            reader.onload = async (e) => {
                await this.imageService.saveEventImage(savedEvent.id, e.target.result, crop);
                this.refreshCalendarEvents();
            };
            reader.readAsDataURL(formData.imageFile);
        } else {
            // If no new image, we still refresh to show the event
            this.refreshCalendarEvents();
        }
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
            allDay: ev.allDay || false,
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
        // If in hours view, return restricted window?
        // Actually, the strip matches the VIEW.
        // But getMinutesFromY in UI calculation relies on container height.
        // If we want to align, we should respect the current view's min/max.
        // But for now, let's keep it simple.
        return { startMinutes: 0, endMinutes: 24 * 60 };
    }

    openEventCreationAt(hour, minute) {
        const baseDate = this.fullCalendar ? this.fullCalendar.getDate() : new Date();
        const startDate = new Date(baseDate);
        startDate.setHours(hour, minute, 0, 0);

        const endDate = new Date(startDate.getTime() + 30 * 60000); // +30 minutes

        this.openEventCreationFromRange(startDate, endDate);
    }

    openEventCreationFromRange(start, end, calendarName, allDay = false) {
        const defaultCalendar = calendarName || this.calendarService.getAll()[0]?.name || 'Main';
        const eventData = {
            id: '',
            calendar: defaultCalendar,
            name: '',
            start: start.toISOString(),
            end: end.toISOString(),
            allDay: allDay,
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

        // Pass includeDeleted=true to sync everything including tombstones
        const events = this.eventService.getAll(true);
        const calendars = this.calendarService.getAll(true);
        const images = await this.imageService.load(true);

        const syncedData = await this.megaSync.sync(events, calendars, images);

        if (syncedData) {
            // Update local state with merged data
            if (syncedData.events) {
                // Clear existing and add merged events
                // Ideally we update specifically, but clearing and re-adding to DB ensures consistency
                // But we must respect the service implementation.
                // EventService uses an array and writes to DB individually on save.
                // We should probably expose a "setAll" or iterate.

                // Let's implement a batch update in services or just iterate
                // For now, simple iteration.
                // Ideally services should support bulk update.
                this.eventService.events = syncedData.events;
                await this.db.clear('events');
                for (const ev of syncedData.events) {
                    await this.db.save('events', ev);
                }
            }

            if (syncedData.calendars) {
                this.calendarService.calendars = syncedData.calendars;
                // Maintain visibility set
                syncedData.calendars.forEach(cal => {
                    if (cal.isVisible !== false) this.calendarService.visibleCalendars.add(cal.name);
                    else this.calendarService.visibleCalendars.delete(cal.name);
                });

                await this.db.clear('calendars');
                for (const cal of syncedData.calendars) {
                    await this.db.save('calendars', cal);
                }
            }

            if (syncedData.images) {
                this.imageService.images = syncedData.images;
                await this.db.clear('images');
                for (const img of syncedData.images) {
                    await this.db.save('images', img);
                }
            }

            this.ui.showToast('Sync complete!', 'success');

            // Refresh UI
            this.ui.renderCalendars(this.calendarService.getAll(), this.calendarService.getVisible());
            this.refreshCalendarResources();
            this.refreshCalendarEvents();

        } else {
            this.ui.showToast('Sync failed.', 'error');
        }
    }
    // #endregion
}
