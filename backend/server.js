import express from 'express';
import cors from 'cors';
import db from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// SSE clients per userId
const sseClients = new Map(); // userId -> Set(res)

function sendSse(userId, event) {
  const set = sseClients.get(String(userId));
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(event);
  for (const res of set) {
    res.write(`data: ${payload}\n\n`);
  }
}

// --- Helper: create notification and push to SSE ---
function createNotification({ userId, type, actorId = null, objectType = null, objectId = null, content = '' }) {
  const stmt = db.prepare(`
    INSERT INTO notifications (user_id, type, actor_id, object_type, object_id, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(userId, type, actorId, objectType, objectId, content);
  const row = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(info.lastInsertRowid);
  // push to SSE
  sendSse(userId, { kind: 'notification', data: row });
  return row;
}

// ---- Users ----
app.post('/users', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db.prepare(`INSERT INTO users (name) VALUES (?)`).run(name);
    res.json(db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/users', (req, res) => {
  const users = db.prepare(`SELECT * FROM users ORDER BY id`).all();
  res.json(users);
});

// ---- Follow ----
app.post('/follow', (req, res) => {
  const { followerId, followeeId } = req.body || {};
  if (!followerId || !followeeId) return res.status(400).json({ error: 'followerId and followeeId are required' });
  try {
    db.prepare(`INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)`).run(followerId, followeeId);
    // Notify followee that they have a new follower
    const follower = db.prepare(`SELECT * FROM users WHERE id = ?`).get(followerId);
    createNotification({
      userId: followeeId,
      type: 'new_follower',
      actorId: followerId,
      objectType: 'user',
      objectId: followerId,
      content: `${follower?.name || 'Someone'} started following you`,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- Posts ----
app.post('/posts', (req, res) => {
  const { userId, content } = req.body || {};
  if (!userId || !content) return res.status(400).json({ error: 'userId and content are required' });

  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO posts (user_id, content) VALUES (?, ?)`).run(userId, content);
    const postId = info.lastInsertRowid;
    const author = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
    const followers = db.prepare(`SELECT follower_id FROM follows WHERE followee_id = ?`).all(userId);

    for (const f of followers) {
      createNotification({
        userId: f.follower_id,
        type: 'new_post',
        actorId: userId,
        objectType: 'post',
        objectId: postId,
        content: `${author?.name || 'Someone'} posted: ${content.slice(0, 60)}`,
      });
    }
    return postId;
  });

  try {
    const postId = tx();
    res.json(db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- Manual/test notification ----
app.post('/notify/test', (req, res) => {
  const { userId, type = 'test', actorId = null, objectType = null, objectId = null, content = 'Hello from test' } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const row = createNotification({ userId, type, actorId, objectType, objectId, content });
  res.json(row);
});

// ---- Notifications ----
app.get('/notifications', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const rows = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `).all(userId);
  res.json(rows);
});

app.post('/notifications/:id/read', (req, res) => {
  const id = req.params.id;
  const info = db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(id);
  res.json({ ok: true, changes: info.changes });
});

// ---- SSE stream ----
app.get('/stream/notifications', (req, res) => {
  const userId = String(req.query.userId || '');
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Register client
  let set = sseClients.get(userId);
  if (!set) {
    set = new Set();
    sseClients.set(userId, set);
  }
  set.add(res);

  // Heartbeat
  const hb = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(hb);
    set.delete(res);
    if (set.size === 0) sseClients.delete(userId);
  });
});

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'insyd-notify-backend' });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
