import sys
import os
from playwright.sync_api import sync_playwright

def verify_zoom_screenshot():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        page.goto("http://localhost:8000")

        # Switch to Hours View
        page.click("button[data-view='hoursView']")

        # Wait for calendar grid
        page.wait_for_selector(".time-grid-container")

        # Initial Screenshot
        page.screenshot(path="verification/1_initial.png")

        # Click Zoom In button twice
        page.click("#hours-zoom-in-btn")
        page.wait_for_timeout(200)
        page.click("#hours-zoom-in-btn")
        page.wait_for_timeout(500)

        # Zoomed In Screenshot
        page.screenshot(path="verification/2_zoomed_in.png")

        # Click Zoom Out button 4 times
        for _ in range(4):
            page.click("#hours-zoom-out-btn")
            page.wait_for_timeout(200)
        page.wait_for_timeout(500)

        # Zoomed Out Screenshot
        page.screenshot(path="verification/3_zoomed_out.png")

        browser.close()

if __name__ == "__main__":
    verify_zoom_screenshot()
