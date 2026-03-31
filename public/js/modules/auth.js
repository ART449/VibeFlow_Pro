(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const auth = VF.modules.auth = {};

  auth.socialLogin = async function(provider) {
    try {
      if (provider === 'google') {
        var googleProvider = new firebase.auth.GoogleAuthProvider();
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        // Always use redirect — popups get blocked on mobile, WebView, and many browsers
        _fbAuth.signInWithRedirect(googleProvider);
        return;
      } else if (provider === 'facebook') {
        var fbProvider = new firebase.auth.FacebookAuthProvider();
        _fbAuth.signInWithRedirect(fbProvider);
        return;
      } else if (provider === 'tiktok') {
        showToast('TikTok login proximamente. Usa Google por ahora.', 'warning');
        return;
      }
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user') return;
      if (e.code === 'auth/unauthorized-domain') {
        showToast('Dominio no autorizado en Firebase. Agrega este dominio en Firebase Console.', 'error');
      } else {
        showToast('Error de login: ' + (e.message || 'intenta de nuevo'), 'error');
      }
    }
  };

  // Handle redirect result when page loads after Google redirect
  auth._handleRedirectResult = function() {
    if (!_fbAuth) return;
    _fbAuth.getRedirectResult().then(function(result) {
      if (result && result.user) {
        _fbUser = result.user;
        var provider = result.additionalUserInfo?.providerId || 'google';
        localStorage.setItem('byflow_user_name', _fbUser.displayName || 'Usuario');
        localStorage.setItem('byflow_user_email', _fbUser.email || '');
        localStorage.setItem('byflow_user_photo', _fbUser.photoURL || '');
        localStorage.setItem('byflow_user_provider', provider.includes('google') ? 'google' : provider);
        localStorage.setItem('byflow_user_uid', _fbUser.uid);
        showToast('Bienvenido, ' + (_fbUser.displayName || 'Usuario') + '!', 'success');
        auth._updateUserUI();
        auth.dismissWelcome();
        setMode('karaoke');
      }
    }).catch(function(e) {
      if (e.code === 'auth/unauthorized-domain') {
        showToast('Dominio no autorizado en Firebase', 'error');
      }
    });
  };

  // Call on load
  auth._handleRedirectResult();

  auth.emailLogin = async function(isRegister) {
    const email = document.getElementById('bf-email-input')?.value?.trim();
    const pass = document.getElementById('bf-pass-input')?.value?.trim();
    if (!email || !pass) {
      showToast('Ingresa email y contrasena', 'warning');
      return;
    }
    if (pass.length < 6) {
      showToast('Contrasena minimo 6 caracteres', 'warning');
      return;
    }
    try {
      let result;
      if (isRegister) {
        result = await _fbAuth.createUserWithEmailAndPassword(email, pass);
      } else {
        result = await _fbAuth.signInWithEmailAndPassword(email, pass);
      }
      if (result && result.user) {
        _fbUser = result.user;
        localStorage.setItem('byflow_user_name', _fbUser.displayName || email.split('@')[0]);
        localStorage.setItem('byflow_user_email', _fbUser.email || '');
        localStorage.setItem('byflow_user_uid', _fbUser.uid);
        localStorage.setItem('byflow_user_provider', 'email');
        showToast('Bienvenido, ' + email.split('@')[0] + '!', 'success');
        auth._updateUserUI();
        auth.dismissWelcome();
        setMode('karaoke');
      }
    } catch (e) {
      const msgs = {
        'auth/email-already-in-use': 'Ese email ya tiene cuenta. Inicia sesion.',
        'auth/invalid-email': 'Email invalido',
        'auth/weak-password': 'Contrasena muy debil (minimo 6 caracteres)',
        'auth/user-not-found': 'No hay cuenta con ese email. Registrate.',
        'auth/wrong-password': 'Contrasena incorrecta',
        'auth/invalid-credential': 'Email o contrasena incorrectos'
      };
      showToast(msgs[e.code] || e.message, 'error');
    }
  };

  auth.bfLogout = function() {
    _fbAuth.signOut();
    _fbUser = null;
    localStorage.removeItem('byflow_user_name');
    localStorage.removeItem('byflow_user_email');
    localStorage.removeItem('byflow_user_photo');
    localStorage.removeItem('byflow_user_provider');
    localStorage.removeItem('byflow_user_uid');
    auth._updateUserUI();
    showToast('Sesion cerrada');
  };

  auth._updateUserUI = function() {
    const nameEl = document.getElementById('bf-user-name');
    const photoEl = document.getElementById('bf-user-photo');
    const loginBtn = document.getElementById('bf-login-btn');
    const logoutBtn = document.getElementById('bf-logout-btn');
    if (_fbUser || localStorage.getItem('byflow_user_uid')) {
      const name = _fbUser?.displayName || localStorage.getItem('byflow_user_name') || 'Usuario';
      const photo = _fbUser?.photoURL || localStorage.getItem('byflow_user_photo') || '';
      if (nameEl) nameEl.textContent = name;
      if (photoEl) {
        photoEl.src = photo || '/icon-192.svg';
        photoEl.style.display = 'block';
      }
      if (loginBtn) loginBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    } else {
      if (nameEl) nameEl.textContent = '';
      if (photoEl) photoEl.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
  };

  auth.dismissWelcome = function() {
    const ov = document.getElementById('welcome-overlay');
    if (ov) {
      ov.style.opacity = '0';
      ov.style.transition = 'opacity .4s';
      setTimeout(() => ov.classList.add('hidden'), 400);
    }
    window._byflowWelcomed = true;
    auth.showPanelsForMode(currentMode || 'karaoke');
  };

  auth.showPanelsForMode = function() {
    document.querySelector('.sidebar').classList.remove('panel-hidden');
    document.querySelector('.right-panel').classList.remove('panel-hidden');
  };

  if (_fbAuth && !window.__vfAuthObserverBound) {
    window.__vfAuthObserverBound = true;
    _fbAuth.onAuthStateChanged((user) => {
      _fbUser = user;
      if (user) {
        localStorage.setItem('byflow_user_name', user.displayName || user.email?.split('@')[0] || 'Usuario');
        localStorage.setItem('byflow_user_email', user.email || '');
        localStorage.setItem('byflow_user_photo', user.photoURL || '');
        localStorage.setItem('byflow_user_uid', user.uid);
      }
      auth._updateUserUI();
    });
  }
})(window.VibeFlow);
