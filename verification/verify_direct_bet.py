from playwright.sync_api import sync_playwright
import time

def verify_direct_bet():
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
            page.screenshot(path="verification/bet_failed_home.png")
            return

        print("Waiting for markets...")
        try:
            # Wait for 'SIM' button
            page.wait_for_selector("text=SIM", timeout=10000)
        except:
            print("Markets not loaded!")
            page.screenshot(path="verification/bet_failed_markets.png")
            return

        # Check Initial Balance
        initial_balance_el = page.locator("text=R$ 1.000,00").first
        if not initial_balance_el.is_visible():
            print("Balance not visible!")
        else:
            print("Initial Balance: R$ 1.000,00 confirmed")

        print("Placing DIRECT bet on SIM (Clicking button)...")
        # Click the first 'SIM' button found
        page.click("text=SIM >> nth=0")

        # We expect NO MODAL, just immediate deduction

        # Check Balance Update (Started at 1000, should be 990)
        time.sleep(1)

        try:
            # Use a looser text match or check if 1.000 is gone
            # Expect "R$ 990,00"
            page.wait_for_selector("text=R$ 990,00", timeout=5000)
            print("Balance updated correctly to R$ 990,00")
            page.screenshot(path="verification/direct_bet_success.png")
        except:
            print("Balance update verification failed!")
            page.screenshot(path="verification/direct_bet_failed_balance.png")

        browser.close()

if __name__ == "__main__":
    verify_direct_bet()
