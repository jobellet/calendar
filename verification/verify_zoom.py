import sys
import os
from playwright.sync_api import sync_playwright

def verify_zoom():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        page.goto("http://localhost:8000")

        # Switch to Hours View
        page.click("button[data-view='hoursView']")

        # Wait for calendar grid
        page.wait_for_selector(".time-grid-container")

        # Check initial slot height (should be default 50px)
        # Note: setSlotHeight sets '--slot-height' variable on element.
        # But in rendered rows, row.style.height = 'var(--slot-height, 50px)'
        # We can check the computed style of a .time-row

        row = page.locator(".time-row").first
        initial_height = row.evaluate("el => parseFloat(getComputedStyle(el).height)")
        print(f"Initial row height: {initial_height}px")

        if abs(initial_height - 50) > 1:
            print("Initial height is not 50px!")

        # Click Zoom In button
        page.click("#hours-zoom-in-btn")
        page.wait_for_timeout(500) # Wait for update

        zoomed_in_height = row.evaluate("el => parseFloat(getComputedStyle(el).height)")
        print(f"Zoomed in height: {zoomed_in_height}px")

        if zoomed_in_height <= initial_height:
            print("Zoom in failed! Height did not increase.")
            sys.exit(1)

        # Click Zoom Out button (twice to go below initial)
        page.click("#hours-zoom-out-btn")
        page.wait_for_timeout(200)
        page.click("#hours-zoom-out-btn")
        page.wait_for_timeout(500)

        zoomed_out_height = row.evaluate("el => parseFloat(getComputedStyle(el).height)")
        print(f"Zoomed out height: {zoomed_out_height}px")

        if zoomed_out_height >= zoomed_in_height:
            print("Zoom out failed! Height did not decrease.")
            sys.exit(1)

        # Check panning
        # Panning should NOT change height
        page.click("#hours-up-btn")
        page.wait_for_timeout(500)

        panned_height = row.evaluate("el => parseFloat(getComputedStyle(el).height)")
        print(f"Panned height: {panned_height}px")

        if abs(panned_height - zoomed_out_height) > 1:
            print("Panning changed the height! Bug persists.")
            sys.exit(1)

        print("Verification successful!")
        browser.close()

if __name__ == "__main__":
    verify_zoom()
