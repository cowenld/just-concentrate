import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3210;
const ROOT = join(__dirname, '..');
const BUILD_DIR = join(ROOT, '.output', 'chrome-mv3');
const SCRIPTS_DIR = __dirname;

if (!existsSync(join(BUILD_DIR, 'popup.html'))) {
  console.log('Building extension...');
  execSync('pnpm build', { cwd: ROOT, stdio: 'inherit' });
}

const MOCK_CHROME = readFileSync(join(SCRIPTS_DIR, 'mock-chrome.js'), 'utf8');
const INJECT_TAG = `<script>${MOCK_CHROME}<\/script>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath;

  if (url.pathname === '/' || url.pathname === '/preview-all.html') {
    filePath = join(SCRIPTS_DIR, 'preview-all.html');
  } else {
    filePath = join(BUILD_DIR, url.pathname);
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  let content = readFileSync(filePath);

  if (ext === '.html' && filePath.startsWith(BUILD_DIR)) {
    let html = content.toString();
    html = html.replace(/<script/, INJECT_TAG + '\n  <script');
    content = html;
  }

  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
});

server.listen(PORT, () => {
  console.log(`\nPreview server running at http://localhost:${PORT}\n`);
  try {
    execSync(`open http://localhost:${PORT}`, { stdio: 'ignore' });
  } catch {}
});
