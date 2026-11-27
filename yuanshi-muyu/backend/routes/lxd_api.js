/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-27 | 大模型：DeepSeek-V4.1-Flash
 * 功能：木语家居业务接口路由（商品/分类/用户/后台管理/统计），统一 {code,message,data} 返回
 */
const express = require('express');
const crypto = require('crypto');
const lxd_sqlite = require('../db/lxd_sqlite');

const lxd_router = express.Router();
const lxd_db = lxd_sqlite.lxd_db;

// token 签名密钥：优先读取 .env，未配置时使用课程演示默认值
const lxd_secret = process.env.LXD_TOKEN_SECRET || 'lxd-24002120311-muyu-secret';
// token 有效期 24 小时
const lxd_token_ttl = 24 * 60 * 60 * 1000;

/* ==================== 通用工具 ==================== */

// 成功响应
function lxd_ok(res, data, message) {
  res.json({ code: 0, message: message || 'ok', data: data === undefined ? null : data });
}

// 业务失败响应（默认 HTTP 200，401 使用 HTTP 401）
function lxd_fail(res, code, message, status) {
  res.status(status || 200).json({ code: code, message: message, data: null });
}

// 解析分页参数（传入 req.query），page 从 1 开始，size 限制 1-100
function lxd_page(query) {
  let page = parseInt(query.page, 10);
  let size = parseInt(query.size, 10);
  if (!page || page < 1) page = 1;
  if (!size || size < 1) size = 8;
  if (size > 100) size = 100;
  return { page: page, size: size, offset: (page - 1) * size };
}

// 把数据库商品行转换为前端使用的字段结构
function lxd_mapProduct(row) {
  if (!row) return null;
  return {
    id: row.lxd_id,
    name: row.lxd_name,
    cat: row.lxd_cat,
    price: row.lxd_price,
    stock: row.lxd_stock,
    sales: row.lxd_sales,
    rate: row.lxd_rating,
    img: row.lxd_img,
    desc: row.lxd_desc,
    sub: row.lxd_sub,
    old: row.lxd_old,
    tag: row.lxd_tag
  };
}

// 把数据库分类行转换为前端使用的字段结构
function lxd_mapCategory(row) {
  return {
    id: row.lxd_id,
    key: row.lxd_key,
    name: row.lxd_name,
    en: String(row.lxd_key || '').toUpperCase(),
    desc: '',
    icon: row.lxd_icon,
    link: 'list.html?cat=' + encodeURIComponent(row.lxd_key)
  };
}

// 把数据库订单行转换为前端使用的字段结构
function lxd_mapOrder(row) {
  return {
    id: row.lxd_id,
    no: row.lxd_no,
    user: row.lxd_user,
    amount: row.lxd_amount,
    status: row.lxd_status,
    createdAt: row.lxd_created_at
  };
}

/* ==================== 登录 token ==================== */

// 生成 HMAC 签名的登录 token（无状态，服务重启后仍有效）
function lxd_signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + lxd_token_ttl }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', lxd_secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

// 校验 token 并返回用户 id，无效/过期返回 null
function lxd_verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payload = parts[0];
  const expect = crypto.createHmac('sha256', lxd_secret).update(payload).digest('base64url');
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!obj.exp || obj.exp < Date.now()) return null;
    return obj.uid;
  } catch (e) {
    return null;
  }
}

// 从请求头 Authorization: Bearer <token> 中取出 token
function lxd_getBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

// 后台鉴权中间件：未登录或 token 无效统一返回 401
function lxd_auth(req, res, next) {
  const uid = lxd_verifyToken(lxd_getBearer(req));
  if (!uid) return lxd_fail(res, 401, '未登录', 401);
  const user = lxd_db.prepare('SELECT lxd_id, lxd_username, lxd_nickname FROM lxd_users WHERE lxd_id = ?').get(uid);
  if (!user) return lxd_fail(res, 401, '未登录', 401);
  req.lxd_user = user;
  next();
}

/* ==================== 前台商品 / 分类 ==================== */

// 组装商品查询条件（分类与关键词）
function lxd_productWhere(query) {
  const where = [];
  const args = [];
  if (query.cat) {
    where.push('lxd_cat = ?');
    args.push(query.cat);
  }
  if (query.kw) {
    where.push('(lxd_name LIKE ? OR lxd_desc LIKE ? OR lxd_sub LIKE ?)');
    const like = '%' + query.kw + '%';
    args.push(like, like, like);
  }
  return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', args: args };
}

