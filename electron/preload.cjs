// Puente seguro entre el panel (HTML) y el programa. Solo expone estas funciones.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('puente', {
    state: () => ipcRenderer.invoke('puente:state'),
    onState: (fn) => ipcRenderer.on('puente:state', (_e, s) => fn(s)),
    onStep: (fn) => ipcRenderer.on('puente:step', (_e, t) => fn(t)),
    checkToken: (token) => ipcRenderer.invoke('puente:checkToken', token),
    detect: () => ipcRenderer.invoke('puente:detect'),
    prepareAndroid: (serial) => ipcRenderer.invoke('puente:prepareAndroid', serial),
    test: (line, phone) => ipcRenderer.invoke('puente:test', line, phone),
    configure: (token, line, name) => ipcRenderer.invoke('puente:configure', token, line, name),
    setLine: (line) => ipcRenderer.invoke('puente:setLine', line),
    pause: (paused) => ipcRenderer.invoke('puente:pause', paused),
    reset: () => ipcRenderer.invoke('puente:reset'),
    version: () => ipcRenderer.invoke('puente:version'),
});
