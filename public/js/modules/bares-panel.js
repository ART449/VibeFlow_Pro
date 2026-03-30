(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const bares = VF.modules.baresPanel = {};

  function expose(name, value) {
    bares[name] = value;
    window[name] = value;
  }

  function safeEsc(value) {
    if (typeof escHtml === 'function') return escHtml(value);
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  const MENU_LS_KEY = 'byflow_bar_menu';
  const MENU_DEFAULT = [
    { id: 1, name: 'Bebidas', items: [
      { id: 101, name: 'Cerveza Nacional', price: 45, desc: 'Corona, Victoria, Modelo' },
      { id: 102, name: 'Cerveza Importada', price: 65, desc: 'Heineken, Stella, Blue Moon' },
      { id: 103, name: 'Michelada', price: 70, desc: 'Preparada con clamato y chamoy' },
      { id: 104, name: 'Mezcal Shot', price: 55, desc: 'Oaxaqueno con naranja y sal de gusano' },
      { id: 105, name: 'Cuba Libre', price: 80, desc: 'Ron, coca-cola y limon' }
    ] },
    { id: 2, name: 'Snacks', items: [
      { id: 201, name: 'Nachos con Queso', price: 90, desc: 'Totopos, queso fundido, jalapeno' },
      { id: 202, name: 'Alitas BBQ', price: 120, desc: '8 piezas con salsa BBQ o bufalo' },
      { id: 203, name: 'Esquites', price: 50, desc: 'Con mayonesa, queso y chile' },
      { id: 204, name: 'Papas a la Francesa', price: 65, desc: 'Con catsup y aderezo ranch' }
    ] },
    { id: 3, name: 'Especiales', items: [
      { id: 301, name: 'Tabla de Quesos', price: 180, desc: 'Seleccion de quesos con uvas y nueces' },
      { id: 302, name: 'Hamburguesa ByFlow', price: 140, desc: 'Angus, tocino, queso cheddar' },
      { id: 303, name: 'Tacos de Pastor', price: 95, desc: '4 tacos con pina, cebolla y cilantro' }
    ] }
  ];

  let menuEditMode = false;
  let menuActiveCategory = 0;

  function menuLoad() {
    try {
      const stored = localStorage.getItem(MENU_LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return JSON.parse(JSON.stringify(MENU_DEFAULT));
  }

  function menuSave(menu) {
    localStorage.setItem(MENU_LS_KEY, JSON.stringify(menu));
  }

  function menuGetAll() {
    return menuLoad();
  }

  function menuRender() {
    const menu = menuGetAll();
    const tabsEl = document.getElementById('menu-tabs');
    const gridEl = document.getElementById('menu-items-grid');
    if (!tabsEl || !gridEl) return;

    if (menuActiveCategory >= menu.length) menuActiveCategory = 0;
    tabsEl.innerHTML = menu.map((cat, index) =>
      '<div class="menu-tab' + (index === menuActiveCategory ? ' active' : '') + '" onclick="menuSelectTab(' + index + ')">' +
        safeEsc(cat.name) +
        (menuEditMode ? ' <span class="menu-item-del" style="display:inline;position:static;width:auto;height:auto;background:none;color:#f87171;font-size:10px;cursor:pointer;margin-left:2px;" onclick="event.stopPropagation();menuDeleteCategory(' + index + ')">&#10005;</span>' : '') +
      '</div>'
    ).join('');

    const cat = menu[menuActiveCategory];
    if (!cat || !cat.items || !cat.items.length) {
      gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:14px;opacity:.5;font-size:11px;">Sin items en esta categoria</div>';
      return;
    }
    gridEl.innerHTML = cat.items.map((item, index) =>
      '<div class="menu-item-card">' +
        '<button class="menu-item-del" onclick="menuDeleteItem(' + menuActiveCategory + ',' + index + ')">&#10005;</button>' +
        '<div class="menu-item-name">' + safeEsc(item.name) + '</div>' +
        (item.desc ? '<div class="menu-item-desc">' + safeEsc(item.desc) + '</div>' : '') +
        '<div class="menu-item-price">$' + Number(item.price).toFixed(0) + ' MXN</div>' +
      '</div>'
    ).join('');
  }

  function menuSelectTab(index) {
    menuActiveCategory = index;
    menuRender();
  }

  function menuToggleEdit() {
    menuEditMode = !menuEditMode;
    const section = document.getElementById('bares-menu-section');
    const btn = document.getElementById('menu-edit-toggle');
    const addCatBtn = document.getElementById('menu-add-cat-btn');
    if (section) section.classList.toggle('menu-edit-mode', menuEditMode);
    if (btn) {
      btn.classList.toggle('active', menuEditMode);
      btn.textContent = menuEditMode ? 'Listo' : 'Editar';
    }
    if (addCatBtn) addCatBtn.style.display = menuEditMode ? '' : 'none';
    menuRender();
  }

  function menuAddItem() {
    const nameEl = document.getElementById('menu-new-name');
    const priceEl = document.getElementById('menu-new-price');
    const descEl = document.getElementById('menu-new-desc');
    const name = nameEl ? nameEl.value.trim() : '';
    const price = priceEl ? parseFloat(priceEl.value) : 0;
    const desc = descEl ? descEl.value.trim() : '';
    if (!name || isNaN(price) || price <= 0) {
      showToast('Nombre y precio son requeridos');
      return;
    }
    const menu = menuGetAll();
    if (!menu.length) {
      showToast('Primero crea una categoria');
      return;
    }
    const newItem = { id: Date.now(), name, price, desc: desc || undefined };
    const updatedCat = Object.assign({}, menu[menuActiveCategory], {
      items: [].concat(menu[menuActiveCategory].items, [newItem])
    });
    const updatedMenu = menu.map((cat, index) => index === menuActiveCategory ? updatedCat : cat);
    menuSave(updatedMenu);
    if (nameEl) nameEl.value = '';
    if (priceEl) priceEl.value = '';
    if (descEl) descEl.value = '';
    showToast('Agregado: ' + name);
    menuRender();
  }

  function menuDeleteItem(catIdx, itemIdx) {
    const menu = menuGetAll();
    const cat = menu[catIdx];
    if (!cat) return;
    const updatedCat = Object.assign({}, cat, { items: cat.items.filter((_, index) => index !== itemIdx) });
    menuSave(menu.map((item, index) => index === catIdx ? updatedCat : item));
    showToast('Item eliminado');
    menuRender();
  }

  function menuAddCategory() {
    const name = prompt('Nombre de la nueva categoria:');
    if (!name || !name.trim()) return;
    const menu = menuGetAll();
    const updatedMenu = menu.concat([{ id: Date.now(), name: name.trim(), items: [] }]);
    menuSave(updatedMenu);
    menuActiveCategory = updatedMenu.length - 1;
    showToast('Categoria creada: ' + name.trim());
    menuRender();
  }

  function menuDeleteCategory(catIdx) {
    const menu = menuGetAll();
    if (menu.length <= 1) {
      showToast('Debe haber al menos una categoria');
      return;
    }
    if (!confirm('Eliminar categoria "' + menu[catIdx].name + '" y todos sus items?')) return;
    const updatedMenu = menu.filter((_, index) => index !== catIdx);
    menuSave(updatedMenu);
    if (menuActiveCategory >= updatedMenu.length) menuActiveCategory = 0;
    showToast('Categoria eliminada');
    menuRender();
  }

  function menuGetPublicData() {
    return menuGetAll().map((cat) => ({
      name: cat.name,
      items: cat.items.map((item) => ({ name: item.name, price: item.price, desc: item.desc || '' }))
    }));
  }

  function menuInit() {
    const menu = menuGetAll();
    if (!localStorage.getItem(MENU_LS_KEY)) menuSave(menu);
    menuRender();
  }

  let djSfxVolume = 0.7;
  const djSfxCache = {};
  const djSfxMap = {
    airhorn: '/sfx/airhorn.mp3',
    applause: '/sfx/applause.mp3',
    drumroll: '/sfx/drumroll.mp3',
    record_scratch: '/sfx/scratch.mp3',
    crowd_cheer: '/sfx/crowd.mp3',
    bell: '/sfx/bell.mp3',
    siren: '/sfx/siren.mp3',
    bass_drop: '/sfx/bassdrop.mp3',
    woosh: '/sfx/woosh.mp3'
  };

  function djPreloadSfx() {
    Object.entries(djSfxMap).forEach(([name, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = djSfxVolume;
      djSfxCache[name] = audio;
    });
  }

  function djSetVolume(val) {
    djSfxVolume = val / 100;
    const lbl = document.getElementById('dj-vol-label');
    if (lbl) lbl.textContent = val + '%';
    localStorage.setItem('byflow_dj_vol', val);
    Object.values(djSfxCache).forEach((audio) => { audio.volume = djSfxVolume; });
  }

  function djPlay(sfxName) {
    const pad = document.querySelector('.dj-pad[data-sfx="' + sfxName + '"]');
    if (pad) {
      pad.classList.add('playing');
      setTimeout(() => pad.classList.remove('playing'), 500);
    }
    const cached = djSfxCache[sfxName];
    if (cached) {
      const clone = cached.cloneNode();
      clone.volume = djSfxVolume;
      clone.play().catch(() => {});
      return;
    }
    const url = djSfxMap[sfxName];
    if (url) {
      const audio = new Audio(url);
      audio.volume = djSfxVolume;
      audio.play().catch(() => {});
      return;
    }
    showToast('SFX: ' + sfxName);
  }

  function djInit() {
    const vol = localStorage.getItem('byflow_dj_vol');
    if (vol) {
      djSfxVolume = parseInt(vol, 10) / 100;
      const slider = document.getElementById('dj-sfx-vol');
      if (slider) slider.value = vol;
      const lbl = document.getElementById('dj-vol-label');
      if (lbl) lbl.textContent = vol + '%';
    }
    djPreloadSfx();
  }

  expose('menuLoad', menuLoad);
  expose('menuSave', menuSave);
  expose('menuGetAll', menuGetAll);
  expose('menuRender', menuRender);
  expose('menuSelectTab', menuSelectTab);
  expose('menuToggleEdit', menuToggleEdit);
  expose('menuAddItem', menuAddItem);
  expose('menuDeleteItem', menuDeleteItem);
  expose('menuAddCategory', menuAddCategory);
  expose('menuDeleteCategory', menuDeleteCategory);
  expose('menuGetPublicData', menuGetPublicData);
  expose('menuInit', menuInit);
  expose('djPreloadSfx', djPreloadSfx);
  expose('djSetVolume', djSetVolume);
  expose('djPlay', djPlay);
  expose('djInit', djInit);
})(window.VibeFlow = window.VibeFlow || {});
