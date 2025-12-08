
import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 375, "height": 812}) # iPhone X size
        await page.goto("http://localhost:8000")
        await page.wait_for_timeout(2000) # wait for render
        await page.screenshot(path="mobile_view.png")
        await browser.close()

asyncio.run(run())
