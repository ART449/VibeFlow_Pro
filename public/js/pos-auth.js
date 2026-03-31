/**
 * ByFlow POS — Shared Auth Module
 * Single source of truth for POS authentication across all pages
 * Used by: pos.html, pos-admin.html, bares-v2.html
 */
(function(window) {
  'use strict';

  const PosAuth = window.PosAuth = {};

  // ═══ Token & Bar ID ═══

  PosAuth.getToken = function() {
    return sessionStorage.getItem('pos_token') ||
      new URLSearchParams(location.search).get('token') ||
      '';
  };

  PosAuth.getBarId = function() {
    return sessionStorage.getItem('pos_bar_id') || 'default';
  };

  PosAuth.getPermissions = function() {
    try {
      return JSON.parse(sessionStorage.getItem('pos_permissions') || '[]');
    } catch (e) {
      return [];
    }
  };

  PosAuth.getSidebar = function() {
    try {
      return JSON.parse(sessionStorage.getItem('pos_sidebar') || '[]');
    } catch (e) {
      return [];
    }
  };

  PosAuth.getDefaultView = function() {
    return sessionStorage.getItem('pos_default_view') || 'mesas';
  };

  PosAuth.getLicense = function() {
    try {
      return JSON.parse(sessionStorage.getItem('pos_license') || 'null');
    } catch (e) {
      return null;
    }
  };

  PosAuth.hasPermission = function(permission) {
    var perms = PosAuth.getPermissions();
    return perms.includes('*') || perms.includes(permission);
  };

  PosAuth.authHeaders = function() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + PosAuth.getToken(),
      'X-Bar-ID': PosAuth.getBarId()
    };
  };

  PosAuth.authHeadersOnly = function() {
    return {
      'Authorization': 'Bearer ' + PosAuth.getToken(),
      'X-Bar-ID': PosAuth.getBarId()
    };
  };

  // ═══ Auth Gate ═══

  PosAuth.requireAuth = function(redirectTo) {
    if (!PosAuth.getToken()) {
      window.location.replace(redirectTo || '/pos.html');
      return false;
    }
    return true;
  };

  // ═══ License Check ═══

  PosAuth.checkLicense = async function(email) {
    try {
      const r = await fetch('/api/pos/license?email=' + encodeURIComponent(email));
      const d = await r.json();
      return d.ok ? d : { ok: false };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  PosAuth.checkLicenseByBar = async function(barId) {
    try {
      const r = await fetch('/api/pos/license?bar_id=' + encodeURIComponent(barId));
      const d = await r.json();
      return d.ok ? d : { ok: false };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // ═══ Bar ID from Email (deterministic) ═══

  PosAuth.emailToBarId = async function(email) {
    const encoder = new TextEncoder();
    const data = encoder.encode(email.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return 'bar_' + hashHex.substring(0, 16);
  };

  // ═══ Session Management ═══

  PosAuth.saveSession = function(employee, token, barId, meta) {
    sessionStorage.setItem('pos_employee', JSON.stringify(employee));
    sessionStorage.setItem('pos_token', token);
    if (barId) sessionStorage.setItem('pos_bar_id', barId);
    meta = meta || {};
    if (meta.permissions) sessionStorage.setItem('pos_permissions', JSON.stringify(meta.permissions));
    if (meta.sidebar) sessionStorage.setItem('pos_sidebar', JSON.stringify(meta.sidebar));
    if (meta.defaultView) sessionStorage.setItem('pos_default_view', meta.defaultView);
    if (meta.license) sessionStorage.setItem('pos_license', JSON.stringify(meta.license));
  };

  PosAuth.getEmployee = function() {
    try {
      return JSON.parse(sessionStorage.getItem('pos_employee') || 'null');
    } catch (e) {
      return null;
    }
  };

  PosAuth.logout = function() {
    sessionStorage.removeItem('pos_token');
    sessionStorage.removeItem('pos_employee');
    sessionStorage.removeItem('pos_bar_id');
    sessionStorage.removeItem('pos_license');
    sessionStorage.removeItem('pos_permissions');
    sessionStorage.removeItem('pos_sidebar');
    sessionStorage.removeItem('pos_default_view');
    localStorage.removeItem('pos_bar_name');
    localStorage.removeItem('pos_bar_email');
    localStorage.removeItem('pos_setup_complete');
    window.location.replace('/pos.html');
  };

  // ═══ Firebase Config (shared) ═══

  PosAuth.firebaseConfig = {
    apiKey: "AIzaSyCrdTH1CvJj-kHX_LR5kzPmlxVG8fkaQpM",
    authDomain: "byflow-d3a0f.firebaseapp.com",
    projectId: "byflow-d3a0f"
  };

})(window);
