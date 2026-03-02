import { contextBridge, ipcRenderer } from 'electron'

// Exponiendo APIs seguras de Electron al Frontend (React)
contextBridge.exposeInMainWorld('ipcRenderer', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args
        return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, ...omit] = args
        return ipcRenderer.off(channel, ...omit)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...omit] = args
        return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...omit] = args
        return ipcRenderer.invoke(channel, ...omit)
    },
})

// Exponer utilidades del sistema
contextBridge.exposeInMainWorld('c4iNative', {
    ping: () => ipcRenderer.invoke('ping'),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
});
