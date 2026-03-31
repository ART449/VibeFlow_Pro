(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const songPackage = VF.modules.songPackage = {};
  const STORAGE_KEY = 'byflow_song_packages_v1';

  function engine() {
    return VF.modules.lrcEngine;
  }

  function styleHelper() {
    return VF.modules.teleprompterStyle || null;
  }

  function now() {
    return Date.now();
  }

  function makeId(prefix) {
    return String(prefix || 'pkg') + '_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function cleanString(value) {
    return String(value || '').trim();
  }

  function normalizeDisplayStyle(value) {
    const helper = styleHelper();
    if (helper && typeof helper.normalize === 'function') return helper.normalize(value);
    return value || null;
  }

  function safeFileName(value) {
    return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'byflow-song-package';
  }

  function triggerDownload(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  songPackage.createEmpty = function() {
    return {
      schemaVersion: 1,
      id: makeId('pkg'),
      title: '',
      artist: '',
      sourceSongId: '',
      sourceKind: 'local-audio',
      sourceRef: '',
      sourceAudioName: '',
      timingMode: 'line',
      globalOffsetMs: 0,
      notes: '',
      displayStyle: normalizeDisplayStyle(null),
      lyricsPlain: '',
      lrcText: '',
      cues: [],
      createdAt: now(),
      updatedAt: now()
    };
  };

  songPackage.normalize = function(raw) {
    const base = songPackage.createEmpty();
    const input = raw || {};
    const inputText = input.lrcText || input.lyricsPlain || input.letra || '';
    const cues = Array.isArray(input.cues) && input.cues.length
      ? engine().cloneCues(input.cues)
      : engine().textToCues(inputText);
    const plainText = cues.length ? engine().cuesToPlainText(cues) : cleanString(input.lyricsPlain || input.letra);
    const globalOffsetMs = Number.isFinite(Number(input.globalOffsetMs)) ? Math.round(Number(input.globalOffsetMs)) : 0;

    return {
      schemaVersion: 1,
      id: cleanString(input.id) || base.id,
      title: cleanString(input.title || input.titulo),
      artist: cleanString(input.artist || input.artista),
      sourceSongId: cleanString(input.sourceSongId),
      sourceKind: cleanString(input.sourceKind) || base.sourceKind,
      sourceRef: cleanString(input.sourceRef),
      sourceAudioName: cleanString(input.sourceAudioName),
      timingMode: cleanString(input.timingMode) || 'line',
      globalOffsetMs,
      notes: cleanString(input.notes),
      displayStyle: normalizeDisplayStyle(input.displayStyle || input.teleprompterStyle || base.displayStyle),
      lyricsPlain: plainText,
      lrcText: engine().hasCompleteTiming(cues) ? engine().cuesToLRC(cues, { offsetMs: globalOffsetMs }) : '',
      cues,
      createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : base.createdAt,
      updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : now()
    };
  };

  songPackage.withCues = function(rawPkg, cues) {
    const normalized = songPackage.normalize(rawPkg);
    normalized.cues = engine().cloneCues(cues);
    normalized.lyricsPlain = engine().cuesToPlainText(normalized.cues);
    normalized.lrcText = engine().hasCompleteTiming(normalized.cues)
      ? engine().cuesToLRC(normalized.cues, { offsetMs: normalized.globalOffsetMs })
      : '';
    normalized.updatedAt = now();
    return normalized;
  };

  songPackage.fromCatalogSong = function(song) {
    return songPackage.normalize({
      id: makeId('pkg'),
      title: song && song.titulo,
      artist: song && song.artista,
      sourceSongId: song && song.id,
      sourceKind: 'catalog',
      sourceRef: song && song.id,
      displayStyle: song && song.displayStyle,
      lrcText: engine().isLikelyLRC(song && song.letra) ? song.letra : '',
      lyricsPlain: !(engine().isLikelyLRC(song && song.letra)) ? (song && song.letra) : '',
      cues: engine().textToCues(song && song.letra),
      createdAt: now(),
      updatedAt: now()
    });
  };

  songPackage.listLocal = function() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw)
        .map((item) => songPackage.normalize(item))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  };

  songPackage.saveLocal = function(pkg) {
    const normalized = songPackage.normalize(pkg);
    const list = songPackage.listLocal().filter((item) => item.id !== normalized.id);
    list.unshift(normalized);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 120)));
    return normalized;
  };

  songPackage.removeLocal = function(id) {
    const list = songPackage.listLocal().filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  songPackage.exportLRC = function(pkg) {
    const normalized = songPackage.normalize(pkg);
    triggerDownload(safeFileName(normalized.artist + '-' + normalized.title) + '.lrc', normalized.lrcText || normalized.lyricsPlain, 'text/plain;charset=utf-8');
  };

  songPackage.exportJSON = function(pkg) {
    const normalized = songPackage.normalize(pkg);
    triggerDownload(safeFileName(normalized.artist + '-' + normalized.title) + '.json', JSON.stringify(normalized, null, 2), 'application/json;charset=utf-8');
  };

  songPackage.importJSON = function(text) {
    return songPackage.normalize(JSON.parse(text));
  };

  songPackage.toTwinPayload = function(pkg, playback) {
    const normalized = songPackage.normalize(pkg);
    const durationMs = Math.max(0, Math.round(Number(playback && playback.durationMs) || 0));
    const activeLineIndex = Number.isFinite(Number(playback && playback.activeLineIndex))
      ? Math.round(Number(playback.activeLineIndex))
      : -1;
    const activeWordIndex = Number.isFinite(Number(playback && playback.activeWordIndex))
      ? Math.round(Number(playback.activeWordIndex))
      : -1;
    return {
      schemaVersion: 1,
      songId: normalized.id,
      title: normalized.title,
      artist: normalized.artist,
      sourceKind: normalized.sourceKind,
      sourceRef: normalized.sourceRef,
      sourceAudioName: normalized.sourceAudioName,
      timingMode: normalized.timingMode,
      globalOffsetMs: normalized.globalOffsetMs,
      displayStyle: normalizeDisplayStyle(normalized.displayStyle),
      lrcText: normalized.lrcText || '',
      lyricsPlain: normalized.lyricsPlain,
      currentTimeMs: Math.max(0, Math.round(Number(playback && playback.currentTimeMs) || 0)),
      durationMs,
      playing: !!(playback && playback.playing),
      rate: Number(playback && playback.rate) || 1,
      activeLineIndex,
      activeWordIndex,
      updatedAt: now()
    };
  };
})(window.VibeFlow);
