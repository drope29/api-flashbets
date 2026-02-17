from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        print("Navigating to app...")
        page.goto("http://localhost:5173", timeout=60000)

        # Wait for dashboard
        print("Waiting for dashboard to load...")
        try:
            page.wait_for_selector("text=FlashBets Admin Dashboard", timeout=10000)
        except Exception as e:
             print(f"Error loading dashboard: {e}")
             page.screenshot(path="frontend/verification/debug_bet.png")
             raise e

        # Wait for a market to open (buttons to be enabled)
        print("Waiting for OPEN market (Buttons enabled)...")
        # We look for the YES button which should be enabled when market is OPEN
        try:
            # wait for button to not be disabled
            page.wait_for_selector("button:has-text('YES (GOAL)'):not([disabled])", timeout=60000)
        except Exception as e:
            print("Market did not open in time.")
            page.screenshot(path="frontend/verification/debug_bet_timeout.png")
            raise e

        print("Market is OPEN. Placing bet...")

        # Setup dialog handler for the prompt
        def handle_dialog(dialog):
            print(f"Dialog message: {dialog.message}")
            dialog.accept("100") # Enter 100 as bet amount

        page.on("dialog", handle_dialog)

        # Setup dialog handler for the Alert (confirmation)
        # Note: Playwright handles alerts automatically by dismissing them,
        # but we want to capture the message to verify success.
        # However, we can't easily distinguish the prompt dialog from the alert dialog in the same handler without logic.
        # Actually, the first dialog is prompt, second is alert.
        # Let's just track dialogs.

        dialogs = []
        def track_dialog(dialog):
            print(f"Dialog type: {dialog.type}, Message: {dialog.message}")
            dialogs.append(dialog)
            if dialog.type == "prompt":
                dialog.accept("50")
            else:
                dialog.accept()

        # Remove previous listener and add tracking one
        page.remove_listener("dialog", handle_dialog)
        page.on("dialog", track_dialog)

        # Click YES button
        page.click("button:has-text('YES (GOAL)')")

        # Wait a bit for the backend response and the alert
        time.sleep(2)

        # Verify we got a confirmation alert
        confirmed = any("Bet Confirmed" in d.message for d in dialogs)
        if confirmed:
            print("✅ Bet Confirmed Alert Received!")
        else:
            print("❌ Bet Confirmation NOT Received.")
            # Print all dialogs seen
            for d in dialogs:
                print(f" - {d.type}: {d.message}")

        # Take screenshot of the state
        print("Taking screenshot...")
        page.screenshot(path="frontend/verification/bet_placed.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run()
