const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const OWNER_USERNAME = process.env.DARK_CUPID_OWNER_USER || 'dono_darkcupid';
const OWNER_PASSWORD = process.env.DARK_CUPID_OWNER_PASSWORD || 'DarkCupidDono#2026';

const SECRET = process.env.JWT_SECRET || 'dark-cupid-change-this-secret';

const DATA = path.join(__dirname, 'data');
const DBFILE = path.join(DATA, 'db.json');
const UP = path.join(__dirname, 'uploads');

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UP, { recursive: true });

const emptyDb = {
    users: [],
    connections: [],
    messages: [],
    posts: [],
    blocks: [],
    reports: [],
    moderation: []
};

if (!fs.existsSync(DBFILE)) {
    fs.writeFileSync(DBFILE, JSON.stringify(emptyDb, null, 2));
}

function db() {
    const d = JSON.parse(fs.readFileSync(DBFILE, 'utf8'));
    for (const key of Object.keys(emptyDb)) {
        if (!Array.isArray(d[key])) d[key] = [];
    }
    return d;
}

const save = (x) => fs.writeFileSync(DBFILE, JSON.stringify(x, null, 2));

const id = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const safe = (u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio || '',
    photo: u.photo || '',
    createdAt: u.createdAt,
    privacy: {
        profileVisibility: u.privacy?.profileVisibility || 'public',
        allowMessages: u.privacy?.allowMessages || 'connections'
    }
});

function isBlocked(d, a, b) {
    return d.blocks.some(
        x => (x.from === a && x.to === b) || (x.from === b && x.to === a)
    );
}

function areConnected(d, a, b) {
    return d.connections.some(
        c =>
            c.status === 'accepted' &&
            ((c.from === a && c.to === b) || (c.from === b && c.to === a))
    );
}

function canMessage(d, from, to) {
    if (isBlocked(d, from, to)) return false;
    const target = d.users.find(u => u.id === to);
    if (!target) return false;
    const setting = target.privacy?.allowMessages || 'connections';
    return setting === 'everyone' || (setting === 'connections' && areConnected(d, from, to));
}

function auth(req, res, next) {
    try {
        const t = (req.headers.authorization || '').replace('Bearer ', '');
        const p = jwt.verify(t, SECRET);
        const d = db();
        const u = d.users.find(x => x.id === p.id);
        if (!u) throw new Error();
        req.user = u;
        next();
    } catch {
        res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
    }
}

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UP));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
    destination: UP,
    filename: (req, file, cb) =>
        cb(null, id() + path.extname(file.originalname).toLowerCase())
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Apenas imagens são permitidas.'));
    }
});


app.post('/api/owner/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (username !== OWNER_USERNAME || password !== OWNER_PASSWORD) {
    return res.status(401).json({ error: 'Usuário ou senha do dono inválidos.' });
  }
  const token = jwt.sign({ owner: true, username: OWNER_USERNAME }, SECRET, { expiresIn: '7d' });
  res.json({ token, owner: true, username: OWNER_USERNAME });
});

function ownerAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    const payload = jwt.verify(t, SECRET);
    if (!payload.owner) return res.status(403).json({ error: 'Acesso restrito ao dono.' });
    req.owner = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão do dono inválida.' });
  }
}

app.post('/api/register', async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.displayName || username).trim().slice(0, 30);
    const ageConfirmed = req.body.ageConfirmed === true;

    if (!ageConfirmed) {
        return res.status(400).json({
            error: 'Este aplicativo é destinado somente a pessoas com 18 anos ou mais.'
        });
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({
            error: 'Usuário: 3–20 caracteres, letras, números e _.'
        });
    }
    if (password.length < 6) {
        return res.status(400).json({
            error: 'A senha precisa ter pelo menos 6 caracteres.'
        });
    }

    const d = db();
    if (d.users.some(u => u.username === username)) {
        return res.status(409).json({ error: 'Esse usuário já existe.' });
    }

    const u = {
        id: id(),
        username,
        passwordHash: await bcrypt.hash(password, 12),
        displayName: name || username,
        bio: '',
        photo: '',
        ageConfirmed: true,
        privacy: { profileVisibility: 'public', allowMessages: 'connections' },
        createdAt: new Date().toISOString()
    };

    d.users.push(u);
    save(d);

    res.json({ token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }), user: safe(u) });
});

