class CalendarView {
    constructor(element, eventService, calendarService, imageService) {
        this.element = element;
        this.eventService = eventService;
        this.calendarService = calendarService;
        this.imageService = imageService;

        this.currentDate = new Date();
        this.viewType = 'dayGridMonth'; // Default

        // Callbacks
        this.onEventClick = null;
        this.onDateClick = null; // Single click on cell
        this.onRangeSelect = null; // Drag selection
        this.onEventSelected = null; // When event is selected via long press
        this.onEventAction = null; // Action triggered from event button
        this.onEventChange = null; // When event is modified (e.g. dragged)

        // View State
        this.startHour = 0;
        this.endHour = 24;
        this.selectedEventId = null;

        this.dragState = null;

        // Current time indicator state
        this.currentTimeLine = null;
        this.currentTimeTimer = null;
    }

    setView(viewType) {
        this.viewType = viewType;
        this.render();
    }

    setDate(date) {
        this.currentDate = new Date(date);
        this.render();
    }

    setRange(startHour, endHour) {
        this.startHour = Math.floor(startHour);
        this.endHour = Math.ceil(endHour);
        if (this.endHour > 24) this.endHour = 24;
        this.render();
    }

    setSlotHeight(height) {
        this.element.style.setProperty('--slot-height', `${height}px`);
    }

