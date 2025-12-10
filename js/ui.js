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
            eventCalendarList: document.getElementById('event-calendar-list'),
            eventName: document.getElementById('event-name'),
            eventDate: document.getElementById('event-date'),
            eventStartTime: document.getElementById('event-start-time'),
            eventEndDate: document.getElementById('event-end-date'),
            eventEndTime: document.getElementById('event-end-time'),
            eventAllDay: document.getElementById('event-all-day'),
            eventStartTimeLabel: document.getElementById('event-start-time-label'),
            eventEndDateLabel: document.getElementById('event-end-date-label'),
            eventEndTimeLabel: document.getElementById('event-end-time-label'),
            eventRecurrence: document.getElementById('event-recurrence'),
            eventResetBtn: document.getElementById('event-reset-btn'),
            customRecurrenceOptions: document.getElementById('custom-recurrence-options'),
            recurrenceDayInputs: Array.from(document.querySelectorAll('input[name="event-recurrence-days"]')),
            eventRecurrenceInterval: document.getElementById('event-recurrence-interval'),
            eventRecurrenceUntil: document.getElementById('event-recurrence-until'),
            // New Event Image Elements
            eventImageFile: document.getElementById('event-image-file'),
            eventImagePreview: document.getElementById('event-image-preview'),
            eventImageSuggestion: document.getElementById('event-image-suggestion'),
            // Image Preview Elements
            imgCalendarPreview: document.getElementById('img-calendar-preview'),
            imgCategoryPreview: document.getElementById('img-category-preview'),
            // Hours View Controls
            hoursViewControls: document.getElementById('hours-view-controls'),
            hoursUpBtn: document.getElementById('hours-up-btn'),
            hoursDownBtn: document.getElementById('hours-down-btn'),
            hoursResetBtn: document.getElementById('hours-reset-btn'),
            // Mobile elements
            mobileMenuToggle: document.querySelector('.mobile-menu-toggle'),
            sidebarOverlay: document.getElementById('sidebar-overlay'),
            leftSidebar: document.getElementById('left-sidebar'),
            closeSidebarBtn: document.getElementById('close-sidebar-btn'),
            fabAddEvent: document.querySelector('.fab-add-event'),
        };
        this.activeCropper = null;
        this.originalImageSource = null; // Store the original source when editing
    }

    init(app) {
        this.app = app;
        this.addEventListeners();
        this.setupEventImageHandling();
        this.setupContextMenu();
        this.setupLongPressHandlers();
    }

    setupContextMenu() {
        const createMenu = (x, y, options) => {
            // Remove existing
            const existing = document.querySelector('.context-menu');
            if (existing) existing.remove();

            const menu = document.createElement('div');
            menu.className = 'context-menu glass-panel';
            menu.style.top = `${y}px`;
            menu.style.left = `${x}px`;

            options.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'context-menu-item';
                item.textContent = opt.label;
                item.onclick = (e) => {
                    e.stopPropagation();
                    opt.action();
                    menu.remove();
                };
                menu.appendChild(item);
            });

            document.body.appendChild(menu);

            // Close on click elsewhere
            const close = () => {
                menu.remove();
                document.removeEventListener('click', close);
            };
            setTimeout(() => document.addEventListener('click', close), 0);
        };

        // Context menu listener on calendar
        if (this.elements.calendarEl) {
            this.elements.calendarEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                let target = e.target;

                // 1. Check for Event
                const contentWrapper = target.closest('.custom-event-content');
                if (contentWrapper && contentWrapper.dataset.eventId) {
                    const eventId = contentWrapper.dataset.eventId;
                    const options = [
                        { label: 'Copy Event', action: () => this.app.copyEvent(eventId) },
                        {
                            label: 'Delete Event', action: async () => {
                                if (confirm('Delete this event?')) {
                                    await this.app.eventService.delete(eventId);
                                    this.app.refreshCalendarEvents();
                                }
                            }
                        }
                    ];
                    createMenu(e.clientX, e.clientY, options);
                    return;
                }

                // 2. Check for Paste (Empty Slot)
                if (this.app.clipboard) {
                    // Try to guess resource from column
                    const col = target.closest('.fc-timegrid-col');
                    if (col || target.closest('.fc-timegrid-body')) {
                        // We offer paste if there is something in clipboard
                        const options = [
                            {
                                label: `Paste "${this.app.clipboard.name}"`, action: () => {
                                    const now = new Date();
                                    this.app.pasteEvent(now, null);
                                }
                            }
                        ];
                        createMenu(e.clientX, e.clientY, options);
                    }
                }
            });
        }
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

        // All Day toggle
        if (this.elements.eventAllDay) {
            this.elements.eventAllDay.addEventListener('change', () => {
                this.toggleAllDayFields();
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
                this.destroyCropper(); // Clean up on close
            });
        }

        // Calendar image save
        this.elements.imgCalendarSaveBtn.addEventListener('click', async () => {
            const calName = this.elements.imgCalendarSelect.value;
            // Get original file if present
            const file = this.elements.imgCalendarFile.files[0];

            if (!calName) {
                this.showToast('Please select a calendar.', 'error');
                return;
            }

            // We might have a file selected OR we might be editing an existing one (not implemented for cal yet).
            // But if we have an active cropper, we use it.
            if (!this.activeCropper && !file) {
                 this.showToast('Please select an image file.', 'error');
                 return;
            }

            try {
                let dataUrl, originalDataUrl;

                if (this.activeCropper) {
                     dataUrl = this.activeCropper.getCroppedCanvas().toDataURL();
                     originalDataUrl = this.originalImageSource;
                } else if (file) {
                     dataUrl = await this.readFileAsDataURL(file);
                     originalDataUrl = null; // No crop
                }

                // Legacy cropX/Y are ignored if we use cropper
                await this.app.saveCalendarImage(calName, dataUrl, {}, originalDataUrl);
                this.showToast('Calendar image saved!', 'success');
                this.destroyCropper();
                this.elements.imgCalendarFile.value = ''; // Reset input
                this.elements.imgCalendarPreview.style.display = 'none';
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
             if (!this.activeCropper && !file) {
                this.showToast('Please select an image file.', 'error');
                return;
            }

            try {
                 let dataUrl, originalDataUrl;

                if (this.activeCropper) {
                     dataUrl = this.activeCropper.getCroppedCanvas().toDataURL();
                     originalDataUrl = this.originalImageSource;
                } else if (file) {
                     dataUrl = await this.readFileAsDataURL(file);
                     originalDataUrl = null;
                }

                await this.app.saveCategoryImage(scope, category, dataUrl, {}, originalDataUrl);
                this.showToast('Category image saved!', 'success');
                this.destroyCropper();
                this.elements.imgCategoryFile.value = '';
                this.elements.imgCategoryPreview.style.display = 'none';
            } catch (error) {
                console.error('Failed to save category image:', error);
                this.showToast('Failed to save image.', 'error');
            }
        });

        // Initialize Previews with Cropper
        this.setupImageCropper(
            this.elements.imgCalendarFile,
            this.elements.imgCalendarPreview,
            [this.elements.imgCalendarCropX, this.elements.imgCalendarCropY]
        );
        this.setupImageCropper(
            this.elements.imgCategoryFile,
            this.elements.imgCategoryPreview,
            [this.elements.imgCategoryCropX, this.elements.imgCategoryCropY]
        );

        // Right sidebar hover logic...
        if (this.elements.timeHoverContainer) {
             // ... existing logic ...
            const container = this.elements.timeHoverContainer;
            const indicator = this.elements.timeHoverIndicator;
            let isDragging = false;
            let startY = 0;
            let startMinutes = 0;

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

            const handleDragStart = (e) => {
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                isDragging = true;
                startY = clientY;
                startMinutes = getMinutesFromY(clientY);

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
                const relativeY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
                selection.style.top = `${relativeY}px`;
                selection.style.height = '1px';
                selection.style.display = 'block';
            };

            container.addEventListener('mousedown', handleDragStart);
            container.addEventListener('touchstart', (e) => {
                if (e.cancelable) e.preventDefault();
                handleDragStart(e);
            }, { passive: false });

            const handleDragMove = (e) => {
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const target = e.touches ? document.elementFromPoint(e.touches[0].clientX, clientY) : e.target;

                if (!isDragging) {
                    if (!e.touches && container.contains(target)) {
                        const mins = getMinutesFromY(clientY);
                        indicator.textContent = formatTime(mins);
                        const rect = container.getBoundingClientRect();
                        const relativeY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
                        indicator.style.top = `${relativeY - 8}px`;
                        indicator.style.display = 'block';
                    } else if (!isDragging) {
                        indicator.style.display = 'none';
                    }
                    return;
                }

                const currentMinutes = getMinutesFromY(clientY);
                const rect = container.getBoundingClientRect();
                const currentY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
                const startRelY = (startMinutes / (24 * 60)) * rect.height;

                const top = Math.min(startRelY, currentY);
                const height = Math.abs(currentY - startRelY);

                const selection = document.getElementById('time-strip-selection');
                if (selection) {
                    selection.style.top = `${top}px`;
                    selection.style.height = `${height}px`;
                }

                indicator.textContent = `${formatTime(Math.min(startMinutes, currentMinutes))} - ${formatTime(Math.max(startMinutes, currentMinutes))}`;
                indicator.style.top = `${currentY}px`;
                indicator.style.display = 'block';
            };

            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('touchmove', (e) => {
                 if (isDragging && e.cancelable) {
                    e.preventDefault();
                }
                handleDragMove(e);
            }, { passive: false });

            const handleDragEnd = (e) => {
                if (!isDragging) return;
                isDragging = false;

                const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
                const endMinutes = getMinutesFromY(clientY);
                const minMins = Math.min(startMinutes, endMinutes);
                const maxMins = Math.max(startMinutes, endMinutes);

                const diff = maxMins - minMins;
                let finalStart = minMins;
                let finalEnd = maxMins;

                if (diff < 15) {
                    finalEnd = finalStart + 30;
                }

                const selection = document.getElementById('time-strip-selection');
                if (selection) selection.style.display = 'none';
                indicator.style.display = 'none';

                const baseDate = new Date();
                const start = new Date(baseDate);
                start.setHours(Math.floor(finalStart / 60), finalStart % 60, 0, 0);

                const end = new Date(baseDate);
                end.setHours(Math.floor(finalEnd / 60), finalEnd % 60, 0, 0);

                this.app.openEventCreationFromRange(start, end);
            };

            window.addEventListener('mouseup', handleDragEnd);
            window.addEventListener('touchend', handleDragEnd);
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

        if (this.elements.closeSidebarBtn) {
            this.elements.closeSidebarBtn.addEventListener('click', () => {
                this.elements.leftSidebar.classList.remove('open');
                this.elements.sidebarOverlay.classList.remove('visible');
            });
        }

        if (this.elements.fabAddEvent) {
            this.elements.fabAddEvent.addEventListener('click', () => {
                const now = new Date();
                let minutes = Math.ceil(now.getMinutes() / 30) * 30;
                let hours = now.getHours();
                if (minutes === 60) {
                    minutes = 0;
                    hours += 1;
                }
                this.app.openEventCreationAt(hours, minutes);
            });
        }

        // Hours View Controls
        if (this.elements.hoursUpBtn) {
            this.elements.hoursUpBtn.addEventListener('click', () => {
                this.app.shiftHoursView(-30);
            });
        }
        if (this.elements.hoursDownBtn) {
            this.elements.hoursDownBtn.addEventListener('click', () => {
                this.app.shiftHoursView(30);
            });
        }
        if (this.elements.hoursResetBtn) {
            this.elements.hoursResetBtn.addEventListener('click', () => {
                this.app.resetHoursView();
            });
        }
    }

    setActiveViewButton(activeBtn) {
        const buttons = this.elements.viewSelector.querySelectorAll('button');
        buttons.forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');

        if (activeBtn.dataset.view === 'hoursView') {
            this.elements.hoursViewControls.style.display = 'flex';
        } else {
            this.elements.hoursViewControls.style.display = 'none';
        }
    }

    renderCalendars(calendars, visibleCalendars) {
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
        this.elements.eventCalendarList.innerHTML = '';
        calendars.forEach(calendar => {
            const wrapper = document.createElement('div');
            wrapper.className = 'checkbox-item';
            const id = `evt-cal-${calendar.name.replace(/\s+/g, '-')}`;

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'event-selected-calendars';
            input.id = id;
            input.value = calendar.name;

            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = calendar.name;

            wrapper.appendChild(input);
            wrapper.appendChild(label);
            this.elements.eventCalendarList.appendChild(wrapper);
        });

        this.refreshImagePanelSelectors();

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
        this.elements.imgCalendarSelect.innerHTML = '';
        calendars.forEach(cal => {
            const opt = document.createElement('option');
            opt.value = cal.name;
            opt.textContent = cal.name;
            this.elements.imgCalendarSelect.appendChild(opt);
        });

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

    async populateEventForm(eventData) {
        this.elements.eventFormTitle.textContent = eventData && eventData.id ? 'Edit event' : 'Create event';

        this.elements.eventId.value = eventData?.id || '';
        this.elements.eventName.value = eventData?.name || '';

        // Clear all checks first
        const checkboxes = this.elements.eventCalendarList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);

        if (eventData?.calendar) {
            // Check the specific calendar
            const cb = this.elements.eventCalendarList.querySelector(`input[value="${eventData.calendar}"]`);
            if (cb) cb.checked = true;
        } else if (checkboxes.length > 0) {
            // Default to first if new? Or no selection?
            // Usually defaulting to first available is good UX
            checkboxes[0].checked = true;
        }

        const isAllDay = eventData?.allDay || false;
        if (this.elements.eventAllDay) {
            this.elements.eventAllDay.checked = isAllDay;
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
            let displayEndDate = endDate;
            if (isAllDay) {
                 displayEndDate = new Date(endDate.getTime() - 1);
            }

            this.elements.eventEndDate.value = displayEndDate.toISOString().slice(0, 10);
            this.elements.eventEndTime.value = endDate.toTimeString().slice(0, 5);
        } else {
            this.elements.eventEndDate.value = '';
            this.elements.eventEndTime.value = '';
        }

        this.setRecurrenceValues(eventData?.recurrence);
        this.toggleAllDayFields();

        // Handle Event Image
        this.destroyCropper(); // Reset previous cropper
        this.elements.eventImageFile.value = ''; // Reset file input
        this.elements.eventImagePreview.style.display = 'none';

        if (eventData?.id) {
             // Try to find existing image
             const img = this.app.imageService.getOriginalImage(`event:${eventData.id}`);
             if (img) {
                 // Load original into preview/cropper
                 this.elements.eventImagePreview.src = img.url;
                 this.elements.eventImagePreview.style.display = 'block';
                 this.originalImageSource = img.url; // Track original

                 // Initialize cropper on the existing image automatically if present.
                 await this.initCropper(this.elements.eventImagePreview);
             }
        }
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

    toggleAllDayFields() {
        if (!this.elements.eventAllDay) return;
        const isAllDay = this.elements.eventAllDay.checked;

        const timeDisplay = isAllDay ? 'none' : 'block';
        if (this.elements.eventStartTime) {
            this.elements.eventStartTime.style.display = timeDisplay;
            this.elements.eventStartTime.required = !isAllDay;
        }
        if (this.elements.eventEndTime) {
            this.elements.eventEndTime.style.display = timeDisplay;
            this.elements.eventEndTime.required = !isAllDay;
        }
        if (this.elements.eventStartTimeLabel) this.elements.eventStartTimeLabel.style.display = timeDisplay;
        if (this.elements.eventEndTimeLabel) this.elements.eventEndTimeLabel.style.display = timeDisplay;

        const endDateDisplay = isAllDay ? 'block' : 'none';
        if (this.elements.eventEndDate) {
            this.elements.eventEndDate.style.display = endDateDisplay;
            this.elements.eventEndDate.required = isAllDay;
        }
        if (this.elements.eventEndDateLabel) this.elements.eventEndDateLabel.style.display = endDateDisplay;
    }

    getEventFormData() {
        const id = this.elements.eventId.value || null;
        // Gather selected calendars
        const selectedCalendars = Array.from(this.elements.eventCalendarList.querySelectorAll('input:checked')).map(cb => cb.value);
        const name = this.elements.eventName.value.trim();
        const date = this.elements.eventDate.value;
        const isAllDay = this.elements.eventAllDay ? this.elements.eventAllDay.checked : false;

        // Conditional validation
        if (selectedCalendars.length === 0) {
            alert('Please select at least one calendar.');
            return null;
        }
        if (!name || !date) {
            alert('Please fill all required fields.');
            return null;
        }

        let startISO, endISO;

        if (isAllDay) {
            const endDate = this.elements.eventEndDate.value;
            if (!endDate) {
                 alert('Please select an end date for all-day event.');
                 return null;
            }
            startISO = new Date(`${date}T00:00:00`).toISOString();
            const e = new Date(`${endDate}T00:00:00`);
            e.setDate(e.getDate() + 1);
            endISO = e.toISOString();

            if (new Date(endISO) <= new Date(startISO)) {
                alert('End date must be after start date.');
                return null;
            }

        } else {
            const startTime = this.elements.eventStartTime.value;
            const endTime = this.elements.eventEndTime.value;

            if (!startTime || !endTime) {
                alert('Please enter start and end times.');
                return null;
            }

            startISO = new Date(`${date}T${startTime}:00`).toISOString();
            endISO = new Date(`${date}T${endTime}:00`).toISOString();

            if (endISO <= startISO) {
                 alert('End time must be after start time.');
                 return null;
            }
        }

        const recurrence = this.getRecurrencePayload();
        if (recurrence.type === 'custom' && (!recurrence.days || !recurrence.days.length)) {
            alert('Please select at least one weekday for custom recurrence.');
            return null;
        }

        // Handle Image Data
        const imageFile = this.elements.eventImageFile.files[0];
        let imageDataUrl = null;
        let originalImageDataUrl = null;

        if (this.activeCropper) {
            // Cropped
            imageDataUrl = this.activeCropper.getCroppedCanvas().toDataURL();
            originalImageDataUrl = this.originalImageSource;
        } else if (imageFile) {
            // Just file, no crop (safe fallback)
        }

        return {
            id,
            calendars: selectedCalendars, // Array of calendar names
            name,
            imageFile,
            imageDataUrl, // Cropped version
            originalImageDataUrl, // Original version
            start: startISO,
            end: endISO,
            allDay: isAllDay,
            recurrence
        };
    }

    setupLongPressHandlers() {
        if (!this.elements.calendarEl) return;

        let pressTimer = null;
        let startX = 0;
        let startY = 0;
        const LONG_PRESS_DURATION = 1000;
        const MOVE_THRESHOLD = 10;

        const clearTimer = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        const handleStart = (e) => {
            // Only left mouse button or touch
            if (e.type === 'mousedown' && e.button !== 0) return;

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX;
            startY = clientY;
            const target = e.target;

            clearTimer();

            pressTimer = setTimeout(() => {
                pressTimer = null;
                this.handleLongPress(target, clientX, clientY);
            }, LONG_PRESS_DURATION);
        };

        const handleMove = (e) => {
            if (!pressTimer) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            if (Math.abs(clientX - startX) > MOVE_THRESHOLD || Math.abs(clientY - startY) > MOVE_THRESHOLD) {
                clearTimer();
            }
        };

        const handleEnd = () => {
            clearTimer();
        };

        const container = this.elements.calendarEl;
        // Use capture phase to detect event before FullCalendar potential stopPropagation
        container.addEventListener('mousedown', handleStart, true);
        container.addEventListener('touchstart', handleStart, { passive: true, capture: true });

        window.addEventListener('mousemove', handleMove, true);
        window.addEventListener('touchmove', handleMove, true);

        window.addEventListener('mouseup', handleEnd, true);
        window.addEventListener('touchend', handleEnd, true);
    }

    handleLongPress(target, x, y) {
        // Check if on event
        const eventContent = target.closest('.custom-event-content');

        if (eventContent && eventContent.dataset.eventId) {
            // Copy Event
            this.app.copyEvent(eventContent.dataset.eventId);
            this.app.ignoreNextClick = true;
            // Safety timeout
            setTimeout(() => this.app.ignoreNextClick = false, 3000);
            return;
        }

        // Check if on empty spot (Paste)
        if (this.app.clipboard) {
             this.app.isPastePending = true;
             this.showToast('Release to paste', 'info');
             setTimeout(() => this.app.isPastePending = false, 2000);
        } else {
             this.showToast('Clipboard empty', 'info');
        }
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
            let days = this.elements.recurrenceDayInputs
                .filter(input => input.checked)
                .map(input => Number(input.value));

            if (days.length === 0) {
                days = [0, 1, 2, 3, 4, 5, 6];
            }

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
            setTimeout(() => modalElement.classList.add('visible'), 10);
        } else {
            modalElement.classList.remove('visible');
            setTimeout(() => modalElement.classList.add('hidden'), 300);
        }
    }

    // Updated: Uses Cropper
    setupImageCropper(fileInput, imgEl, slidersToHide = []) {
        if (!fileInput || !imgEl) return;

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (file) {
                const dataUrl = await this.readFileAsDataURL(file);
                this.originalImageSource = dataUrl;
                imgEl.src = dataUrl;
                imgEl.style.display = 'block';

                // Hide sliders
                slidersToHide.forEach(slider => {
                    if (slider) slider.parentElement.style.display = 'none';
                });

                // Initialize Cropper
                this.initCropper(imgEl);
            } else {
                imgEl.style.display = 'none';
                imgEl.src = '';
                this.destroyCropper();
                slidersToHide.forEach(slider => {
                    if (slider) slider.parentElement.style.display = 'block';
                });
            }
        });
    }

    setupImagePreview(fileInput, imgEl, cropXInput, cropYInput) {
        // This is now replaced by setupImageCropper for main inputs.
    }

    initCropper(imgEl) {
        this.destroyCropper();
        this.activeCropper = new Cropper(imgEl, {
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: false,
            center: false,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });
    }

    destroyCropper() {
        if (this.activeCropper) {
            this.activeCropper.destroy();
            this.activeCropper = null;
        }
        this.originalImageSource = null;
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }

    setupEventImageHandling() {
        // Preview for manual upload
        if (this.elements.eventImageFile && this.elements.eventImagePreview) {
            this.elements.eventImageFile.addEventListener('change', async () => {
                const file = this.elements.eventImageFile.files[0];
                if (file) {
                    const dataUrl = await this.readFileAsDataURL(file);
                    this.originalImageSource = dataUrl;
                    this.elements.eventImagePreview.src = dataUrl;
                    this.elements.eventImagePreview.style.display = 'block';

                    this.initCropper(this.elements.eventImagePreview);
                } else {
                    this.elements.eventImagePreview.style.display = 'none';
                    this.elements.eventImagePreview.src = '';
                    this.destroyCropper();
                }
            });
        }

        // Suggestion logic
        if (this.elements.eventName && this.elements.eventImageSuggestion) {
            this.elements.eventName.addEventListener('input', () => {
                const name = this.elements.eventName.value.trim();
                if (name.length > 2) {
                    const match = this.app.imageService.findImageByCategoryName(name);
                    if (match) {
                        this.elements.eventImageSuggestion.textContent = `Suggestion available: Use image for "${match.category}"`;
                        this.elements.eventImageSuggestion.dataset.url = match.url;
                        this.elements.eventImageSuggestion.style.display = 'block';
                    } else {
                        this.elements.eventImageSuggestion.style.display = 'none';
                    }
                } else {
                    this.elements.eventImageSuggestion.style.display = 'none';
                }
            });

            this.elements.eventImageSuggestion.addEventListener('click', () => {
                const url = this.elements.eventImageSuggestion.dataset.url;
                if (url) {
                    this.elements.eventImagePreview.src = url;
                    this.elements.eventImagePreview.style.display = 'block';
                    this.originalImageSource = url;
                    this.initCropper(this.elements.eventImagePreview);
                }
            });
        }
    }
}
