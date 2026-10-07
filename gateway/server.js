// One port for everything the browser opens:
//   http://localhost:3000/         -> storefront (apps/website)
//   http://localhost:3000/admin    -> admin dashboard (apps/dashboard)
//
// npm run dev    both apps run as dev servers on internal ports and this only routes
// npm start      the dashboard is served straight from its production build (--static)
const fs = require("fs");
const http = require("http");
const path = require("path");
const httpProxy = require("http-proxy");

const PORT = process.env.PORT || 3000;
const DASHBOARD_PATH = "/admin"; // must match "homepage" in apps/dashboard/package.json
const WEBSITE = "http://127.0.0.1:3002";
const DASHBOARD = "http://127.0.0.1:3001";
const DASHBOARD_BUILD = path.join(__dirname, "..", "apps", "dashboard", "build");
const serveBuild = process.argv.includes("--static");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
};

const proxy = httpProxy.createProxyServer({});

proxy.on("error", (err, req, res) => {
  if (!res.writeHead) return res.destroy(); // websocket
  res.writeHead(502, { "Content-Type": "text/plain" });
  res.end("This app is still starting. Refresh in a few seconds.");
});

const isDashboard = (url) =>
  url === DASHBOARD_PATH || url.startsWith(DASHBOARD_PATH + "/") || url.startsWith(DASHBOARD_PATH + "?");

// static files from the dashboard build; any other path is a client-side route -> index.html
const sendDashboardFile = (req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]).slice(DASHBOARD_PATH.length);
  let file = path.join(DASHBOARD_BUILD, urlPath);
  if (!file.startsWith(DASHBOARD_BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DASHBOARD_BUILD, "index.html");
  }
  const isIndex = file.endsWith("index.html");
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": isIndex ? "no-cache" : "public, max-age=3600",
  });
  fs.createReadStream(file).pipe(res);
};

http
  .createServer((req, res) => {
    if (!isDashboard(req.url)) return proxy.web(req, res, { target: WEBSITE });
    if (serveBuild) return sendDashboardFile(req, res);
    proxy.web(req, res, { target: DASHBOARD });
  })
  // only the dashboard dev server uses websockets (hot reload)
  .on("upgrade", (req, socket, head) => (serveBuild ? socket.destroy() : proxy.ws(req, socket, head, { target: DASHBOARD })))
  .listen(PORT, () => {
    console.log(`website    http://localhost:${PORT}`);
    console.log(`dashboard  http://localhost:${PORT}${DASHBOARD_PATH}`);
  });
