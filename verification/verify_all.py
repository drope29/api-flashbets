from playwright.sync_api import sync_playwright
import time

def verify_all():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to home page...")
        page.goto("http://localhost:5173")

        print("Waiting for debug match...")
        try:
            page.wait_for_selector("text=DEBUG TEAM", timeout=10000)
            page.click("text=DEBUG TEAM")
        except:
            print("Debug match not found!")
            page.screenshot(path="verification/failed_home.png")
            return

        print("Waiting for markets...")
        try:
            # Wait for 'SIM' button
            page.wait_for_selector("text=SIM", timeout=10000)
        except:
            print("Markets not loaded!")
            page.screenshot(path="verification/failed_markets.png")
            return

        print("Placing Bet...")
        # Click the first 'SIM' button found
        sim_btn = page.locator("text=SIM").first
        sim_btn.click()

        time.sleep(1)

        # Verify Lock
        try:
            page.wait_for_selector("text=Aposta Registrada", timeout=5000)
            print("Bet Locked UI confirmed.")
        except:
            print("Bet Locking failed.")
            page.screenshot(path="verification/failed_lock.png")

        # Verify Balance Decrease
        # Started 1000, bet 10 -> 990
        # If run multiple times in same session, might be lower, but let's assume fresh load or check relative drop if complex.
        # Just checking if "R$ 1.000,00" is gone is a simple check.
        if not page.locator("text=R$ 1.000,00").is_visible():
             print("Balance decreased.")
        else:
             print("Balance check failed or stayed same.")

        # Note: We cannot easily verify "Payout" without mocking the game end or waiting 100 minutes.
        # But the loop fix (Anti-Spam) prevents infinite alerts.
        # We can check if an alert pops up inappropriately or if we get redirected correctly if we mock end.

        page.screenshot(path="verification/success_all.png")
        browser.close()

if __name__ == "__main__":
    verify_all()
