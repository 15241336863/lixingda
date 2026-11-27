/* ============================================================
   姓名：李兴达 | 学号：24002120311 | 时间：2026-11-27 | 大模型：DeepSeek-V4.1-Flash
   公共脚本 app.js —— 接口请求 / 数据回退 / 购物车 / 收藏 / 登录态 / 动画
   ============================================================ */
'use strict';

/* ---------- 全局配置 ---------- */
const LI = {
  base: '',
  apiBase: '/api',
  dataPath: 'data/',
  cache: {},
  cartKey: 'li_cart',
  favKey: 'li_fav',
  userKey: 'li_user',
  cart: [],
  fav: [],
  current: null
};

/* ---------- 工具：读取本地 JSON 数据（离线 / 纯静态托管的兜底数据源） ---------- */
LI.fetchData = async function (file) {
  if (LI.cache[file]) return LI.cache[file];
  try {
    const res = await fetch(LI.dataPath + file);
    if (!res.ok) throw new Error('http ' + res.status);
    const json = await res.json();
    LI.cache[file] = json.data;
    console.log('[LI.fetchData] 读取本地 JSON：' + file);
    return json.data;
  } catch (e) {
    // 回退到内置数据（本地 file:// 或网络不可用时）
    console.error('[LI.fetchData] 读取失败：' + file, e);
    const fb = LI._DB[file];
    if (fb) { LI.cache[file] = fb; return fb; }
    throw e;
  }
};

/* ---------- 工具：统一接口请求封装（自动携带 token，输出请求日志与错误日志） ---------- */
LI.request = async function (url, options) {
  const opt = options || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opt.headers || {});
  const token = LI.getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const full = LI.apiBase + url;
  console.log('[LI.request] ' + (opt.method || 'GET') + ' ' + full, opt.body || '');
  let res;
  try {
    res = await fetch(full, {
      method: opt.method || 'GET',
      headers: headers,
      body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined
    });
  } catch (e) {
    console.error('[LI.request] 网络请求失败：' + full, e);
    e.network = true;
    throw e;
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    console.error('[LI.request] 响应解析失败：' + full + ' HTTP ' + res.status);
    const err = new Error('响应格式错误');
    err.network = true;
    throw err;
  }
  console.log('[LI.request] 响应：' + full, json);
  if (res.status === 401 || json.code === 401) {
    const err = new Error(json.message || '未登录');
    err.code = 401;
    throw err;
  }
  if (json.code !== 0) {
    const err = new Error(json.message || '请求失败');
    err.code = json.code;
    throw err;
  }
  return json.data;
};

/* ---------- 工具：读取本地登录 token ---------- */
LI.getToken = function () {
  const u = LI.load(LI.userKey, null);
  return u && u.token ? u.token : '';
};

/* ---------- 工具：把商品 sort 参数应用到本地列表 ---------- */
LI.sortLocal = function (list, sort) {
  if (sort === 'hot') return list.slice().sort(function (a, b) { return b.sales - a.sales; });
  if (sort === 'priceUp') return list.slice().sort(function (a, b) { return a.price - b.price; });
  if (sort === 'priceDown') return list.slice().sort(function (a, b) { return b.price - a.price; });
  if (sort === 'new') return list.slice().sort(function (a, b) { return Number(b.id) - Number(a.id) || String(b.id).localeCompare(String(a.id)); });
  return list.slice();
};

/* ---------- 工具：本地数据分页（接口不可用时使用） ---------- */
LI.localQuery = function (all, opts) {
  const o = opts || {};
  const page = o.page || 1;
  const size = o.size || 8;
  let list = all.slice();
  if (o.cat) list = list.filter(function (p) { return p.cat === o.cat; });
  if (o.kw) {
    list = list.filter(function (p) { return (p.name + p.sub + p.desc).indexOf(o.kw) > -1; });
  }
  list = LI.sortLocal(list, o.sort);
  return {
    total: list.length,
    list: list.slice((page - 1) * size, page * size),
    page: page,
    size: size
  };
};

