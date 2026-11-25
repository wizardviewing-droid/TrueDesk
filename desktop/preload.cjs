const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("trueDesk", {
  readSpreadsheets: (target) => ipcRenderer.invoke("read-spreadsheets", target),
  openOutlook: (url) => ipcRenderer.invoke("open-outlook", url),
  openFile: (name, base64) => ipcRenderer.invoke("open-file", name, base64),
});
