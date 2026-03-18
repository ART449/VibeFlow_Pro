/**
 * Colmena ByFlow — System Tray
 */
const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

function createTray(mainWindow) {
  // Crear icono simple (16x16 pixel data)
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback: icono vacío 16x16
    trayIcon = nativeImage.createEmpty();
  }

  const tray = new Tray(trayIcon);
  tray.setToolTip('Colmena ByFlow — Agentes Activos');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🐝 Colmena ByFlow',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Abrir Dashboard',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: 'Minimizar al Tray',
      click: () => mainWindow.hide()
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        mainWindow.destroy();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // Click en tray = mostrar ventana
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });

  return tray;
}

module.exports = { createTray };