app.post('/api/login', async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const d = db();
    const u = d.users.find(x => x.username === username);

    if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    if (u.ownerBlockedUntil && new Date(u.ownerBlockedUntil).getTime() > Date.now()) {
      return res.status(403).json({ error: 'Esta conta está bloqueada temporariamente pelo dono.' });
    }
    const loginToken = jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
    res.json({
        token: loginToken,
        user: safe(u),
        needsAgeConfirmation: u.ageConfirmed !== true
    });
});

app.post('/api/age-confirmation', auth, (req, res) => {
    if (req.body.confirmed !== true) {
        return res.status(400).json({ error: 'A confirmação é necessária.' });
    }
    const d = db();
    const u = d.users.find(x => x.id === req.user.id);
    u.ageConfirmed = true;
    if (!u.privacy) u.privacy = { profileVisibility: 'public', allowMessages: 'connections' };
    save(d);
    res.json({ user: safe(u) });
});


function isUserBlocked(userId) {
  const now = Date.now();
  return db.blocks.some(b =>
    (b.blockedId === userId || b.blockerId === userId) &&
    (!b.expiresAt || new Date(b.expiresAt).getTime() > now)
  );
}

app.get('/api/me', auth, (req, res) => res.json({ user: { ...safe(req.user), ageConfirmed: req.user.ageConfirmed === true } }));

app.put('/api/profile', auth, (req, res) => {
    const d = db();
    const u = d.users.find(x => x.id === req.user.id);
    u.displayName = String(req.body.displayName || u.username).trim().slice(0, 30) || u.username;
    u.bio = String(req.body.bio || '').trim().slice(0, 180);
    save(d);
    res.json({ user: safe(u) });
});

app.put('/api/privacy', auth, (req, res) => {
    const profileVisibility = ['public', 'connections', 'private'].includes(req.body.profileVisibility)
        ? req.body.profileVisibility : 'public';
    const allowMessages = ['everyone', 'connections'].includes(req.body.allowMessages)
        ? req.body.allowMessages : 'connections';

    const d = db();
    const u = d.users.find(x => x.id === req.user.id);
    u.privacy = { profileVisibility, allowMessages };
    save(d);
    res.json({ user: safe(u) });
});

app.post('/api/profile/photo', auth, upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem.' });

    const d = db();
    const u = d.users.find(x => x.id === req.user.id);
    if (u.photo) {
        const old = path.join(__dirname, u.photo.replace('/uploads/', 'uploads/'));
        if (old.startsWith(UP) && fs.existsSync(old)) {
            try { fs.unlinkSync(old); } catch {}
        }
    }
    u.photo = '/uploads/' + req.file.filename;
    save(d);
    res.json({ user: safe(u) });
});

app.get('/api/people', auth, (req, res) => {
    const d = db();
    const users = d.users
        .filter(u => u.id !== req.user.id)
        .filter(u => !isBlocked(d, req.user.id, u.id))
        .filter(u => (u.privacy?.profileVisibility || 'public') !== 'private')
        .map(u => safe(u));
    res.json({ users });
});

app.post('/api/connections/:uid', auth, (req, res) => {
    const to = String(req.params.uid);
    const d = db();

    if (to === req.user.id) return res.status(400).json({ error: 'Você não pode conectar consigo mesmo.' });
    if (!d.users.some(u => u.id === to)) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (isBlocked(d, req.user.id, to)) return res.status(403).json({ error: 'Essa pessoa está bloqueada.' });
    if (d.connections.some(c =>
        (c.from === req.user.id && c.to === to) ||
        (c.from === to && c.to === req.user.id)
    )) return res.status(409).json({ error: 'Essa conexão já existe.' });

    const c = { id: id(), from: req.user.id, to, status: 'accepted', createdAt: new Date().toISOString() };
    d.connections.push(c);
    save(d);
    io.to('user:' + to).emit('connection:new', { user: safe(req.user) });
    res.json({ connection: c });
});

app.get('/api/posts', auth, (req, res) => {
    const d = db();
    res.json({
        posts: d.posts.slice().reverse().filter(p => !isBlocked(d, req.user.id, p.userId)).map(p => ({
            ...p,
            user: safe(d.users.find(u => u.id === p.userId) || { username: 'usuário', displayName: 'Usuário' })
        }))
    });
});

