const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("trueDesk", {
  readSpreadsheets: (target) => ipcRenderer.invoke("read-spreadsheets", target),
  pickFile: () => ipcRenderer.invoke("pick-file"),
  focusWindow: () => ipcRenderer.invoke("focus-window"),
  clearAttention: () => ipcRenderer.invoke("clear-attention"),
  openOutlook: (url) => ipcRenderer.invoke("open-outlook", url),
  openFile: (name, base64) => ipcRenderer.invoke("open-file", name, base64),
  readVault: () => ipcRenderer.invoke("read-vault"),
  writeVault: (json) => ipcRenderer.invoke("write-vault", json),
  readProfile: (username) => ipcRenderer.invoke("read-profile", username),
  writeProfile: (username, json) => ipcRenderer.invoke("write-profile", username, json),
  deleteProfile: (username) => ipcRenderer.invoke("delete-profile", username),
  readAttachment: (id) => ipcRenderer.invoke("read-attachment", id),
  writeAttachment: (id, base64) => ipcRenderer.invoke("write-attachment", id, base64),
  deleteAttachment: (id) => ipcRenderer.invoke("delete-attachment", id),
  readRelease: () => ipcRenderer.invoke("read-release"),
});