/* ---------- 商品分页查询：优先接口，失败回退本地 JSON ---------- */
LI.queryProducts = async function (opts) {
  const o = opts || {};
  const page = o.page || 1;
  const size = o.size || 8;
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('size', size);
  if (o.cat) params.set('cat', o.cat);
  if (o.kw) params.set('kw', o.kw);
  if (o.sort) params.set('sort', o.sort);
  try {
    const data = await LI.request('/products/list?' + params.toString());
    console.log('[LI.queryProducts] 接口返回 ' + data.total + ' 条，当前第 ' + data.page + ' 页');
    return data;
  } catch (e) {
    console.error('[LI.queryProducts] 接口不可用，回退本地 JSON：' + e.message);
    const all = await LI.fetchData('products.json');
    return LI.localQuery(all, o);
  }
};

/* ---------- 商品搜索：走 /products/search 接口，失败回退本地 JSON ---------- */
LI.searchProducts = async function (opts) {
  const o = opts || {};
  const page = o.page || 1;
  const size = o.size || 8;
  if (!o.kw) return { total: 0, list: [], page: 1, size: size };
  const params = new URLSearchParams();
  params.set('kw', o.kw);
  params.set('page', page);
  params.set('size', size);
  try {
    const data = await LI.request('/products/search?' + params.toString());
    console.log('[LI.searchProducts] 搜索 "' + o.kw + '" 命中 ' + data.total + ' 条');
    return data;
  } catch (e) {
    console.error('[LI.searchProducts] 接口不可用，回退本地 JSON：' + e.message);
    const all = await LI.fetchData('products.json');
    return LI.localQuery(all, o);
  }
};

/* ---------- 商品列表：兼容旧调用，默认取全部商品 ---------- */
LI.getProducts = async function (opts) {
  const data = await LI.queryProducts(Object.assign({ page: 1, size: 100 }, opts || {}));
  return data.list;
};

/* ---------- 商品详情：优先接口，失败回退本地 JSON ---------- */
LI.getProductDetail = async function (id) {
  try {
    return await LI.request('/products/detail?id=' + encodeURIComponent(id));
  } catch (e) {
    console.error('[LI.getProductDetail] 接口不可用，回退本地 JSON：' + e.message);
    const all = await LI.fetchData('products.json');
    const hit = all.find(function (p) { return String(p.id) === String(id); });
    if (!hit) throw new Error('商品不存在');
    return hit;
  }
};

/* ---------- 分类列表：优先接口，失败回退本地 JSON ---------- */
LI.getCategories = async function () {
  try {
    const data = await LI.request('/categories/list');
    return data.list;
  } catch (e) {
    console.error('[LI.getCategories] 接口不可用，回退本地 JSON：' + e.message);
    return LI.fetchData('categories.json');
  }
};

// 轮播图仍读取本地 JSON
LI.getBanners = () => LI.fetchData('banners.json');
// 评价仍读取本地 JSON
LI.getReviews = () => LI.fetchData('reviews.json');
// 静态用户资料仍读取本地 JSON
LI.getUser = () => LI.fetchData('user.json');

/* ---------- 工具：存储 ---------- */
LI.save = function (k, v) { localStorage.setItem(k, JSON.stringify(v)); };
LI.load = function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
LI.loadCart = function () { LI.cart = LI.load(LI.cartKey, []); };
LI.loadFav = function () { LI.fav = LI.load(LI.favKey, []); };

/* ---------- 购物车 ---------- */
LI.cartCount = function () { return LI.cart.reduce((s, i) => s + i.qty, 0); };
LI.cartTotal = function () { return LI.cart.reduce((s, i) => s + i.qty * i.price, 0); };
LI.addCart = function (prod, qty) {
  const idx = LI.cart.findIndex(i => i.id === prod.id);
  if (idx > -1) LI.cart[idx].qty += (qty || 1);
  else LI.cart.push({ id: prod.id, name: prod.name, img: prod.img, price: prod.price, qty: qty || 1 });
  LI.save(LI.cartKey, LI.cart);
  LI.refreshBadge();
  LI.toast('已加入购物车');
};
LI.setQty = function (id, qty) {
  const idx = LI.cart.findIndex(i => i.id === id);
  if (idx > -1) { LI.cart[idx].qty = Math.max(1, qty); LI.save(LI.cartKey, LI.cart); LI.refreshBadge(); }
};
LI.delCart = function (id) {
  LI.cart = LI.cart.filter(i => i.id !== id);
  LI.save(LI.cartKey, LI.cart); LI.refreshBadge();
};

