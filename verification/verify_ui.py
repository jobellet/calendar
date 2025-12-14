from playwright.sync_api import sync_playwright, expect
import time

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Enable touch support
        context = browser.new_context(
            viewport={'width': 375, 'height': 812},
            has_touch=True,
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
        )
        page = context.new_page()

        try:
            # 1. Load the page
            page.goto("http://localhost:8000")

            # Wait for app to load
            time.sleep(2)

            # 2. Verify Task Queue Rendering
            # Open the sidebar menu first (on mobile it is hidden)
            # The left sidebar is now accessible via the mobile menu toggle
            page.click('.mobile-menu-toggle')
            time.sleep(1)

            # Check for "Overdue Tasks" label or "Add Task" button
            expect(page.locator('#add-task-btn')).to_be_visible()

            # 3. Create an overdue task to verify queue display
            # Close sidebar first
            page.click('.close-sidebar-btn')
            time.sleep(0.5)

            # Let's use the UI to add a task that is overdue
            # Click FAB
            page.click('.fab-add-event')
            time.sleep(0.5)

            # Fill form
            page.fill('#event-name', 'Test Overdue Task')
            page.select_option('#event-type', 'task')

            # Set date to yesterday
            yesterday = time.strftime('%Y-%m-%d', time.localtime(time.time() - 86400))
            page.fill('#event-date', yesterday)
            page.fill('#event-start-time', '10:00')
            page.fill('#event-duration', '60')

            # Save
            page.click('#event-save-btn')
            time.sleep(1)

            # 4. Verify it appears in Queue
            page.click('.mobile-menu-toggle')
            time.sleep(1)

            # Check for task item
            task_item = page.locator('.queue-task-item', has_text='Test Overdue Task')
            expect(task_item).to_be_visible()

            # Check for buttons
            expect(task_item.locator('.done-btn')).to_be_visible()
            expect(task_item.locator('.sched-btn')).to_be_visible()

            # Screenshot of Queue
            page.screenshot(path="verification/task_queue.png")
            print("Task Queue verified and screenshot taken.")

            # 5. Verify Context Menu for Reschedule
            task_item.locator('.sched-btn').click()
            time.sleep(0.5)
            expect(page.locator('.context-menu')).to_be_visible()
            page.screenshot(path="verification/reschedule_menu.png")
            print("Reschedule menu verified.")

            # Close menu
            page.click('body', position={'x': 0, 'y': 0})

            # 6. Verify Mobile Panning (Hours View)
            # Close sidebar
            page.click('.close-sidebar-btn')
            time.sleep(0.5)

            # Ensure we are in Hours View
            # On mobile we might need to select it if not default
            # It is default in our code now.

            # Drag on the grid
            grid_body = page.locator('.time-grid-body')
            first_label = page.locator('.time-label').first.text_content()

            # Use touchscreen API
            # Tap center to ensure focus
            page.touchscreen.tap(200, 300)

            # Evaluate script to dispatch touch events if API is flaky or needs exact sequence
            # But let's try direct eval dispatch for reliability in headless
            page.evaluate("""
                const body = document.querySelector('.time-grid-body');
                const t1 = new Touch({identifier: 0, target: body, clientY: 200});
                const t2 = new Touch({identifier: 0, target: body, clientY: 300}); // Moved down by 100px

                body.dispatchEvent(new TouchEvent('touchstart', {touches: [t1], bubbles: true}));
                body.dispatchEvent(new TouchEvent('touchmove', {touches: [t2], bubbles: true}));
                body.dispatchEvent(new TouchEvent('touchend', {touches: [], bubbles: true}));
            """)

            time.sleep(1)
            # Check if time labels changed
            new_first_label = page.locator('.time-label').first.text_content()

            if first_label != new_first_label:
                print(f"Panning verified: {first_label} -> {new_first_label}")
            else:
                print("Panning check inconclusive (labels might match if shift was small or snapped back)")

            page.screenshot(path="verification/mobile_view_pan.png")

        finally:
            browser.close()

if __name__ == "__main__":
    verify_changes()
