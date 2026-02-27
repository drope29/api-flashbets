from playwright.sync_api import sync_playwright
import time

def verify_bet_lock():
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
            page.screenshot(path="verification/bet_lock_failed_home.png")
            return

        print("Waiting for markets...")
        try:
            # Wait for 'SIM' button
            page.wait_for_selector("text=SIM", timeout=10000)
        except:
            print("Markets not loaded!")
            page.screenshot(path="verification/bet_lock_failed_markets.png")
            return

        print("Placing First Bet...")
        # Click the first 'SIM' button found
        sim_btn = page.locator("text=SIM").first
        sim_btn.click()

        time.sleep(1)

        # Check if button text changed to "Aposta Registrada"
        # Since FlashOddsButton structure might be complex, we check for text in the button area or button state
        # The prompt says: "Aposta Registrada"
        try:
            page.wait_for_selector("text=Aposta Registrada", timeout=5000)
            print("Button text changed to 'Aposta Registrada'")
        except:
            print("Button text update failed!")
            page.screenshot(path="verification/bet_lock_failed_text.png")

        # Try clicking again - balance should NOT decrease further
        # Get balance
        balance_el = page.locator("text=R$ 990,00").first # Assuming starting 1000 - 10
        if not balance_el.is_visible():
             # maybe it's still 1000 if failed?
             if page.locator("text=R$ 1.000,00").is_visible():
                 print("Balance did not decrease!")
             else:
                 print("Balance check failed (unknown balance)")
        else:
             print("Balance decreased once correctly.")

        # If we click again, it should be disabled or alert.
        # Playwright won't click disabled buttons easily, or it will complain.
        # But we implemented alert for double click.

        # Check if button is disabled attribute
        # We need to find the button again as it re-rendered
        btn = page.locator("button", has_text="Aposta Registrada").first
        if btn.is_disabled():
            print("Button is strictly disabled.")
        else:
            print("Button is NOT disabled attribute-wise (styling only?)")

        page.screenshot(path="verification/bet_lock_success.png")
        browser.close()

if __name__ == "__main__":
    verify_bet_lock()
