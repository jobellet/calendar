from playwright.sync_api import sync_playwright

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000")
        page.wait_for_selector(".calendar-item", timeout=10000)

        page.evaluate("""
            () => {
                const w = document.createElement('div');
                w.className = 'custom-event-content';
                w.style.width = '300px';
                w.style.height = '60px';
                w.style.backgroundColor = 'white';
                w.style.border = '1px solid #ccc';
                w.style.position = 'fixed'; w.style.top = '10px'; w.style.left = '10px'; w.style.zIndex = 10000;

                const img = document.createElement('img');
                img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
                w.appendChild(img);

                const t = document.createElement('div');
                t.className = 'event-title';
                t.textContent = 'Side by Side Text';
                t.style.color = 'black';
                t.style.fontSize = '20px';
                w.appendChild(t);

                document.body.appendChild(w);
            }
        """)

        page.locator(".custom-event-content").last.screenshot(path="verification/layout_final.png")
        browser.close()

if __name__ == "__main__":
    verify()
