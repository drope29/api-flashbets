from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        print("Navigating to app...")
        page.goto("http://localhost:5173", timeout=60000)

        # Wait for connection and some events
        print("Waiting for dashboard to load...")
        try:
            page.wait_for_selector("text=FlashBets Admin Dashboard", timeout=10000)
        except Exception as e:
            print(f"Selector not found: {e}")
            page.screenshot(path="frontend/verification/debug.png")
            raise e

        # Wait a bit for socket connection and market data
        print("Waiting for market data...")
        time.sleep(10)

        # Take screenshot
        print("Taking screenshot...")
        page.screenshot(path="frontend/verification/dashboard.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run()
