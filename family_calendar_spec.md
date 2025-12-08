# Family Calendar – Functional Specification

## 1. High-Level Goals
- **Family-centric calendar:** Designed for multiple family members.
- **Visual, child-friendly view:** Events can display images.
- **Offline-first:** Works fully offline using IndexedDB.
- **Manual sync:** Explicit synchronization with MEGA or similar.
- **Conflict-resistant:** Last-edit-wins using timestamps.
- **Touch & mouse friendly:** Drag-create and time-strip creation.
- **Extendable:** Architecture allows future features.

## 2. Data Model

### 2.1 Calendars
Each calendar has:
- `name: string`
- `isVisible: boolean`

### 2.2 Events
Fields:
- `id: string`
- `calendar: string`
- `name: string`
- `start: ISO datetime`
- `end: ISO datetime`
- `createdAt: number`
- `updatedAt: number`
- `recurrence: object`
- `hasImage: boolean`

### 2.3 Recurrence
Supports:
- none, daily, weekly, biweekly, custom
With:
- `days`, `intervalWeeks`, `until`

### 2.4 Images
Two types:
- Calendar images
- Category images
Fields:
- `id`, `calendar`, `category`, `url`, `createdAt`, `updatedAt`

---

## 3. Offline & Sync Behavior
- IndexedDB stores calendars, events, images.
- Sync button shows login modal.
- Sync conflict resolution uses `updatedAt`.

---

## 4. User Interface Layout

### 4.1 Left Sidebar
- Sync button (red=offline, green=online)
- View selector: Month / Week / Day
- Calendar list
- Add calendar
- Images panel

### 4.2 Main Calendar View
- Month, Week, Day views
- Day view = 00:00–24:00
- Auto-scroll to now−1h
- Drag to create events on empty space
- Click event to edit
- Resize/move events

### 4.3 Right Sidebar – Time Strip
- Hover shows time
- Click creates event at that time (default +30min)
- Y-mapping matches current day-view zoom window

---

## 5. Modals

### 5.1 Login Modal
- Email + password + login/cancel

### 5.2 Image Management Panel
- Upload avatar per calendar
- Upload category images
- Select scope (all or specific calendar)

### 5.3 Event Modal
- Calendar, name, date, start, end, recurrence
- Save or cancel

---

## 6. Image Display Rules
- Cropping tool with sliders
- Centered image in event block
- Empty space filled with average color
- Cached with reasonable quota

---

## 7. Undo (Ctrl+Z)
- History of last ~20 event modifications
- Undo restores snapshot and refreshes calendar

---

## 8. Future Features
- Per-calendar columns
- Advanced recurrence editor
- Conflict resolution UI
- PWA installable version

---

## 9. Summary
A full-featured offline-first family calendar with images, manual sync, drag-create UX, undo, recurrence, and extensible architecture.
