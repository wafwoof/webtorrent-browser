const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  startDownload: torrentUrl => ipcRenderer.send("start-download", torrentUrl),
  onDownloadProgress: callback =>
    ipcRenderer.on("download-progress", (_, progress) => callback(progress)),
  onDownloadComplete: callback =>
    ipcRenderer.on("download-complete", (_, url) => callback(url)),
  getFileList: (dirPath, callback) => {
    ipcRenderer.once(`file-list-response-${dirPath}`, (_, fileList) =>
      callback(fileList)
    );
    ipcRenderer.send("get-file-list", dirPath);
  },
  onSeedingStats: callback => {
    ipcRenderer.on("seeding-stats", (event, stats) => {
      callback(stats);
    });
  }
});
