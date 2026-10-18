const { app, protocol, net, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'mavpad', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

function createWindow() {
  const root = path.join(__dirname, 'www');
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 640,
    title: 'MavPad',
    backgroundColor: '#14141c',
    autoHideMenuBar: true,
    icon: path.join(root, 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('mavpad://')) e.preventDefault();
  });
  win.loadURL('mavpad://local/index.html');
}

app.whenReady().then(() => {
  const root = path.join(__dirname, 'www');
  protocol.handle('mavpad', (request) => {
    const root = path.resolve(__dirname, 'www');
    let rel = decodeURIComponent(new URL(request.url).pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return net.fetch(pathToFileURL(path.join(root, 'index.html')).toString());
    }
    return net.fetch(pathToFileURL(file).toString());
  });
  ipcMain.handle('save-text-file', async (e, name, text) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const safe = String(name || 'mavpad-backup.json').replace(/[^A-Za-z0-9._-]/g, '_');
    const result = await dialog.showSaveDialog(win, {
      defaultPath: safe,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, String(text), 'utf8');
    return true;
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
