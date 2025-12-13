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

        // View State
        this.startHour = 0;
        this.endHour = 24;
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
            start.setDate(1 - start.getDay()); // Go back to Sunday
            end.setMonth(end.getMonth() + 1);
            end.setDate(0);
            end.setDate(end.getDate() + (6 - end.getDay())); // Go to Saturday
        } else if (this.viewType === 'timeGridWeek') {
            start.setDate(start.getDate() - start.getDay());
            end.setDate(end.getDate() + (6 - end.getDay()));
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

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
        const container = document.createElement('div');
        container.className = 'time-grid-container';

        const header = document.createElement('div');
        header.className = 'time-grid-header';

        const gutter = document.createElement('div');
        gutter.className = 'time-gutter-header';
        header.appendChild(gutter);

        const start = dayCount === 1 ? new Date(this.currentDate) : this.getVisibleRange().start;
        const days = [];
        for(let i=0; i<dayCount; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            days.push(d);

            const colHeader = document.createElement('div');
            colHeader.className = 'col-header';
            colHeader.innerHTML = `<span>${d.toLocaleDateString(undefined, {weekday: 'short'})}</span> <span>${d.getDate()}</span>`;
             if (this.isToday(d)) colHeader.classList.add('is-today');
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
                 const cell = document.createElement('div');
                 cell.className = 'time-cell';
                 cell.dataset.date = days[d].toISOString();
                 cell.dataset.hour = h;

                 cell.onclick = () => {
                     const date = new Date(days[d]);
                     date.setHours(h);
                     if (this.onDateClick) this.onDateClick(date);
                 };

                 row.appendChild(cell);
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

                 // Height of one hour slot
                 // We don't have access to CSS var easily here unless we compute it.
                 // But we can use calc or percentage?
                 // Using calc with --slot-height is best.
                 // top = (minutes / 60) * height
                 // Relative to container top.

                 const topHours = (viewStartMin - offsetMin) / 60;
                 const durHours = (viewEndMin - viewStartMin) / 60;

                 el.style.top = `calc(${topHours} * var(--slot-height, 50px))`;
                 el.style.height = `calc(${durHours} * var(--slot-height, 50px))`;

                 // Correct width and position accounting for 50px gutter
                 el.style.left = `calc(50px + ${dayIdx} * ((100% - 50px) / ${dayCount}))`;
                 el.style.width = `calc((100% - 50px) / ${dayCount})`;

                 eventsLayer.appendChild(el);
             });
        });

        content.appendChild(eventsLayer);
        body.appendChild(content);
        container.appendChild(body);

        this.element.appendChild(container);

        // Scroll logic (only for regular views)
        if (this.viewType !== 'hoursView') {
             body.scrollTop = (8 - startH) * 50;
             // Note: 50 is hardcoded default here, but if slot-height changes it might be off.
             // But for non-hoursView, height is default 50.
        }

        return container;
    }

    createEventElement(ev, type) {
        const el = document.createElement('div');
        el.className = 'calendar-event';
        // Add ID for context menu
        el.dataset.eventId = ev.originalId || ev.id;

        if (type === 'month') el.classList.add('month-event');
        else el.classList.add('time-event');

        const image = this.imageService.findEventImage(ev);

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

        el.onclick = (e) => {
            e.stopPropagation();
            if (this.onEventClick) this.onEventClick({
                event: { id: ev.originalId || ev.id }
            });
        };

        return el;
    }

    isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    }
}
