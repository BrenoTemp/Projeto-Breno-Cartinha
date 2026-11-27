const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'cartas.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const revokedTokens = new Set();

const ALLOWED_SEALS = new Set([
  'vinho',
  'terracota',
  'salvia',
  'azul',
  'dourado',
  'lavanda'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

function generateRandomAdminPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += alphabet[bytes[i] % alphabet.length];
  }
  return `BRN-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function atomicWriteJson(filePath, data) {
  ensureDataDir();
  const tmpFile = `${filePath}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

function ensureAdminConfig() {
  ensureDataDir();
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length >= 4) {
    const envPass = process.env.ADMIN_PASSWORD.trim();
    if (!fs.existsSync(ADMIN_FILE)) {
      atomicWriteJson(ADMIN_FILE, {
        senhaHash: hashPassword(envPass),
        tokenSecret: crypto.randomBytes(32).toString('hex'),
        criadaEm: new Date().toISOString(),
        atualizadaEm: new Date().toISOString()
      });
    }
    return;
  }

  if (!fs.existsSync(ADMIN_FILE)) {
    const generated = generateRandomAdminPassword();
    const now = new Date().toISOString();
    atomicWriteJson(ADMIN_FILE, {
      senhaHash: hashPassword(generated),
      tokenSecret: crypto.randomBytes(32).toString('hex'),
      criadaEm: now,
      atualizadaEm: now
    });
    console.log('====================================================');
    console.log(`SENHA DE ADMIN GERADA: ${generated}`);
    console.log('Guarde esta senha! Somente o hash foi salvo em disco.');
    console.log('====================================================');
  }
}

function readAdminConfig() {
  ensureAdminConfig();
  const raw = fs.readFileSync(ADMIN_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.tokenSecret) {
    parsed.tokenSecret = crypto.randomBytes(32).toString('hex');
    atomicWriteJson(ADMIN_FILE, parsed);
  }
  return parsed;
}

function verifyAdminPassword(password) {
  if (typeof password !== 'string' || !password.trim()) return false;
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length >= 4) {
    const expected = Buffer.from(process.env.ADMIN_PASSWORD.trim());
    const received = Buffer.from(password.trim());
    if (expected.length === received.length && crypto.timingSafeEqual(expected, received)) {
      return true;
    }
  }
  const config = readAdminConfig();
  return verifyPassword(password.trim(), config.senhaHash);
}

function createAdminSession() {
  const { tokenSecret } = readAdminConfig();
  const payload = Buffer.from(
    JSON.stringify({
      exp: Date.now() + SESSION_TTL_MS,
      jti: crypto.randomBytes(8).toString('hex')
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(token) {
  if (typeof token !== 'string' || !token || revokedTokens.has(token)) {
    return false;
  }
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return false;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!payload || !sig) return false;

  const { tokenSecret } = readAdminConfig();
  const expectedSig = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function extractAdminToken(req, body = null) {
  const xHeader = req.headers['x-admin-token'];
  if (typeof xHeader === 'string' && xHeader.trim()) {
    return xHeader.trim();
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req);
  if (cookies.cartinhas_admin) {
    return cookies.cartinhas_admin;
  }
  if (body && typeof body.adminToken === 'string' && body.adminToken.trim()) {
    return body.adminToken.trim();
  }
  return '';
}

function isAdminAuthenticated(req, body = null) {
  const token = extractAdminToken(req, body);
  return verifyAdminToken(token);
}

function createInitialData() {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      nome: 'Exemplo — Melhor Amigo(a)',
      mensagem:
        'Se você está lendo isso, é porque a senha funcionou direitinho!\n\nEssa é uma cartinha de exemplo para mostrar como suas mensagens vão aparecer aqui no Cartinhas do Breno. Você pode escrever quantos parágrafos quiser, contar histórias, deixar lembranças ou agradecer pessoas especiais.\n\nPara editar, excluir este exemplo ou adicionar novas cartinhas, entre na aba Admin lá no topo usando sua senha de administrador.',
      assinatura: 'Com carinho, Breno',
      dica: 'A senha de teste é: amizade',
      selo: 'vinho',
      senhaHash: hashPassword('amizade'),
      criadaEm: now,
      atualizadaEm: now
    },
    {
      id: crypto.randomUUID(),
      nome: 'Exemplo — Família',
      mensagem:
        'Às vezes a correria do dia a dia passa tão rápido que a gente esquece de dizer o quanto certas pessoas são importantes.\n\nPor isso criei este cantinho: para que cada pessoa possa abrir sua própria carta com calma, no seu tempo, sabendo que cada palavra foi escrita pensando nela.\n\nObrigado por estar sempre por perto.',
      assinatura: 'Um abraço apertado, Breno',
      dica: 'A senha de teste é: carinho',
      selo: 'salvia',
      senhaHash: hashPassword('carinho'),
      criadaEm: now,
      atualizadaEm: now
    }
  ];
}

function ensureDataFile() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    const initial = createInitialData();
    saveLetters(initial);
  }
}

