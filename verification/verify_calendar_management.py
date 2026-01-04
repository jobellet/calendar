import time
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:8000")

    # Wait for app to load
    page.wait_for_selector("#calendar")

    # 1. Create a new calendar "TestCal"
    page.click("#add-calendar-btn")
    page.fill("#new-calendar-name", "TestCal")
    page.click("#add-calendar-form button[type='submit']")
    page.wait_for_selector("label:has-text('TestCal')")
    print("Created TestCal")

    # 2. Add an event to "TestCal"
    page.keyboard.press("n")
    page.wait_for_selector("#event-overlay.visible")
    page.fill("#event-name", "Test Event")
    page.evaluate("document.querySelectorAll('#event-calendar-list input:checked').forEach(el => el.click())")
    page.check("input[value='TestCal']")
    page.click("#event-save-btn")
    page.wait_for_selector("#event-overlay", state="hidden")
    print("Created Event")

    # 3. Rename "TestCal" to "RenamedCal"
    page.click(".calendar-item:has-text('TestCal') .calendar-options-btn", force=True)
    page.click(".context-menu-item:has-text('Rename')", force=True)
    page.wait_for_selector("#rename-calendar-modal.visible")
    page.fill("#rename-calendar-new-name", "RenamedCal")
    page.click("#rename-calendar-form button[type='submit']")
    page.wait_for_selector("label:has-text('RenamedCal')")
    print("Renamed to RenamedCal")

    page.wait_for_selector("#calendar:has-text('Test Event')")
    print("Event found after rename")

    # 4. Create "MergeTarget"
    page.click("#add-calendar-btn")
    page.fill("#new-calendar-name", "MergeTarget")
    page.click("#add-calendar-form button[type='submit']")
    page.wait_for_selector("label:has-text('MergeTarget')")

    # 5. Merge "RenamedCal" into "MergeTarget"
    # Ensure previous context menu is closed by clicking elsewhere?
    # Or just click the button again, which recreates it.

    # Click body to close any open menu
    page.click("body", position={"x":0, "y":0})
    time.sleep(0.5)

    page.click(".calendar-item:has-text('RenamedCal') .calendar-options-btn", force=True)
    page.wait_for_selector(".context-menu-item:has-text('Merge into...')")
    page.click(".context-menu-item:has-text('Merge into...')", force=True)

    page.wait_for_selector("#merge-calendar-modal.visible")
    page.select_option("#merge-calendar-target", label="MergeTarget")
    page.on("dialog", lambda dialog: dialog.accept())
    page.click("#merge-calendar-form button[type='submit']")

    page.wait_for_selector(".calendar-item:has-text('RenamedCal')", state="detached")
    print("Merged and RenamedCal is gone")

    page.wait_for_selector("#calendar:has-text('Test Event')")
    print("Event found after merge")

    # 6. Delete "MergeTarget"
    page.click("body", position={"x":0, "y":0})
    time.sleep(0.5)

    page.click(".calendar-item:has-text('MergeTarget') .calendar-options-btn", force=True)
    page.wait_for_selector(".context-menu-item:has-text('Delete')")
    page.click(".context-menu-item:has-text('Delete')", force=True)

    page.wait_for_selector(".calendar-item:has-text('MergeTarget')", state="detached")
    print("Deleted MergeTarget")

    time.sleep(1)

    if page.locator("#calendar:has-text('Test Event')").count() == 0:
        print("Event successfully deleted with calendar")
    else:
        print("Event still visible after delete!")

    page.screenshot(path="verification/calendar_management.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