    next() {
        if (this.viewType === 'dayGridMonth') {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        } else if (this.viewType === 'timeGridWeek') {
            this.currentDate.setDate(this.currentDate.getDate() + 7);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + 1);
        }
        this.render();
    }

    prev() {
        if (this.viewType === 'dayGridMonth') {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        } else if (this.viewType === 'timeGridWeek') {
            this.currentDate.setDate(this.currentDate.getDate() - 7);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() - 1);
        }
        this.render();
    }

    today() {
        this.currentDate = new Date();
        this.render();
    }

    render() {
        this.clearCurrentTimeIndicator();
        this.element.innerHTML = '';
        this.updateTitle();

        // Prepare events for the visible range
        const range = this.getVisibleRange();
        const events = this.getEventsInRange(range.start, range.end);

        if (this.viewType === 'dayGridMonth') {
            this.renderMonthView(events);
        } else if (this.viewType === 'timeGridWeek') {
            this.renderWeekView(events);
        } else if (this.viewType === 'timeGridDay') {
            this.renderDayView(events);
        } else if (this.viewType === 'hoursView') {
            this.renderHoursView(events);
        }
    }

    updateTitle() {
        const titleEl = document.getElementById('calendar-title');
        if (!titleEl) return;

        const options = { year: 'numeric', month: 'long' };
        if (this.viewType !== 'dayGridMonth') {
            options.day = 'numeric';
        }
        titleEl.textContent = this.currentDate.toLocaleDateString(undefined, options);
    }

    getVisibleRange() {
        const start = new Date(this.currentDate);
        const end = new Date(this.currentDate);

        if (this.viewType === 'dayGridMonth') {
            start.setDate(1);
            // Monday start:
            const day = start.getDay();
            const diff = day === 0 ? 6 : day - 1;
            start.setDate(start.getDate() - diff); // Go back to Monday

            end.setMonth(end.getMonth() + 1);
            end.setDate(0);
            // End on Sunday
            const endDay = end.getDay();
            const endDiff = endDay === 0 ? 0 : 7 - endDay;
            end.setDate(end.getDate() + endDiff);
        } else if (this.viewType === 'timeGridWeek') {
            const day = start.getDay();
            const diff = day === 0 ? 6 : day - 1;
            start.setDate(start.getDate() - diff);

            // Correctly calculate end date by creating a new Date object from start
            const endWeek = new Date(start);
            endWeek.setDate(start.getDate() + 6);
            end.setTime(endWeek.getTime());
            end.setHours(23, 59, 59, 999);
        } else {
            // Day or Hours view
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        }
        return { start, end };
    }

    getEventsInRange(start, end) {
        // Get all events and expand recurrences
        const allEvents = this.eventService.getAll();
        const expanded = [];
        const visibleCalendars = this.calendarService.getVisible();

        for (const event of allEvents) {
            if (!visibleCalendars.has(event.calendar)) continue;
            if (event.deleted) continue;

            if (event.recurrence && event.recurrence.type !== 'none') {
                expanded.push(...this.expandRecurrence(event, start, end));
            } else {
                const evStart = new Date(event.start);
                const evEnd = new Date(event.end);
                if (evStart < end && evEnd > start) {
                    expanded.push(event);
                }
            }
        }
        return expanded;
    }

    expandRecurrence(event, rangeStart, rangeEnd) {
        const instances = [];
        const { type, until, intervalWeeks, days } = event.recurrence;
        const interval = intervalWeeks || 1;
        const untilDate = until ? new Date(until) : null;

        let current = new Date(event.start);
        const duration = new Date(event.end) - new Date(event.start);

        // Safety break
        let count = 0;
        while (current < rangeEnd && count < 1000) {
            count++;

            if (untilDate && current > untilDate) break;

            if (current >= rangeStart) {
                // Check if this instance matches the rule
                let match = false;
                if (type === 'daily') match = true;
                if (type === 'weekly') {
                    match = true;
                }
                if (type === 'biweekly') match = true;

                if (type === 'custom' && days) {
                    if (days.includes(current.getDay())) match = true;
                }

                if (match) {
                     instances.push({
                         ...event,
                         id: `${event.id}_${current.getTime()}`,
                         originalId: event.id,
                         start: current.toISOString(),
                         end: new Date(current.getTime() + duration).toISOString()
                     });
                }
            }

            if (type === 'daily') {
                current.setDate(current.getDate() + 1);
            } else if (type === 'weekly') {
                current.setDate(current.getDate() + 7 * interval);
            } else if (type === 'biweekly') {
                current.setDate(current.getDate() + 14);
            } else if (type === 'custom') {
                const startWeek = this.getWeekNumber(new Date(event.start));
                const currentWeek = this.getWeekNumber(current);
                const weekDiff = currentWeek - startWeek;

                if (weekDiff % interval === 0) {
                     current.setDate(current.getDate() + 1);
                     continue;
                } else {
                     current.setDate(current.getDate() + (7 - current.getDay()));
                     continue;
                }
            }
        }

        if (type === 'custom') {
            return this.expandCustomRecurrence(event, rangeStart, rangeEnd);
        }

        return instances;
    }

    expandCustomRecurrence(event, rangeStart, rangeEnd) {
        const instances = [];
        const { intervalWeeks, days, until } = event.recurrence;
        const interval = intervalWeeks || 1;
        const untilDate = until ? new Date(until) : null;
        const duration = new Date(event.end) - new Date(event.start);

        let currentBase = new Date(event.start);
        currentBase.setDate(currentBase.getDate() - currentBase.getDay());

        let count = 0;
        while (currentBase < rangeEnd && count < 100) {
            count++;
            for (const dayIndex of days) {
                const instanceDate = new Date(currentBase);
                instanceDate.setDate(instanceDate.getDate() + dayIndex);

                const originalStart = new Date(event.start);
                instanceDate.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);

                if (instanceDate < new Date(event.start)) continue;
                if (untilDate && instanceDate > untilDate) continue;
                if (instanceDate >= rangeEnd) continue;

                if (instanceDate >= rangeStart) {
                     instances.push({
                         ...event,
                         id: `${event.id}_${instanceDate.getTime()}`,
                         originalId: event.id,
                         start: instanceDate.toISOString(),
                         end: new Date(instanceDate.getTime() + duration).toISOString()
                     });
                }
            }
            currentBase.setDate(currentBase.getDate() + (7 * interval));
        }
        return instances;
    }

    getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }

    renderMonthView(events) {
        const grid = document.createElement('div');
        grid.className = 'calendar-grid-month';

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const headerRow = document.createElement('div');
        headerRow.className = 'calendar-header-row';
        days.forEach(d => {
            const cell = document.createElement('div');
            cell.className = 'header-cell';
            cell.textContent = d;
            headerRow.appendChild(cell);
        });
        grid.appendChild(headerRow);

        const range = this.getVisibleRange();
        let current = new Date(range.start);

        const body = document.createElement('div');
        body.className = 'calendar-body-month';

        while (current <= range.end) {
            const cellDate = new Date(current);
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            if (cellDate.getMonth() !== this.currentDate.getMonth()) {
                cell.classList.add('other-month');
            }
            // Add date to dataset for drop handling
            cell.dataset.date = cellDate.toISOString();

            const dateNum = document.createElement('div');
            dateNum.className = 'date-number';
            dateNum.textContent = cellDate.getDate();
            if (this.isToday(cellDate)) dateNum.classList.add('is-today');
            cell.appendChild(dateNum);

            cell.onclick = (e) => {
                 if(e.target === cell || e.target === dateNum) {
                     if (this.onDateClick) this.onDateClick(cellDate);
                 }
            };

            const dayEvents = events.filter(ev => {
                const s = new Date(ev.start);
                const e = new Date(ev.end);
                const dayStart = new Date(cellDate); dayStart.setHours(0,0,0,0);
                const dayEnd = new Date(cellDate); dayEnd.setHours(23,59,59,999);
                return s < dayEnd && e > dayStart;
            });

            dayEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'events-container';

            dayEvents.forEach(ev => {
                const el = this.createEventElement(ev, 'month');
                eventsContainer.appendChild(el);
            });
            cell.appendChild(eventsContainer);

            body.appendChild(cell);
            current.setDate(current.getDate() + 1);
        }
        grid.appendChild(body);
        this.element.appendChild(grid);
    }

    renderWeekView(events) {
        this.renderTimeGrid(events, 7);
    }

    renderDayView(events) {
        this.renderTimeGrid(events, 1);
    }

    renderHoursView(events) {
        const el = this.renderTimeGrid(events, 1);
        el.classList.add('hours-view');
    }

    renderTimeGrid(events, dayCount) {
        const visibleCalendars = Array.from(this.calendarService.getVisible()).sort();
        const subColCount = visibleCalendars.length || 1;

        const container = document.createElement('div');
        container.className = 'time-grid-container';

        const header = document.createElement('div');
        header.className = 'time-grid-header';

        const gutter = document.createElement('div');
        gutter.className = 'time-gutter-header';
        header.appendChild(gutter);

        const start = this.getVisibleRange().start;
        // Ensure start time is 00:00:00 to avoid offset issues
        start.setHours(0, 0, 0, 0);

        const days = [];
        for(let i=0; i<dayCount; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            days.push(d);

            const colHeader = document.createElement('div');
            colHeader.className = 'col-header';

            const dateDisplay = document.createElement('div');
            dateDisplay.innerHTML = `<span>${d.toLocaleDateString(undefined, {weekday: 'short'})}</span> <span>${d.getDate()}</span>`;
            if (this.isToday(d)) dateDisplay.style.color = 'var(--primary-color)';
            colHeader.appendChild(dateDisplay);

            if (subColCount > 1) {
                const subRow = document.createElement('div');
                subRow.style.display = 'flex';
                subRow.style.width = '100%';
                subRow.style.marginTop = '4px';
                subRow.style.borderTop = '1px solid rgba(0,0,0,0.05)';

                visibleCalendars.forEach(calName => {
                    const calTitle = document.createElement('div');
                    calTitle.style.flex = '1';
                    calTitle.textContent = calName;
                    calTitle.style.fontSize = '0.7rem';
                    calTitle.style.overflow = 'hidden';
                    calTitle.style.textOverflow = 'ellipsis';
                    calTitle.style.whiteSpace = 'nowrap';
                    calTitle.style.textAlign = 'center';
                    calTitle.title = calName;
                    subRow.appendChild(calTitle);
                });
                colHeader.appendChild(subRow);
            }
            header.appendChild(colHeader);
        }
        container.appendChild(header);

        const body = document.createElement('div');
        body.className = 'time-grid-body';

        const content = document.createElement('div');
        content.className = 'time-grid-content';

        // Determine range
        let startH = 0;
        let endH = 24;
        if (this.viewType === 'hoursView') {
            startH = this.startHour;
            endH = this.endHour;
        }

        for(let h=startH; h<endH; h++) {
            const row = document.createElement('div');
            row.className = 'time-row';
            // Use dynamic height if set
            row.style.height = 'var(--slot-height, 50px)';

            const timeLabel = document.createElement('div');
            timeLabel.className = 'time-label';
            timeLabel.textContent = `${h}:00`;
            row.appendChild(timeLabel);

            for(let d=0; d<dayCount; d++) {
                 const dayWrapper = document.createElement('div');
                 dayWrapper.style.flex = '1';
                 dayWrapper.style.display = 'flex';
                 dayWrapper.style.borderRight = '1px solid rgba(0,0,0,0.05)';

                 for(let c=0; c<subColCount; c++) {
                     const cell = document.createElement('div');
                     cell.className = 'time-cell';
                     cell.dataset.date = days[d].toISOString();
                     cell.dataset.hour = h;
                     // Add calendar name to dataset for drop target identification
                     cell.dataset.calendar = visibleCalendars[c];
                     cell.style.flex = '1';
                     if (c < subColCount - 1) {
                         cell.style.borderRight = '1px solid rgba(0,0,0,0.02)';
                     }

                     const calName = visibleCalendars[c];

                     // Robust Click Handler (replacing simple onclick)
                     cell.onmousedown = (e) => {
                         if (e.target !== cell) return;

                         this.isDragging = true;
                         this.dragStartCell = cell;
                         this.dragStartCal = calName;

                         const date = new Date(days[d]);
                         date.setHours(h);
                         date.setMinutes(0, 0, 0);

                         // Snap to 15 min
                         const rect = cell.getBoundingClientRect();
                         const y = e.clientY - rect.top;
                         const ratio = Math.max(0, Math.min(1, y / rect.height));
                         const minutes = Math.floor(ratio * 4) * 15;
                         date.setMinutes(minutes);

                         this.dragStartDate = date;
                     };

                     cell.onmouseup = (e) => {
                         if (!this.isDragging) return;
                         this.isDragging = false;

                         const endDate = new Date(days[d]);
                         endDate.setHours(h);
                         endDate.setMinutes(0, 0, 0);

                         // Snap to 15 min
                         const rect = cell.getBoundingClientRect();
                         const y = e.clientY - rect.top;
                         const ratio = Math.max(0, Math.min(1, y / rect.height));
                         const minutes = Math.floor(ratio * 4) * 15;
                         endDate.setMinutes(minutes);

                         // Check if we are on the same calendar column
                         if (this.dragStartCal !== calName) return;

                         // Determine range
                         let s = new Date(this.dragStartDate);
                         let e_ = new Date(endDate);

                         if (s > e_) {
                             const temp = s; s = e_; e_ = temp;
                         }

                         // If start == end (single click), default to 1 hour
                         if (s.getTime() === e_.getTime()) {
                             e_.setHours(e_.getHours() + 1);
                         }

                         if (s.getTime() === e_.getTime()) {
                             // Single click
                             if (this.onDateClick) this.onDateClick(s, calName);
                             else if (this.onRangeSelect) {
                                 const endDefault = new Date(s);
                                 endDefault.setHours(endDefault.getHours() + 1);
                                 this.onRangeSelect(s, endDefault, calName);
                             }
                         } else {
                             // Range drag
                             if (this.onRangeSelect) {
                                 this.onRangeSelect(s, e_, calName);
                             }
                         }
                     };

                     dayWrapper.appendChild(cell);
                 }
                 row.appendChild(dayWrapper);
            }
            content.appendChild(row);
        }

        const eventsLayer = document.createElement('div');
        eventsLayer.className = 'events-layer';

        days.forEach((day, dayIdx) => {
             const dayEvents = events.filter(ev => {
                const s = new Date(ev.start);
                const e = new Date(ev.end);
                const dayStart = new Date(day); dayStart.setHours(0,0,0,0);
                const dayEnd = new Date(day); dayEnd.setHours(23,59,59,999);
                return s < dayEnd && e > dayStart;
             });

             dayEvents.forEach(ev => {
                 const calIdx = visibleCalendars.indexOf(ev.calendar);
                 if (calIdx === -1) return;

                 const el = this.createEventElement(ev, 'timegrid');

                 const s = new Date(ev.start);
                 const e = new Date(ev.end);

                 let startMin = s.getHours() * 60 + s.getMinutes();
                 let endMin = e.getHours() * 60 + e.getMinutes();

                 const dayStart = new Date(day); dayStart.setHours(0,0,0,0);
                 if (s < dayStart) startMin = 0;

                 const dayEnd = new Date(day); dayEnd.setHours(23,59,59,999);
                 if (e > dayEnd) endMin = 24 * 60;

                 // Adjust positions based on startH
                 const offsetMin = startH * 60;
                 if (endMin < offsetMin) return; // Event before view
                 if (startMin > endH * 60) return; // Event after view

                 const viewStartMin = Math.max(startMin, offsetMin);
                 const viewEndMin = Math.min(endMin, endH * 60);

                 const topHours = (viewStartMin - offsetMin) / 60;
                 const durHours = (viewEndMin - viewStartMin) / 60;

                 el.style.top = `calc(${topHours} * var(--slot-height, 50px))`;
                 el.style.height = `calc(${durHours} * var(--slot-height, 50px))`;

                 // Correct width and position accounting for 50px gutter
                 const totalCols = dayCount * subColCount;
                 const globalColIdx = dayIdx * subColCount + calIdx;

                 el.style.left = `calc(50px + ${globalColIdx} * ((100% - 50px) / ${totalCols}))`;
                 el.style.width = `calc((100% - 50px) / ${totalCols})`;

                 eventsLayer.appendChild(el);
             });
        });

        content.appendChild(eventsLayer);
        this.renderCurrentTimeLine(content, days, startH, endH);
        body.appendChild(content);
        container.appendChild(body);

        this.element.appendChild(container);

        // Scroll logic (only for regular views)
        if (this.viewType !== 'hoursView') {
             body.scrollTop = (8 - startH) * 50;
        }

        return container;
    }

    renderCurrentTimeLine(content, days, startH, endH) {
        const now = new Date();
        const todayIdx = days.findIndex(day => this.isSameDay(day, now));
        if (todayIdx === -1) return;

        const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
        if (minutes < startH * 60 || minutes > endH * 60) return;

        const offsetMin = startH * 60;
        const positionHours = (minutes - offsetMin) / 60;

        this.currentTimeLine = document.createElement('div');
        this.currentTimeLine.className = 'current-time-line';
        this.currentTimeLine.style.top = `calc(${positionHours} * var(--slot-height, 50px))`;

        content.appendChild(this.currentTimeLine);

        const updatePosition = () => {
            const nowDate = new Date();
            const todaysIndex = days.findIndex(day => this.isSameDay(day, nowDate));
            const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes() + nowDate.getSeconds() / 60;

            if (todaysIndex === -1 || currentMinutes < startH * 60 || currentMinutes > endH * 60) {
                this.currentTimeLine.style.display = 'none';
                return;
            }

            this.currentTimeLine.style.display = 'block';
            const viewPositionHours = (currentMinutes - startH * 60) / 60;
            this.currentTimeLine.style.top = `calc(${viewPositionHours} * var(--slot-height, 50px))`;
        };

        updatePosition();
        this.currentTimeTimer = setInterval(updatePosition, 60000);
    }

    clearCurrentTimeIndicator() {
        if (this.currentTimeTimer) {
            clearInterval(this.currentTimeTimer);
            this.currentTimeTimer = null;
        }

        if (this.currentTimeLine && this.currentTimeLine.parentElement) {
            this.currentTimeLine.parentElement.removeChild(this.currentTimeLine);
        }
        this.currentTimeLine = null;
    }

    createEventElement(ev, type) {
        const el = document.createElement('div');
        el.className = 'calendar-event';

        if ((ev.type || 'event') === 'task') {
            el.classList.add('task-event');
        }
        if (ev.done) {
            el.classList.add('task-done');
        }

        const eventId = ev.originalId || ev.id;
        el.dataset.eventId = eventId;

        if (this.selectedEventId === eventId) {
            el.classList.add('selected');
        }

        if (type === 'month') el.classList.add('month-event');
        else el.classList.add('time-event');

        const image = this.imageService.findEventImage(ev, this.eventService);

        const content = document.createElement('div');
        content.className = 'event-content';

        if (image) {
            const img = document.createElement('img');
            img.src = image.url;
            img.style.objectPosition = `${image.cropX}% ${image.cropY}%`;
            content.appendChild(img);
            el.style.backgroundColor = image.averageColor || 'var(--primary-color)';
        } else {
             el.style.backgroundColor = 'var(--primary-color)';
        }

        const title = document.createElement('span');
        title.className = 'event-title';

        // Format time (HH:MM)
        const date = new Date(ev.start);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        title.textContent = `${timeStr} ${ev.name}`;
        content.appendChild(title);

        el.appendChild(content);

        // Action Buttons (visible when selected)
        if (this.selectedEventId === eventId) {
            const actions = document.createElement('div');
            actions.className = 'event-actions';

            const createBtn = (icon, action, label) => {
                const btn = document.createElement('button');
                btn.className = 'event-action-btn';
                btn.innerHTML = icon;
                btn.title = label;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    action();
                };
                return btn;
            };

            // Edit
            actions.appendChild(createBtn('✎', () => {
                if (this.onEventClick) this.onEventClick({ event: { id: eventId } });
            }, 'Edit Event'));

            // Up (Earlier)
            actions.appendChild(createBtn('▲', () => this.triggerAction('moveTime', eventId, -15), 'Move 15m earlier'));
            // Down (Later)
            actions.appendChild(createBtn('▼', () => this.triggerAction('moveTime', eventId, 15), 'Move 15m later'));
            // Left (Prev Day)
            actions.appendChild(createBtn('◀', () => this.triggerAction('moveDay', eventId, -1), 'Previous Day'));
            // Right (Next Day)
            actions.appendChild(createBtn('▶', () => this.triggerAction('moveDay', eventId, 1), 'Next Day'));
            // Delete
            actions.appendChild(createBtn('🗑', () => this.triggerAction('delete', eventId), 'Delete'));

            el.appendChild(actions);
        }

        // Interaction Logic
        let pressTimer;
        let isLongPress = false;
        let startX, startY;

        const handleStart = (e) => {
            if (e.target.closest('.event-actions')) return;

            isLongPress = false;
            // Store coordinates
            if (e.type === 'touchstart') {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            } else {
                startX = e.clientX;
                startY = e.clientY;
            }

            pressTimer = setTimeout(() => {
                isLongPress = true;
                this.startEventDrag(ev, el, e, startX, startY);
            }, 500); // 500ms long press
        };

        const handleMove = (e) => {
             const cx = e.touches ? e.touches[0].clientX : e.clientX;
             const cy = e.touches ? e.touches[0].clientY : e.clientY;
             // If moved significantly, cancel long press (allow scrolling)
             if (Math.abs(cx - startX) > 10 || Math.abs(cy - startY) > 10) {
                 clearTimeout(pressTimer);
             }
        };

        const handleEnd = (e) => {
            clearTimeout(pressTimer);
            if (!isLongPress && !this.dragState) {
                 if (e.target.closest('.event-actions')) return;

                 // Select Event
                 if (this.selectedEventId !== eventId) {
                     this.selectedEventId = eventId;
                     if (this.onEventSelected) this.onEventSelected(eventId);
                     this.render();
                 }
            }
        };

        el.addEventListener('mousedown', handleStart);
        el.addEventListener('touchstart', handleStart, {passive: true});

        el.addEventListener('mousemove', handleMove);
        el.addEventListener('touchmove', handleMove, {passive: true});

        el.addEventListener('mouseup', handleEnd);
        el.addEventListener('touchend', handleEnd);
        el.addEventListener('mouseleave', () => clearTimeout(pressTimer));

        // Prevent click prop
        el.onclick = (e) => e.stopPropagation();

        return el;
    }

    startEventDrag(event, element, originalEvent, startX, startY) {
        if (navigator.vibrate) navigator.vibrate(50);
        element.style.opacity = '0.5';
        element.style.zIndex = '1000';
        element.style.pointerEvents = 'none';

        this.dragState = {
            event: event,
            element: element,
            startX: startX,
            startY: startY,
            originalLeft: element.style.left,
            originalTop: element.style.top
        };

        this.dragMoveHandler = this.onDragMove.bind(this);
        this.dragEndHandler = this.onDragEnd.bind(this);

        document.addEventListener('mousemove', this.dragMoveHandler);
        document.addEventListener('touchmove', this.dragMoveHandler, { passive: false });
        document.addEventListener('mouseup', this.dragEndHandler);
        document.addEventListener('touchend', this.dragEndHandler);
    }

    onDragMove(e) {
        if (!this.dragState) return;
        if (e.cancelable) e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const dx = clientX - this.dragState.startX;
        const dy = clientY - this.dragState.startY;

        this.dragState.element.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    async onDragEnd(e) {
        if (!this.dragState) return;

        const { event, element } = this.dragState;

        document.removeEventListener('mousemove', this.dragMoveHandler);
        document.removeEventListener('touchmove', this.dragMoveHandler);
        document.removeEventListener('mouseup', this.dragEndHandler);
        document.removeEventListener('touchend', this.dragEndHandler);

        element.style.opacity = '';
        element.style.zIndex = '';
        element.style.pointerEvents = '';
        element.style.transform = '';

        this.dragState = null;

        const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
        const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

        const target = document.elementFromPoint(clientX, clientY);

        // Find Time Cell
        const cell = target ? target.closest('.time-cell') : null;
        if (cell) {
            const dateStr = cell.dataset.date;
            const hour = parseInt(cell.dataset.hour);
            const calendarName = cell.dataset.calendar;

            // Calculate minutes based on Y in cell
            const rect = cell.getBoundingClientRect();
            const y = clientY - rect.top;
            const ratio = Math.max(0, Math.min(1, y / rect.height));
            const minutes = Math.floor(ratio * 4) * 15;

            const newStart = new Date(dateStr);
            newStart.setHours(hour, minutes, 0, 0);

            // Calculate difference
            const oldStart = new Date(event.start);
            const duration = new Date(event.end) - oldStart;

            const newEnd = new Date(newStart.getTime() + duration);

            // Create new event object
            const updatedEvent = {
                ...event,
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
                calendar: calendarName || event.calendar
            };

            // Use Callback
            if (this.onEventChange) {
                this.onEventChange(updatedEvent);
            }
            // Re-render handled by parent/callback or we do it here if parent doesn't immediately
            // But usually parent will refresh. If we don't refresh here, event snaps back until refresh.
            // Let's assume parent refreshes.
            return;
        }

        // Find Month Cell
        const dayCell = target ? target.closest('.day-cell') : null;
        if (dayCell && dayCell.dataset.date) {
            const newDate = new Date(dayCell.dataset.date);
            const oldStart = new Date(event.start);

            // Keep time
            newDate.setHours(oldStart.getHours(), oldStart.getMinutes());

            const duration = new Date(event.end) - oldStart;
            const newEnd = new Date(newDate.getTime() + duration);

            const updatedEvent = {
                ...event,
                start: newDate.toISOString(),
                end: newEnd.toISOString()
            };

            if (this.onEventChange) {
                this.onEventChange(updatedEvent);
            }
            return;
        }

        // If no valid drop, just re-render to reset
        this.render();
    }

    triggerAction(action, id, param) {
        if (this.onEventAction) {
            this.onEventAction(action, id, param);
        }
    }

    isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    }
}
