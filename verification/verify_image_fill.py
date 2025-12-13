from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Navigate to the app (assuming it will be served on port 8000)
        page.goto("http://localhost:8000")

        # Wait for calendar to load
        page.wait_for_selector(".calendar-grid-month")

        # Wait a bit for JS to init
        time.sleep(1)

        # Inject mock event and image
        page.evaluate("""
            const app = window.calendarApp || (window.calendarApp = new CalendarApp());
            // We assume app is already attached to window by app.js?
            // Actually app.js defines `const app = new CalendarApp()` inside DOMContentLoaded but does NOT expose it to window.
            // I need to patch app.js or find a way to access the instance.
            // For now, I will modify the CSS verification to just look at the elements I can create via UI or by inspecting.

            // Wait, I cannot easily access `app` if it is not global.
            // I will rely on visual inspection of a newly created event via UI interaction?
            // Or I can modify app.js temporarily to expose it, or just trust my CSS changes.

            // Let us try to expose it via a small script injection if I could, but I cannot modify running JS easily without reload.
            // Actually, I can just create a dummy element that mimics the structure in the DOM and screenshot that.
        """)

        # Alternative: Manually insert the HTML structure into the DOM to verify CSS.
        page.evaluate("""
            const container = document.querySelector(".calendar-body-month .day-cell .events-container");
            if (container) {
                const el = document.createElement("div");
                el.className = "calendar-event month-event";
                el.style.backgroundColor = "blue";

                const content = document.createElement("div");
                content.className = "event-content";

                const img = document.createElement("img");
                img.src = "https://via.placeholder.com/150";
                img.style.position = "absolute"; // Already in CSS but explicit here to match logic? No, rely on CSS.
                content.appendChild(img);

                const title = document.createElement("span");
                title.className = "event-title";
                title.textContent = "Test Event";
                content.appendChild(title);

                el.appendChild(content);
                container.appendChild(el);
            }
        """)

        # Wait for the event to appear
        page.wait_for_selector(".calendar-event")

        # Take screenshot of Month View
        page.screenshot(path="verification/month_view.png")

        # Now try to create a "Time Grid" event structure
        page.evaluate("""
             const timeGrid = document.querySelector(".calendar-grid-month");
             // Just replace the whole body content with a mock time grid structure for visualization
             document.body.innerHTML = "";

             const container = document.createElement("div");
             container.className = "time-grid-container";
             container.style.height = "500px";
             container.style.width = "500px";
             container.style.position = "relative";

             const eventsLayer = document.createElement("div");
             eventsLayer.className = "events-layer";
             eventsLayer.style.position = "relative";
             eventsLayer.style.height = "100%";
             eventsLayer.style.width = "100%";

             const el = document.createElement("div");
             el.className = "calendar-event time-event";
             el.style.top = "50px";
             el.style.left = "50px";
             el.style.width = "200px";
             el.style.height = "100px";
             el.style.position = "absolute";
             el.style.backgroundColor = "red";

             const content = document.createElement("div");
             content.className = "event-content";

             const img = document.createElement("img");
             img.src = "https://via.placeholder.com/300";
             content.appendChild(img);

             const title = document.createElement("span");
             title.className = "event-title";
             title.textContent = "Time Event Title";
             content.appendChild(title);

             el.appendChild(content);
             eventsLayer.appendChild(el);
             container.appendChild(eventsLayer);

             document.body.appendChild(container);
        """)

        # Take screenshot of Week View Mock
        page.screenshot(path="verification/week_view_mock.png")

        browser.close()

if __name__ == "__main__":
    run()
