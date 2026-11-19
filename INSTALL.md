# Installing Canvas Submitted Work

This extension isn't in the Edge store, so Edge installs it from a folder on your computer. It takes about two minutes. These steps are for Microsoft Edge on Windows. Google Chrome works the same way at `chrome://extensions`.

## Option A: Install script (easiest)

1. Press **Start**, type **PowerShell**, and open **Windows PowerShell**.
2. Paste this line and press **Enter**:

   ```powershell
   irm https://raw.githubusercontent.com/jorel13/canvas-submissions-extension/main/install.ps1 | iex
   ```

   The script downloads the latest version to `%LOCALAPPDATA%\CanvasSubmittedWork`, copies that folder path to your clipboard, and opens Edge's Extensions page.
3. In Edge, turn on **Developer mode** (left side of the page).
4. Click **Load unpacked**. Click in the folder box at the top of the window, paste (**Ctrl+V**), press **Enter**, then click **Select Folder**.
5. Click the puzzle-piece icon in the Edge toolbar and pin **Canvas Submitted Work**.

You can [read the script](install.ps1) before running it.

## Option B: Manual install

1. Download [canvas-submitted-work.zip](https://github.com/jorel13/canvas-submissions-extension/releases/latest/download/canvas-submitted-work.zip).
2. Right-click the ZIP, choose **Extract All**, and extract it to a folder you'll keep, such as `Documents\CanvasSubmittedWork`. **Don't delete this folder.** Edge runs the extension from it.
3. Open `edge://extensions` in Edge and turn on **Developer mode**.
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Pin the extension from the puzzle-piece menu.

## Using it

Log in to Canvas, keep a Canvas tab open, and click the extension icon.

## Updating

The popup shows a notice when a new version is out.

- **Installed with the script:** run the same PowerShell line again, then close and reopen Edge.
- **Installed manually:** download the new ZIP, extract it over the same folder (replace the files), then click **Reload** on the extension in `edge://extensions`.

Your settings and hidden courses are kept.

## Uninstalling

Click **Remove** on the extension in `edge://extensions`, then delete the folder (`%LOCALAPPDATA%\CanvasSubmittedWork` if you used the script).

## Troubleshooting

- **"Turn off extensions in developer mode" popup:** Edge sometimes shows this when it starts. Close it with the **X**. Clicking **Turn off** disables the extension.
- **"Manifest file is missing or unreadable":** you selected the wrong folder. Pick the one that directly contains `manifest.json`.
- **"Running scripts is disabled on this system":** use the exact line above (it doesn't need script permissions), or use Option B.
- **"Open a Canvas tab" message:** the extension only works while the active tab is a Canvas page on `*.instructure.com`.
- **Work or school computer:** your organization may block developer-mode extensions. You'd need to ask IT.
