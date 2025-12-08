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
            // Image Preview Elements
            imgCalendarPreview: document.getElementById('img-calendar-preview'),
            imgCategoryPreview: document.getElementById('img-category-preview'),
            // Mobile elements
            mobileMenuToggle: document.querySelector('.mobile-menu-toggle'),
            sidebarOverlay: document.getElementById('sidebar-overlay'),
            leftSidebar: document.getElementById('left-sidebar'),
            fabAddEvent: document.querySelector('.fab-add-event'),
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
            this.toggleModal(this.elements.loginOverlay, true);
        });

        // Login cancel
        if (this.elements.loginCancelBtn) {
            this.elements.loginCancelBtn.addEventListener('click', () => {
                this.toggleModal(this.elements.loginOverlay, false);
            });
        }

        // Login submit (just closes for now)
        if (this.elements.loginForm) {
            this.elements.loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;

                await this.app.loginToMega(email, password);

                this.elements.loginOverlay.classList.remove('visible');
                setTimeout(() => this.elements.loginOverlay.classList.add('hidden'), 300);
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
        this.elements.eventForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.app.saveEventFromForm();
            this.toggleModal(this.elements.eventOverlay, false);
        });

        if (this.elements.eventRecurrence) {
            this.elements.eventRecurrence.addEventListener('change', () => {
                this.toggleCustomRecurrenceFields();
            });
        }

        this.elements.eventResetBtn.addEventListener('click', () => {
            this.toggleModal(this.elements.eventOverlay, false);
        });

        // Close event modal X button
        const closeEventBtn = document.getElementById('close-event-modal-btn');
        if (closeEventBtn) {
            closeEventBtn.addEventListener('click', () => {
                this.toggleModal(this.elements.eventOverlay, false);
            });
        }

        // Image management panel
        this.elements.openImagePanelBtn.addEventListener('click', () => {
            this.toggleModal(this.elements.imageManagementPanel, true);
            this.refreshImagePanelSelectors();
        });

        if (this.elements.closeImagePanelBtn) {
            this.elements.closeImagePanelBtn.addEventListener('click', () => {
                this.toggleModal(this.elements.imageManagementPanel, false);
            });
        }

        // Calendar image save
        // Calendar image save
        this.elements.imgCalendarSaveBtn.addEventListener('click', async () => {
            const calName = this.elements.imgCalendarSelect.value;
            const file = this.elements.imgCalendarFile.files[0];
            if (!calName) {
                this.showToast('Please select a calendar.', 'error');
                return;
            }
            if (!file) {
                this.showToast('Please select an image file.', 'error');
                return;
            }
            try {
                const dataUrl = await this.readFileAsDataURL(file);
                const cropX = Math.min(100, Math.max(0, parseInt(this.elements.imgCalendarCropX?.value, 10) || 50));
                const cropY = Math.min(100, Math.max(0, parseInt(this.elements.imgCalendarCropY?.value, 10) || 50));
                await this.app.saveCalendarImage(calName, dataUrl, { cropX, cropY });
                this.showToast('Calendar image saved!', 'success');
            } catch (error) {
                console.error('Failed to save calendar image:', error);
                this.showToast('Failed to save image.', 'error');
            }
        });

        // Category image save
        this.elements.imgCategorySaveBtn.addEventListener('click', async () => {
            const category = this.elements.imgCategoryName.value.trim();
            const scope = this.elements.imgCategoryScope.value || 'all';
            const file = this.elements.imgCategoryFile.files[0];

            if (!category) {
                this.showToast('Please enter a category name.', 'error');
                return;
            }
            if (!file) {
                this.showToast('Please select an image file.', 'error');
                return;
            }

            try {
                const dataUrl = await this.readFileAsDataURL(file);
                const cropX = Math.min(100, Math.max(0, parseInt(this.elements.imgCategoryCropX?.value, 10) || 50));
                const cropY = Math.min(100, Math.max(0, parseInt(this.elements.imgCategoryCropY?.value, 10) || 50));
                await this.app.saveCategoryImage(scope, category, dataUrl, { cropX, cropY });
                this.showToast('Category image saved!', 'success');
            } catch (error) {
                console.error('Failed to save category image:', error);
                this.showToast('Failed to save image.', 'error');
            }
        });

        // Initialize Previews
        this.setupImagePreview(
            this.elements.imgCalendarFile,
            this.elements.imgCalendarPreview,
            this.elements.imgCalendarCropX,
            this.elements.imgCalendarCropY
        );
        this.setupImagePreview(
            this.elements.imgCategoryFile,
            this.elements.imgCategoryPreview,
            this.elements.imgCategoryCropX,
            this.elements.imgCategoryCropY
        );

        // Right sidebar hover / click -> choose time in the same zoom window as day view
        if (this.elements.timeHoverContainer) {
            const container = this.elements.timeHoverContainer;
            const indicator = this.elements.timeHoverIndicator;
            let isDragging = false;
            let startY = 0;
            let startMinutes = 0;

            // Helper to get minutes from Y position
            const getMinutesFromY = (y) => {
                const rect = container.getBoundingClientRect();
                const safeY = Math.min(Math.max(y - rect.top, 0), rect.height);
                const ratio = rect.height > 0 ? (safeY / rect.height) : 0;
                return Math.round(ratio * 24 * 60);
            };

            const formatTime = (minutes) => {
                const h = Math.floor(minutes / 60);
                const m = Math.floor(minutes % 60);
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            };

            // Drag Start
            container.addEventListener('mousedown', (e) => {
                isDragging = true;
                startY = e.clientY;
                startMinutes = getMinutesFromY(e.clientY);

                // Create/Update visual selection div
                let selection = document.getElementById('time-strip-selection');
                if (!selection) {
                    selection = document.createElement('div');
                    selection.id = 'time-strip-selection';
                    selection.style.position = 'absolute';
                    selection.style.background = 'rgba(var(--primary-hue), var(--primary-sat), var(--primary-lig), 0.3)';
                    selection.style.width = '100%';
                    selection.style.pointerEvents = 'none';
                    container.appendChild(selection);
                }

                const rect = container.getBoundingClientRect();
                const relativeY = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
                selection.style.top = `${relativeY}px`;
                selection.style.height = '1px';
                selection.style.display = 'block';
            });

            // Dragging (Selection Update)
            window.addEventListener('mousemove', (e) => {
                if (!isDragging) {
                    // Hover effect only
                    if (container.contains(e.target)) {
                        const mins = getMinutesFromY(e.clientY);
                        indicator.textContent = formatTime(mins);
                        const rect = container.getBoundingClientRect();
                        const relativeY = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
                        indicator.style.top = `${relativeY - 8}px`;
                        indicator.style.display = 'block';
                    } else {
                        indicator.style.display = 'none';
                    }
                    return;
                }

                // Update selection visual
                const currentMinutes = getMinutesFromY(e.clientY);
                const rect = container.getBoundingClientRect();
                const currentY = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
                const startRelY = (startMinutes / (24 * 60)) * rect.height; // Recalculate robust start Y

                const top = Math.min(startRelY, currentY);
                const height = Math.abs(currentY - startRelY);

                const selection = document.getElementById('time-strip-selection');
                if (selection) {
                    selection.style.top = `${top}px`;
                    selection.style.height = `${height}px`;
                }

                indicator.textContent = `${formatTime(Math.min(startMinutes, currentMinutes))} - ${formatTime(Math.max(startMinutes, currentMinutes))}`;
                indicator.style.top = `${currentY}px`;
            });

            // Drag End (Create Event)
            window.addEventListener('mouseup', (e) => {
                if (!isDragging) return;
                isDragging = false;

                const endMinutes = getMinutesFromY(e.clientY);

                // Determine range
                const minMins = Math.min(startMinutes, endMinutes);
                const maxMins = Math.max(startMinutes, endMinutes);

                // If it's just a click (diff < 5 mins), treat as 30m slot
                const diff = maxMins - minMins;
                let finalStart = minMins;
                let finalEnd = maxMins;

                if (diff < 15) {
                    finalEnd = finalStart + 30; // Default 30 min
                }

                // Hide selection visual
                const selection = document.getElementById('time-strip-selection');
                if (selection) selection.style.display = 'none';

                // Convert to Dates
                const baseDate = new Date(); // Or current viewed date
                const start = new Date(baseDate);
                start.setHours(Math.floor(finalStart / 60), finalStart % 60, 0, 0);

                const end = new Date(baseDate);
                end.setHours(Math.floor(finalEnd / 60), finalEnd % 60, 0, 0);

                // Open modal
                this.app.openEventCreationFromRange(start, end);
            });
        }

        // Mobile Interactions
        if (this.elements.mobileMenuToggle) {
            this.elements.mobileMenuToggle.addEventListener('click', () => {
                this.elements.leftSidebar.classList.add('open');
                this.elements.sidebarOverlay.classList.add('visible');
            });
        }

        if (this.elements.sidebarOverlay) {
            this.elements.sidebarOverlay.addEventListener('click', () => {
                this.elements.leftSidebar.classList.remove('open');
                this.elements.sidebarOverlay.classList.remove('visible');
            });
        }

        if (this.elements.fabAddEvent) {
            this.elements.fabAddEvent.addEventListener('click', () => {
                const now = new Date();
                // Default to next rounded half-hour
                let minutes = Math.ceil(now.getMinutes() / 30) * 30;
                let hours = now.getHours();
                if (minutes === 60) {
                    minutes = 0;
                    hours += 1;
                }
                this.app.openEventCreationAt(hours, minutes);
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
        const calendars = this.app ? this.app.calendarService.getAll() : [];
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

    getEventFormData() {
        const id = this.elements.eventId.value || null;
        const calendar = this.elements.eventCalendar.value;
        const name = this.elements.eventName.value.trim();
        const date = this.elements.eventDate.value;
        const startTime = this.elements.eventStartTime.value;
        const endTime = this.elements.eventEndTime.value;

        if (!calendar || !name || !date || !startTime || !endTime) {
            alert('Please fill all required fields.');
            return null;
        }

        const recurrence = this.getRecurrencePayload();
        if (recurrence.type === 'custom' && (!recurrence.days || !recurrence.days.length)) {
            alert('Please select at least one weekday for custom recurrence.');
            return null;
        }

        return {
            id,
            calendar,
            name,
            start: new Date(`${date}T${startTime}:00`).toISOString(),
            end: new Date(`${date}T${endTime}:00`).toISOString(),
            recurrence
        };
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

    toggleModal(modalElement, show) {
        if (show) {
            modalElement.classList.remove('hidden');
            // Delay to allow the display property to apply before starting the transition
            setTimeout(() => modalElement.classList.add('visible'), 10);
        } else {
            modalElement.classList.remove('visible');
            // Hide the element after the transition is complete
            setTimeout(() => modalElement.classList.add('hidden'), 300);
        }
    }

    setupImagePreview(fileInput, imgEl, cropXInput, cropYInput) {
        if (!fileInput || !imgEl) return;

        const updatePosition = () => {
            const x = cropXInput ? cropXInput.value : 50;
            const y = cropYInput ? cropYInput.value : 50;
            imgEl.style.objectPosition = `${x}% ${y}%`;
        };

        if (cropXInput) cropXInput.addEventListener('input', updatePosition);
        if (cropYInput) cropYInput.addEventListener('input', updatePosition);

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (file) {
                const dataUrl = await this.readFileAsDataURL(file);
                imgEl.src = dataUrl;
                imgEl.style.display = 'block';
                updatePosition();
            } else {
                imgEl.style.display = 'none';
                imgEl.src = '';
            }
        });
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Animation in
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        // Remove after 3s
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
}
