const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("trueDesk", {
  readSpreadsheets: (target) => ipcRenderer.invoke("read-spreadsheets", target),
  pickFile: () => ipcRenderer.invoke("pick-file"),
  focusWindow: () => ipcRenderer.invoke("focus-window"),
  clearAttention: () => ipcRenderer.invoke("clear-attention"),
  openOutlook: (payload) => ipcRenderer.invoke("open-outlook", payload),
  openFile: (username, name, base64) => ipcRenderer.invoke("open-file", username, name, base64),
  openMail: (username, name, base64) => ipcRenderer.invoke("open-mail", username, name, base64),
  readVault: () => ipcRenderer.invoke("read-vault"),
  writeVault: (json) => ipcRenderer.invoke("write-vault", json),
  readProfile: (username) => ipcRenderer.invoke("read-profile", username),
  writeProfile: (username, json) => ipcRenderer.invoke("write-profile", username, json),
  deleteProfile: (username) => ipcRenderer.invoke("delete-profile", username),
  readAttachment: (id) => ipcRenderer.invoke("read-attachment", id),
  writeAttachment: (username, id, base64) => ipcRenderer.invoke("write-attachment", username, id, base64),
  claimAttachment: (username, id) => ipcRenderer.invoke("claim-attachment", username, id),
  deleteAttachment: (id) => ipcRenderer.invoke("delete-attachment", id),
  writeTools: (json) => ipcRenderer.invoke("write-tools", json),
  writeUserTasks: (username, json) => ipcRenderer.invoke("write-user-tasks", username, json),
  readRelease: () => ipcRenderer.invoke("read-release"),
});