/* ---------- 收藏 ---------- */
LI.isFav = function (id) { return LI.fav.includes(id); };
LI.toggleFav = function (id) {
  if (LI.isFav(id)) { LI.fav = LI.fav.filter(x => x !== id); LI.toast('已取消收藏'); }
  else { LI.fav.push(id); LI.toast('收藏成功'); LI.flyHeart(); }
  LI.save(LI.favKey, LI.fav);
  LI.refreshFavBtn(id);
  return LI.isFav(id);
};
LI.refreshFavBtn = function (id) {
  const btn = document.querySelectorAll(`[data-fav="${id}"]`);
  btn.forEach(b => b.classList.toggle('li-fav-on', LI.isFav(id)));
};

/* ---------- 徽标 ---------- */
LI.refreshBadge = function () {
  document.querySelectorAll('.li-tab-badge').forEach(b => {
    const n = LI.cartCount();
    b.textContent = n > 99 ? '99+' : n;
    b.classList.toggle('li-show', n > 0);
  });
};

/* ---------- 登录态 ---------- */
LI.isLogin = function () { return !!localStorage.getItem(LI.userKey); };
/* 保存登录态：兼容接口返回的 {token,user} 与本地模拟的扁平用户对象 */
LI.login = function (data) {
  let user;
  if (data && data.token && data.user) {
    const u = data.user;
    user = {
      token: data.token,
      id: u.id,
      account: u.username,
      username: u.username,
      nick: u.nickname || u.username,
      level: u.level || '木语会员',
      points: u.points !== undefined ? u.points : 100,
      orderCount: u.orderCount !== undefined ? u.orderCount : 0
    };
  } else {
    user = data || {};
  }
  localStorage.setItem(LI.userKey, JSON.stringify(user));
  LI.current = user;
  console.log('[LI.login] 登录态已保存：' + (user.nick || user.account || '用户'));
  return user;
};
LI.logout = function () { localStorage.removeItem(LI.userKey); LI.current = null; };
LI.needLogin = function () {
  if (!LI.isLogin()) { LI.toast('请先登录'); setTimeout(() => location.href = 'login.html', 600); return true; }
  return false;
};

/* ---------- Toast / 心形动画 ---------- */
LI.toast = function (msg) {
  const old = document.querySelector('.li-toast'); if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'li-toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
};
LI.flyHeart = function (el) {
  const h = document.createElement('div');
  h.innerHTML = '&#10084;'; h.style.cssText = 'position:fixed;left:50%;top:40%;font-size:40px;color:#c0392b;z-index:300;transform:translate(-50%,-50%);animation:liHeart .8s ease;pointer-events:none;';
  document.body.appendChild(h);
  setTimeout(() => h.remove(), 850);
};

/* ---------- 通用：渲染商品卡片 ---------- */
LI.prodCard = function (p, i) {
  const favCls = LI.isFav(p.id) ? 'li-fav-on' : '';
  return `
  <article class="li-card" data-id="${p.id}">
    <a href="detail.html?id=${p.id}" class="li-img">
      ${p.tag ? `<span class="li-tag">${p.tag}</span>` : ''}
      <img src="img/${p.img}" alt="${p.name}" loading="lazy">
    </a>
    <div class="li-body">
      <a href="detail.html?id=${p.id}" class="li-name">${p.name}</a>
      <p class="li-sub">${p.sub}</p>
      <div class="li-row">
        <div class="li-price"><i>¥</i>${p.price}<span class="li-old">¥${p.old}</span></div>
        <div class="li-acts">
          <button class="li-ico-btn" data-fav="${p.id}" title="收藏">${LI.icoHeart()}</button>
          <button class="li-ico-btn" data-add="${p.id}" title="加入购物车">${LI.icoCart()}</button>
        </div>
      </div>
    </div>
  </article>`;
};

/* ---------- 通用：左图右文商品列表卡片（全部商品页用） ---------- */
LI.listRow = function (p) {
  return `
  <a class="li-lrow" href="detail.html?id=${p.id}">
    <div class="li-imgbox">
      <img src="img/${p.img}" alt="${p.name}" loading="lazy">
      <span class="li-bigbadge">最热</span>
    </div>
    <div class="li-info">
      <div class="li-ptags"><span class="li-ptag">限时抢7折</span><span class="li-ptag li-blue">店长补贴</span></div>
      <div class="li-name">${p.name}</div>
      <div class="li-sub">${p.sub}</div>
      <div class="li-sales">已售${p.sales}件</div>
      <div class="li-foot">
        <div class="li-price"><i>¥</i>${p.price}<span class="li-old">¥${p.old}</span></div>
        <span class="li-carticon" data-add="${p.id}">${LI.icoCart()}</span>
      </div>
    </div>
  </a>`;
};

