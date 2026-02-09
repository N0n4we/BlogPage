import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'comments.db');

let db;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_post_id_created ON comments(post_id, created_at DESC)`);
  saveDb();
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function getCommentsByPostId(postId) {
  const stmt = db.prepare(
    'SELECT id, nickname, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at DESC'
  );
  stmt.bind([postId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function createComment(postId, nickname, content) {
  const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  db.run(
    'INSERT INTO comments (post_id, nickname, content, created_at) VALUES (?, ?, ?, ?)',
    [postId, nickname, content, createdAt]
  );
  saveDb();

  const stmt = db.prepare('SELECT id FROM comments WHERE post_id = ? AND nickname = ? AND created_at = ?');
  stmt.bind([postId, nickname, createdAt]);
  let id = null;
  if (stmt.step()) {
    id = stmt.getAsObject().id;
  }
  stmt.free();

  return { id, nickname, content, created_at: createdAt };
}

export { initDb, getCommentsByPostId, createComment };
