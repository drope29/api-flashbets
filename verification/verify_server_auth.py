from playwright.sync_api import sync_playwright
import time

def verify_server_authority():
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
            page.screenshot(path="verification/auth_failed_home.png")
            return

        print("Waiting for markets...")
        try:
            # Wait for 'SIM' button
            page.wait_for_selector("text=SIM", timeout=10000)
        except:
            print("Markets not loaded!")
            page.screenshot(path="verification/auth_failed_markets.png")
            return

        # Check Initial Balance (Wait for socket connect)
        time.sleep(2)
        # Should be R$ 1.000,00 initially (user_1 mock db)
        if not page.locator("text=R$ 1.000,00").is_visible():
             print("Initial Balance NOT 1000.00 (might be persistent or delayed).")
             # Try capturing whatever it is
             page.screenshot(path="verification/auth_initial_balance.png")
        else:
             print("Initial Balance: R$ 1.000,00 confirmed")

        print("Placing Bet on SIM...")
        page.click("text=SIM >> nth=0")

        # Wait for Toast Confirmation (Server Response)
        try:
            page.wait_for_selector("text=Bet Confirmed!", timeout=5000)
            print("Server confirmed bet (Toast appeared).")
        except:
            print("Server confirmation toast missing!")
            page.screenshot(path="verification/auth_failed_toast.png")

        # Verify Balance Update (Server Authoritative)
        # Should be 990.00
        time.sleep(1)
        if page.locator("text=R$ 990,00").is_visible():
             print("Balance updated to R$ 990,00 based on server response.")
        else:
             print("Balance update verification failed!")
             page.screenshot(path="verification/auth_failed_balance.png")

        browser.close()

if __name__ == "__main__":
    verify_server_authority()
