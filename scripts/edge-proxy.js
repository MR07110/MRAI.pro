// ngrok static domen uchun yagona kirish:
//   /mcp va /health      -> cmc (7777)
//   /pyserver/*          -> Python server (8080), "/pyserver" prefiksi olib tashlanadi (Vercel MRAI_SERVER_URL uchun)
//   qolgani              -> mrai-web (3000)
const http = require("http");
const net = require("net");
const PORT = +process.env.EDGE_PORT || 7780;
const CMC = { host: "127.0.0.1", port: 7777 };
const WEB = { host: "127.0.0.1", port: 3000 };
const PY = { host: "127.0.0.1", port: 8080 };

function route(url) {
  if (/^\/pyserver(\/|\?|$)/.test(url)) {
    let p = url.slice("/pyserver".length);
    if (!p.startsWith("/")) p = "/" + p;
    return { t: PY, path: p };
  }
  if (/^\/(mcp|health)(\/|\?|$)/.test(url)) return { t: CMC, path: url };
  return { t: WEB, path: url };
}

const server = http.createServer((req, res) => {
  const { t, path } = route(req.url);
  const up = http.request(
    { ...t, method: req.method, path, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    }
  );
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("upstream xato");
  });
  res.on("close", () => up.destroy());
  req.pipe(up);
});

server.on("upgrade", (req, socket, head) => {
  const { t, path } = route(req.url);
  const s = net.connect(t.port, t.host, () => {
    let raw = `${req.method} ${path} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    s.write(raw + "\r\n");
    if (head && head.length) s.write(head);
    socket.pipe(s).pipe(socket);
  });
  s.on("error", () => socket.destroy());
  socket.on("error", () => s.destroy());
});

server.listen(PORT, "127.0.0.1", () => console.log("edge-proxy :" + PORT));