app.post('/api/posts', auth, upload.single('photo'), (req, res) => {
    const text = String(req.body.text || '').trim().slice(0, 500);
    if (!text && !req.file) return res.status(400).json({ error: 'Escreva algo ou escolha uma foto.' });

    const d = db();
    const p = {
        id: id(),
        userId: req.user.id,
        text,
        photo: req.file ? '/uploads/' + req.file.filename : '',
        createdAt: new Date().toISOString()
    };
    d.posts.push(p);
    save(d);
    res.json({ post: { ...p, user: safe(req.user) } });
});

app.get('/api/messages/:uid', auth, (req, res) => {
    const to = String(req.params.uid);
    const d = db();
    if (!d.users.some(u => u.id === to)) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (isBlocked(d, req.user.id, to)) return res.status(403).json({ error: 'Conversa indisponível porque existe um bloqueio.' });
    if (!canMessage(d, req.user.id, to)) return res.status(403).json({ error: 'Essa pessoa só recebe mensagens de conexões.' });

    const messages = d.messages.filter(m =>
        ((m.from === req.user.id && m.to === to) || (m.from === to && m.to === req.user.id)) &&
        m.moderation?.status !== 'removed'
    ).slice(-100);
    res.json({ messages });
});

app.post('/api/messages/:uid', auth, upload.single('image'), (req, res) => {
    const to = String(req.params.uid);
    const text = String(req.body.text || '').trim().slice(0, 1000);
    const d = db();

    if (to === req.user.id) return res.status(400).json({ error: 'Você não pode enviar mensagem para si mesmo.' });
    if (!d.users.some(u => u.id === to)) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (isBlocked(d, req.user.id, to)) return res.status(403).json({ error: 'Não é possível conversar com uma pessoa bloqueada.' });
    if (!canMessage(d, req.user.id, to)) return res.status(403).json({ error: 'Essa pessoa só recebe mensagens de conexões.' });
    if (!text && !req.file) return res.status(400).json({ error: 'Escreva uma mensagem ou escolha uma imagem.' });

    const m = {
        id: id(),
        from: req.user.id,
        to,
        text,
        image: req.file ? '/uploads/' + req.file.filename : '',
        createdAt: new Date().toISOString(),
        moderation: { status: 'approved', reports: 0 }
    };

    d.messages.push(m);
    save(d);

    io.to('user:' + to).emit('message:new', m);
    io.to('user:' + req.user.id).emit('message:sent', m);
    res.json({ message: m });
});

app.post('/api/blocks/:uid', auth, (req, res) => {
    const to = String(req.params.uid);
    const d = db();
    if (to === req.user.id) return res.status(400).json({ error: 'Você não pode bloquear a si mesmo.' });
    if (!d.users.some(u => u.id === to)) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!d.blocks.some(b => b.from === req.user.id && b.to === to)) {
        d.blocks.push({ id: id(), from: req.user.id, to, createdAt: new Date().toISOString() });
        save(d);
    }
    io.to('user:' + to).emit('user:blocked', { by: req.user.id });
    res.json({ ok: true });
});

app.delete('/api/blocks/:uid', auth, (req, res) => {
    const to = String(req.params.uid);
    const d = db();
    d.blocks = d.blocks.filter(b => !(b.from === req.user.id && b.to === to));
    save(d);
    res.json({ ok: true });
});

app.get('/api/blocks', auth, (req, res) => {
    const d = db();
    const ids = d.blocks.filter(b => b.from === req.user.id).map(b => b.to);
    res.json({
        users: d.users.filter(u => ids.includes(u.id)).map(safe)
    });
});

