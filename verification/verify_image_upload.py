from playwright.sync_api import sync_playwright

def verify_event_image_upload():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto("http://localhost:8000")
        page.wait_for_selector('body', state='visible')

        # Click "Day" view button to switch to timeGridDay.
        # This view has simpler click handlers on time cells.
        page.get_by_text("Day", exact=True).click()

        # Wait for time grid
        page.wait_for_selector('.time-grid-content', state='visible')

        # Click on a time cell
        page.locator('.time-cell >> nth=10').click()

        # Wait for modal
        page.wait_for_selector('#event-overlay.visible')

        # Check for label
        if page.get_by_text("Event Image (Optional)").is_visible():
            print("Event Image label found")

        page.screenshot(path="verification/event_modal_image_upload.png")

        browser.close()

if __name__ == "__main__":
    verify_event_image_upload()
