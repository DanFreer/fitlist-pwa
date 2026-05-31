require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const PORT = process.env.PORT || 4173;
const JWT_SECRET = process.env.JWT_SECRET || 'fitlist-secret';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://fitlist:fitlist@localhost:5432/fitlist';

const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function createToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kids (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT,
      age TEXT,
      emoji TEXT,
      color TEXT,
      photo TEXT,
      style TEXT,
      sizes JSONB DEFAULT '{}'::jsonb
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_kids_user_id ON kids(user_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gifts (
      id TEXT PRIMARY KEY,
      kid_id TEXT NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      text TEXT,
      urgent BOOLEAN DEFAULT FALSE,
      claimed_by TEXT
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_kid_id ON gifts(kid_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buys (
      id TEXT PRIMARY KEY,
      kid_id TEXT NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      text TEXT,
      date TEXT
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_buys_kid_id ON buys(kid_id);
  `);
}

async function getUserFromToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT id, username, display_name FROM users WHERE id = $1', [payload.userId]);
    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const token = authHeader.slice(7);
  getUserFromToken(token).then(user => {
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Invalid token' }));
}

app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    const name = displayName && displayName.trim() ? displayName.trim() : username.trim();
    const result = await pool.query(
      'INSERT INTO users(username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name',
      [username.trim(), hashed, name]
    );
    const token = createToken(result.rows[0]);
    return res.json({ token, username: result.rows[0].username, displayName: result.rows[0].display_name });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Unable to register' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const result = await pool.query('SELECT id, username, password_hash, display_name FROM users WHERE username = $1', [username.trim()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = createToken(user);
    return res.json({ token, username: user.username, displayName: user.display_name });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to login' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  return res.json({ username: req.user.username, displayName: req.user.display_name });
});

app.get('/api/sync', authMiddleware, async (req, res) => {
  try {
    const kidsRes = await pool.query('SELECT id, name, age, emoji, color, photo, style, sizes FROM kids WHERE user_id = $1 ORDER BY name', [req.user.id]);
    const kidIds = kidsRes.rows.map(k => k.id);
    const giftsRes = await pool.query('SELECT id, kid_id, text, urgent, claimed_by FROM gifts WHERE kid_id = ANY($1)', [kidIds.length ? kidIds : ['']]);
    const buysRes = await pool.query('SELECT id, kid_id, text, date FROM buys WHERE kid_id = ANY($1)', [kidIds.length ? kidIds : ['']]);

    const giftsByKid = {};
    giftsRes.rows.forEach(g => {
      giftsByKid[g.kid_id] = giftsByKid[g.kid_id] || [];
      giftsByKid[g.kid_id].push(g);
    });
    const buysByKid = {};
    buysRes.rows.forEach(b => {
      buysByKid[b.kid_id] = buysByKid[b.kid_id] || [];
      buysByKid[b.kid_id].push(b);
    });

    const kids = kidsRes.rows.map(k => ({
      id: k.id,
      name: k.name,
      age: k.age,
      emoji: k.emoji,
      color: k.color,
      photo: k.photo,
      style: k.style,
      sizes: k.sizes || {},
      gifts: giftsByKid[k.id] || [],
      buys: buysByKid[k.id] || []
    }));
    return res.json({ kids });
  } catch (error) {
    console.error('Sync error', error);
    return res.status(500).json({ error: 'Unable to sync data' });
  }
});

app.post('/api/sync', authMiddleware, async (req, res) => {
  const { kids = [] } = req.body || {};
  if (!Array.isArray(kids)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM buys WHERE kid_id IN (SELECT id FROM kids WHERE user_id = $1)', [req.user.id]);
    await client.query('DELETE FROM gifts WHERE kid_id IN (SELECT id FROM kids WHERE user_id = $1)', [req.user.id]);
    await client.query('DELETE FROM kids WHERE user_id = $1', [req.user.id]);

    for (const kid of kids) {
      await client.query(
        `INSERT INTO kids(id, user_id, name, age, emoji, color, photo, style, sizes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [kid.id, req.user.id, kid.name || '', kid.age || '', kid.emoji || '', kid.color || '', kid.photo || null, kid.style || '', kid.sizes || {}]
      );
      if (Array.isArray(kid.gifts)) {
        for (const gift of kid.gifts) {
          await client.query(
            'INSERT INTO gifts(id, kid_id, text, urgent, claimed_by) VALUES ($1, $2, $3, $4, $5)',
            [gift.id, kid.id, gift.text || '', gift.urgent || false, gift.claimedBy || null]
          );
        }
      }
      if (Array.isArray(kid.buys)) {
        for (const buy of kid.buys) {
          await client.query(
            'INSERT INTO buys(id, kid_id, text, date) VALUES ($1, $2, $3, $4)',
            [buy.id, kid.id, buy.text || '', buy.date || '']
          );
        }
      }
    }
    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync save error', error);
    return res.status(500).json({ error: 'Unable to save data' });
  } finally {
    client.release();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Fit List backend running on http://localhost:${PORT}`);
  });
}).catch(error => {
  console.error('Failed to initialize database', error);
  process.exit(1);
});
