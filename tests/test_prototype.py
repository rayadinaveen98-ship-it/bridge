from pathlib import Path
from playwright.sync_api import sync_playwright

HTML = Path(__file__).resolve().parents[1] / "prototype" / "bridge-v1.html"
OUT = Path(__file__).resolve().parent / "artifacts"
OUT.mkdir(parents=True, exist_ok=True)

def test_happy_path():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.set_content(HTML.read_text(encoding="utf-8"), wait_until="load")
        page.screenshot(path=str(OUT / "welcome.png"), full_page=True)
        page.locator('[data-action="go"][data-to="age"]').click()
        page.locator('[data-action="ageNext"]').click()
        assert "Confirm eligibility" in page.locator("#mobileApp").inner_text()
        page.locator("#ageCheck").check()
        page.locator('[data-action="ageNext"]').click()
        page.locator("#agreeCheck").check()
        page.locator('[data-action="safetyNext"]').click()
        page.locator("#nickname").fill("Stardust")
        page.locator('[data-action="identityNext"]').click()
        page.locator('[data-action="language"][data-value="Swahili"]').click()
        page.locator('[data-action="finishOnboarding"]').click()
        assert page.locator('[data-action="startQuick"]').count() == 1
        page.screenshot(path=str(OUT / "discover.png"), full_page=True)
        page.locator('[data-action="startQuick"]').click()
        assert "simulated" in page.locator("#mobileApp").inner_text().lower()
        page.locator('[data-action="simulateMatch"]').click()
        page.locator("#chatInput").fill("I love watching movies")
        page.locator('[data-action="send"]').click()
        assert "I love watching movies" in page.locator("#mobileApp").inner_text()
        page.screenshot(path=str(OUT / "chat.png"), full_page=True)
        page.locator('[data-action="menu"]').click()
        page.locator('[data-action="reportFromChat"]').click()
        page.locator("#reportDetails").fill("Test report")
        page.locator('[data-action="submitReport"]').click()
        assert "No report was actually submitted" in page.locator("#mobileApp").inner_text()
        page.locator('[data-action="go"][data-to="discover"]').click()
        page.locator('[data-action="startQuick"]').click()
        page.locator('[data-action="simulateMatch"]').click()
        page.locator('[data-action="endChat"]').click()
        page.locator('[data-action="requestConnection"]').click()
        page.locator('[data-action="simulateAccept"]').click()
        page.locator('[data-action="go"][data-to="dm"]').click()
        page.locator("#chatInput").fill("Hello again")
        page.locator('[data-action="sendDm"]').click()
        assert "Hello again" in page.locator("#mobileApp").inner_text()
        assert not errors, errors
        browser.close()

def test_mobile_block_and_18_screens():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width":390,"height":844})
        errors=[]
        page.on("pageerror",lambda error: errors.append(str(error)))
        page.on("dialog",lambda dialog:dialog.accept())
        page.set_content(HTML.read_text(encoding="utf-8"))
        page.evaluate("direct('discover')")
        page.screenshot(path=str(OUT / "mobile.png"))
        assert page.locator(".bottom-nav").count() == 1
        page.evaluate("direct('chat')")
        page.locator('[data-action="menu"]').click()
        page.locator('[data-action="blockConfirm"]').click()
        page.locator('[data-action="startQuick"]').click()
        assert "no eligible match" in page.locator("#mobileApp").inner_text().lower()
        assert page.locator('[data-action="simulateMatch"]').count() == 0
        page.locator('[data-action="cancelMatch"]').click()
        for screen in page.evaluate("screenDefs.map(x => x[0])"):
            page.evaluate("(name) => direct(name)", screen)
            assert page.locator("#mobileApp").count() == 1
        assert not errors, errors
        browser.close()
