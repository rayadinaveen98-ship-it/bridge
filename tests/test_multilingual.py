from pathlib import Path
from playwright.sync_api import sync_playwright

HTML=Path(__file__).resolve().parents[1]/"prototype"/"bridge-v1.html"

def test_language_equality():
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True)
        for width,height in [(390,844),(1440,900)]:
            page=b.new_page(viewport={"width":width,"height":height})
            errors=[]
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.set_content(HTML.read_text(encoding="utf-8"))
            page.evaluate("direct('preferences')")
            assert page.evaluate("S.languages.length")==0
            assert "No language is preselected" in page.locator("#mobileApp").inner_text()
            for language in ["Swahili","Kashmiri"]:
                page.locator("#languageSearch").fill(language)
                matching=page.locator("#languageOptions [data-language-option]:visible")
                assert matching.count()==1, language
                matching.first.click()
            page.locator("#languageSearch").fill("Xhosa")
            page.locator('[data-action="addLanguage"]').click()
            assert set(page.evaluate("S.languages"))=={"Swahili","Kashmiri","Xhosa"}
            page.evaluate("direct('queue')")
            queue=page.locator("#mobileApp").inner_text()
            assert "Kashmiri · Swahili · Xhosa" in queue
            assert not errors, errors
            page.close()
        b.close()
