const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// .env 파일 로드 (간이 구현, dotenv 미사용)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';

// 확장자별 Content-Type 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // /api/config 엔드포인트: 클라이언트에 환경변수 전달
  if (req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    }));
    return;
  }

  // URL에서 쿼리스트링/해시 제거
  let filePath = req.url.split('?')[0].split('#')[0];

  // '/'이면 index.html로
  if (filePath === '/') {
    filePath = '/index.html';
  }

  // Path Traversal 방어: 디코딩 후 정규화된 경로가 __dirname 내에 있는지 검증
  const decodedPath = decodeURIComponent(filePath);
  const fullPath = path.resolve(__dirname, '.' + decodedPath);

  if (!fullPath.startsWith(path.resolve(__dirname))) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>403 - Forbidden</h1>');
    return;
  }

  // .env 파일 접근 차단
  const basename = path.basename(fullPath);
  if (basename.startsWith('.env')) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>403 - Forbidden</h1>');
    return;
  }

  const ext = path.extname(fullPath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - 페이지를 찾을 수 없습니다</h1>');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.warn('[경고] SUPABASE_URL 또는 SUPABASE_PUBLISHABLE_KEY가 설정되지 않았습니다.');
    console.warn('.env 파일을 생성하거나 환경변수를 설정해주세요. (.env.example 참고)');
  }
  console.log(`서버가 실행되었습니다: http://localhost:${PORT}`);
  console.log(`설정 가이드: http://localhost:${PORT}/setup-guide.html`);
});
