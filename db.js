const { Pool } = require('pg');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');

let pgPool = null;
let sqlDb = null;

async function getDb() {
  if (pgPool) return pgPool;
  if (sqlDb) return sqlDb;

  if (process.env.DATABASE_URL) {
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const client = await pgPool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        verification_code TEXT,
        goal REAL DEFAULT 2000,
        currency TEXT DEFAULT '€',
        is_admin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        "purchasePrice" REAL DEFAULT 0,
        "sellingPrice" REAL DEFAULT 0,
        status TEXT DEFAULT 'en_vente',
        "dateAdded" TEXT,
        "dateSold" TEXT
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        category TEXT,
        date TEXT,
        "itemId" TEXT
      )
    `);
    client.release();
    console.log(' PostgreSQL connecté');
    return pgPool;
  }

  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    sqlDb = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    sqlDb = new SQL.Database();
    sqlDb.run("PRAGMA journal_mode=WAL");
    sqlDb.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        verification_code TEXT,
        goal REAL DEFAULT 2000,
        currency TEXT DEFAULT '€',
        is_admin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    sqlDb.run(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        purchasePrice REAL DEFAULT 0,
        sellingPrice REAL DEFAULT 0,
        status TEXT DEFAULT 'en_vente',
        dateAdded TEXT,
        dateSold TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    sqlDb.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        category TEXT,
        date TEXT,
        itemId TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    saveDb();
  }
  try { sqlDb.run("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0"); } catch(e) {}
  console.log(' SQLite utilisé');
  return sqlDb;
}

function saveDb() {
  if (sqlDb) {
    fs.writeFileSync(dbPath, Buffer.from(sqlDb.export()));
  }
}

function pgSql(sql) {
  return sql.replace(/\?/g, () => '$' + (++((pgSql)._c || (pgSql)._c = 0)));
}
function pgReset() { (pgSql)._c = 0 }

async function query(sql, params = []) {
  if (pgPool) {
    pgReset();
    const res = await pgPool.query(pgSql(sql), params);
    return res.rows;
  }
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params);
  if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('WITH')) {
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }
  stmt.free();
  sqlDb.run(sql, params);
  return { changes: sqlDb.getRowsModified() };
}

async function get(sql, params = []) {
  if (pgPool) {
    pgReset();
    const res = await pgPool.query(pgSql(sql), params);
    return res.rows[0] || null;
  }
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return result;
}

async function run(sql, params = []) {
  if (pgPool) {
    pgReset();
    const res = await pgPool.query(pgSql(sql), params);
    return { changes: res.rowCount, lastInsertRowid: res.rows[0]?.id };
  }
  sqlDb.run(sql, params);
  saveDb();
  return { changes: sqlDb.getRowsModified() };
}

module.exports = { getDb, query, get, run, saveDb };