// 商品排序规则：hot 销量倒序、priceUp 价格升序、priceDown 价格降序、new 最新
function lxd_productOrder(sort) {
  if (sort === 'hot') return ' ORDER BY lxd_sales DESC, lxd_id ASC';
  if (sort === 'priceUp') return ' ORDER BY lxd_price ASC, lxd_id ASC';
  if (sort === 'priceDown') return ' ORDER BY lxd_price DESC, lxd_id ASC';
  if (sort === 'new') return ' ORDER BY lxd_id DESC';
  return ' ORDER BY lxd_id ASC';
}

// 分页查询商品（列表页通用）
function lxd_queryProducts(query) {
  const pg = lxd_page(query);
  const w = lxd_productWhere(query);
  const total = lxd_db.prepare('SELECT COUNT(*) AS n FROM lxd_products' + w.sql).get(...w.args).n;
  const rows = lxd_db.prepare(
    'SELECT * FROM lxd_products' + w.sql + lxd_productOrder(query.sort) + ' LIMIT ? OFFSET ?'
  ).all(...w.args.concat([pg.size, pg.offset]));
  return { total: total, list: rows.map(lxd_mapProduct), page: pg.page, size: pg.size };
}

// GET /api/products/list：商品分页列表，支持分类/关键词/排序
lxd_router.get('/products/list', function (req, res) {
  lxd_ok(res, lxd_queryProducts(req.query));
});

// GET /api/products/search：关键词搜索（等价于带 kw 的列表）
lxd_router.get('/products/search', function (req, res) {
  if (!req.query.kw) return lxd_ok(res, { total: 0, list: [], page: 1, size: lxd_page(req.query).size });
  lxd_ok(res, lxd_queryProducts(req.query));
});

// GET /api/products/detail：按 id 查询商品详情
lxd_router.get('/products/detail', function (req, res) {
  const id = parseInt(req.query.id, 10);
  if (!id) return lxd_fail(res, 400, '缺少商品 id');
  const row = lxd_db.prepare('SELECT * FROM lxd_products WHERE lxd_id = ?').get(id);
  if (!row) return lxd_fail(res, 404, '商品不存在');
  lxd_ok(res, lxd_mapProduct(row));
});

// GET /api/categories/list：分类列表（含商品数量）
lxd_router.get('/categories/list', function (req, res) {
  const rows = lxd_db.prepare(
    'SELECT c.*, (SELECT COUNT(*) FROM lxd_products p WHERE p.lxd_cat = c.lxd_key) AS lxd_count ' +
    'FROM lxd_categories c ORDER BY c.lxd_id ASC'
  ).all();
  const list = rows.map(function (r) {
    const item = lxd_mapCategory(r);
    item.count = r.lxd_count;
    return item;
  });
  lxd_ok(res, { total: list.length, list: list, page: 1, size: list.length });
});

/* ==================== 用户注册 / 登录 ==================== */

