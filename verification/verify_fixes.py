from playwright.sync_api import sync_playwright, expect
import time

def verify_fixes(page):
    print("Navigating to app...")
    page.goto("http://localhost:8000")

    # 1. Verify Global Click Hijack Fix
    print("Testing Navigation Buttons (Month/Week/Day)...")

    # Check that clicking "Week" switches view and DOES NOT open modal
    page.get_by_role("button", name="Week").click()

    # Wait a bit to ensure no modal appears
    time.sleep(0.5)

    # Check if modal is visible (it should NOT be)
    modal = page.locator("#event-overlay")
    if modal.is_visible():
        print("FAIL: Event modal opened when clicking Week button")
    else:
        print("PASS: Event modal did not open when clicking Week button")

    # Verify view changed (Week view usually has time grid)
    expect(page.locator(".time-grid-container")).to_be_visible()

    # 2. Verify Add Calendar Modal
    print("Testing Add Calendar Modal...")
    page.get_by_role("button", name="+ Add calendar").click()

    add_cal_modal = page.locator("#add-calendar-modal")
    expect(add_cal_modal).to_be_visible()
    print("PASS: Add Calendar modal opened")

    # Close it
    page.locator("#close-add-calendar-modal-btn").click()
    expect(add_cal_modal).not_to_be_visible()

    # 3. Verify Drag to Create (or at least Click on grid)
    print("Testing Click on Grid to Create Event...")

    # Switch to Day view for easier targeting (Using exact=True to distinguish Day vs Today)
    page.get_by_role("button", name="Day", exact=True).click()
    time.sleep(0.5)

    # Find a time cell (e.g., 10:00)
    # The structure is .time-row -> .time-cell
    # We need to find the cell corresponding to 10:00.
    # The time label is in the row.

    # Let's click on a cell in the middle
    cells = page.locator(".time-cell")
    count = cells.count()
    if count > 0:
        target_cell = cells.nth(10) # 10th hour roughly

        # Simulate click
        target_cell.click()

        # Now modal SHOULD open
        expect(modal).to_be_visible()
        print("PASS: Event modal opened when clicking grid")

        # Verify time is populated (not random)
        # We clicked 10th cell (10:00 if startHour is 0)
        start_time = page.locator("#event-start-time").input_value()
        print(f"Populated Start Time: {start_time}")

        # Close modal
        page.locator("#close-event-modal-btn").click()
    else:
        print("FAIL: No time cells found")

    # 4. Verify Keyboard Shortcuts
    print("Testing Keyboard Shortcuts (M)...")
    page.keyboard.press("m")

    # Should be back to Month view
    expect(page.locator(".calendar-grid-month")).to_be_visible()
    print("PASS: Switched to Month view with 'm'")

    # Take screenshot
    page.screenshot(path="verification/verification.png")
    print("Screenshot saved to verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_fixes(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
