// Live-preview server for the design mockups in docs/.
// Serves docs/ at http://localhost:8787 and injects a polling auto-reload
// snippet into HTML responses so the browser refreshes itself whenever a
// mockup file changes on disk (true live preview while iterating).
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'docs');
const PORT = Number(process.env.PORT) || 8787;
const DEFAULT_FILE = 'design/mockups/instrument-ledger-dark-only.html';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const RELOAD_SNIPPET = `
<script>
(function () {
  var last = null;
  setInterval(function () {
    fetch(location.href, { method: 'HEAD' })
      .then(function (res) {
        var lm = res.headers.get('Last-Modified');
        if (last === null) last = lm;
        else if (lm !== last) location.reload();
      })
      .catch(function () {});
  }, 1000);
})();
</script>
`;

const server = http.createServer(function (req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (rel === '/' || rel === '') rel = '/' + DEFAULT_FILE;
  const file = path.resolve(path.join(DIR, rel));
  if (file !== DIR && !file.startsWith(DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const headers = {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Last-Modified': st.mtime.toUTCString(),
      'Cache-Control': 'no-store'
    };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    fs.readFile(file, function (err2, data) {
      if (err2) {
        res.writeHead(500);
        res.end('Read error');
        return;
      }
      res.writeHead(200, headers);
      if (path.extname(file).toLowerCase() === '.html') {
        res.end(data.toString('utf8').replace('</body>', RELOAD_SNIPPET + '</body>'));
      } else {
        res.end(data);
      }
    });
  });
});

server.listen(PORT, function () {
  console.log('preview server: http://localhost:' + PORT + '/ (serving ' + DIR + ')');
});
