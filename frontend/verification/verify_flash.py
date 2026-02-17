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
            page.wait_for_selector(".grid > div", timeout=10000)
        except Exception as e:
             print(f"Error loading list: {e}")
             page.screenshot(path="frontend/verification/debug_flash_list.png")
             raise e

        # Join a match
        print("Joining match...")
        page.click(".grid > div:first-child")

        # Wait for Flash UI
        print("Waiting for Flash UI...")
        try:
            page.wait_for_selector("text=Current Window", timeout=10000)
            page.wait_for_selector("text=Next Window", timeout=10000)
            # Check clock format (MM:SS)
            page.wait_for_selector("text=:", timeout=10000)
        except Exception as e:
             print(f"Error loading flash view: {e}")
             page.screenshot(path="frontend/verification/debug_flash_game.png")
             raise e

        # Wait to capture odds movement (Flash effect)
        print("Waiting for odds movement...")
        time.sleep(3)

        # Take screenshot
        print("Taking screenshot...")
        page.screenshot(path="frontend/verification/flash_view.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run()
