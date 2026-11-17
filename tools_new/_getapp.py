"""A "get the app" card for the tool pages. The installer links point at a release that never changes its name
(for example color-latest), so a new version never needs a new link. getapp.js turns the card into the right
download for the visitor's computer (Windows, or Mac with an Apple chip or an Intel chip)."""
import html

REPO = 'https://github.com/Evansrite1/portfolio/releases/download/'
e = lambda s: html.escape(s, quote=True)


def card(app_id, name, release, files, blurb, extra=''):
    """files: dict with win, macArm, macIntel file names."""
    return ('<div class="card get-app" id="ga-%s" data-name="%s" data-base="%s%s/" data-win="%s" data-macarm="%s" data-macintel="%s" '
            'style="text-align:center;margin:0 0 16px;padding:22px 16px">'
            '<h2 style="margin:0 0 6px;font-size:1.25rem">Get the %s app</h2>'
            '<p class="help" style="max-width:60ch;margin:0 auto 14px">%s</p>'
            '<a class="btn primary ga-btn" href="%s%s/%s" download style="padding:13px 24px">Download for Windows</a>'
            '<p class="help ga-other" style="margin-top:10px"></p><p class="help ga-tip" style="max-width:58ch;margin:6px auto 0"></p>%s</div>') % (
        e(app_id), e(name), REPO, release, e(files['win']), e(files['macArm']), e(files['macIntel']), e(name), blurb, REPO, release, e(files['win']), extra)
