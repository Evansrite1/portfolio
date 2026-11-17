"""Sending a direct message and reading the inbox, driven in the same real browser window the person logged in with.

Instagram has no free official way to send a first message, so the app does what a person does: opens the profile,
presses Message, types and presses Enter. It types at a human speed. It never logs in for the person and never sees a
password. Instagram changes its page often, so every step tries more than one way to find the button or the box, and
any step that cannot be done stops that message with a plain reason instead of guessing.
"""
import asyncio
import random
import re

COMPOSER = ['div[role="textbox"][contenteditable="true"]', 'div[contenteditable="true"][aria-label*="essage"]', 'textarea[placeholder*="essage"]',
            'p[class*="xdj266r"]']
BLOCK_WORDS = ("try again later", "action blocked", "temporarily blocked", "we restrict certain activity", "suspicious activity")
SNIPPET_SKIP = re.compile(r"^(active|online|seen|typing|sent|delivered|you sent|\d+\s*[smhdw]\b)", re.I)


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", str(s or ""))).strip().lower()


def parse_thread(text):
    """The text of one inbox row, for example 'Sam Baker\\nYou: Hi there · 2h'. Returns (name, snippet, outgoing)."""
    lines = [x.strip() for x in str(text).split("\n") if x.strip()]
    if not lines:
        return "", "", True
    name = lines[0]
    rest = [x for x in lines[1:] if not SNIPPET_SKIP.match(x) or x.lower().startswith("you")]
    snippet = rest[-1] if rest else ""
    snippet = re.sub(r"\s*[·•]\s*\d+\s*[smhdw]\s*$", "", snippet).strip()
    outgoing = bool(re.match(r"^you(:|\s+sent|\s+replied)", snippet, re.I)) or snippet == ""
    return name, snippet, outgoing


async def _dismiss(page):
    for label in ("Not Now", "Not now", "Close", "OK"):
        try:
            b = page.get_by_role("button", name=label, exact=True)
            if await b.count():
                await b.first.click(timeout=1500)
                await asyncio.sleep(0.5)
        except Exception:
            pass


async def _blocked(page):
    try:
        txt = (await page.inner_text("body", timeout=3000)).lower()
    except Exception:
        return False
    return any(w in txt for w in BLOCK_WORDS)


async def _composer(page, wait=10):
    for _ in range(int(wait * 4)):
        for sel in COMPOSER:
            try:
                loc = page.locator(sel)
                if await loc.count():
                    el = loc.last
                    if await el.is_visible():
                        return el
            except Exception:
                pass
        await asyncio.sleep(0.25)
    return None


