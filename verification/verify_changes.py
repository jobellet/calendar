from playwright.sync_api import sync_playwright

def verify_mobile_sidebar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use iPhone 13 viewport to simulate mobile
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:8000")
        page.wait_for_load_state("networkidle")

        # 1. Verify Right Sidebar strip is visible on mobile
        print("Checking right sidebar strip...")
        right_sidebar = page.locator("#right-sidebar")
        # Should be visible and have width 30px
        if right_sidebar.is_visible():
            box = right_sidebar.bounding_box()
            print(f"Right sidebar visible. Width: {box['width']}")
            if box['width'] == 30:
                print("Right sidebar width is correct.")
            else:
                print(f"Right sidebar width is {box['width']}, expected 30.")
        else:
            print("Right sidebar NOT visible.")

        # 2. Verify Open Sidebar
        print("Opening sidebar...")
        page.click(".mobile-menu-toggle")
        page.wait_for_selector("#left-sidebar.open")

        # Verify Image Management button is visible in sidebar
        print("Checking Image Management button...")
        img_btn = page.locator("#open-image-panel-btn")
        if img_btn.is_visible():
            print("Image Management button is visible.")
        else:
            print("Image Management button is NOT visible.")

        # Take screenshot of open sidebar
        page.screenshot(path="verification/mobile_sidebar_open.png")
        print("Screenshot saved: mobile_sidebar_open.png")

        # 3. Verify Close Button
        print("Checking close button...")
        close_btn = page.locator("#close-sidebar-btn")
        if close_btn.is_visible():
            print("Close button is visible.")
            close_btn.click()
            # Wait for sidebar to close (remove 'open' class)
            page.wait_for_function("!document.getElementById('left-sidebar').classList.contains('open')")
            print("Sidebar closed successfully.")
        else:
            print("Close button is NOT visible.")

        # Take screenshot of closed sidebar
        page.screenshot(path="verification/mobile_sidebar_closed.png")
        print("Screenshot saved: mobile_sidebar_closed.png")

        browser.close()

if __name__ == "__main__":
    verify_mobile_sidebar()
