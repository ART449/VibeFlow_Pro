const fs = require('fs');
const path = require('path');

describe('UI production regressions', () => {
  function readPublicFile(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
  }

  test('bares-v2 no longer ships placeholder alerts or "Proximamente" click handlers', () => {
    const html = readPublicFile('bares-v2.html');

    expect(html).not.toMatch(/onclick="toast\([^"]*Proximamente/i);
    expect(html).not.toMatch(/onclick="alert\(/i);
    expect(html).toMatch(/onclick="openKaraokeQueueModal\(\)"/);
    expect(html).toMatch(/onclick="openCobrarShortcut\(\)"/);
    expect(html).toMatch(/function openKaraokeQueueModal\(/);
    expect(html).toMatch(/function submitKaraokeSong\(/);
  });

  test('bares-v2 keeps UX helpers for busy states and keyboard-friendly controls', () => {
    const html = readPublicFile('bares-v2.html');

    expect(html).toMatch(/function setBusyState\(/);
    expect(html).toMatch(/function syncInteractiveControls\(/);
    expect(html).toMatch(/function syncPosActionState\(/);
    expect(html).toMatch(/tabIndex = 0/);
    expect(html).toMatch(/posAction\('enviar', this\)/);
    expect(html).toMatch(/data-pos-action="enviar"/);
    expect(html).toMatch(/data-pos-action="cancion"/);
    expect(html).toMatch(/id="karaoke-add-btn"/);
    expect(html).toMatch(/id="cover-save-btn"/);
  });

  test('production entry pages avoid raw alert() handlers', () => {
    ['index.html', 'pos.html', 'pos-admin.html', 'remote.html', 'cuenta.html'].forEach((file) => {
      const html = readPublicFile(file);
      expect(html).not.toMatch(/onclick="alert\(/i);
    });
  });
});
