const { app, BrowserWindow, Notification } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'VM Brasil Conveniência',
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon-512x512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  // In dev/preview, load the web URL; in production, load local files
  const startUrl = process.env.ELECTRON_START_URL || 'https://lojasvm.lovable.app';
  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Keep the app running in the system tray area when "closed"
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    // Still don't quit — keep running for notifications
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// Allow quit from tray/menu
app.on('before-quit', () => {
  app.isQuiting = true;
});
