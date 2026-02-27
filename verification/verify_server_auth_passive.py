from playwright.sync_api import sync_playwright
import time

def verify_server_authority_passive():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Subscribe to console logs
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        print("Navigating to home page...")
        page.goto("http://localhost:5173")

        print("Waiting for debug match...")
        try:
            page.wait_for_selector("text=DEBUG TEAM", timeout=10000)
            page.click("text=DEBUG TEAM")
        except:
            print("Debug match not found!")
            return

        print("Waiting for markets...")
        try:
            page.wait_for_selector("text=SIM", timeout=10000)
        except:
            print("Markets not loaded!")
            return

        # Capture Initial Balance
        time.sleep(2)
        initial_balance_el = page.locator("header >> text=R$")
        if not initial_balance_el.is_visible():
             print("Balance element not found!")
             return
        initial_text = initial_balance_el.inner_text()
        print(f"Initial Balance: {initial_text}")

        print("Placing Bet on SIM...")
        # Force click
        page.click("text=SIM >> nth=0", force=True)

        print("Waiting for 'Sending bet' toast...")
        try:
            page.wait_for_selector("text=Sending bet", timeout=3000)
            print("Toast 'Sending bet' appeared.")
        except:
            print("Toast 'Sending bet' MISSING. Click might have failed or socket missing.")

        print("Waiting for Server Confirmation...")
        try:
            # Wait for success toast
            page.wait_for_selector("text=Bet Confirmed", timeout=5000)
            print("Toast 'Bet Confirmed' appeared.")
        except:
            print("Toast 'Bet Confirmed' MISSING.")

        # Verify Balance Update
        time.sleep(2)

        final_balance_el = page.locator("header >> text=R$")
        final_text = final_balance_el.inner_text()
        print(f"Final Balance: {final_text}")

        try:
            init_val = float(initial_text.replace("R$", "").replace(".", "").replace(",", ".").strip())
            final_val = float(final_text.replace("R$", "").replace(".", "").replace(",", ".").strip())

            if final_val == init_val - 10:
                print("SUCCESS: Balance decreased by exactly 10.00 via Server Authority.")
            else:
                print(f"FAILURE: Balance mismatch. Expected {init_val - 10}, got {final_val}")
        except Exception as e:
            print(f"Error parsing balance: {e}")

        browser.close()

if __name__ == "__main__":
    verify_server_authority_passive()
