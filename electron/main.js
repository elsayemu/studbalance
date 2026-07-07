// electron/main.js
// Electron's "main process" - this is what actually runs when someone
// double-clicks the app. It:
//   1. Figures out where to store the database (a proper per-user folder,
//      not wherever the app happens to be installed).
//   2. Starts the Next.js server as a background process on a local port.
//   3. Opens a native window pointed at that local server.
//   4. Shuts the server down cleanly when the window closes.

const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const net = require("net");

let serverProcess = null;
let mainWindow = null;
const PORT = 3456;

// Log to a real file
function getLogPath() {
  try {
    return path.join(app.getPath("userData"), "app.log");
  } catch {
    return path.join(__dirname, "app.log");
  }
}
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  console.log(line.trim());
  try {
    fs.appendFileSync(getLogPath(), line);
  } catch {}
}

// --- Critical: prevent multiple copies of the app from ever running at
// once. Without this, double-clicking the shortcut twice (e.g. because
// startup takes a few seconds and nothing seems to happen yet) launches a
// second full instance - which spawns its OWN server fighting for the same
// port, and its own window - cascading fast if clicked repeatedly. ---
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Another instance is already running - just quit this one immediately.
  app.quit();
} else {
  app.on("second-instance", () => {
    // Someone tried to open the app again while it's already running -
    // just bring the existing window to the front instead of opening a new one.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (serverProcess) serverProcess.kill();
  });
}

// Where the SQLite database lives. In dev this is just the project folder;
// in the packaged app it's the OS's proper per-user app-data folder, so it
// survives updates and isn't stuck inside the (read-only, on macOS)
// installed app bundle.
function getDatabaseUrl() {
  if (!app.isPackaged) {
    return "file:./dev.db";
  }
  const userDataDir = app.getPath("userData");
  const dbPath = path.join(userDataDir, "studbalance.db");

  if (!fs.existsSync(dbPath)) {
    const templatePath = path.join(process.resourcesPath, "standalone", "template.db");
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.copyFileSync(templatePath, dbPath);
      log("First launch - created database from template at", dbPath);
    } catch (err) {
      log("Failed to create database from template:", err.message);
    }
  }

  return `file:${dbPath}`;
}

function waitForServer(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;

    if (serverProcess) {
      serverProcess.once("exit", (code, signal) => {
        if (!settled && code !== 0) {
          settled = true;
          reject(new Error(`Server process exited early (code=${code}, signal=${signal}). Check the log file.`));
        }
      });
    }

    (function check() {
      if (settled) return;
      const socket = net.createConnection(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      socket.once("error", () => {
        socket.destroy();
        if (settled) return;
        if (Date.now() - start > timeoutMs) {
          settled = true;
          reject(new Error("Server did not start in time"));
        } else {
          setTimeout(check, 300);
        }
      });
    })();
  });
}

function startNextServer() {
  // In the packaged app, the Next.js standalone server lives alongside
  // this file (see the electron-builder "extraResources"/"files" config
  // in package.json). In dev, we just run "next start" from the project root.
  const appRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  const serverEntry = app.isPackaged
    ? path.join(appRoot, "standalone", "server.js")
    : null;

  const env = {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: getDatabaseUrl(),
    NODE_ENV: "production",
    ELECTRON_RUN_AS_NODE: "1", // critical: makes process.execPath behave as plain Node, not relaunch Electron/Chromium
  };

  if (app.isPackaged) {
    // electron-builder already correctly bundles every real dependency
    // (next, react, @prisma/client, and Prisma's native engine binary)
    // into the app itself, based on package.json - we saw this directly
    // in the build log. Rather than fight extraResources' file filtering
    // (which strips node_modules no matter how it's configured), just
    // point Node at that already-correct location via NODE_PATH.
    const asarNodeModules = path.join(process.resourcesPath, "app.asar", "node_modules");
    const unpackedNodeModules = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules");
    // Prisma's generated client lives here instead (see scripts/prepare-standalone.js
    // for why it's relocated out of a folder literally named "node_modules").
    const prismaSupport = path.join(process.resourcesPath, "standalone", "prisma-support");
    env.NODE_PATH = [asarNodeModules, unpackedNodeModules, prismaSupport].join(path.delimiter);
    log("NODE_PATH set to:", env.NODE_PATH);
  }

  if (app.isPackaged) {
    log("Starting standalone server:", serverEntry);
    log("Server cwd:", path.dirname(serverEntry));
    log("Server entry exists?", fs.existsSync(serverEntry));
    serverProcess = spawn(process.execPath, [serverEntry], { env, cwd: path.dirname(serverEntry) });
  } else {
    serverProcess = spawn("npx", ["next", "start", "-p", String(PORT)], {
      env,
      cwd: appRoot,
      shell: true,
    });
  }

  serverProcess.on("error", (err) => {
    log("Server process failed to start:", err.message);
  });
  serverProcess.on("exit", (code, signal) => {
    log(`Server process exited early - code=${code} signal=${signal}`);
  });
  serverProcess.stdout?.on("data", (d) => log(`[next stdout] ${d}`.trim()));
  serverProcess.stderr?.on("data", (d) => log(`[next stderr] ${d}`.trim()));
}

async function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "StudBalance",
    autoHideMenuBar: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
    },
  });


  if (process.env.ELECTRON_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_DEV_SERVER_URL);
    return;
  }

  // Show something immediately - startup takes a few seconds (spawning the
  // server, waiting for the port to open), and a window that appears
  // instantly but shows a clear "starting up" message.
  mainWindow.loadURL(
    "data:text/html," +
      encodeURIComponent(`
      <html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#0f172a;color:#f1f5f9;">
        <p>Starting StudBalance...</p>
      </body></html>
    `)
  );

  startNextServer();

  try {
    await waitForServer(PORT);
  } catch (err) {
    log("Server never became ready:", err.message);
    dialog.showErrorBox(
      "StudBalance failed to start",
      `The background server didn't start in time.\n\nDetails: ${err.message}\n\nA log file has been saved to:\n${getLogPath()}\n\n`
    );
    app.quit();
    return;
  }

  mainWindow.loadURL(`http://localhost:${PORT}`);
}