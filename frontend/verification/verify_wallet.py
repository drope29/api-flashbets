from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        print("Navigating to app...")
        page.goto("http://localhost:5173", timeout=60000)

        # Wait for dashboard and balance
        print("Waiting for dashboard and balance...")
        try:
            page.wait_for_selector("text=FlashBets Admin Dashboard", timeout=10000)
            page.wait_for_selector("text=R$ 1.000,00", timeout=10000)
        except Exception as e:
             print(f"Error loading dashboard: {e}")
             page.screenshot(path="frontend/verification/debug_wallet.png")
             raise e

        # Wait for a market to open (buttons to be enabled)
        print("Waiting for OPEN market (Buttons enabled)...")
        try:
            page.wait_for_selector("button:has-text('YES (GOAL)'):not([disabled])", timeout=60000)
        except Exception as e:
            print("Market did not open in time.")
            page.screenshot(path="frontend/verification/debug_wallet_timeout.png")
            raise e

        print("Market is OPEN. Placing bet...")

        # Click YES button to open modal
        page.click("button:has-text('YES (GOAL)')")

        # Wait for modal
        print("Waiting for Bet Modal...")
        page.wait_for_selector("text=Place Bet:")

        # Type amount
        print("Entering amount...")
        page.fill("input[placeholder='0.00']", "150")

        # Click Confirm
        print("Clicking Confirm...")
        page.click("text=Confirm Bet")

        # Wait for Toast and Balance update
        print("Waiting for success toast and balance update...")
        time.sleep(2)

        # Check for Toast
        try:
             # Toastify text
             page.wait_for_selector("text=Bet Confirmed!", timeout=5000)
             print("✅ Success Toast found!")
        except:
             print("❌ Toast NOT found.")

        # Check Balance (should be 850,00)
        try:
            # Note: Locators might be tricky with formatting, look for the text part
            page.wait_for_selector("text=850,00", timeout=5000)
            print("✅ Balance updated correctly!")
        except:
            print("❌ Balance NOT updated correctly.")

        # Take screenshot of the state
        print("Taking screenshot...")
        page.screenshot(path="frontend/verification/wallet_bet_placed.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run()
