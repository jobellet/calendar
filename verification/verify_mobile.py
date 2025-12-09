from playwright.sync_api import sync_playwright

def verify_mobile_drag(page):
    # Set viewport to mobile size
    page.set_viewport_size({"width": 375, "height": 812})

    # Go to the app
    page.goto("http://localhost:8000")

    # Wait for calendar to load
    page.wait_for_selector("#calendar")

    # Check if right sidebar exists and is visible (it should be 30px wide)
    right_sidebar = page.locator("#right-sidebar")
    if not right_sidebar.is_visible():
        print("Right sidebar is not visible!")
        return

    # Simulate drag on the right sidebar
    # We need to use mouse events because Playwright's touch simulation is a bit complex
    # and our code handles mouse events too (we just added touch support).
    # But to verify TOUCH specifically, we should try to dispatch touch events if possible,
    # or at least verify the mouse interactions still work (since we modified that file).
    # Wait, the prompt says "make the smartphone view functional".
    # We added touch listeners. Playwright has `page.touchscreen.tap` but drag is harder.
    # We can try to manually dispatch touch events via evaluate.

    print("Simulating touch drag on right sidebar...")

    # Get sidebar bounding box
    box = right_sidebar.bounding_box()
    start_x = box['x'] + 15
    start_y = box['y'] + 100
    end_y = box['y'] + 200

    # Dispatch touch events
    page.evaluate("""
        (coords) => {
            const { x, startY, endY } = coords;
            const target = document.elementFromPoint(x, startY);

            const touchStart = new Touch({
                identifier: 0,
                target: target,
                clientX: x,
                clientY: startY,
                pageX: x,
                pageY: startY
            });

            const evtStart = new TouchEvent('touchstart', {
                touches: [touchStart],
                targetTouches: [touchStart],
                changedTouches: [touchStart],
                bubbles: true,
                cancelable: true
            });

            target.dispatchEvent(evtStart);

            // Move
            const touchMove = new Touch({
                identifier: 0,
                target: target,
                clientX: x,
                clientY: endY,
                pageX: x,
                pageY: endY
            });

            const evtMove = new TouchEvent('touchmove', {
                touches: [touchMove],
                targetTouches: [touchMove],
                changedTouches: [touchMove],
                bubbles: true,
                cancelable: true
            });

            target.dispatchEvent(evtMove);

            // End
            const touchEnd = new Touch({
                identifier: 0,
                target: target,
                clientX: x,
                clientY: endY,
                pageX: x,
                pageY: endY
            });

            const evtEnd = new TouchEvent('touchend', {
                touches: [],
                targetTouches: [],
                changedTouches: [touchEnd], // changedTouches contains the released touch
                bubbles: true,
                cancelable: true
            });

            target.dispatchEvent(evtEnd);
        }
    """, {'x': start_x, 'startY': start_y, 'endY': end_y})

    # If successful, the event modal should appear
    try:
        page.wait_for_selector("#event-overlay", state="visible", timeout=2000)
        print("Event overlay appeared!")
    except:
        print("Event overlay did not appear.")

    page.screenshot(path="verification/mobile_drag_test.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        verify_mobile_drag(page)
        browser.close()
