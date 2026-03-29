(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const lrcEngine = VF.modules.lrcEngine = {};

  let cueSeq = 0;

  function nextCueId() {
    cueSeq += 1;
    return 'cue_' + Date.now().toString(36) + '_' + cueSeq.toString(36);
  }

  function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function clampMs(value) {
    const num = toFiniteNumber(value);
    return num === null ? null : Math.max(0, Math.round(num));
  }

  function normalizeText(value) {
    return String(value || '').replace(/\r\n?/g, '\n');
  }

  function normalizeCue(cue, index) {
    return {
      id: cue && cue.id ? String(cue.id) : nextCueId(),
      text: String((cue && cue.text) || '').trim(),
      timeMs: clampMs(cue && cue.timeMs),
      lineIndex: index
    };
  }

  function wordsInLine(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
  }

  lrcEngine.isLikelyLRC = function(text) {
    return /\[\d{2}:\d{2}\.\d{2,3}\]/.test(String(text || ''));
  };

  lrcEngine.parseClockValue = function(value) {
    const match = String(value || '').trim().match(/^(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (!match) return null;
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const frac = (match[3] || '0').padEnd(3, '0').slice(0, 3);
    return clampMs((min * 60 * 1000) + (sec * 1000) + parseInt(frac, 10));
  };

  lrcEngine.formatClockValue = function(value) {
    const totalMs = Math.max(0, Math.round(Number(value) || 0));
    const min = Math.floor(totalMs / 60000);
    const sec = Math.floor((totalMs % 60000) / 1000);
    const cent = Math.floor((totalMs % 1000) / 10);
    return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(cent).padStart(2, '0');
  };

  lrcEngine.formatTag = function(value) {
    return '[' + lrcEngine.formatClockValue(value) + ']';
  };

  lrcEngine.cloneCues = function(cues) {
    return (Array.isArray(cues) ? cues : []).map((cue, index) => normalizeCue(cue, index)).filter((cue) => cue.text);
  };

  lrcEngine.parseLRC = function(text) {
    const cues = [];
    const lines = normalizeText(text).split('\n');
    const tagRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

    lines.forEach((rawLine) => {
      const matches = Array.from(rawLine.matchAll(tagRegex));
      if (!matches.length) return;

      const content = rawLine.replace(tagRegex, '').trim();
      if (!content) return;

      matches.forEach((match) => {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const frac = match[3].padEnd(3, '0').slice(0, 3);
        cues.push({
          id: nextCueId(),
          text: content,
          timeMs: clampMs((min * 60 * 1000) + (sec * 1000) + parseInt(frac, 10))
        });
      });
    });

    return cues.sort((a, b) => {
      const aMs = a.timeMs === null ? Number.MAX_SAFE_INTEGER : a.timeMs;
      const bMs = b.timeMs === null ? Number.MAX_SAFE_INTEGER : b.timeMs;
      return aMs - bMs;
    }).map((cue, index) => normalizeCue(cue, index));
  };

  lrcEngine.textToCues = function(text) {
    const normalized = normalizeText(text).trim();
    if (!normalized) return [];
    if (lrcEngine.isLikelyLRC(normalized)) return lrcEngine.parseLRC(normalized);

    return normalized.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => normalizeCue({ text: line, timeMs: null }, index));
  };

  lrcEngine.cuesToPlainText = function(cues) {
    return lrcEngine.cloneCues(cues).map((cue) => cue.text).join('\n');
  };

  lrcEngine.hasCompleteTiming = function(cues) {
    const normalized = lrcEngine.cloneCues(cues);
    return normalized.length > 0 && normalized.every((cue) => cue.timeMs !== null);
  };

  lrcEngine.cuesToLRC = function(cues, options) {
    const normalized = lrcEngine.cloneCues(cues);
    const offsetMs = toFiniteNumber(options && options.offsetMs) || 0;
    return normalized
      .filter((cue) => cue.timeMs !== null)
      .map((cue) => lrcEngine.formatTag(Math.max(0, cue.timeMs + offsetMs)) + cue.text)
      .join('\n');
  };

  lrcEngine.buildDraftTimings = function(cues, durationMs, options) {
    const normalized = lrcEngine.cloneCues(cues);
    if (!normalized.length) return [];

    const leadInMs = clampMs(options && options.leadInMs) || 10000;
    const tailOutMs = clampMs(options && options.tailOutMs) || 5000;
    const softPauseWeight = Number((options && options.softPauseWeight) || 0.45);
    const fallbackDuration = Math.max(180000, normalized.length * 2800);
    const totalDuration = Math.max(fallbackDuration, clampMs(durationMs) || 0);
    const usableDuration = Math.max(normalized.length * 1200, totalDuration - leadInMs - tailOutMs);

    const weights = normalized.map((cue) => Math.max(1, wordsInLine(cue.text)));
    const totalWeight = weights.reduce((sum, weight, index) => {
      const pauseWeight = index === 0 ? 0 : softPauseWeight;
      return sum + weight + pauseWeight;
    }, 0);

    let cursorWeight = 0;
    return normalized.map((cue, index) => {
      const pauseWeight = index === 0 ? 0 : softPauseWeight;
      cursorWeight += pauseWeight;
      const ratio = totalWeight > 0 ? cursorWeight / totalWeight : 0;
      const timeMs = leadInMs + Math.round(usableDuration * ratio);
      cursorWeight += weights[index];
      return normalizeCue({ id: cue.id, text: cue.text, timeMs }, index);
    });
  };

  lrcEngine.normalizeTimeline = function(cues, minGapMs) {
    const normalized = lrcEngine.cloneCues(cues);
    const gap = Math.max(10, clampMs(minGapMs) || 80);
    let last = null;

    return normalized.map((cue, index) => {
      if (cue.timeMs === null) return cue;
      let nextTime = cue.timeMs;
      if (last !== null && nextTime <= last) nextTime = last + gap;
      last = nextTime;
      return normalizeCue({ id: cue.id, text: cue.text, timeMs: nextTime }, index);
    });
  };

  lrcEngine.collectIssues = function(cues) {
    const normalized = lrcEngine.cloneCues(cues);
    let untimedCount = 0;
    let backwardsCount = 0;
    let last = null;

    normalized.forEach((cue) => {
      if (cue.timeMs === null) {
        untimedCount += 1;
        return;
      }
      if (last !== null && cue.timeMs <= last) backwardsCount += 1;
      last = cue.timeMs;
    });

    return {
      total: normalized.length,
      timed: normalized.length - untimedCount,
      untimed: untimedCount,
      backwards: backwardsCount,
      complete: normalized.length > 0 && untimedCount === 0 && backwardsCount === 0
    };
  };

  lrcEngine.resolveActiveCueIndex = function(cues, currentTimeMs, offsetMs) {
    const normalized = lrcEngine.cloneCues(cues);
    if (!normalized.length) return -1;

    const currentMs = clampMs(currentTimeMs) || 0;
    const offset = toFiniteNumber(offsetMs) || 0;
    const effectiveMs = currentMs + offset;

    let activeIdx = -1;
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i].timeMs === null) continue;
      if (effectiveMs >= normalized[i].timeMs) activeIdx = i;
      else break;
    }
    return activeIdx;
  };
})(window.VibeFlow);