/* ---------- 通用：渲染分页条（上一页 / 下一页 + 页码信息） ---------- */
LI.renderPager = function (el, data, onChange) {
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(data.total / data.size));
  const page = Math.min(Math.max(1, data.page), totalPages);
  el.innerHTML =
    '<button class="li-pagebtn" data-p="prev"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
    '<span class="li-pageinfo">第 ' + page + ' / ' + totalPages + ' 页 · 共 ' + data.total + ' 件</span>' +
    '<button class="li-pagebtn" data-p="next"' + (page >= totalPages ? ' disabled' : '') + '>下一页</button>';
  el.querySelectorAll('.li-pagebtn').forEach(function (b) {
    b.addEventListener('click', function () {
      const next = b.dataset.p === 'prev' ? page - 1 : page + 1;
      if (next >= 1 && next <= totalPages) onChange(next);
    });
  });
};

/* ---------- 客服悬浮组件（全局） ---------- */
LI.csReady = false;
LI.initCS = function () {
  if (LI.csReady) return;
  LI.csReady = true;

  function ensurePanel() {
    let p = document.getElementById('liCSPanel');
    if (!p) {
      p = document.createElement('div');
      p.className = 'li-cs-panel li-hidden';
      p.id = 'liCSPanel';
      document.body.appendChild(p);
    }
    return p;
  }
  function ensureFloat() {
    let f = document.getElementById('liCSFloat');
    if (!f) {
      f = document.createElement('button');
      f.className = 'li-cs-float';
      f.id = 'liCSFloat';
      f.innerHTML = '<span class="li-cs-dot"></span><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.7 8.7 0 0 1-3.6-.7L3 21l1.9-4.5a8.2 8.2 0 0 1-.9-5A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>';
      document.body.appendChild(f);
      f.addEventListener('click', openPanel);
    }
    return f;
  }

  function addMsg(text, who) {
    const body = document.querySelector('#liCSPanel .li-cs-body');
    if (!body) return;
    const d = document.createElement('div');
    d.className = 'li-cs-msg ' + who;
    d.textContent = text;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  }
  function botReply(q) {
    const map = [
      ['物流|发货|快递', '亲，我们默认顺丰/德邦送货上门，预计3-5天送达，可随时在“我的-订单”查看物流哦～'],
      ['退换|售后|保修', '支持7天无理由退换，实木家具质保3年，如有问题可联系本客服或拨打 15241336863。'],
      ['价格|优惠|折扣', '当前全场限时7折，叠加“店长补贴”，满3500减50、满6000减100，多买更划算！'],
      ['材质|实木|环保', '我们选用北美FAS级橡木、新西兰松木等纯实木，环保水性漆，无贴皮、无密度板，母婴安心。'],
      ['沙发', '云朵沙发坐感高回弹、可拆洗，当前¥3299限时7折，点商品页可直接加购哦～'],
      ['床|床垫', '实木双人床承重稳固、排骨架结实，好评率99%，值得入手！']
    ];
    let ans = '亲，感谢咨询！如需帮助可以拨打客服电话 15241336863，或输入“物流”“售后”“价格”“材质”等关键词查询哦～';
    map.forEach(function (kv) {
      if (new RegExp(kv[0]).test(q)) ans = kv[1];
    });
    addMsg(ans, 'li-bot');
  }

  function openPanel() {
    const p = ensurePanel();
    if (!p.classList.contains('li-hidden')) return;
    p.classList.remove('li-hidden');
    if (!p.querySelector('.li-cs-body')) {
      p.innerHTML =
        '<div class="li-cs-head">' +
          '<span class="li-cs-avatar">&#128172;</span>' +
          '<div><b>木语客服</b><div class="li-cs-online">在线 · 通常秒回</div></div>' +
          '<span class="li-cs-close" data-cs-close>&#10005;</span>' +
        '</div>' +
        '<div class="li-cs-body">' +
          '<div class="li-cs-msg bot">您好，欢迎光临木语家居！&#128578;<br>我是您的专属客服小木，有什么可以帮您？</div>' +
          '<div class="li-cs-msg quick" data-q="物流">查物流</div>' +
          '<div class="li-cs-msg quick" data-q="价格">优惠活动</div>' +
          '<div class="li-cs-msg quick" data-q="售后">退换售后</div>' +
          '<div class="li-cs-msg quick" data-q="材质">材质环保</div>' +
        '</div>' +
        '<div class="li-cs-input">' +
          '<input id="liCSInput" type="text" placeholder="请输入您的问题...">' +
          '<button id="liCSSend">发送</button>' +
        '</div>';
      p.querySelector('.li-cs-close').addEventListener('click', function () { p.classList.add('li-hidden'); });
      p.querySelector('.li-cs-input input').addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
      p.querySelector('.li-cs-input button').addEventListener('click', send);
      p.querySelectorAll('[data-q]').forEach(function (q) {
        q.addEventListener('click', function () { send(q.dataset.q); });
      });
    }
    document.querySelector('#liCSInput') && document.querySelector('#liCSInput').focus();
  }

  function send(text) {
    const input = document.querySelector('#liCSInput');
    const v = (text || (input && input.value)).trim();
    if (!v) return;
    addMsg(v, 'li-user');
    if (input) input.value = '';
    setTimeout(function () { botReply(v); }, 400);
  }

  ensureFloat();
};

