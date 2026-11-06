"""The browser side. One real Edge or Chrome window, logged in by the person, with its session kept in ig-scout/profile.

Why a real browser: the person logs in themselves (2FA included), so this app never sees or stores a password.

How data is read: each profile is opened the way a person would open it, and the data the page itself loads is read
from its network responses. Instagram no longer answers the old direct data addresses, so this is the reliable route.
Images, video and fonts are blocked in the scraping tabs so a profile loads in about a second or two.
"""
import asyncio
import json
import re
import threading

from playwright.async_api import async_playwright

BLOCKED = {"image", "media", "font"}


class Engine:
    def __init__(self, profile_dir, log):
        self.profile_dir = str(profile_dir)
        self.log = log
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        self._pw = None
        self._ctx = None
        self._lock = None
        self._pages = {}
        self._login_page = None

    def _run(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def call(self, coro, timeout=60):
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout)

    # ---------- browser ----------
    async def _open(self):
        if self._ctx is not None:
            return
        if self._lock is None:
            self._lock = asyncio.Lock()
        async with self._lock:
            if self._ctx is not None:
                return
            self._pw = await async_playwright().start()
            last = None
            for channel in ("msedge", "chrome", None):
                try:
                    kw = dict(user_data_dir=self.profile_dir, headless=False, no_viewport=True,
                              args=["--disable-blink-features=AutomationControlled", "--window-size=1100,860"],
                              ignore_default_args=["--enable-automation"])
                    if channel:
                        kw["channel"] = channel
                    self._ctx = await self._pw.chromium.launch_persistent_context(**kw)
                    self.log(f"Browser opened ({channel or 'bundled Chromium'})")
                    break
                except Exception as e:  # noqa
                    last = e
            if self._ctx is None:
                raise RuntimeError(f"Could not open a browser: {last}")
            self._ctx.on("close", lambda *_: self._closed())
            self._login_page = self._ctx.pages[0] if self._ctx.pages else await self._ctx.new_page()

    def _closed(self):
        self._ctx = None
        self._pages = {}
        self._login_page = None
        self.log("The Instagram browser window was closed")

    async def _show_login(self):
        await self._open()
        try:
            cur = self._login_page.url or ""
            if "instagram.com" not in cur:
                await self._login_page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")
            await self._login_page.bring_to_front()
        except Exception as e:  # noqa
            self.log(f"Could not load the login page: {e}")

    def open_login(self):
        self.call(self._show_login(), 90)

    async def _logged_in(self):
        if self._ctx is None:
            return False
        try:
            cookies = await self._ctx.cookies("https://www.instagram.com")
        except Exception:
            return False
        return any(c["name"] == "sessionid" and c.get("value") for c in cookies)

    def status(self):
        try:
            li = self.call(self._logged_in(), 10)
        except Exception:
            li = False
        return {"browser_open": self._ctx is not None, "logged_in": li}

    async def _page_for(self, slot):
        await self._open()
        pg = self._pages.get(slot)
        if pg is None or pg.is_closed():
            pg = await self._ctx.new_page()

            async def gate(route):
                if route.request.resource_type in BLOCKED:
                    await route.abort()
                else:
                    await route.continue_()
            await pg.route("**/*", gate)
            self._pages[slot] = pg
        return pg

    # ---------- reading pages ----------
    async def _visit(self, slot, url, wants, first, extra_wait):
        """Open url, collect the page's own data responses. wants: {key: substring of the query name}.
        Waits for `first`, then up to extra_wait more seconds for the rest. Returns (got, status)."""
        page = await self._page_for(slot)
        got, tasks = {}, []

        async def grab(resp):
            try:
                name = resp.request.headers.get("x-fb-friendly-name", "")
                for key, sub in wants.items():
                    if sub in name and key not in got:
                        got[key] = await resp.text()
            except Exception:
                pass

        def on(resp):
            if "/api/graphql" in resp.url:
                tasks.append(asyncio.ensure_future(grab(resp)))

        page.on("response", on)
        status = 200
        try:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            except Exception:
                return got, 0
            for _ in range(60):
                if first in got:
                    break
                await asyncio.sleep(0.25)
            if first not in got:
                cur = page.url or ""
                try:
                    title = await page.title()
                except Exception:
                    title = ""
                if "/accounts/login" in cur or "/challenge" in cur:
                    status = 401
                elif "not found" in title.lower() or "isn't available" in title.lower():
                    status = 404
                else:
                    status = 408
            else:
                for _ in range(int(extra_wait * 4)):
                    if all(k in got for k in wants):
                        break
                    await asyncio.sleep(0.25)
            await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            page.remove_listener("response", on)
        return got, status

    def profile(self, username, slot=0):
        """Returns dict(status, user, edges, suggested). status: 200 ok, 404 not found, 401 sign-in wall,
        429 rate limited, 408 slow or empty."""
        wants = {"user": "ProfilePageContentQuery", "posts": "ProfilePostsQuery", "similar": "ProfileSuggestedUsers"}
        got, status = self.call(self._visit(slot, f"https://www.instagram.com/{username}/", wants, "user", 3.0), 90)
        out = {"status": status, "user": None, "edges": [], "suggested": []}
        body = got.get("user")
        if body:
            if "Rate limit exceeded" in body[:400] or '"code":1675004' in body[:400]:
                out["status"] = 429
                return out
            try:
                out["user"] = json.loads(body)["data"]["user"]
            except Exception:
                out["status"] = 404
                return out
        if got.get("posts"):
            try:
                out["edges"] = json.loads(got["posts"])["data"]["xdt_api__v1__feed__user_timeline_graphql_connection"]["edges"]
            except Exception:
                pass
        if got.get("similar") and "Rate limit" not in got["similar"][:300]:
            out["suggested"] = list(dict.fromkeys(re.findall(r'"username":"([A-Za-z0-9._]{2,30})"', got["similar"])))
        return out

    def search(self, query):
        """Handles of accounts that post about the query, from Instagram's own keyword search page.
        Returns (status, handles)."""
        from urllib.parse import quote
        wants = {"results": "PolarisKeywordSearchExplorePageRelayQuery"}
        got, status = self.call(
            self._visit(99, f"https://www.instagram.com/explore/search/keyword/?q={quote(query)}", wants, "results", 0), 90)
        body = got.get("results")
        if not body:
            return status, []
        if "Rate limit exceeded" in body[:400]:
            return 429, []
        handles = list(dict.fromkeys(re.findall(r'"username":"([A-Za-z0-9._]{2,30})"', body)))
        return 200, handles

    async def _close(self):
        try:
            if self._ctx:
                await self._ctx.close()
            if self._pw:
                await self._pw.stop()
        except Exception:
            pass
        self._ctx = None

    def close(self):
        try:
            self.call(self._close(), 15)
        except Exception:
            pass
