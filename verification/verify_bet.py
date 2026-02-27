from playwright.sync_api import sync_playwright
import time

def verify_bet_placement():
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
            # Wait for any market button, e.g., SIM or NAO
            page.wait_for_selector("text=SIM", timeout=10000)
        except:
            print("Markets not loaded!")
            page.screenshot(path="verification/bet_failed_markets.png")
            return

        print("Placing bet on SIM...")
        # Click the first 'SIM' button found
        page.click("text=SIM >> nth=0")

        # Expect Modal
        print("Waiting for modal...")
        page.wait_for_selector("text=Confirm Bet")

        # Enter Amount
        print("Entering amount...")
        page.fill("input[type=number]", "10")

        # Confirm
        print("Confirming bet...")
        page.click("text=PLACE BET")

        # Expect Toast Success
        print("Waiting for confirmation toast...")
        try:
            page.wait_for_selector("text=Bet Confirmed!", timeout=5000)
            print("Bet Confirmed Toast appeared!")
            page.screenshot(path="verification/bet_success.png")
        except:
            print("Bet Confirmation Toast NOT found!")
            page.screenshot(path="verification/bet_failed_toast.png")

        # Check Balance Update (Started at 1000, should be 990)
        # We need to wait a bit for update
        time.sleep(1)
        balance_text = page.locator("text=R$ 990,00").first
        if balance_text:
            print("Balance updated correctly to R$ 990,00")
        else:
            print("Balance update verification failed (might need selector tuning)")

        browser.close()

if __name__ == "__main__":
    verify_bet_placement()
