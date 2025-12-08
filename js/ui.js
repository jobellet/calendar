class UI {
    constructor() {
        this.elements = {
            syncBtn: document.getElementById('sync-btn'),
            viewSelector: document.getElementById('view-selector'),
            calendarsList: document.getElementById('calendars-list'),
            addCalendarBtn: document.getElementById('add-calendar-btn'),
            openImagePanelBtn: document.getElementById('open-image-panel-btn'),
            closeImagePanelBtn: document.getElementById('close-image-panel-btn'),
            imageManagementPanel: document.getElementById('image-management-panel'),
            calendarEl: document.getElementById('calendar'),
            // right sidebar hover area
            rightSidebar: document.getElementById('right-sidebar'),
            timeHoverContainer: document.getElementById('time-hover-container'),
            timeHoverIndicator: document.getElementById('time-hover-indicator'),
            // Image management controls
            imgCalendarSelect: document.getElementById('img-calendar-select'),
            imgCalendarFile: document.getElementById('img-calendar-file'),
            imgCalendarCropX: document.getElementById('img-calendar-crop-x'),
            imgCalendarCropY: document.getElementById('img-calendar-crop-y'),
            imgCalendarSaveBtn: document.getElementById('img-calendar-save-btn'),
            imgCategoryName: document.getElementById('img-category-name'),
            imgCategoryScope: document.getElementById('img-category-scope'),
            imgCategoryFile: document.getElementById('img-category-file'),
            imgCategoryCropX: document.getElementById('img-category-crop-x'),
            imgCategoryCropY: document.getElementById('img-category-crop-y'),
            imgCategorySaveBtn: document.getElementById('img-category-save-btn'),
            // Login overlay
            loginOverlay: document.getElementById('login-overlay'),
            loginForm: document.getElementById('login-form'),
            loginCancelBtn: document.getElementById('login-cancel-btn'),
            // Event overlay + form
            eventOverlay: document.getElementById('event-overlay'),
            eventForm: document.getElementById('event-form'),
            eventFormTitle: document.getElementById('event-form-title'),
            eventId: document.getElementById('event-id'),
            eventCalendar: document.getElementById('event-calendar'),
            eventName: document.getElementById('event-name'),
            eventDate: document.getElementById('event-date'),
            eventStartTime: document.getElementById('event-start-time'),
            eventEndTime: document.getElementById('event-end-time'),
            eventRecurrence: document.getElementById('event-recurrence'),
            eventResetBtn: document.getElementById('event-reset-btn'),
            customRecurrenceOptions: document.getElementById('custom-recurrence-options'),
            recurrenceDayInputs: Array.from(document.querySelectorAll('input[name="event-recurrence-days"]')),
            eventRecurrenceInterval: document.getElementById('event-recurrence-interval'),
            eventRecurrenceUntil: document.getElementById('event-recurrence-until'),
        };
    }

    init(app) {
        this.app = app;
        this.addEventListeners();
    }

    addEventListeners() {
        // View selector buttons
        this.elements.viewSelector.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const view = e.target.dataset.view;
                this.setActiveViewButton(e.target);
                this.app.changeView(view);
            }
        });

        // Ctrl+Z / Cmd+Z for undo
        window.addEventListener('keydown', (e) => {
            const isUndo = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z');
            if (isUndo) {
                e.preventDefault();
                this.app.undoLastAction();
            }
        });

        // Sync button -> open login overlay
        this.elements.syncBtn.addEventListener('click', () => {
            if (this.elements.loginOverlay) {
                this.elements.loginOverlay.classList.remove('hidden');
            }
        });

        // Login cancel
        if (this.elements.loginCancelBtn) {
            this.elements.loginCancelBtn.addEventListener('click', () => {
                this.elements.loginOverlay.classList.add('hidden');
            });
        }

        // Login submit (just closes for now)
        if (this.elements.loginForm) {
            this.elements.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                // later: this.app.megaSync.login(email, password);
                this.elements.loginOverlay.classList.add('hidden');
                this.app.setOnlineStatus(true);
            });
        }

        // Add calendar
        this.elements.addCalendarBtn.addEventListener('click', () => {
            const name = window.prompt('New calendar name:');
            if (name && name.trim()) {
                this.app.addCalendar(name.trim());
            }
        });

        // Event form submit (overlay)
        this.elements.eventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.app.saveEventFromForm();
            this.elements.eventOverlay.classList.add('hidden');
        });

        if (this.elements.eventRecurrence) {
            this.elements.eventRecurrence.addEventListener('change', () => {
                this.toggleCustomRecurrenceFields();
            });
        }

        this.elements.eventResetBtn.addEventListener('click', () => {
            this.elements.eventOverlay.classList.add('hidden');
        });

        // Image management panel
        this.elements.openImagePanelBtn.addEventListener('click', () => {
            this.elements.imageManagementPanel.classList.remove('hidden');
            this.refreshImagePanelSelectors();
        });

        if (this.elements.closeImagePanelBtn) {
            this.elements.closeImagePanelBtn.addEventListener('click', () => {
                this.elements.imageManagementPanel.classList.add('hidden');
            });
        }

        // Calendar image save
        this.elements.imgCalendarSaveBtn.addEventListener('click', async () => {
            const calName = this.elements.imgCalendarSelect.value;
            const file = this.elements.imgCalendarFile.files[0];
            if (!calName || !file) return;
            const dataUrl = await this.readFileAsDataURL(file);
            const cropX = Math.min(100, Math.max(0, parseInt(this.elements.imgCalendarCropX?.value, 10) || 50));
            const cropY = Math.min(100, Math.max(0, parseInt(this.elements.imgCalendarCropY?.value, 10) || 50));
            this.app.saveCalendarImage(calName, dataUrl, { cropX, cropY });
        });

        // Category image save
        this.elements.imgCategorySaveBtn.addEventListener('click', async () => {
            const category = this.elements.imgCategoryName.value.trim();
            const scope = this.elements.imgCategoryScope.value || 'all';
            const file = this.elements.imgCategoryFile.files[0];
            if (!category || !file) return;
            const dataUrl = await this.readFileAsDataURL(file);
            const cropX = Math.min(100, Math.max(0, parseInt(this.elements.imgCategoryCropX?.value, 10) || 50));
            const cropY = Math.min(100, Math.max(0, parseInt(this.elements.imgCategoryCropY?.value, 10) || 50));
            this.app.saveCategoryImage(scope, category, dataUrl, { cropX, cropY });
        });

        // Right sidebar hover / click -> choose time in the same zoom window as day view
        if (this.elements.timeHoverContainer) {
            const container = this.elements.timeHoverContainer;
            const indicator = this.elements.timeHoverIndicator;

            const updateIndicator = (clientY) => {
                const rect = container.getBoundingClientRect();
                const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);

                const { startMinutes, endMinutes } = this.app.getTimeStripWindow();
                const span = Math.max(1, endMinutes - startMinutes);
                const ratio = rect.height > 0 ? (y / rect.height) : 0;
                const minutes = startMinutes + ratio * span;

                const hour = Math.floor(minutes / 60);
                const minute = Math.round(minutes % 60);
                const hh = hour.toString().padStart(2, '0');
                const mm = minute.toString().padStart(2, '0');

                indicator.textContent = `${hh}:${mm}`;
                indicator.style.top = `${y - 8}px`;
            };

            container.addEventListener('mousemove', (e) => {
                updateIndicator(e.clientY);
            });

            container.addEventListener('mouseleave', () => {
                indicator.textContent = 'Move here to choose a time';
                indicator.style.top = '4px';
            });

            container.addEventListener('click', (e) => {
                const rect = container.getBoundingClientRect();
                const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);

                const { startMinutes, endMinutes } = this.app.getTimeStripWindow();
                const span = Math.max(1, endMinutes - startMinutes);
                const ratio = rect.height > 0 ? (y / rect.height) : 0;
                const minutes = startMinutes + ratio * span;

                const hour = Math.floor(minutes / 60);
                const minute = Math.round(minutes % 60);

                this.app.openEventCreationAt(hour, minute);
            });
        }
    }

    setActiveViewButton(activeBtn) {
        const buttons = this.elements.viewSelector.querySelectorAll('button');
        buttons.forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    renderCalendars(calendars, visibleCalendars) {
        // Calendars in left list
        this.elements.calendarsList.innerHTML = '';
        calendars.forEach(calendar => {
            const wrapper = document.createElement('div');
            wrapper.className = 'calendar-item';
            const id = `cal-${calendar.name}`;
            wrapper.innerHTML = `
                <input type="checkbox" id="${id}" data-calendar="${calendar.name}" ${visibleCalendars.has(calendar.name) ? 'checked' : ''}>
                <label for="${id}">${calendar.name}</label>
            `;
            this.elements.calendarsList.appendChild(wrapper);
        });

        // Calendar selector in event form
        this.elements.eventCalendar.innerHTML = '';
        calendars.forEach(calendar => {
            const opt = document.createElement('option');
            opt.value = calendar.name;
            opt.textContent = calendar.name;
            this.elements.eventCalendar.appendChild(opt);
        });

        // Calendar selector in image panel
        this.refreshImagePanelSelectors();

        // Attach visibility listeners
        this.elements.calendarsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const calendarName = cb.dataset.calendar;
                const isVisible = cb.checked;
                this.app.setCalendarVisibility(calendarName, isVisible);
            });
        });
    }

    refreshImagePanelSelectors() {
        const calendars = this.app ? this.app.calendars : [];
        // Calendar image select
        this.elements.imgCalendarSelect.innerHTML = '';
        calendars.forEach(cal => {
            const opt = document.createElement('option');
            opt.value = cal.name;
            opt.textContent = cal.name;
            this.elements.imgCalendarSelect.appendChild(opt);
        });

        // Category scope select
        this.elements.imgCategoryScope.innerHTML = '';
        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'All calendars';
        this.elements.imgCategoryScope.appendChild(allOpt);
        calendars.forEach(cal => {
            const opt = document.createElement('option');
            opt.value = cal.name;
            opt.textContent = cal.name;
            this.elements.imgCategoryScope.appendChild(opt);
        });
    }

    populateEventForm(eventData) {
        this.elements.eventFormTitle.textContent = eventData && eventData.id ? 'Edit event' : 'Create event';

        this.elements.eventId.value = eventData?.id || '';
        this.elements.eventName.value = eventData?.name || '';

        if (eventData?.calendar) {
            this.elements.eventCalendar.value = eventData.calendar;
        } else if (this.elements.eventCalendar.options.length) {
            this.elements.eventCalendar.value = this.elements.eventCalendar.options[0].value;
        }

        if (eventData?.start) {
            const startDate = new Date(eventData.start);
            this.elements.eventDate.value = startDate.toISOString().slice(0, 10);
            this.elements.eventStartTime.value = startDate.toTimeString().slice(0, 5);
        } else {
            this.elements.eventDate.value = '';
            this.elements.eventStartTime.value = '';
        }

        if (eventData?.end) {
            const endDate = new Date(eventData.end);
            this.elements.eventEndTime.value = endDate.toTimeString().slice(0, 5);
        } else {
            this.elements.eventEndTime.value = '';
        }

        this.setRecurrenceValues(eventData?.recurrence);
    }

    clearEventForm() {
        this.populateEventForm(null);
    }

    setRecurrenceValues(recurrence) {
        const safeRecurrence = recurrence || { type: 'none', days: [], intervalWeeks: 1, until: null };
        const type = safeRecurrence.type || 'none';
        if (this.elements.eventRecurrence) {
            this.elements.eventRecurrence.value = type;
        }
        this.toggleCustomRecurrenceFields();

        if (type === 'custom') {
            const days = Array.isArray(safeRecurrence.days) ? safeRecurrence.days : [];
            this.elements.recurrenceDayInputs.forEach(input => {
                input.checked = days.includes(Number(input.value));
            });
            if (this.elements.eventRecurrenceInterval) {
                this.elements.eventRecurrenceInterval.value = safeRecurrence.intervalWeeks || 1;
            }
            if (this.elements.eventRecurrenceUntil) {
                this.elements.eventRecurrenceUntil.value = safeRecurrence.until || '';
            }
        } else {
            this.elements.recurrenceDayInputs.forEach(input => {
                input.checked = false;
            });
            if (this.elements.eventRecurrenceInterval) {
                this.elements.eventRecurrenceInterval.value = 1;
            }
            if (this.elements.eventRecurrenceUntil) {
                this.elements.eventRecurrenceUntil.value = '';
            }
        }
    }

    toggleCustomRecurrenceFields() {
        if (!this.elements.customRecurrenceOptions || !this.elements.eventRecurrence) {
            return;
        }
        const show = this.elements.eventRecurrence.value === 'custom';
        this.elements.customRecurrenceOptions.classList.toggle('hidden', !show);
    }

    getRecurrencePayload() {
        const type = this.elements.eventRecurrence?.value || 'none';
        const payload = {
            type,
            days: [],
            intervalWeeks: 1,
            until: null
        };
        if (type === 'custom') {
            const days = this.elements.recurrenceDayInputs
                .filter(input => input.checked)
                .map(input => Number(input.value));
            payload.days = days;
            const intervalValue = parseInt(this.elements.eventRecurrenceInterval?.value, 10);
            payload.intervalWeeks = (!Number.isNaN(intervalValue) && intervalValue > 0) ? intervalValue : 1;
            payload.until = this.elements.eventRecurrenceUntil?.value || null;
        }
        return payload;
    }

    setSyncStatus(online) {
        if (online) {
            this.elements.syncBtn.classList.remove('status-offline');
            this.elements.syncBtn.classList.add('status-online');
        } else {
            this.elements.syncBtn.classList.remove('status-online');
            this.elements.syncBtn.classList.add('status-offline');
        }
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
}
