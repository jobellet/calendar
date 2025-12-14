from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Load the page
        page.goto("http://localhost:8000/index.html")
        page.wait_for_selector("#calendar")

        # 1. Verify Task Modal All-Day Checkbox
        print("Checking All-Day for tasks...")
        page.click("#add-task-btn")
        page.wait_for_selector("#event-overlay.visible")

        # Check if All-Day is disabled (should NOT be disabled)
        all_day_checkbox = page.locator("#event-all-day")
        if all_day_checkbox.is_disabled():
            print("FAIL: All-Day checkbox is disabled for task")
        else:
            print("PASS: All-Day checkbox is enabled for task")

        # Close modal
        page.click("#close-event-modal-btn")
        page.wait_for_selector("#event-overlay", state="hidden")


        # 2. Verify Time Picker Steps
        print("Checking Time Picker Step...")
        page.keyboard.press("n") # Open new event
        page.wait_for_selector("#event-overlay.visible")

        start_time_input = page.locator("#event-start-time")
        step_attr = start_time_input.get_attribute("step")
        if step_attr == "60":
             print("PASS: Time picker has step=60")
        else:
             print(f"FAIL: Time picker step is {step_attr}")

        page.click("#close-event-modal-btn")
        page.wait_for_selector("#event-overlay", state="hidden")


        # 3. Verify Week View Overlay Buttons
        print("Checking Week View Overlay...")
        page.keyboard.press("w") # Switch to week view
        page.wait_for_timeout(500)

        # Create an event
        page.keyboard.press("n")
        page.wait_for_selector("#event-overlay.visible")
        page.fill("#event-name", "Test Event Week View")
        page.click("#event-save-btn")
        page.wait_for_selector("#event-overlay", state="hidden")
        page.wait_for_timeout(500)

        # Find the event element
        event_el = page.locator(".calendar-event").first
        event_el.click()
        page.wait_for_timeout(200)

        # Check for overlay buttons
        actions = page.locator(".event-actions")
        if actions.is_visible():
             print("PASS: Overlay actions visible in Week View")
             page.screenshot(path="verification/week_view_overlay.png")
        else:
             print("FAIL: Overlay actions NOT visible in Week View")

        browser.close()

if __name__ == "__main__":
    run()
