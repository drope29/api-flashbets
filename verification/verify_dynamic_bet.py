from playwright.sync_api import sync_playwright
import time

def verify_dynamic_bet_amount():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))

        print("Navigating to home page...")
        page.goto("http://localhost:5173")

        print("Waiting for debug match...")
        try:
            page.wait_for_selector("text=DEBUG TEAM", timeout=10000)
            page.click("text=DEBUG TEAM")
        except:
            print("Debug match not found!")
            return

        print("Waiting for Bet Amount Panel...")
        try:
            page.wait_for_selector("text=Valor da Aposta", timeout=10000)
        except:
            print("Bet Amount Panel not found!")
            return

        # Capture Initial Balance
        time.sleep(2)
        initial_balance_el = page.locator("header >> text=R$")
        if not initial_balance_el.is_visible():
             print("Balance element not found!")
             return
        initial_text = initial_balance_el.inner_text()
        print(f"Initial Balance: {initial_text}")

        # --- TEST 1: Quick Add +10 (Total 20) ---
        print("Testing Quick Add +10...")
        # Current amount is 10. Click +10. Should be 20.
        page.click("text=+10")

        # Verify input value (range or number input)
        # The number input is below, let's check it.
        # Assuming only one input type=number or finding by value
        # But we can also check the display R$ 20.00

        amount_display = page.locator("text=R$ 20.00")
        if amount_display.is_visible():
             print("Amount updated to R$ 20.00 correctly.")
        else:
             print("Amount update failed!")

        # --- TEST 2: Place Bet with 20 ---
        print("Placing Bet on SIM with R$ 20...")
        page.click("text=SIM >> nth=0", force=True)

        print("Waiting for Server Confirmation...")
        try:
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

            # Should have deducted 20
            if final_val == init_val - 20:
                print("SUCCESS: Balance decreased by exactly 20.00.")
            else:
                print(f"FAILURE: Balance mismatch. Expected {init_val - 20}, got {final_val}")
        except Exception as e:
            print(f"Error parsing balance: {e}")

        browser.close()

if __name__ == "__main__":
    verify_dynamic_bet_amount()