function readLetters() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Erro ao ler cartas.json:', err);
    return [];
  }
}

function saveLetters(letters) {
  atomicWriteJson(DATA_FILE, letters);
}

function toPublicSummary(letter) {
  return {
    id: letter.id,
    nome: letter.nome,
    dica: letter.dica || '',
    selo: ALLOWED_SEALS.has(letter.selo) ? letter.selo : 'vinho',
    criadaEm: letter.criadaEm,
    atualizadaEm: letter.atualizadaEm
  };
}

function toFullLetter(letter) {
  return {
    id: letter.id,
    nome: letter.nome,
    mensagem: letter.mensagem,
    assinatura: letter.assinatura || 'Com carinho, Breno',
    dica: letter.dica || '',
    selo: ALLOWED_SEALS.has(letter.selo) ? letter.selo : 'vinho',
    criadaEm: letter.criadaEm,
    atualizadaEm: letter.atualizadaEm
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function parseJsonBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Conteúdo muito grande.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(Object.assign(new Error('JSON inválido.'), { statusCode: 400 }));
          return;
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('JSON malformado.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function requireAdmin(req, res, body = null) {
  if (!isAdminAuthenticated(req, body)) {
    sendJson(res, 401, { erro: 'Acesso restrito ao administrador. Faça login na aba Admin.' });
    return false;
  }
  return true;
}

function sendJsonWithHeaders(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

async function handleApi(req, res, pathname) {
  const method = req.method.toUpperCase();

  // ========================
  // ROTAS PÚBLICAS
  // ========================

  // GET /api/cartas — lista pública de envelopes lacrados (sem texto nem senha)
  if (pathname === '/api/cartas' && method === 'GET') {
    const letters = readLetters();
    return sendJson(res, 200, {
      cartas: letters.map(toPublicSummary)
    });
  }

  // POST /api/cartas/:id/abrir — valida a senha individual de uma carta
  const openMatch = pathname.match(/^\/api\/cartas\/([^/]+)\/abrir$/);
  if (openMatch && method === 'POST') {
    const id = decodeURIComponent(openMatch[1]);
    const body = await parseJsonBody(req);
    const senha = typeof body.senha === 'string' ? body.senha.trim() : '';

    if (!senha) {
      return sendJson(res, 400, { erro: 'Digite a senha para abrir esta cartinha.' });
    }

    const letters = readLetters();
    const letter = letters.find((item) => item.id === id);
    if (!letter) {
      return sendJson(res, 404, { erro: 'Cartinha não encontrada.' });
    }

    if (!verifyPassword(senha, letter.senhaHash)) {
      return sendJson(res, 401, { erro: 'Senha incorreta. Tente novamente.' });
    }

    return sendJson(res, 200, {
      carta: toFullLetter(letter)
    });
  }

  // ========================
  // AUTENTICAÇÃO ADMIN
  // ========================

  // POST /api/admin/login
  if (pathname === '/api/admin/login' && method === 'POST') {
    const body = await parseJsonBody(req);
    const senha = typeof body.senha === 'string' ? body.senha.trim() : '';

    if (!senha) {
      return sendJson(res, 400, { erro: 'Informe a senha de administrador.' });
    }

    if (!verifyAdminPassword(senha)) {
      return sendJson(res, 401, { erro: 'Senha de administrador incorreta.' });
    }

    const token = createAdminSession();
    const letters = readLetters();
    const isHttps = req.headers['x-forwarded-proto'] === 'https';
    const cookieFlags = isHttps
      ? 'Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400'
      : 'Path=/; HttpOnly; SameSite=Lax; Max-Age=86400';

    return sendJsonWithHeaders(
      res,
      200,
      {
        ok: true,
        token,
        cartas: letters.map(toFullLetter)
      },
      {
        'Set-Cookie': `cartinhas_admin=${encodeURIComponent(token)}; ${cookieFlags}`
      }
    );
  }

  // POST /api/admin/logout
  if (pathname === '/api/admin/logout' && method === 'POST') {
    const body = await parseJsonBody(req);
    const token = extractAdminToken(req, body);
    if (token) revokedTokens.add(token);
    return sendJsonWithHeaders(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': 'cartinhas_admin=; Path=/; HttpOnly; Max-Age=0' }
    );
  }

  // GET /api/admin/me e POST /api/admin/sessao
  if (pathname === '/api/admin/me' && method === 'GET') {
    return sendJson(res, 200, { autenticado: isAdminAuthenticated(req) });
  }
  if (pathname === '/api/admin/sessao' && method === 'POST') {
    const body = await parseJsonBody(req);
    return sendJson(res, 200, { autenticado: isAdminAuthenticated(req, body) });
  }

  // POST /api/admin/senha — alterar senha do admin
  if (pathname === '/api/admin/senha' && method === 'POST') {
    const body = await parseJsonBody(req);
    if (!requireAdmin(req, res, body)) return;
    const senhaAtual = typeof body.senhaAtual === 'string' ? body.senhaAtual.trim() : '';
    const novaSenha = typeof body.novaSenha === 'string' ? body.novaSenha.trim() : '';

    if (!verifyAdminPassword(senhaAtual)) {
      return sendJson(res, 401, { erro: 'A senha atual do administrador está incorreta.' });
    }
    if (novaSenha.length < 6) {
      return sendJson(res, 400, { erro: 'A nova senha de administrador deve ter pelo menos 6 caracteres.' });
    }

    const config = readAdminConfig();
    atomicWriteJson(ADMIN_FILE, {
      ...config,
      senhaHash: hashPassword(novaSenha),
      atualizadaEm: new Date().toISOString()
    });

    return sendJson(res, 200, { ok: true });
  }

  // ========================
  // GESTÃO DE CARTAS (SOMENTE ADMIN)
  // ========================

  // GET /api/admin/cartas e POST /api/admin/cartas/listar
  if (pathname === '/api/admin/cartas' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const letters = readLetters();
    return sendJson(res, 200, {
      cartas: letters.map(toFullLetter)
    });
  }

  if (pathname === '/api/admin/cartas/listar' && method === 'POST') {
    const body = await parseJsonBody(req);
    if (!requireAdmin(req, res, body)) return;
    const letters = readLetters();
    return sendJson(res, 200, {
      cartas: letters.map(toFullLetter)
    });
  }

  // POST /api/admin/cartas — criar nova cartinha
  if (pathname === '/api/admin/cartas' && method === 'POST') {
    const body = await parseJsonBody(req);
    if (!requireAdmin(req, res, body)) return;
    const nome = sanitizeText(body.nome, 80);
    const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim().slice(0, 20000) : '';
    const senha = typeof body.senha === 'string' ? body.senha.trim() : '';
    const dica = sanitizeText(body.dica, 140);
    const assinatura = sanitizeText(body.assinatura, 80) || 'Com carinho, Breno';
    const selo = ALLOWED_SEALS.has(body.selo) ? body.selo : 'vinho';

    if (!nome) {
      return sendJson(res, 400, { erro: 'Informe o nome da pessoa que vai receber a cartinha.' });
    }
    if (!mensagem) {
      return sendJson(res, 400, { erro: 'Escreva a mensagem da cartinha antes de salvar.' });
    }
    if (senha.length < 3) {
      return sendJson(res, 400, { erro: 'A senha da cartinha precisa ter pelo menos 3 caracteres.' });
    }

    const now = new Date().toISOString();
    const newLetter = {
      id: crypto.randomUUID(),
      nome,
      mensagem,
      assinatura,
      dica,
      selo,
      senhaHash: hashPassword(senha),
      criadaEm: now,
      atualizadaEm: now
    };

    const letters = readLetters();
    letters.unshift(newLetter);
    saveLetters(letters);

    return sendJson(res, 201, {
      carta: toFullLetter(newLetter)
    });
  }

  // PUT & DELETE /api/admin/cartas/:id
  const adminItemMatch = pathname.match(/^\/api\/admin\/cartas\/([^/]+)$/);
  if (adminItemMatch && method === 'PUT') {
    const body = await parseJsonBody(req);
    if (!requireAdmin(req, res, body)) return;
    const id = decodeURIComponent(adminItemMatch[1]);

    const letters = readLetters();
    const index = letters.findIndex((item) => item.id === id);
    if (index === -1) {
      return sendJson(res, 404, { erro: 'Cartinha não encontrada.' });
    }

    const current = letters[index];
    const nome = sanitizeText(body.nome, 80);
    const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim().slice(0, 20000) : '';
    const dica = sanitizeText(body.dica, 140);
    const assinatura = sanitizeText(body.assinatura, 80) || 'Com carinho, Breno';
    const selo = ALLOWED_SEALS.has(body.selo) ? body.selo : current.selo;
    const novaSenha = typeof body.novaSenha === 'string' ? body.novaSenha.trim() : '';

    if (!nome) {
      return sendJson(res, 400, { erro: 'O nome não pode ficar vazio.' });
    }
    if (!mensagem) {
      return sendJson(res, 400, { erro: 'A mensagem não pode ficar vazia.' });
    }
    if (novaSenha && novaSenha.length < 3) {
      return sendJson(res, 400, { erro: 'A nova senha da cartinha precisa ter pelo menos 3 caracteres.' });
    }

    const updated = {
      ...current,
      nome,
      mensagem,
      dica,
      assinatura,
      selo,
      senhaHash: novaSenha ? hashPassword(novaSenha) : current.senhaHash,
      atualizadaEm: new Date().toISOString()
    };

    letters[index] = updated;
    saveLetters(letters);

    return sendJson(res, 200, {
      carta: toFullLetter(updated)
    });
  }

  if (adminItemMatch && method === 'DELETE') {
    const body = await parseJsonBody(req);
    if (!requireAdmin(req, res, body)) return;
    const id = decodeURIComponent(adminItemMatch[1]);

    const letters = readLetters();
    const index = letters.findIndex((item) => item.id === id);
    if (index === -1) {
      return sendJson(res, 404, { erro: 'Cartinha não encontrada.' });
    }

    letters.splice(index, 1);
    saveLetters(letters);

    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { erro: 'Rota da API não encontrada.' });
}

function serveStatic(req, res, pathname) {
  let relPath = pathname === '/' ? '/index.html' : pathname;
  try {
    relPath = decodeURIComponent(relPath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Requisição inválida');
    return;
  }

  const normalized = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso negado');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Erro interno ao carregar arquivo.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    res.end(content);
  });
}

ensureAdminConfig();
ensureDataFile();

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error('Erro na requisição:', err);
    const status = err.statusCode || 500;
    sendJson(res, status, {
      erro: err.message || 'Erro interno no servidor.'
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Cartinhas do Breno rodando em http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
