/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-27 | 大模型：DeepSeek-V4.1-Flash
 * 功能：创建并初始化 SQLite 数据库 muyu.db，建表、导入种子数据（商品/分类/订单）与默认管理员
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// 数据库文件固定放在 backend/db/muyu.db
const lxd_db_dir = __dirname;
const lxd_db_file = path.join(lxd_db_dir, 'muyu.db');
const lxd_data_dir = path.join(__dirname, '..', '..', 'data');

// 打开（不存在则自动创建）数据库
const lxd_db = new DatabaseSync(lxd_db_file);

// 建表 SQL：商品、分类、订单、用户
function lxd_initSchema() {
  lxd_db.exec(`
    CREATE TABLE IF NOT EXISTS lxd_products (
      lxd_id INTEGER PRIMARY KEY AUTOINCREMENT,
      lxd_name TEXT NOT NULL,
      lxd_cat TEXT NOT NULL,
      lxd_price REAL NOT NULL DEFAULT 0,
      lxd_stock INTEGER NOT NULL DEFAULT 0,
      lxd_sales INTEGER NOT NULL DEFAULT 0,
      lxd_rating REAL NOT NULL DEFAULT 5,
      lxd_img TEXT DEFAULT '',
      lxd_desc TEXT DEFAULT '',
      lxd_sub TEXT DEFAULT '',
      lxd_old REAL DEFAULT 0,
      lxd_tag TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS lxd_categories (
      lxd_id INTEGER PRIMARY KEY AUTOINCREMENT,
      lxd_key TEXT NOT NULL UNIQUE,
      lxd_name TEXT NOT NULL,
      lxd_icon TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS lxd_orders (
      lxd_id INTEGER PRIMARY KEY AUTOINCREMENT,
      lxd_no TEXT NOT NULL UNIQUE,
      lxd_user TEXT NOT NULL,
      lxd_amount REAL NOT NULL DEFAULT 0,
      lxd_status TEXT NOT NULL DEFAULT '待发货',
      lxd_created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lxd_users (
      lxd_id INTEGER PRIMARY KEY AUTOINCREMENT,
      lxd_username TEXT NOT NULL UNIQUE,
      lxd_password_hash TEXT NOT NULL,
      lxd_salt TEXT NOT NULL,
      lxd_nickname TEXT DEFAULT '',
      lxd_created_at TEXT NOT NULL
    );
  `);
  console.log('[lxd_db] 数据表初始化完成：' + lxd_db_file);
}

// 读取 data 目录下的 JSON 数据文件，返回 data 数组
function lxd_readSeed(file) {
  const lxd_full = path.join(lxd_data_dir, file);
  const lxd_json = JSON.parse(fs.readFileSync(lxd_full, 'utf8'));
  return lxd_json.data || [];
}

// 生成加盐密码哈希（scrypt）
function lxd_hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// 导入分类种子数据（仅当分类表为空时执行）
function lxd_seedCategories() {
  const row = lxd_db.prepare('SELECT COUNT(*) AS n FROM lxd_categories').get();
  if (row.n > 0) return;
  const list = lxd_readSeed('categories.json');
  const stmt = lxd_db.prepare('INSERT INTO lxd_categories (lxd_key, lxd_name, lxd_icon) VALUES (?, ?, ?)');
  lxd_db.exec('BEGIN');
  list.forEach(function (c) {
    const match = String(c.link || '').match(/cat=([^&]+)/);
    const key = match ? match[1] : String(c.id);
    stmt.run(key, c.name, c.icon || '');
  });
  lxd_db.exec('COMMIT');
  console.log('[lxd_db] 分类种子数据导入完成：' + list.length + ' 条');
}

// 导入商品种子数据（仅当商品表为空时执行，20 件商品）
function lxd_seedProducts() {
  const row = lxd_db.prepare('SELECT COUNT(*) AS n FROM lxd_products').get();
  if (row.n > 0) return;
  const list = lxd_readSeed('products.json');
  const stmt = lxd_db.prepare(
    'INSERT INTO lxd_products (lxd_name, lxd_cat, lxd_price, lxd_stock, lxd_sales, lxd_rating, lxd_img, lxd_desc, lxd_sub, lxd_old, lxd_tag) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  lxd_db.exec('BEGIN');
  list.forEach(function (p) {
    stmt.run(p.name, p.cat, p.price, p.stock, p.sales, p.rate, p.img, p.desc, p.sub || '', p.old || 0, p.tag || '');
  });
  lxd_db.exec('COMMIT');
  console.log('[lxd_db] 商品种子数据导入完成：' + list.length + ' 条');
}

// 格式化日期为 YYYY-MM-DD HH:mm:ss
function lxd_fmtDate(d) {
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

// 导入订单种子数据（3 条历史订单 + 10 条分页演示订单，分布在近 7 天）
function lxd_seedOrders() {
  const row = lxd_db.prepare('SELECT COUNT(*) AS n FROM lxd_orders').get();
  if (row.n > 0) return;
  const users = ['李兴达', '张一凡', '王思雨', '刘洋', '陈晓', '赵敏', '孙悦', '周涛'];
  const statuses = ['待付款', '待发货', '配送中', '已签收', '退款售后'];
  const stmt = lxd_db.prepare(
    'INSERT INTO lxd_orders (lxd_no, lxd_user, lxd_amount, lxd_status, lxd_created_at) VALUES (?, ?, ?, ?, ?)'
  );
  lxd_db.exec('BEGIN');
  // 3 条历史订单（7 天以前）
  const history = [
    ['DD20261001001', '李兴达', 4599, '已签收'],
    ['DD20261002008', '李兴达', 2199, '已签收'],
    ['DD20261003015', '王思雨', 1299, '已签收']
  ];
  history.forEach(function (o, i) {
    const d = new Date();
    d.setDate(d.getDate() - (10 + i));
    d.setHours(10 + i, 20, 0, 0);
    stmt.run(o[0], o[1], o[2], o[3], lxd_fmtDate(d));
  });
  // 10 条近 7 天订单，用于后台分页与趋势图演示
  for (let i = 0; i < 10; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (i % 7));
    d.setHours(9 + (i % 10), 15 + i, 0, 0);
    const no = 'DD20261127' + String(101 + i);
    stmt.run(no, users[i % users.length], 599 + i * 863, statuses[i % statuses.length], lxd_fmtDate(d));
  }
  lxd_db.exec('COMMIT');
  console.log('[lxd_db] 订单种子数据导入完成：13 条');
}

// 创建默认管理员账号 lixingda / 123456（已存在则跳过）
function lxd_seedUsers() {
  const exists = lxd_db.prepare('SELECT lxd_id FROM lxd_users WHERE lxd_username = ?').get('lixingda');
  if (exists) return;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = lxd_hashPassword('123456', salt);
  lxd_db.prepare(
    'INSERT INTO lxd_users (lxd_username, lxd_password_hash, lxd_salt, lxd_nickname, lxd_created_at) VALUES (?, ?, ?, ?, ?)'
  ).run('lixingda', hash, salt, '李兴达', lxd_fmtDate(new Date()));
  console.log('[lxd_db] 默认管理员已创建：lixingda / 123456');
}

// 依次初始化表结构与全部种子数据
function lxd_init() {
  lxd_initSchema();
  lxd_seedCategories();
  lxd_seedProducts();
  lxd_seedOrders();
  lxd_seedUsers();
}

lxd_init();

module.exports = {
  lxd_db: lxd_db,
  lxd_db_file: lxd_db_file,
  lxd_hashPassword: lxd_hashPassword,
  lxd_fmtDate: lxd_fmtDate
};
