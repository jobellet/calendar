from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Load the page
        page.goto("http://localhost:8000/index.html")
        page.wait_for_selector("#calendar")

        # Switch to Hours View
        page.keyboard.press("h")
        page.wait_for_timeout(500)

        # Check visible rows
        rows = page.locator(".time-row")
        count = rows.count()
        print(f"Hours View Row Count: {count}")

        # We expect around 6 rows (6 hours) + maybe one partial?
        # My change set window to 6 hours.
        # But render logic loops from startH to endH.
        # So it should be close to 6 or 7.
        if count >= 6:
            print("PASS: Hours View shows adequate range")
        else:
            print(f"FAIL: Hours View range too small ({count})")

        page.screenshot(path="verification/hours_view.png")

        browser.close()

if __name__ == "__main__":
    run()
