from playwright.sync_api import sync_playwright, expect
import time

def verify_shared_images():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Load the app
        page.goto("http://localhost:8000")

        # Add a calendar "TestCal1"
        page.click("#add-calendar-btn")
        page.fill("#new-calendar-name", "TestCal1")
        page.click("#add-calendar-form button[type='submit']")

        # Add a calendar "TestCal2"
        page.click("#add-calendar-btn")
        page.fill("#new-calendar-name", "TestCal2")
        page.click("#add-calendar-form button[type='submit']")

        # Create event "Gym" in TestCal1
        page.click("button[data-view='timeGridDay']")
        # Click at 10:00 to create event
        # Assuming we are on today
        # We need to find the cell for 10:00.
        # The app renders time cells.

        # Let's create event via 'N' key shortcut to be simpler, or use the FAB if mobile,
        # but let's try to click on a specific cell.
        # Or even better, use the N key shortcut which opens modal.
        page.keyboard.press("n")

        # Fill event form
        page.fill("#event-name", "Gym")

        # Select TestCal1
        # First uncheck others if any? Default is Main.
        # We want to select TestCal1.
        page.check("input[value='TestCal1']")
        page.uncheck("input[value='Main']")

        # Add an image (mocking file upload)
        # We need a sample image.
        # We can create a small dummy image file first.

        page.set_input_files("#event-image-file", "verification/test_image.png")

        # Save event
        page.click("#event-form button[type='submit']")

        # Wait for save
        page.wait_for_timeout(1000)

        # Now create "Gym" in TestCal2 without image
        page.keyboard.press("n")
        page.fill("#event-name", "Gym")
        page.check("input[value='TestCal2']")
        page.uncheck("input[value='Main']")
        page.uncheck("input[value='TestCal1']")

        # Ensure no image is selected (file input is empty by default)

        # Save
        page.click("#event-form button[type='submit']")

        # Wait for render
        page.wait_for_timeout(1000)

        # Now verification:
        # Check if the second event has the image.
        # We need to find the event elements.

        gym_events = page.locator(".calendar-event:has-text('Gym')")
        count = gym_events.count()
        print(f"Found {count} Gym events")

        if count < 2:
            print("Failed to create both events")
            browser.close()
            return

        # Take screenshot
        page.screenshot(path="verification/shared_images.png")

        # Check if both have images
        # The image is an <img> tag inside .event-content

        event1 = gym_events.nth(0)
        event2 = gym_events.nth(1)

        img1 = event1.locator("img")
        img2 = event2.locator("img")

        if img1.is_visible() and img2.is_visible():
            print("SUCCESS: Both events have images!")
        else:
            print("FAILURE: One or both events missing image.")
            if not img1.is_visible(): print("Event 1 missing image")
            if not img2.is_visible(): print("Event 2 missing image")

        browser.close()

if __name__ == "__main__":
    verify_shared_images()
