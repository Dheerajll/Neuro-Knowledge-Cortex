import { app, BrowserWindow, protocol, net, shell } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { attachRoot, ensureDirs } from './store'
import { rebuildIndex } from './index-db'
import { registerIpc } from './ipc'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'neuron',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let win: BrowserWindow | null = null

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#F5F2EA',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 16 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) await win.loadURL(devUrl)
  else await win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  protocol.handle('neuron', async (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const abs = path.normalize(path.join(attachRoot(), rel))
    if (!abs.startsWith(attachRoot())) return new Response('not found', { status: 404 })
    try {
      return await net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })

  await ensureDirs()
  await rebuildIndex()
  registerIpc(() => win)
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})