/* ---------- SVG 图标（本地，不用字体库） ---------- */
LI.icoHeart = (on) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
LI.icoCart = () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>`;
LI.icoHome = () => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>`;
LI.icoUser = () => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
LI.icoSearch = () => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
LI.icoBack = () => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`;

/* ---------- Tab 高亮 ---------- */
LI.setTab = function (key) {
  document.querySelectorAll('.li-tabbar a, .li-tab5 a').forEach(a => {
    a.classList.toggle('li-on', a.dataset.tab === key);
  });
};

/* ---------- 事件委托：购物车 / 收藏（全局生效，每页均可点击） ---------- */
document.addEventListener('click', function (e) {
  const add = e.target.closest('[data-add]');
  if (add) {
    if (LI.needLogin()) return;
    const id = add.dataset.add;
    LI.getProducts().then(list => {
      const p = list.find(x => String(x.id) === String(id));
      if (p) { LI.addCart(p, 1); LI.heartAnim(add); }
    });
    return;
  }
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    if (LI.needLogin()) return;
    LI.toggleFav(fav.dataset.fav);
    return;
  }
  // 通用返回
  const back = e.target.closest('[data-back]');
  if (back) history.length > 1 ? history.back() : location.href = 'index.html';
});

/* ---------- 按钮点击放大动画 ---------- */
LI.heartAnim = function (el) {
  el.style.animation = 'liPulse .5s ease';
  setTimeout(() => el.style.animation = '', 500);
};

/* ---------- 初始化 ---------- */
(function init() {
  LI.loadCart(); LI.loadFav(); LI.refreshBadge();
  LI.current = LI.load(LI.userKey, null);
  LI.initCS(); // 全局客服悬浮
})();

/* ---------- 内置数据（file:// 双击打开时的回退数据源，与 data/*.json 一致） ---------- */
LI._DB = {
  'categories.json': [
    { "id": 1, "name": "客厅系列", "en": "LIVING", "desc": "沙发·茶几·电视柜·休闲椅", "icon": "living.png", "link": "list.html?cat=living" },
    { "id": 2, "name": "卧室系列", "en": "BEDROOM", "desc": "床·衣柜·床头柜·梳妆台", "icon": "bedroom.png", "link": "list.html?cat=bedroom" },
    { "id": 3, "name": "餐厅系列", "en": "DINING", "desc": "餐桌·餐椅·餐边柜·吧台椅", "icon": "dining.png", "link": "list.html?cat=dining" },
    { "id": 4, "name": "办公系列", "en": "OFFICE", "desc": "办公桌·人体工学椅·书柜", "icon": "office.png", "link": "list.html?cat=office" }
  ],
  'banners.json': [
    { "id": "b1", "img": "living-modern.jpg", "title": "原木客厅 · 自然留白", "sub": "北美FAS级橡木，纯实木无贴皮", "link": "list.html?cat=living" },
    { "id": "b2", "img": "bedroom-simple.jpg", "title": "静谧卧室 · 安稳入眠", "sub": "新西兰松木排骨架，环保水性漆", "link": "list.html?cat=bedroom" },
    { "id": "b3", "img": "dining-nordic.jpg", "title": "北欧餐厅 · 温润餐叙", "sub": "樱桃木色温润纹理，一桌一椅皆匠心", "link": "list.html?cat=dining" }
  ],
  'products.json': [
    { "id": "p101", "cat": "living", "name": "云朵现代简约沙发", "sub": "北美橡木框架·布艺软包", "img": "sofa-modern.png", "price": 3299, "old": 4299, "sales": 1832, "stock": 86, "rate": 4.9, "tag": "热卖", "desc": "高回弹海绵坐感，可拆洗布艺面料，扶手圆润包边，适合中小户型客厅。" },
    { "id": "p102", "cat": "living", "name": "L型转角布艺沙发", "sub": "贵妃榻·实木高脚", "img": "l-sofa.jpg", "price": 4599, "old": 5599, "sales": 1267, "stock": 52, "rate": 4.8, "tag": "热卖", "desc": "L型贵妃位设计，座深舒适，可折叠储物脚踏，大客厅首选。" },
    { "id": "p103", "cat": "living", "name": "皮质单人休闲沙发", "sub": "头层牛皮·可躺可摇", "img": "leather-sofa.jpg", "price": 2199, "old": 2699, "sales": 934, "stock": 40, "rate": 4.9, "tag": "", "desc": "头层牛皮触感细腻，可调节靠背，摇椅功能，午休看书都惬意。" },
    { "id": "p104", "cat": "living", "name": "大理石纹岩板茶几", "sub": "天然纹理·储物抽屉", "img": "marble-table.jpg", "price": 1299, "old": 1699, "sales": 2104, "stock": 120, "rate": 4.8, "tag": "新品", "desc": "岩板台面耐磨防烫，下置双层储物格，简约不占地。" },
    { "id": "p105", "cat": "living", "name": "现代实木电视柜", "sub": "原木色·大容量抽屉", "img": "tv-cabinet.jpg", "price": 1699, "old": 2099, "sales": 1508, "stock": 76, "rate": 4.7, "tag": "", "desc": "北美橡木直拼，双抽双门，走线孔设计，承重稳固。" },
    { "id": "p201", "cat": "bedroom", "name": "实木双人床", "sub": "北美橡木·齐边设计", "img": "bed-solid.png", "price": 4599, "old": 5699, "sales": 2890, "stock": 63, "rate": 4.9, "tag": "爆款", "desc": "新西兰松木排骨架，齐边可贴墙，承重稳固，简约耐看。" },
    { "id": "p202", "cat": "bedroom", "name": "三门实木衣柜", "sub": "原木色·大容量", "img": "wardrobe.png", "price": 5999, "old": 7399, "sales": 1120, "stock": 30, "rate": 4.8, "tag": "", "desc": "三门对开，可调节层板，挂衣区充足，环保水性漆。" },
    { "id": "p203", "cat": "bedroom", "name": "实木床头柜", "sub": "原木色·单抽单开", "img": "nightstand.png", "price": 699, "old": 899, "sales": 3456, "stock": 150, "rate": 4.8, "tag": "热卖", "desc": "小巧实用，圆角设计，可放床头小物，原木温润。" },
    { "id": "p204", "cat": "bedroom", "name": "实木梳妆台", "sub": "带镜·三抽收纳", "img": "dresser.jpg", "price": 1999, "old": 2499, "sales": 876, "stock": 44, "rate": 4.7, "tag": "新品", "desc": "自带化妆镜，三抽收纳，桌角圆润，卧室梳妆两相宜。" },
    { "id": "p205", "cat": "bedroom", "name": "简约卧室系列套装", "sub": "床+柜+床头柜组合", "img": "bedroom-simple.jpg", "price": 10999, "old": 13999, "sales": 356, "stock": 18, "rate": 4.9, "tag": "套装", "desc": "床、床头柜、衣柜一价配齐，风格统一，省心省力。" },
    { "id": "p301", "cat": "dining", "name": "实木伸缩餐桌", "sub": "北美橡木·可伸缩", "img": "dining-table.jpg", "price": 2899, "old": 3599, "sales": 1674, "stock": 58, "rate": 4.8, "tag": "热卖", "desc": "1.2米可伸至1.6米，轻松应对家庭聚餐，原木温润。" },
    { "id": "p302", "cat": "dining", "name": "布艺餐椅", "sub": "软包坐垫·实木腿", "img": "fabric-chair.jpg", "price": 459, "old": 599, "sales": 5230, "stock": 200, "rate": 4.8, "tag": "爆款", "desc": "软包坐垫舒适，实木椅腿稳固，多色可选。" },
    { "id": "p303", "cat": "dining", "name": "实木餐边柜", "sub": "大容量·长虹玻璃", "img": "sideboard.jpg", "price": 2199, "old": 2699, "sales": 989, "stock": 66, "rate": 4.7, "tag": "", "desc": "长虹玻璃柜门，内置层板，收纳餐具酒具，台面可作水吧。" },
    { "id": "p304", "cat": "dining", "name": "高脚吧台椅", "sub": "原木·可旋转", "img": "bar-stool.jpg", "price": 359, "old": 459, "sales": 2130, "stock": 130, "rate": 4.6, "tag": "", "desc": "吧台/岛台绝配，可旋转座面，脚踏设计更舒适。" },
    { "id": "p305", "cat": "dining", "name": "北欧餐厅系列套装", "sub": "餐桌+四椅组合", "img": "dining-nordic.jpg", "price": 4999, "old": 6399, "sales": 745, "stock": 25, "rate": 4.8, "tag": "套装", "desc": "餐桌配四把餐椅，风格统一，樱桃木色温润雅致。" },
    { "id": "p401", "cat": "office", "name": "电动升降办公桌", "sub": "双电机·记忆高度", "img": "lift-desk.jpg", "price": 2799, "old": 3499, "sales": 1560, "stock": 70, "rate": 4.9, "tag": "新品", "desc": "双电机静音升降，三档记忆高度，久坐健康之选。" },
    { "id": "p402", "cat": "office", "name": "人体工学椅", "sub": "腰靠·扶手可调", "img": "ergo-chair.png", "price": 1899, "old": 2399, "sales": 2340, "stock": 90, "rate": 4.9, "tag": "爆款", "desc": "自适应腰靠，4D扶手，网布透气，久坐不累。" },
    { "id": "p403", "cat": "office", "name": "实木书柜", "sub": "开放格·大容量", "img": "bookshelf.jpg", "price": 2499, "old": 2999, "sales": 1120, "stock": 55, "rate": 4.8, "tag": "", "desc": "开放格设计，可调节层板，储物展示两相宜。" },
    { "id": "p404", "cat": "office", "name": "实木会议桌", "sub": "大板直拼·沉稳", "img": "meeting-table.jpg", "price": 6999, "old": 8599, "sales": 210, "stock": 12, "rate": 4.8, "tag": "套装", "desc": "大板直拼桌面，多人会议适用，原木大气沉稳。" },
    { "id": "p405", "cat": "office", "name": "现代办公系列套装", "sub": "桌+椅+书柜组合", "img": "office-modern.jpg", "price": 8999, "old": 10999, "sales": 468, "stock": 20, "rate": 4.8, "tag": "套装", "desc": "办公桌、人体工学椅、书柜一站配齐，办公更高效。" }
  ],
  'reviews.json': [
    { "id": "c1", "user": "木木家的小屋", "text": "沙发送到家几乎无味道，坐感很扎实，家里人都说好，原木质感一流！", "product": "云朵现代简约沙发", "rate": 5, "time": "2026-09-18" },
    { "id": "c2", "user": "栖居者", "text": "床是纯实木的，排骨架很结实，晚上翻身没有异响，很满意的一次网购。", "product": "实木双人床", "rate": 5, "time": "2026-09-12" },
    { "id": "c3", "user": "晚风与木", "text": "餐桌伸缩功能很实用，家里来人也不怕坐不下，木纹很漂亮。", "product": "实木伸缩餐桌", "rate": 5, "time": "2026-09-05" },
    { "id": "c4", "user": "原木主义者", "text": "办公椅腰靠很舒服，久坐办公腰不酸了，网布透气夏天也不闷。", "product": "人体工学椅", "rate": 4, "time": "2026-08-28" }
  ],
  'user.json': [
    { "id": "u1", "account": "lixingda", "nick": "李兴达", "phone": "15241336863", "level": "白银会员", "points": 2680, "avatar": "products.png", "orderCount": 12, "address": "辽宁省大连市 大连东软信息学院博川校区" }
  ]
};
