"""Video compressor, converter and trimmer as one tool with three buttons. The three panels are the old tools unchanged."""
import importlib.util
import os

_here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_parts')


def _load(name):
    spec = importlib.util.spec_from_file_location('part_' + name, os.path.join(_here, name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


_vc, _cv, _vt = _load('video_compressor'), _load('video_converter'), _load('video_trimmer')

INFO = dict(slug='video-tools', kicker='Video', tile_title='Video compressor, converter and trimmer',
            tile_desc='Three video tools in one: shrink a big video, convert it to MP4, MP3, GIF and more, or cut it in seconds. Nothing is uploaded.',
            nav='Video compressor, converter and trimmer', pos=2)

TABS = [('compress', 'Compressor', _vc), ('convert', 'Converter', _cv), ('trim', 'Trimmer', _vt)]

TOOL = ('<div class="vh-tabs" role="tablist" aria-label="Choose a video tool">' +
        ''.join('<button type="button" role="tab" class="vh-tab" data-p="%s" aria-selected="false">%s</button>' % (k, n) for k, n, _ in TABS) +
        '</div>\n' +
        ''.join('<div class="vh-panel" data-p="%s" role="tabpanel" hidden>\n%s\n</div>\n' % (k, m.TOOL) for k, n, m in TABS))

_css = []
for _, _, m in TABS:
    for c in (m.PAGE.get('css') or []):
        if c not in _css:
            _css.append(c)
_css.append('video-hub.css')

PAGE = dict(
    title='Video Compressor, Converter and Trimmer: Free Online, No Upload',
    desc='Three free video tools in one page: compress a big video, convert video to MP4, MP3, GIF and more, or trim and split it. Runs in your browser, so nothing is uploaded.',
    h1='Video compressor, converter and trimmer',
    app='Video Compressor, Converter and Trimmer',
    lead='Pick what you want to do: shrink a big video, change its format, or cut it. Everything runs in your browser, so your video is never uploaded.',
    tool=TOOL, vendor=[], own=['videohub.js'], module=[m.PAGE['module'][0] for _, _, m in TABS], css=_css,
    sections=('<section class="block prose" id="about-compress"><h2>Video compressor</h2>' + _vc.PAGE['sections'].replace('<section class="block prose">', '').replace('</section>', '') + '</section>'
              '<section class="block prose" id="about-convert"><h2>Video converter</h2>' + _cv.PAGE['sections'].replace('<section class="block prose">', '').replace('</section>', '') + '</section>'
              '<section class="block prose" id="about-trim"><h2>Video trimmer</h2>' + _vt.PAGE['sections'].replace('<section class="block prose">', '').replace('</section>', '') + '</section>'),
    faq=list(_vc.PAGE['faq']) + list(_cv.PAGE['faq']) + list(_vt.PAGE['faq']),
    related=['video-editor', 'screen-recorder', 'audio-mastering', 'image-converter'])