app.post('/api/reports', auth, (req, res) => {
    const targetUserId = String(req.body.targetUserId || '');
    const messageId = req.body.messageId ? String(req.body.messageId) : '';
    const reason = String(req.body.reason || '').trim().slice(0, 80);
    const details = String(req.body.details || '').trim().slice(0, 500);

    const d = db();
    if (!targetUserId || targetUserId === req.user.id || !d.users.some(u => u.id === targetUserId)) {
        return res.status(400).json({ error: 'Pessoa denunciada inválida.' });
    }
    if (!reason) return res.status(400).json({ error: 'Escolha um motivo para a denúncia.' });

    const r = {
        id: id(),
        reporterId: req.user.id,
        targetUserId,
        messageId,
        reason,
        details,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    d.reports.push(r);

    if (messageId) {
        const m = d.messages.find(x => x.id === messageId);
        if (m && (m.from === targetUserId || m.to === targetUserId)) {
            m.moderation = m.moderation || { status: 'approved', reports: 0 };
            m.moderation.reports = Number(m.moderation.reports || 0) + 1;
            if (m.moderation.reports >= 2) m.moderation.status = 'removed';
        }
    }

    d.moderation.push({
        id: id(),
        type: messageId ? 'message_report' : 'user_report',
        reportId: r.id,
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    save(d);
    res.json({ report: { id: r.id, status: r.status } });
});

app.get('/api/safety/status/:uid', auth, (req, res) => {
    const uid = String(req.params.uid);
    const d = db();
    res.json({
        blocked: isBlocked(d, req.user.id, uid),
        connected: areConnected(d, req.user.id, uid),
        canMessage: canMessage(d, req.user.id, uid)
    });
});

io.use((s, next) => {
    try {
        const p = jwt.verify(s.handshake.auth?.token, SECRET);
        const d = db();
        const u = d.users.find(x => x.id === p.id);
        if (!u || u.ageConfirmed !== true) throw new Error();
        s.user = safe(u);
        next();
    } catch {
        next(new Error('Não autorizado'));
    }
});

io.on('connection', s => {
    s.join('user:' + s.user.id);
});

app.use((err, req, res, next) => {
    res.status(400).json({ error: err.message || 'Erro.' });
});

app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log('💘 Dark Cupid em http://localhost:' + PORT);
});


app.get('/api/owner/reports', ownerAuth, (req, res) => {
  const reports = db.reports.map(r => ({
    ...r,
    reporter: safe(db.users.find(u => u.id === r.reporterId)),
    reported: safe(db.users.find(u => u.reportedId === r.reportedId))
  })).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reports });
});

app.post('/api/reports/:uid', auth, (req, res) => {
  const reported = db.users.find(u => u.id === req.params.uid);
  if (!reported || reported.id === req.user.id) return res.status(400).json({ error: 'Usuário inválido.' });
  const reason = String(req.body?.reason || 'Outro').trim().slice(0, 200);
  db.reports.push({
    id: crypto.randomBytes(8).toString('hex'),
    reporterId: req.user.id,
    reportedId: reported.id,
    reason: reason || 'Outro',
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  save(db);
  res.json({ ok: true });
});

app.post('/api/owner/users/:uid/delete', ownerAuth, (req, res) => {
  const uid = req.params.uid;
  const idx = db.users.findIndex(u => u.id === uid);
  if (idx < 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
  db.users.splice(idx, 1);
  db.connections = db.connections.filter(c => c.from !== uid && c.to !== uid);
  db.messages = db.messages.filter(m => m.from !== uid && m.to !== uid);
  db.posts = db.posts.filter(p => p.userId !== uid);
  db.reports = db.reports.filter(r => r.reporterId !== uid && r.reportedId !== uid);
  db.blocks = db.blocks.filter(b => b.blockerId !== uid && b.blockedId !== uid);
  db.moderationActions.push({
    id: crypto.randomBytes(8).toString('hex'),
    action: 'delete_user',
    targetUserId: uid,
    createdAt: new Date().toISOString()
  });
  save(db);
  res.json({ ok: true });
});

app.post('/api/owner/users/:uid/block', ownerAuth, (req, res) => {
  const uid = req.params.uid;
  const user = db.users.find(u => u.id === uid);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const days = 7;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  db.blocks = db.blocks.filter(b => !(b.blockerId === 'OWNER' && b.blockedId === uid));
  db.blocks.push({
    id: crypto.randomBytes(8).toString('hex'),
    blockerId: 'OWNER',
    blockedId: uid,
    expiresAt,
    reason: 'Bloqueio de 7 dias pelo dono',
    createdAt: new Date().toISOString()
  });
  user.ownerBlockedUntil = expiresAt;
  db.moderationActions.push({
    id: crypto.randomBytes(8).toString('hex'),
    action: 'block_7_days',
    targetUserId: uid,
    expiresAt,
    createdAt: new Date().toISOString()
  });
  save(db);
  res.json({ ok: true, expiresAt });
});
