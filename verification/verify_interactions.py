from playwright.sync_api import sync_playwright

def verify_interactions():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000")

        page.get_by_role("button", name="Week").click()
        page.wait_for_selector('.time-grid-container')

        page.locator('.time-cell').nth(80).click(force=True)
        page.wait_for_selector('#event-overlay.visible')

        page.fill('#event-name', 'Test Event')
        page.click('#event-save-btn')

        # Wait for modal to hide
        page.wait_for_selector('#event-overlay', state='hidden')

        # Check event
        page.wait_for_selector('.calendar-event')

        event_el = page.locator('.calendar-event').first
        box = event_el.bounding_box()

        # Long press
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        page.wait_for_timeout(600)
        page.mouse.up()

        page.wait_for_selector('.calendar-event.selected')
        print("Event selected")

        if page.locator('.event-actions').is_visible():
            print("Action buttons visible")

        page.screenshot(path="verification/interactions_verification.png")
        browser.close()

if __name__ == "__main__":
    verify_interactions()
