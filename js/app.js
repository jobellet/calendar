document.addEventListener('DOMContentLoaded', async () => {
    const app = new CalendarApp();
    try {
        await app.init();
    } catch (e) {
        console.error(e);
        alert('Failed to initialize app: ' + e.message);
    }
});

class CalendarApp {
    constructor() {
        this.db = new Database();
        this.historyService = new HistoryService();
        this.settingsService = new SettingsService();
        this.eventService = new EventService(this.db, this.historyService);
        this.imageService = new ImageService(this.db);
        this.calendarService = new CalendarService(this.db);
        this.ui = new UI();
        this.megaSync = new MegaSync();

        this.calendarView = null;

        this.hoursViewMode = 'auto'; // 'auto' or 'manual'
        this.hoursViewCenterTime = null;
        this.notificationInterval = null;
        this.notificationTimeout = null;
        this.upcomingNotificationCache = {
            events: [],
            windowStart: null,
            windowEnd: null,
            expiresAt: 0
        };
        this.notifiedEvents = new Set();
    }

    async init() {
        await this.db.init();

        const { calendars, visibleCalendars } = await this.calendarService.load();
        await this.eventService.load();
        await this.imageService.load();

        this.ui.init(this);
        this.ui.renderCalendars(calendars, visibleCalendars);
        this.ui.renderTaskQueue(this.getTaskQueue());

        this.initCalendarView();

        // Set default view to Hours
        this.changeView('hoursView');
        this.ui.setActiveViewButton(this.ui.elements.viewSelector.querySelector('button[data-view="hoursView"]'));

        this.setupKeyboardShortcuts();
        this.ui.setSyncStatus(false);
        this.restartNotificationLoop();

        this.taskRefreshInterval = setInterval(() => {
            this.refreshCalendarEvents();
        }, 30000);
    }

