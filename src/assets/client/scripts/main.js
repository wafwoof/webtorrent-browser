// setup render functions for the iframe

const iframe = document.getElementById("content");
const contentParent = document.getElementById("content-parent");

function updateIframe(config) {
  const newIframe = document.createElement("iframe");
  newIframe.id = "content";

  // Apply configuration based on the type
  if (config.src) {
    newIframe.src = config.src;
  } else if (config.srcdoc) {
    newIframe.srcdoc = config.srcdoc;
  }

  // Replace the existing iframe
  document.getElementById("content").remove();
  contentParent.appendChild(newIframe);

  return newIframe;
}

function reRenderIframe(url) {
  document.querySelector("header section.logo img").classList.remove("spin");
  updateIframe({ src: url });
}

function renderBlank() {
  updateIframe({
    srcdoc: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>wtb:blank</title>
      </head>
      <body>
        <code>Welcome to WebTorrent Browser!</code>
        <br />
        <code>Hint: Click the bookmarks dropdown to see examples.</code>
      </body>
      </html>
    `
  });
}

function renderSpinner() {
  document.querySelector("header section.logo img").classList.add("spin");
  // todo: show loading percentage instead of meaningless spinner
  const spinnerHtml = `
    <code class="spinner" id="loading-spinner"></code>
  `;
  updateIframe({ srcdoc: spinnerHtml });
}

function generateFileListingHtml(basePath, files) {
  return `
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; padding: 8px; }
                h2 { color: black; }
                ul { list-style-type: none; padding: 0; }
                li { margin: 8px 0; }
                a { color: #0066cc; text-decoration: none; }
                a:hover { text-decoration: underline; }
              </style>
            </head>
            <body>
              <h2>Files</h2>
              <ul>
                ${files
                  .map(
                    file =>
                      `<li><a href="javascript:void(0)" onclick="window.parent.dispatchEvent(new CustomEvent('location-changed', {detail: {url: '${basePath}/${file}'}}));">${file}</a></li>`
                  )
                  .join("")}
              </ul>
            </body>
          </html>
        `;
}

function renderDirectory(url) {
  document.querySelector("header section.logo img").classList.remove("spin");
  console.log("Rendering directory:", url);
  window.electron.getFileList(url, fileList => {
    console.log("URL:", url);
    console.log("File list:", fileList);
    const fileListingHtml = generateFileListingHtml(url, fileList);
    updateIframe({ srcdoc: fileListingHtml });
  });
}

// history navigation functionality

function checkMediaFile(url) {
  return url.match(
    /\.(webm|mp4|mkv|avi|mov|jpg|jpeg|png|gif|mp3|wav|ogg|srt|sub|txt|pdf|docx|pptx|xlsx|html|htm|css|js|json|xml|zip|tar|gz|bz2|7z|exe|apk|dmg)$/
  );
}

const navBackButton = document.getElementById("nav-back");
const navForwardButton = document.getElementById("nav-forward");
const contentIframe = document.getElementById("content");
let historyStack = ["about:blank"];
let currentHistoryIndex = 0;

navBackButton.addEventListener("click", () => {
  if (currentHistoryIndex > 0) {
    currentHistoryIndex--;
    const previousUrl = historyStack[currentHistoryIndex];
    // check if directory
    if (previousUrl.endsWith("/index.html")) {
      reRenderIframe(previousUrl);
    } else if (previousUrl === "about:blank") {
      renderBlank();
    } else {
      // Create a custom request to generate file listing
      window.electron.getFileList(previousUrl, fileList => {
        const fileListingHtml = generateFileListingHtml(previousUrl, fileList);
        const iframe = document.getElementById("content");
        iframe.srcdoc = fileListingHtml;
      });
    }
  }
});

navForwardButton.addEventListener("click", () => {
  if (currentHistoryIndex < historyStack.length - 1) {
    currentHistoryIndex++;
    const nextUrl = historyStack[currentHistoryIndex];
    // check if directory
    if (checkMediaFile(nextUrl)) {
      reRenderIframe(nextUrl);
    } else if (nextUrl === "about:blank") {
      renderBlank();
    } else {
      // Create a custom request to generate file listing
      window.electron.getFileList(nextUrl, fileList => {
        const fileListingHtml = generateFileListingHtml(nextUrl, fileList);
        const iframe = document.getElementById("content");
        iframe.srcdoc = fileListingHtml;
      });
    }
  }
});

window.addEventListener("location-changed", event => {
  const newUrl = event.detail.url;
  console.log("Location changed to:", newUrl);

  // Check if the new URL is different from the last one in history
  if (historyStack[currentHistoryIndex] !== newUrl) {
    // Add the new URL to the history stack
    historyStack = historyStack.slice(0, currentHistoryIndex + 1);
    historyStack.push(newUrl);
    currentHistoryIndex++;
    console.log("History updated:", historyStack);
  }

  // Use the same URL type checking logic here as in forward/back navigation
  if (checkMediaFile(newUrl)) {
    reRenderIframe(newUrl);
  } else if (newUrl === "about:blank") {
    renderBlank();
  } else {
    // Create a custom request to generate file listing
    window.electron.getFileList(newUrl, fileList => {
      const fileListingHtml = generateFileListingHtml(newUrl, fileList);
      const iframe = document.getElementById("content");
      iframe.srcdoc = fileListingHtml;
    });
  }

  console.log("Handled URL:", newUrl);
});

// bookmark functionality

const bookmarks = document.getElementById("bookmarks");
const torrentUrlInput = document.getElementById("torrentUrl");
const addBookmarkButton = document.getElementById("add-bookmark");

// Add event listener to the bookmarks dropdown
bookmarks.addEventListener("change", event => {
  const selectedUrl = event.target.value;
  if (selectedUrl) {
    torrentUrlInput.value = selectedUrl;
    bookmarks.selectedIndex = 0;
    document.getElementById("download").click();
  }
});

// Add event listener to the add bookmark button
addBookmarkButton.addEventListener("click", () => {
  const torrentUrl = torrentUrlInput.value;
  if (torrentUrl) {
    // Extract the display name (dn parameter) from the magnet link if available
    let displayName = torrentUrl;
    const dnMatch = torrentUrl.match(/&dn=([^&]+)/);
    if (dnMatch && dnMatch[1]) {
      displayName = decodeURIComponent(dnMatch[1]).replace(/\+/g, " ");
    }

    const option = document.createElement("option");
    option.value = torrentUrl;
    option.textContent = displayName;
    bookmarks.appendChild(option);
    console.log("Added bookmark:", torrentUrl);

    // Save updated bookmarks to localStorage
    saveBookmarksToStorage();
  } else {
    console.error("No URL provided for bookmark");
  }
});

// listener for go/download button
document.getElementById("download").addEventListener("click", () => {
  renderSpinner();
  const torrentUrl = document.getElementById("torrentUrl").value;
  if (torrentUrl) {
    console.log("Downloading torrent:", torrentUrl);
    window.electron.startDownload(torrentUrl);
  } else {
    console.error("No torrent URL provided");
  }
});

// load bookmarks from localStorage
function loadBookmarksFromStorage() {
  try {
    const savedBookmarks =
      JSON.parse(localStorage.getItem("webtorrentBookmarks")) || [];

    if (Array.isArray(savedBookmarks) && savedBookmarks.length > 0) {
      // Get existing bookmark URLs for comparison
      const existingUrls = Array.from(bookmarks.options).map(
        option => option.value
      );

      savedBookmarks.forEach(bookmark => {
        // only add if this URL doesn't already exist in the dropdown
        if (!existingUrls.includes(bookmark.url)) {
          const option = document.createElement("option");
          option.value = bookmark.url;
          option.textContent = bookmark.name;
          bookmarks.appendChild(option);
        }
      });
      console.log("Loaded bookmarks from localStorage:", savedBookmarks.length);
    }
  } catch (error) {
    console.error("Error loading bookmarks from localStorage:", error);
  }
}

// Save bookmarks to localStorage
function saveBookmarksToStorage() {
  try {
    const bookmarkElements = Array.from(bookmarks.options).slice(1); // Skip the first disabled option
    const bookmarksData = bookmarkElements.map(option => ({
      url: option.value,
      name: option.textContent
    }));
    localStorage.setItem("webtorrentBookmarks", JSON.stringify(bookmarksData));
    console.log("Saved bookmarks to localStorage:", bookmarksData.length);
  } catch (error) {
    console.error("Error saving bookmarks to localStorage:", error);
  }
}

// Load bookmarks when the page loads
document.addEventListener("DOMContentLoaded", loadBookmarksFromStorage);

window.electron.onDownloadComplete(url => {
  console.log("Download complete:", url);

  // Extract directory path
  const urlWithoutIndex = url.substring(0, url.lastIndexOf("/"));
  // Check if this is a directory or a file
  if (url.endsWith("/index.html")) {
    reRenderIframe(url);
  } else {
    // Create a custom request to generate file listing
    renderDirectory(url); // Fixed: 'ur' to 'url'
  }

  // dispatch event "location-changed" to main
  const event = new CustomEvent("location-changed", {
    detail: { url }
  });
  window.dispatchEvent(event);
});

// if user presses enter while focused on the torrentUrl input, trigger the download button
torrentUrlInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("download").click();
  }
});

// listener for seeding stats
window.electron.onDownloadProgress(progress => {
  // console.log("Download progress:", progress);
  try {
    let progressPercentage = Math.round(progress);
    const iframe = document.getElementById("content");
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.getElementById("loading-spinner").textContent =
      progressPercentage + "%";
  } catch (error) {
    // console.error("Error updating progress:", error);
    1 + 1; // no-op
    return;
  }
});
