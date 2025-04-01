import { app, BrowserWindow, ipcMain } from "electron";
import WebTorrent from "webtorrent";
import path from "path";
import fs from "fs";

let mainWindow;
const client = new WebTorrent();
const downloadPath = path.join(app.getPath("downloads"), "torrent_download");

// app stuff
const appIcon = path.join(app.getAppPath(), "src/assets/icon.png");
const macOSAppIcon = path.join(app.getAppPath(), "src/assets/icon.icns");
app.dock.setIcon(appIcon);
app.name = "WebTorrent Browser";

app.setAboutPanelOptions({
  applicationName: "WebTorrent Browser",
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: "Written by Kazei McQuaid 2025",
  credits:
    "A web browser that uses magnet links instead of http links. Very experimental, mostly meant to demonstrate the underusage and potential of bittorrent.",
  website: "https://github.com/wafwoof",
  iconPath: macOSAppIcon
});

function setupAppWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(app.getAppPath(), "src/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: appIcon,
    titleBarStyle: "hidden"
  });

  window.loadFile(path.join(app.getAppPath(), "src/index.html"));
  window.webContents.openDevTools();
}

// IPC Handler - Start Download
function ipcHandleStartDownload(event, torrentUrl) {
  console.log("Starting download: ", torrentUrl);
  const magnetURI = torrentUrl;

  // use torrent name from magnet URI
  let torrentName = magnetURI.split("dn=")[1];
  if (torrentName.includes("&")) {
    torrentName = torrentName.split("&")[0];
  }
  torrentName = decodeURIComponent(torrentName);
  console.log("Torrent name: ", torrentName);
  const torrentPath = path.join(downloadPath, torrentName);
  // check if theres an index.html file in the torrentPath
  const indexFilePath = path.join(torrentPath, "index.html");
  console.log("Torrent path: ", torrentPath);
  console.log("Index path: ", indexFilePath);

  // check if torrent already exists to skip download
  try {
    if (fs.existsSync(torrentPath)) {
      console.log("Torrent already exists, skipping download");
      // if index.html exists, return its file URL
      if (
        fs.existsSync(indexFilePath) &&
        fs.statSync(indexFilePath).isFile() &&
        fs.statSync(indexFilePath).size > 0
      ) {
        event.reply("download-complete", "file://" + indexFilePath);
      } else {
        // otherwise just return the torrent folder path
        event.reply("download-complete", torrentPath);
      }
      return;
    }
  } catch (err) {
    console.error("Error checking torrent path:", err);
  }

  // attempt to add the torrent
  try {
    client.add(magnetURI, { path: downloadPath }, torrent => {
      console.table({
        infoHash: torrent.infoHash,
        progress: torrent.progress,
        downloaded: torrent.downloaded,
        length: torrent.length
      });

      // track if we've sent the completion event
      let completionSent = false;

      // send completion event if already done or when it becomes done
      console.table({
        downloaded: torrent.downloaded,
        length: torrent.length,
        progress: torrent.progress
      });
      if (torrent.downloaded === torrent.length || torrent.progress === 1) {
        console.log("Files already downloaded");
        sendCompletionEvent();
      }

      // progress
      torrent.on("download", () => {
        const progress = torrent.progress * 100;
        event.reply("download-progress", progress);

        // if progress is 100%, send completion event immediately
        if (progress >= 100 && !completionSent) {
          event.reply("download-complete", "Download complete");
        }
      });

      // listen for done event as a backup
      torrent.on("done", () => {
        if (!completionSent) {
          console.log("Download complete event fired");
          sendCompletionEvent();
        }
      });

      // helper function to send completion event
      function sendCompletionEvent() {
        if (completionSent) return;
        completionSent = true;

        const files = torrent.files.map(file => file.path);
        // Send completion event but keep the torrent object alive for seeding
        // Check for index.html first
        const indexFile = files.find(file => file.endsWith("index.html"));
        if (indexFile) {
          event.reply("download-complete", {
            path: torrent.path,
            files,
            seeding: true,
            uploadSpeed: torrent.uploadSpeed,
            peers: torrent.numPeers
          });

          // Set up periodic reporting of seeding statistics
          setInterval(() => {
            event.reply("seeding-stats", {
              infoHash: torrent.infoHash,
              uploadSpeed: torrent.uploadSpeed,
              uploaded: torrent.uploaded,
              ratio: torrent.ratio,
              numPeers: torrent.numPeers
            });
            console.log(
              `Seeding stats: ${torrent.uploadSpeed} B/s, ${torrent.uploaded} bytes uploaded, ${torrent.ratio} ratio, ${torrent.numPeers} peers`
            );
          }, 5000);
        }

        // find first media file
        const mediaPath = files.find(file => {
          const decodedFile = file.replace(/\+/g, " ");
          const isMediaFile = /\.\w{2,4}$/.test(decodedFile);
          return isMediaFile;
        });

        if (mediaPath) {
          // if media file found, use it as primary content
          const mediaFile = mediaPath.split("/")[0];
          event.reply(
            "download-complete",
            "file://" + path.join(torrent.path, mediaFile)
          );
        } else if (indexPath) {
          event.reply(
            "download-complete",
            "file://" + path.join(downloadPath, indexPath)
          );
        }
      }
    });
  } catch (error) {
    console.info("Error adding torrent:", error);
    throw error;
  }
}

// IPC Handler - Get File Listing
function ipcHandleGetFileListing(event, dirPath) {
  try {
    // converts the file:// URL to a filesystem path
    let fsPath = dirPath;
    if (dirPath.startsWith("file://")) {
      // on macOS: file:///some/path -> /some/path
      fsPath = decodeURI(dirPath.replace("file://", ""));
    }

    // read directory contents
    fs.readdir(fsPath, (error, files) => {
      if (error) {
        console.error("Error reading directory:", error);
        return;
      }

      // send the file list back to renderer
      event.reply(`file-list-response-${dirPath}`, files);
    });
  } catch (error) {
    console.log("Error in getFileList:", error);
    if (/\.\w{2,4}$/.test(dirPath)) {
      // if it has a file extension, it's likely a file not a directory
      event.reply(`download-complete`, "file://" + dirPath);
    }
  }
}

// main app event
app.whenReady().then(() => {
  setupAppWindow();

  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  ipcMain.on("start-download", (event, torrentUrl) =>
    ipcHandleStartDownload(event, torrentUrl)
  );

  ipcMain.on("get-file-list", (event, dirPath) =>
    ipcHandleGetFileListing(event, dirPath)
  );
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
