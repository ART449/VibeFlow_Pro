(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const teleprompterStyle = VF.modules.teleprompterStyle = {};
  const STORAGE_KEY = 'byflow_tp_style_v1';

  const FONT_PRESETS = {
    stage: {
      label: 'Stage Sans',
      value: '"Aptos","Segoe UI",Tahoma,sans-serif'
    },
    mono: {
      label: 'Mono Bars',
      value: '"JetBrains Mono","Consolas","SFMono-Regular",monospace'
    },
    impact: {
      label: 'Impacto',
      value: '"Arial Black","Segoe UI",sans-serif'
    },
    rounded: {
      label: 'Rounded Flow',
      value: '"Trebuchet MS","Aptos","Segoe UI",sans-serif'
    },
    serif: {
      label: 'Serif Stage',
      value: '"Georgia","Times New Roman",serif'
    }
  };

  const DEFAULTS = {
    presetKey: 'stage',
    fontPreset: 'stage',
    fontFamily: FONT_PRESETS.stage.value,
    fontSizeRem: 5,
    lineHeight: 1.6,
    letterSpacingEm: 0.01,
    maxWidthPx: 1100,
    textAlign: 'center',
    activeScale: 1.01,
    inactiveOpacity: 0.25,
    nextOpacity: 0.45,
    doneOpacity: 0.18,
    glowAlpha: 0.28,
    stageTopVh: 10,
    stageBottomVh: 30
  };

  const PRESETS = {
    stage: {},
    compact: {
      fontPreset: 'rounded',
      fontSizeRem: 4,
      lineHeight: 1.4,
      letterSpacingEm: 0,
      maxWidthPx: 960,
      activeScale: 1.02,
      inactiveOpacity: 0.28,
      nextOpacity: 0.48,
      doneOpacity: 0.16,
      glowAlpha: 0.18,
      stageTopVh: 8,
      stageBottomVh: 22
    },
    mono: {
      fontPreset: 'mono',
      fontSizeRem: 4.4,
      lineHeight: 1.5,
      letterSpacingEm: 0.025,
      maxWidthPx: 1220,
      textAlign: 'left',
      activeScale: 1,
      inactiveOpacity: 0.34,
      nextOpacity: 0.52,
      doneOpacity: 0.18,
      glowAlpha: 0.14,
      stageTopVh: 6,
      stageBottomVh: 20
    },
    arena: {
      fontPreset: 'impact',
      fontSizeRem: 6.6,
      lineHeight: 1.3,
      letterSpacingEm: 0.015,
      maxWidthPx: 1300,
      activeScale: 1.05,
      inactiveOpacity: 0.18,
      nextOpacity: 0.4,
      doneOpacity: 0.12,
      glowAlpha: 0.42,
      stageTopVh: 12,
      stageBottomVh: 34
    }
  };

  function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  }

  function resolveFontPreset(name) {
    const key = String(name || '').trim();
    return FONT_PRESETS[key] ? key : DEFAULTS.fontPreset;
  }

  function resolveFontFamily(preset, input) {
    const raw = String(input || '').trim();
    if (raw) return raw;
    const presetKey = resolveFontPreset(preset);
    return FONT_PRESETS[presetKey].value;
  }

  teleprompterStyle.defaultStyle = function() {
    return teleprompterStyle.normalize(DEFAULTS);
  };

  teleprompterStyle.normalize = function(input) {
    const source = input || {};
    const fontPreset = resolveFontPreset(source.fontPreset);
    const presetKey = PRESETS[String(source.presetKey || '').trim()] ? String(source.presetKey).trim() : '';
    const normalized = {
      presetKey,
      fontPreset,
      fontFamily: resolveFontFamily(fontPreset, source.fontFamily),
      fontSizeRem: clamp(source.fontSizeRem, 1.8, 10, DEFAULTS.fontSizeRem),
      lineHeight: clamp(source.lineHeight, 1.1, 2.4, DEFAULTS.lineHeight),
      letterSpacingEm: clamp(source.letterSpacingEm, -0.02, 0.18, DEFAULTS.letterSpacingEm),
      maxWidthPx: clamp(source.maxWidthPx, 420, 1800, DEFAULTS.maxWidthPx),
      textAlign: ['left', 'center', 'right'].includes(String(source.textAlign || '').trim())
        ? String(source.textAlign).trim()
        : DEFAULTS.textAlign,
      activeScale: clamp(source.activeScale, 1, 1.15, DEFAULTS.activeScale),
      inactiveOpacity: clamp(source.inactiveOpacity, 0.05, 0.8, DEFAULTS.inactiveOpacity),
      nextOpacity: clamp(source.nextOpacity, 0.08, 0.95, DEFAULTS.nextOpacity),
      doneOpacity: clamp(source.doneOpacity, 0.05, 0.6, DEFAULTS.doneOpacity),
      glowAlpha: clamp(source.glowAlpha, 0, 0.7, DEFAULTS.glowAlpha),
      stageTopVh: clamp(source.stageTopVh, 0, 30, DEFAULTS.stageTopVh),
      stageBottomVh: clamp(source.stageBottomVh, 8, 45, DEFAULTS.stageBottomVh)
    };

    if (normalized.doneOpacity > normalized.nextOpacity) {
      normalized.doneOpacity = Math.min(normalized.nextOpacity, normalized.doneOpacity);
    }
    if (normalized.nextOpacity < normalized.inactiveOpacity) {
      normalized.nextOpacity = normalized.inactiveOpacity;
    }
    return normalized;
  };

  teleprompterStyle.preset = function(name) {
    const key = PRESETS[String(name || '').trim()] ? String(name || '').trim() : 'stage';
    return teleprompterStyle.normalize(Object.assign({}, DEFAULTS, PRESETS[key], { presetKey: key }));
  };

  teleprompterStyle.fontOptions = function() {
    return Object.keys(FONT_PRESETS).map(function(key) {
      return {
        id: key,
        label: FONT_PRESETS[key].label,
        value: FONT_PRESETS[key].value
      };
    });
  };

  teleprompterStyle.presetOptions = function() {
    return Object.keys(PRESETS).map(function(key) {
      return {
        id: key,
        label: key === 'stage' ? 'Escenario' : key === 'compact' ? 'Compacto' : key === 'mono' ? 'Mono' : 'Arena'
      };
    });
  };

  teleprompterStyle.applyToElement = function(node, input) {
    if (!node || !node.style) return teleprompterStyle.normalize(input);
    const style = teleprompterStyle.normalize(input);

    node.style.setProperty('--tp-font-family', style.fontFamily);
    node.style.setProperty('--tp-font-size', style.fontSizeRem.toFixed(2) + 'rem');
    node.style.setProperty('--tp-line-height', style.lineHeight.toFixed(2));
    node.style.setProperty('--tp-letter-spacing', style.letterSpacingEm.toFixed(3) + 'em');
    node.style.setProperty('--tp-max-width', Math.round(style.maxWidthPx) + 'px');
    node.style.setProperty('--tp-text-align', style.textAlign);
    node.style.setProperty('--tp-active-scale', style.activeScale.toFixed(3));
    node.style.setProperty('--tp-line-opacity', style.inactiveOpacity.toFixed(2));
    node.style.setProperty('--tp-next-opacity', style.nextOpacity.toFixed(2));
    node.style.setProperty('--tp-done-opacity', style.doneOpacity.toFixed(2));
    node.style.setProperty('--tp-glow-alpha', style.glowAlpha.toFixed(2));
    node.style.setProperty('--tp-glow-secondary-alpha', Math.min(0.35, style.glowAlpha * 0.42).toFixed(2));
    node.style.setProperty('--tp-stage-padding-top', style.stageTopVh.toFixed(1) + 'vh');
    node.style.setProperty('--tp-stage-padding-bottom', style.stageBottomVh.toFixed(1) + 'vh');
    return style;
  };

  teleprompterStyle.signature = function(input) {
    const style = teleprompterStyle.normalize(input);
    return JSON.stringify(style);
  };

  teleprompterStyle.save = function(input) {
    const normalized = teleprompterStyle.normalize(input);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {}
    return normalized;
  };

  teleprompterStyle.load = function() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return teleprompterStyle.defaultStyle();
      return teleprompterStyle.normalize(JSON.parse(raw));
    } catch {
      return teleprompterStyle.defaultStyle();
    }
  };

  teleprompterStyle.reset = function() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return teleprompterStyle.defaultStyle();
  };
})(window.VibeFlow);
