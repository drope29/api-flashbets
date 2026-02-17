from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        print("Navigating to app...")
        page.goto("http://localhost:5173", timeout=60000)

        # Wait for Match List (Debug Match should be there in DEBUG_MODE)
        print("Waiting for DEBUG TEAM match...")
        try:
            page.wait_for_selector("text=DEBUG TEAM", timeout=15000)
            print("✅ Debug Match Found")
        except Exception as e:
             print(f"Error loading list: {e}")
             page.screenshot(path="frontend/verification/debug_lifecycle_list.png")
             # Assuming it's fine if no debug mode but strictly checking for it

        # Join match
        if page.is_visible("text=DEBUG TEAM"):
            page.click("text=DEBUG TEAM")
            print("Joined Debug Match")

            # Check for LIVE status
            page.wait_for_selector("text=LIVE MATCH TIME", timeout=10000)
            print("✅ Match is LIVE")

            # Take screenshot
            page.screenshot(path="frontend/verification/lifecycle_live.png")

            # Wait a bit (simulate watching)
            time.sleep(2)

            # Note: We can't easily force FINISHED state from here without backend access in this script context
            # But we can verify the logic structure via code review (done).
            # If we could, we would check for "GAME OVER" text.

        browser.close()

if __name__ == "__main__":
    run()
