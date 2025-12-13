from playwright.sync_api import sync_playwright

def verify_event_manipulation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Open the calendar app
        page.goto("http://localhost:8000")
        page.wait_for_selector("#calendar")

        # 1. Switch to Week View explicitly using the button
        print("Switching to Week View...")
        page.click("button[data-view='timeGridWeek']")
        page.wait_for_selector(".time-grid-container")

        # 2. Click a time cell to create event
        print("Creating event...")
        page.locator(".time-cell[data-hour='10']").first.click()
        page.wait_for_selector("#event-overlay.visible")

        # Fill event form
        page.fill("#event-name", "Test Event")
        page.click("#event-form button[type='submit']")

        # Wait for event to appear
        print("Waiting for event...")
        page.wait_for_selector(".calendar-event")

        # 3. Test Long Press & Selection using dispatchEvent to avoid mouse flakiness
        print("Selecting event...")

        # Trigger mousedown
        page.evaluate("""
            const el = document.querySelector('.calendar-event');
            const event = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            el.dispatchEvent(event);
        """)

        # Wait for timer (500ms)
        page.wait_for_timeout(600)

        # Check if selected
        event_el = page.locator(".calendar-event").first
        classes = event_el.get_attribute("class")
        print(f"Classes after long press: {classes}")

        if "selected" not in classes:
            print("Selection failed. Dumping page source snippet...")
            # print(page.content()[:1000])
        else:
            print("Selection successful!")

        page.screenshot(path="verification/step1_selected.png")

        # 4. Test Arrow Keys (Move Event)
        print("Moving event...")
        # Move Right (Next Day)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(1000) # Wait for animation/save

        page.screenshot(path="verification/step2_moved.png")

        # Verify date didn't change (Calendar didn't pan)
        # We need to check the header date or something.
        # Week view header: "December 8 - 14, 2025" (Example)
        # If it pans, it becomes "December 15 - 21"

        # 5. Test Delete
        print("Deleting event...")
        page.on("dialog", lambda dialog: dialog.accept())
        page.keyboard.press("Delete")
        page.wait_for_timeout(1000)

        remaining_events = page.locator(".calendar-event")
        count = remaining_events.count()
        print(f"Remaining events: {count}")

        page.screenshot(path="verification/step3_deleted.png")

        browser.close()

if __name__ == "__main__":
    verify_event_manipulation()