// POST /api/user/register：注册新用户，用户名唯一，密码 scrypt 加盐哈希
lxd_router.post('/user/register', function (req, res) {
  const body = req.body || {};
  const username = String(body.username || body.account || '').trim();
  const password = String(body.password || body.pwd || '');
  const nickname = String(body.nickname || body.nick || username).trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return lxd_fail(res, 400, '用户名需为 3-20 位字母、数字或下划线');
  if (password.length < 6 || password.length > 20) return lxd_fail(res, 400, '密码需为 6-20 位');
  const exists = lxd_db.prepare('SELECT lxd_id FROM lxd_users WHERE lxd_username = ?').get(username);
  if (exists) return lxd_fail(res, 400, '该用户名已注册');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = lxd_sqlite.lxd_hashPassword(password, salt);
  const info = lxd_db.prepare(
    'INSERT INTO lxd_users (lxd_username, lxd_password_hash, lxd_salt, lxd_nickname, lxd_created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(username, hash, salt, nickname, lxd_sqlite.lxd_fmtDate(new Date()));
  const user = {
    id: Number(info.lastInsertRowid),
    username: username,
    nickname: nickname,
    createdAt: lxd_sqlite.lxd_fmtDate(new Date())
  };
  console.log('[lxd_api] 新用户注册：' + username);
  lxd_ok(res, user, '注册成功');
});

// POST /api/user/login：账号密码登录，成功签发 token
lxd_router.post('/user/login', function (req, res) {
  const body = req.body || {};
  const username = String(body.username || body.account || '').trim();
  const password = String(body.password || body.pwd || '');
  if (!username || !password) return lxd_fail(res, 400, '请输入用户名和密码');
  const row = lxd_db.prepare('SELECT * FROM lxd_users WHERE lxd_username = ?').get(username);
  if (!row) return lxd_fail(res, 400, '用户名或密码错误');
  const hash = lxd_sqlite.lxd_hashPassword(password, row.lxd_salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(row.lxd_password_hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return lxd_fail(res, 400, '用户名或密码错误');
  const token = lxd_signToken(row.lxd_id);
  const user = { id: row.lxd_id, username: row.lxd_username, nickname: row.lxd_nickname, createdAt: row.lxd_created_at };
  console.log('[lxd_api] 用户登录成功：' + username);
  lxd_ok(res, { token: token, user: user }, '登录成功');
});

/* ==================== 后台：商品管理 ==================== */

// GET /api/admin/products/list：后台商品分页列表（需登录）
lxd_router.get('/admin/products/list', lxd_auth, function (req, res) {
  lxd_ok(res, lxd_queryProducts(req.query));
});

// POST /api/admin/products/add：新增商品
lxd_router.post('/admin/products/add', lxd_auth, function (req, res) {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const cat = String(b.cat || '').trim();
  if (!name || !cat) return lxd_fail(res, 400, '商品名称和分类不能为空');
  const info = lxd_db.prepare(
    'INSERT INTO lxd_products (lxd_name, lxd_cat, lxd_price, lxd_stock, lxd_sales, lxd_rating, lxd_img, lxd_desc, lxd_sub, lxd_old, lxd_tag) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    name, cat,
    Number(b.price) || 0, Number(b.stock) || 0, Number(b.sales) || 0, Number(b.rating) || 5,
    String(b.img || ''), String(b.desc || ''), String(b.sub || ''), Number(b.old) || 0, String(b.tag || '')
  );
  const row = lxd_db.prepare('SELECT * FROM lxd_products WHERE lxd_id = ?').get(Number(info.lastInsertRowid));
  lxd_ok(res, lxd_mapProduct(row), '新增成功');
});

// PUT /api/admin/products/:id：编辑商品（未传字段保持原值）
lxd_router.put('/admin/products/:id', lxd_auth, function (req, res) {
  const id = parseInt(req.params.id, 10);
  const row = lxd_db.prepare('SELECT * FROM lxd_products WHERE lxd_id = ?').get(id);
  if (!row) return lxd_fail(res, 404, '商品不存在');
  const b = req.body || {};
  lxd_db.prepare(
    'UPDATE lxd_products SET lxd_name=?, lxd_cat=?, lxd_price=?, lxd_stock=?, lxd_sales=?, lxd_rating=?, lxd_img=?, lxd_desc=?, lxd_sub=?, lxd_old=?, lxd_tag=? WHERE lxd_id=?'
  ).run(
    b.name !== undefined ? String(b.name) : row.lxd_name,
    b.cat !== undefined ? String(b.cat) : row.lxd_cat,
    b.price !== undefined ? Number(b.price) : row.lxd_price,
    b.stock !== undefined ? Number(b.stock) : row.lxd_stock,
    b.sales !== undefined ? Number(b.sales) : row.lxd_sales,
    b.rating !== undefined ? Number(b.rating) : row.lxd_rating,
    b.img !== undefined ? String(b.img) : row.lxd_img,
    b.desc !== undefined ? String(b.desc) : row.lxd_desc,
    b.sub !== undefined ? String(b.sub) : row.lxd_sub,
    b.old !== undefined ? Number(b.old) : row.lxd_old,
    b.tag !== undefined ? String(b.tag) : row.lxd_tag,
    id
  );
  const updated = lxd_db.prepare('SELECT * FROM lxd_products WHERE lxd_id = ?').get(id);
  lxd_ok(res, lxd_mapProduct(updated), '更新成功');
});

// DELETE /api/admin/products/:id：删除商品
lxd_router.delete('/admin/products/:id', lxd_auth, function (req, res) {
  const id = parseInt(req.params.id, 10);
  const info = lxd_db.prepare('DELETE FROM lxd_products WHERE lxd_id = ?').run(id);
  if (!info.changes) return lxd_fail(res, 404, '商品不存在');
  lxd_ok(res, { id: id }, '删除成功');
});

/* ==================== 后台：分类管理 ==================== */

// GET /api/admin/categories/list：后台分类列表（含商品数量）
lxd_router.get('/admin/categories/list', lxd_auth, function (req, res) {
  const rows = lxd_db.prepare(
    'SELECT c.*, (SELECT COUNT(*) FROM lxd_products p WHERE p.lxd_cat = c.lxd_key) AS lxd_count ' +
    'FROM lxd_categories c ORDER BY c.lxd_id ASC'
  ).all();
  const list = rows.map(function (r) {
    const item = lxd_mapCategory(r);
    item.count = r.lxd_count;
    return item;
  });
  lxd_ok(res, { total: list.length, list: list, page: 1, size: list.length });
});

// POST /api/admin/categories/add：新增分类
lxd_router.post('/admin/categories/add', lxd_auth, function (req, res) {
  const b = req.body || {};
  const key = String(b.key || '').trim();
  const name = String(b.name || '').trim();
  const icon = String(b.icon || '');
  if (!key || !name) return lxd_fail(res, 400, '分类标识和名称不能为空');
  if (!/^[a-z0-9-]+$/.test(key)) return lxd_fail(res, 400, '分类标识只能包含小写字母、数字和短横线');
  const exists = lxd_db.prepare('SELECT lxd_id FROM lxd_categories WHERE lxd_key = ?').get(key);
  if (exists) return lxd_fail(res, 400, '分类标识已存在');
  const info = lxd_db.prepare('INSERT INTO lxd_categories (lxd_key, lxd_name, lxd_icon) VALUES (?, ?, ?)').run(key, name, icon);
  const row = lxd_db.prepare('SELECT * FROM lxd_categories WHERE lxd_id = ?').get(Number(info.lastInsertRowid));
  lxd_ok(res, lxd_mapCategory(row), '新增成功');
});

// PUT /api/admin/categories/:id：编辑分类
lxd_router.put('/admin/categories/:id', lxd_auth, function (req, res) {
  const id = parseInt(req.params.id, 10);
  const row = lxd_db.prepare('SELECT * FROM lxd_categories WHERE lxd_id = ?').get(id);
  if (!row) return lxd_fail(res, 404, '分类不存在');
  const b = req.body || {};
  const key = b.key !== undefined ? String(b.key).trim() : row.lxd_key;
  if (!/^[a-z0-9-]+$/.test(key)) return lxd_fail(res, 400, '分类标识只能包含小写字母、数字和短横线');
  const dup = lxd_db.prepare('SELECT lxd_id FROM lxd_categories WHERE lxd_key = ? AND lxd_id <> ?').get(key, id);
  if (dup) return lxd_fail(res, 400, '分类标识已存在');
  lxd_db.prepare('UPDATE lxd_categories SET lxd_key=?, lxd_name=?, lxd_icon=? WHERE lxd_id=?').run(
    key,
    b.name !== undefined ? String(b.name) : row.lxd_name,
    b.icon !== undefined ? String(b.icon) : row.lxd_icon,
    id
  );
  const updated = lxd_db.prepare('SELECT * FROM lxd_categories WHERE lxd_id = ?').get(id);
  lxd_ok(res, lxd_mapCategory(updated), '更新成功');
});

// DELETE /api/admin/categories/:id：删除分类（该分类下有商品时禁止删除）
lxd_router.delete('/admin/categories/:id', lxd_auth, function (req, res) {
  const id = parseInt(req.params.id, 10);
  const row = lxd_db.prepare('SELECT * FROM lxd_categories WHERE lxd_id = ?').get(id);
  if (!row) return lxd_fail(res, 404, '分类不存在');
  const used = lxd_db.prepare('SELECT COUNT(*) AS n FROM lxd_products WHERE lxd_cat = ?').get(row.lxd_key).n;
  if (used > 0) return lxd_fail(res, 400, '该分类下还有 ' + used + ' 件商品，不能删除');
  lxd_db.prepare('DELETE FROM lxd_categories WHERE lxd_id = ?').run(id);
  lxd_ok(res, { id: id }, '删除成功');
});

/* ==================== 后台：订单管理 ==================== */

// 查询订单列表（分页 + 状态 + 关键词）
function lxd_queryOrders(query) {
  const pg = lxd_page(query);
  const where = [];
  const args = [];
  if (query.status) { where.push('lxd_status = ?'); args.push(query.status); }
  if (query.kw) {
    where.push('(lxd_no LIKE ? OR lxd_user LIKE ?)');
    args.push('%' + query.kw + '%', '%' + query.kw + '%');
  }
  const wsql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = lxd_db.prepare('SELECT COUNT(*) AS n FROM lxd_orders' + wsql).get(...args).n;
  const rows = lxd_db.prepare(
    'SELECT * FROM lxd_orders' + wsql + ' ORDER BY lxd_created_at DESC, lxd_id DESC LIMIT ? OFFSET ?'
  ).all(...args.concat([pg.size, pg.offset]));
  return { total: total, list: rows.map(lxd_mapOrder), page: pg.page, size: pg.size };
}

// GET /api/admin/orders/list：后台订单分页列表
lxd_router.get('/admin/orders/list', lxd_auth, function (req, res) {
  lxd_ok(res, lxd_queryOrders(req.query));
});

// POST /api/admin/orders/add：新增订单（演示用）
lxd_router.post('/admin/orders/add', lxd_auth, function (req, res) {
  const b = req.body || {};
  const user = String(b.user || '').trim();
  if (!user) return lxd_fail(res, 400, '下单用户不能为空');
  const status = String(b.status || '待发货');
  const no = String(b.no || 'DD' + Date.now() + Math.floor(Math.random() * 900 + 100));
  const createdAt = String(b.createdAt || lxd_sqlite.lxd_fmtDate(new Date()));
  const info = lxd_db.prepare(
    'INSERT INTO lxd_orders (lxd_no, lxd_user, lxd_amount, lxd_status, lxd_created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(no, user, Number(b.amount) || 0, status, createdAt);
  const row = lxd_db.prepare('SELECT * FROM lxd_orders WHERE lxd_id = ?').get(Number(info.lastInsertRowid));
  lxd_ok(res, lxd_mapOrder(row), '新增成功');
});

// PATCH /api/admin/orders/:id：修改订单状态
lxd_router.patch('/admin/orders/:id', lxd_auth, function (req, res) {
  const id = parseInt(req.params.id, 10);
  const row = lxd_db.prepare('SELECT * FROM lxd_orders WHERE lxd_id = ?').get(id);
  if (!row) return lxd_fail(res, 404, '订单不存在');
  const b = req.body || {};
  const allowed = ['待付款', '待发货', '配送中', '已签收', '退款售后'];
  const status = String(b.status || row.lxd_status);
  if (allowed.indexOf(status) === -1) return lxd_fail(res, 400, '订单状态不合法');
  lxd_db.prepare('UPDATE lxd_orders SET lxd_status = ? WHERE lxd_id = ?').run(status, id);
  const updated = lxd_db.prepare('SELECT * FROM lxd_orders WHERE lxd_id = ?').get(id);
  lxd_ok(res, lxd_mapOrder(updated), '状态已更新');
});

// DELETE /api/admin/orders/:id：删除订单
lxd_router.delete('/admin/orders/:id', lxd_auth, function (req, res) {
  const id = parseInt(req.params.id, 10);
  const info = lxd_db.prepare('DELETE FROM lxd_orders WHERE lxd_id = ?').run(id);
  if (!info.changes) return lxd_fail(res, 404, '订单不存在');
  lxd_ok(res, { id: id }, '删除成功');
});

/* ==================== 后台：统计概览 ==================== */

// GET /api/admin/stat/overview：KPI、分类商品数量分布、近 7 天订单趋势（全部实时查库）
lxd_router.get('/admin/stat/overview', lxd_auth, function (req, res) {
  const prod = lxd_db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(lxd_stock),0) AS stock, COALESCE(SUM(lxd_sales),0) AS sales FROM lxd_products').get();
  const order = lxd_db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(lxd_amount),0) AS amount FROM lxd_orders').get();
  const user = lxd_db.prepare('SELECT COUNT(*) AS n FROM lxd_users').get();

  // 分类商品数量分布（包含零商品的分类）
  const catRows = lxd_db.prepare(
    'SELECT c.lxd_key AS key, c.lxd_name AS name, (SELECT COUNT(*) FROM lxd_products p WHERE p.lxd_cat = c.lxd_key) AS count ' +
    'FROM lxd_categories c ORDER BY c.lxd_id ASC'
  ).all();

  // 近 7 天订单趋势：先生成日期序列，再按日期汇总
  const days = [];
  const base = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    days.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
  }
  const start = days[0];
  const rows = lxd_db.prepare(
    'SELECT substr(lxd_created_at, 1, 10) AS d, COUNT(*) AS n, COALESCE(SUM(lxd_amount),0) AS amount ' +
    'FROM lxd_orders WHERE substr(lxd_created_at, 1, 10) >= ? GROUP BY d'
  ).all(start);
  const map = {};
  rows.forEach(function (r) { map[r.d] = r; });
  const trend = days.map(function (d) {
    return { date: d, count: map[d] ? map[d].n : 0, amount: map[d] ? map[d].amount : 0 };
  });

  lxd_ok(res, {
    kpi: {
      productCount: prod.n,
      stockTotal: prod.stock,
      salesTotal: prod.sales,
      orderCount: order.n,
      orderAmount: order.amount,
      userCount: user.n
    },
    catDist: catRows,
    trend: trend
  });
});

module.exports = lxd_router;
