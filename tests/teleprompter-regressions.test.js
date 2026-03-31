const fs = require('fs');
const path = require('path');

describe('Teleprompter audit regressions', () => {
  function readFromRoot(...parts) {
    return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
  }

  test('LRC Studio ships a canvas-style control surface for teleprompter look', () => {
    const html = readFromRoot('public', 'lrc-studio.html');

    expect(html).toMatch(/Canvas tipografico/);
    expect(html).toMatch(/tp-style-font-family/);
    expect(html).toMatch(/tp-style-active-scale/);
    expect(html).toMatch(/tp-style-bottom-padding/);
    expect(html).toMatch(/preview-lines-inner/);
  });

  test('main teleprompter settings expose shared style controls and presets', () => {
    const html = readFromRoot('public', 'index.html');

    expect(html).toMatch(/teleprompter-style\.js/);
    expect(html).toMatch(/set-tp-font-family/);
    expect(html).toMatch(/set-tp-line-height/);
    expect(html).toMatch(/data-tp-preset="arena"/);
    expect(html).toMatch(/--tp-font-size/);
  });

  test('lyrics engine uses a frame-based playback loop with external time sync hook', () => {
    const js = readFromRoot('public', 'js', 'modules', 'lyrics.js');

    expect(js).toMatch(/requestAnimationFrame\(playbackFrame\)/);
    expect(js).toMatch(/syncToExternalTime/);
    expect(js).toMatch(/resolveWordIndexAtElapsedMs/);
    expect(js).toMatch(/buildLrcWordTimings/);
  });

  test('song packages and catalog routes persist teleprompter display style', () => {
    const pkg = readFromRoot('public', 'js', 'modules', 'song-package.js');
    const routes = readFromRoot('routes', 'canciones.js');

    expect(pkg).toMatch(/displayStyle/);
    expect(routes).toMatch(/displayStyle/);
    expect(routes).toMatch(/sanitizeDisplayStyle/);
  });
});
