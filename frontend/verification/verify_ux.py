from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        print("Navigating to app...")
        page.goto("http://localhost:5173", timeout=60000)

        # Wait for Match List
        print("Waiting for Match List...")
        try:
            page.wait_for_selector("text=FLASHBETS", timeout=10000)
        except Exception as e:
             print(f"Error loading list: {e}")
             page.screenshot(path="frontend/verification/debug_ux_list.png")
             # Continue anyway, might just be empty list due to no token

        # Take screenshot of Dashboard
        print("Taking screenshot of Dashboard...")
        page.screenshot(path="frontend/verification/ux_dashboard.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run()