    restartNotificationLoop() {
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
        }
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        const settings = this.settingsService.get();
        if (settings.voiceEnabled) {
            this.scheduleNotificationCheck(0);
        }
    }

    checkNotifications() {
        const settings = this.settingsService.get();
        if (!settings.voiceEnabled) return;

        const now = new Date();
        const leadMs = settings.voiceLeadTime * 60000;
        const windowPastMs = 15 * 60000;
        const windowFutureMs = (settings.voiceLeadTime + 30) * 60000;

        const events = this.getUpcomingEventsForNotifications(now, windowPastMs, windowFutureMs);

        events.forEach(event => {
            const start = new Date(event.start);
            const diffMs = start - now;

            if (settings.voiceAtStart) {
                if (Math.abs(diffMs) <= 30000) {
                     const key = `${event.id}_start`;
                     if (!this.notifiedEvents.has(key)) {
                         this.speak(event.name, 0);
                         this.notifiedEvents.add(key);
                         setTimeout(() => this.notifiedEvents.delete(key), 300000);
                     }
                }
            }

            if (settings.voiceLeadTime > 0) {
                 const targetDiffMs = settings.voiceLeadTime * 60000;
                 if (Math.abs(diffMs - targetDiffMs) <= 30000) {
                     const key = `${event.id}_before`;
                     if (!this.notifiedEvents.has(key)) {
                         this.speak(event.name, settings.voiceLeadTime);
                         this.notifiedEvents.add(key);
                         setTimeout(() => this.notifiedEvents.delete(key), 300000);
                     }
                 }
            }
        });

        this.scheduleNextNotification(now, events.length > 0, leadMs, windowFutureMs);
    }

    getUpcomingEventsForNotifications(now, windowPastMs, windowFutureMs) {
        const nowMs = now.getTime();
        const windowStart = new Date(nowMs - windowPastMs);
        const windowEnd = new Date(nowMs + windowFutureMs);

        const cacheValid =
            this.upcomingNotificationCache.windowStart &&
            this.upcomingNotificationCache.windowEnd &&
            this.upcomingNotificationCache.windowStart <= now &&
            this.upcomingNotificationCache.windowEnd >= now &&
            this.upcomingNotificationCache.expiresAt > nowMs;

        if (cacheValid) {
            return this.upcomingNotificationCache.events;
        }

        const events = this.eventService.getScheduled(false, now).filter(event => {
            if (event.deleted || event.allDay) return false;
            const start = new Date(event.start);
            return start >= windowStart && start <= windowEnd;
        });

        this.upcomingNotificationCache = {
            events,
            windowStart,
            windowEnd,
            expiresAt: nowMs + 30000
        };

        return events;
    }

    scheduleNotificationCheck(delayMs) {
        this.notificationTimeout = setTimeout(() => this.checkNotifications(), delayMs);
    }

    scheduleNextNotification(now, hasNearbyEvents, leadMs, windowFutureMs) {
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        if (hasNearbyEvents) {
            this.scheduleNotificationCheck(5000);
            return;
        }

        const events = this.eventService.getScheduled(false, now).filter(event => !event.deleted && !event.allDay);
        let nextStartDiff = null;
        events.forEach(event => {
            const start = new Date(event.start).getTime() - now.getTime();
            if (start >= 0 && (nextStartDiff === null || start < nextStartDiff)) {
                nextStartDiff = start;
            }
        });

        let delayMs = 60000; // Default to 1 minute when nothing is nearby
        if (nextStartDiff !== null) {
            const untilWindow = Math.max(nextStartDiff - windowFutureMs + leadMs, 0);
            delayMs = Math.max(60000, Math.min(untilWindow, 300000));
        }

        this.scheduleNotificationCheck(delayMs);
    }

    speak(eventName, minutesBefore) {
        if (!('speechSynthesis' in window)) return;
        const text = this.settingsService.getNotificationText(eventName, minutesBefore);
        const utterance = new SpeechSynthesisUtterance(text);
        const settings = this.settingsService.get();
        utterance.lang = settings.language;
        window.speechSynthesis.speak(utterance);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) {
                return;
            }

            if (!this.calendarView) return;

            // Check if an event is selected
            if (this.calendarView.selectedEventId) {
                switch (e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        this.handleEventAction('moveDay', this.calendarView.selectedEventId, -1);
                        return;
                    case 'ArrowRight':
                        e.preventDefault();
                        this.handleEventAction('moveDay', this.calendarView.selectedEventId, 1);
                        return;
                    case 'ArrowUp':
                        e.preventDefault();
                        this.handleEventAction('moveTime', this.calendarView.selectedEventId, -15);
                        return;
                    case 'ArrowDown':
                        e.preventDefault();
                        this.handleEventAction('moveTime', this.calendarView.selectedEventId, 15);
                        return;
                    case 'Delete':
                    case 'Backspace':
                        e.preventDefault();
                        this.handleEventAction('delete', this.calendarView.selectedEventId);
                        return;
                    case 'Escape':
                        // Only deselect if no modal is open
                        if (!document.querySelector('.overlay.visible')) {
                            e.preventDefault();
                            this.calendarView.selectedEventId = null;
                            this.calendarView.render();
                        }
                        return;
                }
            }

            // Global shortcuts
            if (e.key === 'm' || e.key === 'M') {
                 this.changeView('dayGridMonth');
                 this.ui.setActiveViewButton(this.ui.elements.viewSelector.querySelector('button[data-view="dayGridMonth"]'));
            } else if (e.key === 'w' || e.key === 'W') {
                 this.changeView('timeGridWeek');
                 this.ui.setActiveViewButton(this.ui.elements.viewSelector.querySelector('button[data-view="timeGridWeek"]'));
            } else if (e.key === 'd' || e.key === 'D') {
                 this.changeView('timeGridDay');
                 this.ui.setActiveViewButton(this.ui.elements.viewSelector.querySelector('button[data-view="timeGridDay"]'));
            } else if (e.key === 'h' || e.key === 'H') {
                 this.changeView('hoursView');
                 this.ui.setActiveViewButton(this.ui.elements.viewSelector.querySelector('button[data-view="hoursView"]'));
            } else if (e.key === 't' || e.key === 'T') {
                 this.calendarView.today();
            } else if (e.key === 'n' || e.key === 'N') {
                 // Create new event at current time rounded to next 30 min
                 const now = new Date();
                 let minutes = Math.ceil(now.getMinutes() / 30) * 30;
                 let hours = now.getHours();
                 if (minutes === 60) { minutes = 0; hours++; }
                 this.openEventCreationAt(hours, minutes);
                 e.preventDefault(); // Prevent type-ahead if any
            } else if (e.key === 's' || e.key === 'S') {
                 // Settings
                 if (this.ui.elements.settingsBtn) this.ui.elements.settingsBtn.click();
            } else if (e.key === 'i' || e.key === 'I') {
                 // Images
                 if (this.ui.elements.openImagePanelBtn) this.ui.elements.openImagePanelBtn.click();
            }

            switch (e.key) {
                case 'ArrowLeft':
                    this.calendarView.prev();
                    break;
                case 'ArrowRight':
                    this.calendarView.next();
                    break;
                case 'ArrowUp':
                    if (this.calendarView.viewType === 'hoursView') {
                        e.preventDefault();
                        this.shiftHoursView(-30);
                    }
                    break;
                case 'ArrowDown':
                    if (this.calendarView.viewType === 'hoursView') {
                        e.preventDefault();
                        this.shiftHoursView(30);
                    }
                    break;
            }
        });
    }

    initCalendarView() {
        const calendarEl = document.getElementById('calendar');
        this.calendarView = new CalendarView(
            calendarEl,
            this.eventService,
            this.calendarService,
            this.imageService
        );

        this.calendarView.onEventClick = this.handleEventClick.bind(this);
        this.calendarView.onDateClick = this.handleDateClick.bind(this);
        this.calendarView.onRangeSelect = this.handleRangeSelect.bind(this); // Bind range select
        this.calendarView.onEventAction = this.handleEventAction.bind(this);
        this.calendarView.onEventChange = this.handleEventChange.bind(this);

        document.getElementById('prev-btn').onclick = () => this.calendarView.prev();
        document.getElementById('next-btn').onclick = () => this.calendarView.next();
        document.getElementById('today-btn').onclick = () => this.calendarView.today();

        this.calendarView.render();
    }

    refreshCalendarResources() {
       this.refreshCalendarEvents();
    }

    async handleEventAction(action, eventId, param) {
        const event = this.eventService.find(eventId);
        if (!event) return;

        if (action === 'delete') {
            if (confirm(`Delete "${event.name}"?`)) {
                 await this.eventService.delete(eventId);
                 this.calendarView.selectedEventId = null;
                 this.refreshCalendarEvents();
            }
            return;
        }

        let newStart = new Date(event.start);
        let newEnd = new Date(event.end);

        if (action === 'moveTime') {
             // param is minutes
             newStart.setTime(newStart.getTime() + param * 60000);
             newEnd.setTime(newEnd.getTime() + param * 60000);
        } else if (action === 'moveDay') {
             // param is days
             newStart.setDate(newStart.getDate() + param);
             newEnd.setDate(newEnd.getDate() + param);
        }

        const updatedEvent = { ...event, start: newStart.toISOString(), end: newEnd.toISOString() };
        await this.eventService.save(updatedEvent);

        this.ensureEventVisible(updatedEvent);
        this.refreshCalendarEvents();
    }

    async handleEventChange(updatedEvent) {
        // Handles drag-and-drop updates
        // We could verify overlaps here if needed, or just save.
        // Assuming user drag is an explicit override.
        await this.eventService.save(updatedEvent);
        this.refreshCalendarEvents();
    }

    ensureEventVisible(event) {
        const range = this.calendarView.getVisibleRange();
        const start = new Date(event.start);

        if (start < range.start) {
            this.calendarView.prev();
        } else if (start > range.end) {
            this.calendarView.next();
        }
    }

    refreshCalendarEvents() {
        if (this.calendarView) {
            this.calendarView.render();
        }
        this.ui.renderTaskQueue(this.getTaskQueue());
    }

    handleEventClick(info) {
        const event = this.eventService.find(info.event.id);
        if (event) {
            this.ui.populateEventForm(event);
            this.ui.toggleModal(this.ui.elements.eventOverlay, true);
        }
    }

    handleDateClick(date, calendarName) {
        if (this.clipboard) {
             this.pasteEvent(date, calendarName);
             return;
        }

        if (this.calendarView.viewType === 'dayGridMonth') {
             this.calendarView.setDate(date);
             this.changeView('timeGridDay');
             const dayBtn = this.ui.elements.viewSelector.querySelector('button[data-view="timeGridDay"]');
             if (dayBtn) this.ui.setActiveViewButton(dayBtn);
        } else {
             // Single click in time grid: open creation with 1 hour duration
             const start = new Date(date);
             const end = new Date(start.getTime() + 60 * 60000);
             this.openEventCreationFromRange(start, end, calendarName);
        }
    }

    handleRangeSelect(start, end, calendarName) {
        this.openEventCreationFromRange(start, end, calendarName);
    }

    changeView(view) {
        // If switching to hoursView, we need to enable update loop
        if (view === 'hoursView') {
             this.calendarView.setView('hoursView');
             this.enableHoursViewUpdates(true);
        } else {
             this.calendarView.setView(view);
             this.enableHoursViewUpdates(false);
             // Reset slots to default if needed (though view switching handles it)
             this.calendarView.setSlotHeight(50); // Reset to default
             this.calendarView.setRange(0, 24);
        }
    }

    enableHoursViewUpdates(enable) {
        if (this.ui.elements.calendarEl) {
            this.ui.elements.calendarEl.classList.toggle('view-hours-stretched', enable);
        }

        if (this.hoursViewInterval) {
            clearInterval(this.hoursViewInterval);
            this.hoursViewInterval = null;
        }

        if (!enable) {
            if (this.hoursResizeListener) {
                window.removeEventListener('resize', this.hoursResizeListener);
                this.hoursResizeListener = null;
            }
            return;
        }

        if (enable) {
            this.updateHoursViewWindow();
            this.hoursViewInterval = setInterval(() => this.updateHoursViewWindow(), 60000);

            if (!this.hoursResizeListener) {
                this.hoursResizeListener = () => requestAnimationFrame(() => this.updateHoursViewWindow());
                window.addEventListener('resize', this.hoursResizeListener);
            }
        }
    }

    updateHoursViewWindow() {
        if (!this.calendarView) return;

        let centerMs;
        if (this.hoursViewMode === 'manual' && this.hoursViewCenterTime) {
            const d = this.hoursViewCenterTime;
            centerMs = d.getHours() * 3600000 + d.getMinutes() * 60000 + d.getSeconds() * 1000;
        } else {
            const now = new Date();
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            centerMs = now.getTime() - startOfDay.getTime();
            this.hoursViewCenterTime = now;
        }

        // Window: -2 hours to +4 hours (6 hours total) for better context
        const START_OFFSET_MS = 120 * 60 * 1000;
        const END_OFFSET_MS = 240 * 60 * 1000;
        const DURATION_MS = START_OFFSET_MS + END_OFFSET_MS;

        let startMs = centerMs - START_OFFSET_MS;
        let endMs = centerMs + END_OFFSET_MS;

        if (startMs < 0) {
            startMs = 0;
            endMs = Math.min(DURATION_MS, 24 * 60 * 60 * 1000);
        }
        if (endMs > 24 * 60 * 60 * 1000) {
            endMs = 24 * 60 * 60 * 1000;
            startMs = Math.max(0, endMs - DURATION_MS);
        }

        // Calculate hours for setRange
        const startHour = startMs / 3600000;
        const endHour = endMs / 3600000;

        this.calendarView.setRange(startHour, endHour);

        // Dynamic slot height
        if (this.ui.elements.calendarEl) {
            const calendarHeight = this.ui.elements.calendarEl.clientHeight;
            const toolbar = this.ui.elements.calendarEl.querySelector('.calendar-header');
            const header = this.ui.elements.calendarEl.querySelector('.time-grid-header');

            const toolbarHeight = toolbar ? toolbar.offsetHeight : 50;
            const headerHeight = header ? header.offsetHeight : 30;

            const availableHeight = calendarHeight - toolbarHeight - headerHeight - 10;

            // Total hours visible = endHour - startHour
            const totalHours = endHour - startHour;

            // We want availableHeight to cover totalHours
            // Slot Height (per hour) = availableHeight / totalHours
            const newSlotHeight = Math.max(20, availableHeight / totalHours);

            this.calendarView.setSlotHeight(newSlotHeight);
        }
    }

    shiftHoursView(minutes) {
        this.hoursViewMode = 'manual';
        if (!this.hoursViewCenterTime) {
            this.hoursViewCenterTime = new Date();
        }
        this.hoursViewCenterTime = new Date(this.hoursViewCenterTime.getTime() + minutes * 60000);
        this.updateHoursViewWindow();
    }

    resetHoursView() {
        this.hoursViewMode = 'auto';
        this.hoursViewCenterTime = new Date();
        this.updateHoursViewWindow();
    }

    async addCalendar(name) {
        const newCal = await this.calendarService.add(name);
        if (newCal) {
            this.ui.renderCalendars(this.calendarService.getAll(), this.calendarService.getVisible());
            this.refreshCalendarEvents();
        }
    }

    async setCalendarVisibility(calendarName, isVisible) {
        await this.calendarService.setVisibility(calendarName, isVisible);
        this.refreshCalendarEvents();
    }

    async undoLastAction() {
        await this.eventService.undo();
        this.refreshCalendarEvents();
    }

    async saveEventFromForm() {
        const formData = this.ui.getEventFormData();
        if (!formData) return;

        // Check for overlaps (simple check)
        const overlaps = this.eventService.checkOverlap(formData.start, formData.end, formData.calendars, formData.id);
        if (overlaps.length > 0) {
            const msg = `Warning: This event overlaps with ${overlaps.length} existing event(s):\n` +
                        overlaps.map(e => `- ${e.name} (${new Date(e.start).toLocaleTimeString()} - ${new Date(e.end).toLocaleTimeString()})`).join('\n') +
                        `\n\nSave anyway?`;
            if (!confirm(msg)) {
                return;
            }
        }

        const calendars = formData.calendars;
        const originalId = formData.id;
        let primarySavedEvent = null;

        for (let i = 0; i < calendars.length; i++) {
            const calName = calendars[i];

            const eventData = { ...formData };
            delete eventData.calendars;
            delete eventData.imageFile;
            eventData.calendar = calName;

            let currentId = '';
            if (originalId && i === 0) {
                 currentId = originalId;
            }

            eventData.id = currentId;

            const saved = await this.eventService.save(eventData);
            if (i === 0) primarySavedEvent = saved;

            const crop = { cropX: 50, cropY: 50 };

            if (formData.imageFile && saved) {
                await new Promise((resolve) => {
                    const r = new FileReader();
                    r.onload = async (e) => {
                        await this.imageService.saveEventImage(saved.id, e.target.result, crop, false);
                        resolve();
                    };
                    r.readAsDataURL(formData.imageFile);
                });

                if (formData.croppedDataUrl) {
                     await this.imageService.saveEventImage(saved.id, formData.croppedDataUrl, crop, true);
                }
            }
            else if (formData.croppedDataUrl && saved) {
                 await this.imageService.saveEventImage(saved.id, formData.croppedDataUrl, crop, true);
            }
        }

        this.refreshCalendarEvents();
    }

    async saveCalendarImage(calendarName, dataUrl, crop) {
        await this.imageService.saveCalendarImage(calendarName, dataUrl, crop);
        this.refreshCalendarEvents();
    }

    async saveCategoryImage(scope, category, dataUrl, crop) {
        await this.imageService.saveCategoryImage(scope, category, dataUrl, crop);

        const matchingEvents = this.eventService.getAll().filter(ev =>
            ev.name.toLowerCase() === category.trim().toLowerCase() &&
            (scope === 'all' || ev.calendar === scope)
        );
        for (const ev of matchingEvents) {
            await this.eventService.save({ ...ev, hasImage: true });
        }

        this.refreshCalendarEvents();
    }

    getScrollTimeString() { return "08:00:00"; }
    getTimeStripWindow() { return { startMinutes: 0, endMinutes: 24 * 60 }; }

    openEventCreationAt(hour, minute) {
        const baseDate = this.calendarView ? this.calendarView.currentDate : new Date();
        const startDate = new Date(baseDate);
        startDate.setHours(hour, minute, 0, 0);
        const endDate = new Date(startDate.getTime() + 60 * 60000);
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
            type: 'event',
            durationMinutes: Math.max(1, Math.round((end - start) / 60000)),
            recurrence: { type: 'none' }
        };
        this.ui.populateEventForm(eventData);
        this.ui.toggleModal(this.ui.elements.eventOverlay, true);
    }

    openTaskCreation() {
        const now = new Date();

        // Find the end of the current task queue to set as start time
        // getScheduled returns scheduled versions of tasks (start times adjusted for queue)
        const scheduledTasks = this.eventService.getScheduled(false, now)
            .filter(ev => (ev.type || 'event') === 'task' && !ev.done);

        let start = new Date(now);

        if (scheduledTasks.length > 0) {
            // We want to append to the end of the *entire* schedule of tasks,
            // so we look at the last task returned by getScheduled (which sorts by time).
            const lastTask = scheduledTasks[scheduledTasks.length - 1];
            if (lastTask) {
                // Use the end of the last task as the start of the new one
                start = new Date(lastTask.end);
                // Ensure we don't go back in time
                if (start < now) {
                     start = new Date(now);
                }
            }
        }

        const end = new Date(start.getTime() + 60 * 60000);
        const defaultCalendar = this.calendarService.getAll()[0]?.name || 'Main';
        const eventData = {
            id: '',
            calendar: defaultCalendar,
            name: '',
            start: start.toISOString(),
            end: end.toISOString(),
            allDay: false,
            type: 'task',
            durationMinutes: 60,
            recurrence: { type: 'none' }
        };
        this.ui.populateEventForm(eventData);
        this.ui.toggleModal(this.ui.elements.eventOverlay, true);
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
            id: '',
            calendar: calendarId || this.clipboard.calendar,
            start: newStart.toISOString(),
            end: newEnd.toISOString()
        };

        await this.eventService.save(newEvent);
        this.refreshCalendarEvents();
        this.ui.showToast('Event pasted', 'success');
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

    async logoutFromMega() {
        await this.megaSync.logout();
        this.setOnlineStatus(false);
        this.ui.showToast('Logged out from MEGA', 'info');
    }

    async sync() {
        if (!this.megaSync.isLoggedIn()) return;

        this.ui.showToast('Syncing with MEGA...', 'info');

        const events = this.eventService.getAll(true);
        const calendars = this.calendarService.getAll(true);
        const images = await this.imageService.load(true);
        const settings = this.settingsService.get();

        const syncedData = await this.megaSync.sync(events, calendars, images, settings);

        if (syncedData) {
            if (syncedData.events) {
                this.eventService.events = syncedData.events;
                await this.db.clear('events');
                for (const ev of syncedData.events) {
                    await this.db.save('events', ev);
                }
            }

            if (syncedData.calendars) {
                this.calendarService.calendars = syncedData.calendars;
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

            if (syncedData.settings) {
                this.settingsService.updateFromSync(syncedData.settings);
                // Also update UI settings immediately if needed, although UI mostly reads on demand.
                // But active settings like language might need refresh?
                // For now, next action will use new settings.
            }

            this.ui.showToast('Sync complete!', 'success');
            this.ui.renderCalendars(this.calendarService.getAll(), this.calendarService.getVisible());
            this.refreshCalendarEvents();

        } else {
            this.ui.showToast('Sync failed.', 'error');
        }
    }

    getTaskQueue() {
        const now = new Date();
        return this.eventService.getScheduled(false, now)
            .filter(ev => (ev.type || 'event') === 'task' && !ev.done) // Removed start <= now to show future tasks
            .sort((a, b) => {
                 // Sort by orderIndex first (for ready tasks), then by start time (for future tasks)
                 // getScheduled already returns them in a decent order (ready tasks sorted by orderIndex, then future tasks)
                 // But merging them into one list:
                 // Ready tasks have dynamic start times now. Future tasks have fixed start times.
                 // So sorting by start time should generally work for the whole list now!
                 return new Date(a.start) - new Date(b.start);
            });
    }

    async reorderTasks(orderIds) {
        await this.eventService.updateTaskOrder(orderIds);
        this.refreshCalendarEvents();
    }

    async markTaskDone(taskId) {
        const task = this.eventService.find(taskId);
        if (!task) return;
        task.done = true;
        task.updatedAt = Date.now();
        await this.eventService.save(task);
        this.refreshCalendarEvents();
    }
}
