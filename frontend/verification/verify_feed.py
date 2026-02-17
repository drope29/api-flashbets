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
        print("Waiting for DEBUG TEAM match...")
        try:
            page.wait_for_selector("text=DEBUG TEAM", timeout=15000)
        except Exception as e:
             print(f"Error loading list: {e}")
             page.screenshot(path="frontend/verification/debug_feed_list.png")
             # Continue to check if logic is fundamentally broken or just slow

        if page.is_visible("text=DEBUG TEAM"):
            page.click("text=DEBUG TEAM")
            print("Joined Debug Match")

            # Wait for Feed items
            print("Checking Feed...")
            try:
                page.wait_for_selector("text=Dev Junior", timeout=5000)
                print("✅ Found 'Dev Junior' event")
                page.wait_for_selector("text=Console Log", timeout=5000)
                print("✅ Found 'Console Log' event")
            except Exception as e:
                print(f"Feed error: {e}")

            page.screenshot(path="frontend/verification/feed_check.png")

        browser.close()

if __name__ == "__main__":
    run()
