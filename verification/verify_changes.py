from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate a mobile device to test mobile layout and FAB
        context = browser.new_context(
            viewport={'width': 375, 'height': 667},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1'
        )
        page = context.new_page()

        # 1. Load the page
        page.goto("http://localhost:8000")
        page.wait_for_load_state('networkidle')

        # 2. Verify Mobile Layout & FAB
        print("Verifying Mobile Layout & FAB...")
        fab = page.locator(".fab-add-event")
        if fab.is_visible():
            print("FAB is visible.")
            page.screenshot(path="verification/mobile_fab.png")
        else:
            print("FAB is NOT visible.")

        # Test Sidebar Swipe (Simulated)
        # Playwright doesn't easily simulate complex touch gestures like swipe in Python sync API conveniently without mouse emulation.
        # We will check if sidebar opens via button for now, or try to simulate touch events.

        # 3. Switch to Desktop Context for other checks
        context_desktop = browser.new_context(viewport={'width': 1280, 'height': 800})
        page_desktop = context_desktop.new_page()
        page_desktop.goto("http://localhost:8000")
        page_desktop.wait_for_load_state('networkidle')

        # 4. Verify Event Actions Overlay (Create an event first)
        print("Creating event to check overlay...")
        # Click on a cell to create event
        # 9:00 AM slot.
        # Assuming Hours view is default or we switch to it.
        # Click "Hours" view button
        page_desktop.get_by_text("Hours").click()

        # Click at 9:00 (approximate position)
        # Find 9:00 label row

        # Create a test event via JS to be sure
        page_desktop.evaluate("""
            const app = document.querySelector('script[src="js/app.js"]').parentElement.querySelector('#app-container') ? window.app : null;
            // Access app instance from window if exposed, or trigger via DOM
            // Since app instance isn't globally exposed easily, let's use UI interaction.
        """)

        # Click on grid
        # We need to find a cell.
        cell = page_desktop.locator('.time-cell').first
        cell.click()

        # Fill form
        page_desktop.fill('#event-name', 'Test Event')
        page_desktop.click('#event-save-btn')

        # Select the event
        page_desktop.wait_for_selector('.calendar-event')
        event = page_desktop.locator('.calendar-event').first
        event.click()

        # Check overlay
        overlay = page_desktop.locator('.event-actions')
        if overlay.is_visible():
            print("Event overlay is visible.")
            page_desktop.screenshot(path="verification/desktop_overlay.png")
        else:
            print("Event overlay is NOT visible.")

        # 5. Verify Resize Handle existence
        handle = event.locator('.resize-handle')
        if handle.count() > 0:
            print("Resize handle exists.")
        else:
            print("Resize handle missing.")

        # 6. Verify Task All-Day Checkbox
        print("Verifying Task All-Day Checkbox...")
        # Open creation modal
        page_desktop.click('#add-task-btn') # "Add Task" from sidebar

        # Check if All-Day checkbox is enabled
        all_day_cb = page_desktop.locator('#event-all-day')
        is_disabled = all_day_cb.is_disabled()
        if not is_disabled:
            print("All-Day checkbox is ENABLED for Task.")
        else:
            print("All-Day checkbox is DISABLED for Task.")

        page_desktop.screenshot(path="verification/task_modal.png")

        browser.close()

if __name__ == "__main__":
    verify_changes()