async def send_dm(page, handle, text, log):
    """Returns dict(ok, thread, error, blocked)."""
    out = {"ok": False, "thread": "", "error": "", "blocked": False}
    try:
        await page.goto(f"https://www.instagram.com/{handle}/", wait_until="domcontentloaded", timeout=30000)
    except Exception:
        out["error"] = "The profile did not load"
        return out
    await asyncio.sleep(random.uniform(2.0, 3.5))
    cur = page.url or ""
    if "/accounts/login" in cur or "/challenge" in cur:
        out["error"] = "Instagram asked to log in again"
        out["blocked"] = True
        return out
    try:
        title = (await page.title()).lower()
    except Exception:
        title = ""
    if "isn't available" in title or "not found" in title or "page not found" in title:
        out["error"] = "The account does not exist or was removed"
        return out
    await _dismiss(page)
    # press Message
    clicked = False
    for finder in (lambda: page.get_by_role("button", name=re.compile(r"^(send )?message$", re.I)),
                   lambda: page.get_by_role("link", name=re.compile(r"^(send )?message$", re.I)),
                   lambda: page.locator('div[role="button"]:has-text("Message")')):
        try:
            loc = finder()
            if await loc.count():
                await loc.first.click(timeout=4000)
                clicked = True
                break
        except Exception:
            continue
    if not clicked:
        out["error"] = "No Message button on this profile (the account may not accept messages from new people)"
        return out
    await asyncio.sleep(random.uniform(1.5, 2.5))
    await _dismiss(page)
    box = await _composer(page)
    if box is None:
        out["blocked"] = await _blocked(page)
        out["error"] = "Instagram would not open the message box" + (" (it is limiting this account)" if out["blocked"] else "")
        return out
    # type like a person, line by line
    await box.click()
    lines = str(text).split("\n")
    for i, line in enumerate(lines):
        for ch in line:
            await page.keyboard.type(ch, delay=random.randint(18, 55))
            if random.random() < 0.02:
                await asyncio.sleep(random.uniform(0.2, 0.6))
        if i < len(lines) - 1:
            await page.keyboard.press("Shift+Enter")
    await asyncio.sleep(random.uniform(0.6, 1.3))
    await page.keyboard.press("Enter")
    # confirm that the message is on the screen
    probe = norm(text)[:24]
    sent = False
    for _ in range(40):
        await asyncio.sleep(0.25)
        try:
            body = norm(await page.inner_text("body", timeout=2000))
        except Exception:
            continue
        if probe and probe in body:
            # the typed text also sits in the box until it is sent, so the box must be empty now
            try:
                left = norm(await box.inner_text(timeout=1000)) if (await box.evaluate("e => e.tagName")) != "TEXTAREA" else norm(await box.input_value())
            except Exception:
                left = ""
            if probe not in left:
                sent = True
                break
    m = re.search(r"/direct/t/(\d+)", page.url or "")
    out["thread"] = m.group(1) if m else ""
    if sent:
        out["ok"] = True
        return out
    out["blocked"] = await _blocked(page)
    out["error"] = "Instagram did not accept the message" + (" (it is limiting this account, stop for today)" if out["blocked"] else "")
    return out


async def read_inbox(page, log):
    """Returns a list of dict(thread, name, snippet, outgoing) from the inbox, Primary and General."""
    rows, seen = [], set()
    try:
        await page.goto("https://www.instagram.com/direct/inbox/", wait_until="domcontentloaded", timeout=30000)
    except Exception:
        return rows
    await asyncio.sleep(3)
    await _dismiss(page)
    for tab in (None, "General"):
        if tab:
            try:
                t = page.get_by_role("tab", name=re.compile(tab, re.I))
                if await t.count():
                    await t.first.click(timeout=2000)
                    await asyncio.sleep(1.5)
                else:
                    continue
            except Exception:
                continue
        for _ in range(4):                      # scroll a few times so older threads load
            try:
                items = await page.eval_on_selector_all('a[href^="/direct/t/"]', "els => els.map(e => ({href: e.getAttribute('href'), text: e.innerText}))")
            except Exception:
                items = []
            for it in items:
                m = re.search(r"/direct/t/(\d+)", it["href"] or "")
                if not m or m.group(1) in seen:
                    continue
                seen.add(m.group(1))
                name, snippet, outgoing = parse_thread(it["text"])
                rows.append({"thread": m.group(1), "name": name, "snippet": snippet, "outgoing": outgoing})
            try:
                await page.mouse.wheel(0, 1500)
            except Exception:
                pass
            await asyncio.sleep(0.8)
    return rows


def replies_in(inbox, leads):
    """Which of our leads wrote back. leads: list of dict(handle, name, thread). An inbox row counts as a reply when the
    last message is not ours. A row is matched by the thread number saved when the message was sent, or by the name."""
    by_thread = {l["thread"]: l for l in leads if l.get("thread")}
    by_name = {}
    for l in leads:
        for k in (l.get("handle"), l.get("name")):
            if k:
                by_name[norm(k)] = l
    found = []
    for r in inbox:
        l = by_thread.get(r["thread"]) or by_name.get(norm(r["name"]))
        if l and not r["outgoing"] and r["snippet"]:
            found.append((l["handle"], r["snippet"]))
    return found
