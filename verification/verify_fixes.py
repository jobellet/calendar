from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use mobile viewport to ensure FAB is visible, or just use keyboard
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto("http://localhost:8000")

        # 1. Verify Task All-Day check
        # Use 'N' shortcut to open modal (Desktop way)
        page.keyboard.press("n")
        page.wait_for_selector("#event-overlay.visible")

        page.select_option("#event-type", "task")

        # Check if All Day is enabled and unchecked
        all_day_checkbox = page.locator("#event-all-day")
        if all_day_checkbox.is_disabled():
            print("FAIL: All Day checkbox is disabled for tasks")
        else:
            print("PASS: All Day checkbox is enabled for tasks")
            all_day_checkbox.check()
            if not all_day_checkbox.is_checked():
                 print("FAIL: Could not check All Day")
            else:
                 print("PASS: Checked All Day for task")

        # 2. Verify Time Input step
        start_time = page.locator("#event-start-time")
        step = start_time.get_attribute("step")
        if step == "60":
            print("PASS: Start time has step=60")
        else:
            print(f"FAIL: Start time step is {step}")

        # 3. Verify Hours View window (approx)
        # Close modal first
        page.click("#close-event-modal-btn")
        page.wait_for_selector("#event-overlay.hidden", state="attached")

        # Switch to hours view
        page.click("button[data-view='hoursView']")

        # We need to see if time range is wider.
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/hours_view.png")
        print("Screenshot saved to verification/hours_view.png")

        # 4. Create a task and verify visual (actions)
        # Create a task at current time using N again
        page.keyboard.press("n")
        page.wait_for_selector("#event-overlay.visible")
        page.fill("#event-name", "Test Task")
        page.select_option("#event-type", "task")
        page.click("#event-save-btn")

        page.wait_for_timeout(1000) # Wait for save/render

        # Click on the task to select it and show actions
        # We need to find the event element.
        task = page.locator(".task-event").first
        if task.count() > 0:
            task.click()
            page.wait_for_timeout(500)

            # Check for event-actions
            actions = page.locator(".event-actions")
            if actions.is_visible():
                print("PASS: Event actions visible")
                page.screenshot(path="verification/task_actions.png")
                print("Screenshot saved to verification/task_actions.png")
            else:
                print("FAIL: Event actions not visible")
                page.screenshot(path="verification/task_actions_fail.png")
        else:
            print("FAIL: Could not find created task")

        browser.close()

if __name__ == "__main__":
    verify_changes()
