"""Verify both boards render and Lichess suggestions work."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        
        # Collect network responses
        api_responses = []
        def on_response(response):
            if 'lichess' in response.url:
                api_responses.append(f"{response.status} {response.url[:80]}")
        page.on("response", on_response)
        
        print("=== Loading app ===")
        await page.goto("http://localhost:8000", wait_until="networkidle", timeout=15000)
        
        # Click Launch
        await page.locator("#btn-landing-start").click()
        await page.wait_for_timeout(1000)
        
        # === Test Builder ===
        print("\n=== Builder Board ===")
        await page.locator("#nav-build-repertoire").click()
        await page.wait_for_timeout(2000)
        
        builder_pieces = page.locator("#builder-board piece")
        print(f"Builder pieces: {await builder_pieces.count()}")
        if await builder_pieces.count() > 0:
            box = await builder_pieces.first.bounding_box()
            print(f"  First piece bbox: {box}")
        
        # Wait for Lichess
        print("\n=== Lichess Suggestions ===")
        await page.wait_for_timeout(4000)
        
        sugg = page.locator("#builder-suggestions")
        sugg_html = await sugg.inner_html()
        sugg_text = await sugg.inner_text()
        print(f"  Suggestion text: {sugg_text[:200]}")
        has_buttons = "button" in sugg_html.lower()
        print(f"  Has suggestion buttons: {has_buttons}")
        
        await page.screenshot(path="test_builder_final.png")
        
        # === Test MoveTrainer ===
        print("\n=== MoveTrainer Board ===")
        # Create test course
        await page.evaluate("""() => {
            const courses = JSON.parse(localStorage.getItem('chess_courses') || '[]');
            if (courses.length === 0) {
                courses.push({
                    id: 'test-1', title: 'Test Italian', color: 'white',
                    lines: [[
                        {san: 'e4', from: 'e2', to: 'e4', color: 'w'},
                        {san: 'e5', from: 'e7', to: 'e5', color: 'b'},
                        {san: 'Nf3', from: 'g1', to: 'f3', color: 'w'},
                        {san: 'Nc6', from: 'b8', to: 'c6', color: 'b'}
                    ]],
                    srs: {}
                });
                localStorage.setItem('chess_courses', JSON.stringify(courses));
            }
        }""")
        
        # Navigate to dashboard
        await page.locator("#nav-dashboard").click()
        await page.wait_for_timeout(500)
        
        courses = page.locator(".course-card")
        print(f"Courses: {await courses.count()}")
        
        if await courses.count() > 0:
            await courses.first.click()
            await page.wait_for_timeout(500)
            
            # Click Learn button
            learn_btn = page.locator("text=Learn")
            if await learn_btn.count() > 0:
                await learn_btn.first.click()
                await page.wait_for_timeout(500)
            
            # Wait for view transition + redraw
            await page.wait_for_timeout(500)
            
            training_pieces = page.locator("#board piece")
            tc = await training_pieces.count()
            print(f"Training pieces: {tc}")
            
            if tc > 0:
                box = await training_pieces.first.bounding_box()
                print(f"  First piece bbox: {box}")
                if box and box['width'] > 0:
                    print("  ✅ MoveTrainer pieces are VISIBLE and properly sized!")
                else:
                    print("  ❌ MoveTrainer pieces have zero size or no bbox")
            
            await page.screenshot(path="test_movetrainer_final.png")
        
        # Print API responses
        print("\n=== Lichess API Responses ===")
        for r in api_responses:
            print(f"  {r}")
        
        await browser.close()

asyncio.run(main())
