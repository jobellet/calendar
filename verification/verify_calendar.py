from playwright.sync_api import sync_playwright

def verify_calendar_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        page.goto("http://localhost:8000")

        # Wait for calendar to load (any container)
        page.wait_for_selector('.time-grid-container, .calendar-grid-month')

        # Switch to Week View if not already
        if not page.locator('.time-grid-container').is_visible():
            page.get_by_role("button", name="Week").click()
            page.wait_for_selector('.time-grid-container')
            # Wait for transition
            page.wait_for_timeout(500)

        # Verify Week Starts on Monday
        # The first .col-header > div > span:first-child should be "Mon"
        # .col-header structure changed: div > span
        first_header_text = page.locator('.col-header').first.inner_text()
        print(f"First header text: {first_header_text}")

        # Verify split columns
        # Add another calendar using UI if possible, or try to access window globals via evaluate
        # Assuming we can't easily access app instance if it's not on window.
        # But looking at app.js, `const app` is inside DOMContentLoaded. It is not global.

        # So we have to use the UI to add a calendar.

        # Click "Add calendar" button
        # Button ID: add-calendar-btn

        # We need to handle the prompt dialog
        def handle_dialog(dialog):
            dialog.accept("Work")

        page.on("dialog", handle_dialog)
        page.locator('#add-calendar-btn').click()

        # Wait for calendar to be added and UI updated
        page.wait_for_timeout(1000)

        # Check for sub-headers
        # We need to make sure the new calendar is visible (it defaults to visible)

        sub_headers = page.locator('.col-header > div[style*="display: flex"]')
        count = sub_headers.count()
        print(f"Sub-headers count: {count}")

        page.screenshot(path="verification/calendar_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_calendar_changes()
