# Usability Review: Family Calendar

## Context
- **Session**: Returning visit to evaluate recent updates on the Family Calendar site.
- **Coverage**: Navigation, event/task creation and editing, modal interactions, and view-specific behaviour.

## Observed Improvements
- Navigation buttons for **Month/Week/Day/Hours** reliably switch views without triggering unintended modals; Day view splits by calendar and Hours view includes shift earlier/later controls.
- Event creation modal opens on double-click with calendar selection, metadata fields, recurrence, and scrollable hour/minute/AM-PM pickers; **All Day** option correctly swaps time fields for date fields on events.
- Day view event overlays surface controls (shift earlier/later by 15 minutes or a day, edit, delete) and allow quick rescheduling.
- Task creation warns about overlapping items before proceeding.
- Settings modal provides language choices and voice notification toggle; Images modal supports category/calendar image customization with focus sliders and file uploads, both closable via X button.

## Remaining Issues & Pain Points
- **All-Day for tasks**: The All Day checkbox in the task modal is non-functional; checking it has no effect, unlike events.
- **Time selection friction**: Time pickers only expose coarse increments (00/15/30/45), often default to irregular times (e.g., 12:16), and adjusting hours can reset minutes; manual typing is unsupported.
- **Tiny overlay icons**: Shift arrows on the event overlay are small and easy to misclick, often opening the edit modal instead; no drag-and-drop repositioning exists.
- **Week view editing gap**: Event overlays with shift/edit/delete controls appear in Day view only; double-clicking events in Week view lacks these controls.
- **Task queue defaults**: New tasks default to fixed times (e.g., 11:59), making scheduling cumbersome; completed tasks disappear with no filter to view history.
- **Hours view clarity**: Displays a narrow time slice with unclear range indicators; shifting earlier/later can hide events without context.
- **Keyboard accessibility**: No shortcuts for common actions (create, view toggles, closing modals); Esc does not close modals, limiting keyboard-only navigation.

## Recommendations
- **Fix task All-Day toggle** to mirror event behaviour and ensure date-based scheduling.
- **Streamline time inputs**: Allow typed entry with validation, provide common quick-select times, and enable arrow-key adjustments without resetting minutes.
- **Improve repositioning**: Enlarge overlay controls, add drag-and-drop movement and resizing, and make overlays consistent in Day and Week views; add a delete confirmation to avoid accidental removal.
- **Clarify Hours view**: Show explicit time ranges (e.g., 8 AM–6 PM), support vertical scrolling, retain event visibility when shifting, and include a Today shortcut.
- **Keyboard shortcuts and ARIA**: Map keys (N for new, W/D/M/H for views, Esc to close, arrows for navigation), ensure modals close with Esc, and add ARIA labels for accessibility.
- **Task queue controls**: Let users specify task times or confirm defaults, and add filters to review completed or date-specific tasks.

