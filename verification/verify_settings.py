from playwright.sync_api import sync_playwright, expect
import re

def verify_settings():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        page.goto("http://localhost:8000")

        # Wait for calendar to load
        expect(page.locator("#calendar")).to_be_visible()

        # 1. Check Settings Button existence
        settings_btn = page.locator("#settings-btn")
        expect(settings_btn).to_be_visible()

        # 2. Click Settings Button
        settings_btn.click()

        # 3. Verify Modal Appears
        settings_panel = page.locator("#settings-panel")
        expect(settings_panel).to_have_class(re.compile(r"visible"))

        # 4. Interact with Voice Settings
        voice_checkbox = page.locator("#settings-voice-enabled")
        expect(voice_checkbox).not_to_be_checked()

        # Enable voice
        voice_checkbox.check()

        # Verify expanded options are visible
        voice_group = page.locator("#voice-settings-group")
        expect(voice_group).to_be_visible()

        # Check Test Voice Button
        test_btn = page.locator("#test-voice-btn")
        expect(test_btn).to_be_visible()
        test_btn.click()

        # Take screenshot of settings modal with Test Voice button
        page.screenshot(path="verification/settings_modal_test_btn.png")
        print("Screenshot saved to verification/settings_modal_test_btn.png")

        # Change lead time
        lead_time_input = page.locator("#settings-voice-lead-time")
        lead_time_input.fill("5")

        # 5. Save Settings
        save_btn = page.get_by_role("button", name="Save Settings")
        save_btn.click()

        # Verify modal closed
        expect(settings_panel).to_have_class(re.compile(r"hidden"))

        # Verify toast
        toast = page.locator(".toast-success")
        expect(toast).to_contain_text("Settings saved")
        expect(toast).to_be_visible()

        page.screenshot(path="verification/settings_saved.png")
        print("Screenshot saved to verification/settings_saved.png")

        browser.close()

if __name__ == "__main__":
    verify_settings()
