/* ============================================================
   姓名：李兴达 | 学号：24002120311 | 时间：2026-11-28 | 大模型：DeepSeek-V4.1-Flash
   功能名称：AI 学习助手本地服务（静态托管 + 智谱 GLM 转发代理，零第三方依赖）
   ============================================================ */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const lxd_root = __dirname;
const lxd_port = Number(process.env.PORT || 8312);

/* ---------- 读取 .env（KEY=VALUE，忽略注释与引号） ---------- */
function lxd_loadEnv() {
  const file = path.join(lxd_root, '.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const i = s.indexOf('=');
    if (i < 0) return;
    const key = s.slice(0, i).trim();
    let val = s.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  });
}
lxd_loadEnv();

const lxd_aiConf = {
  key: process.env.ZHIPU_API_KEY || '',
  base: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
  model: process.env.ZHIPU_MODEL || 'glm-4.7-flash',
  fallback: process.env.ZHIPU_FALLBACK_MODEL || 'glm-4-flash'
};

/* ---------- 统一 JSON 响应 ---------- */
function lxd_json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

/* ---------- 读取请求体 ---------- */
function lxd_body(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
  });
}

/* ---------- 调用智谱 OpenAI 兼容接口（429 自动退避重试） ---------- */
async function lxd_chat(system, user) {
  if (!lxd_aiConf.key) throw new Error('未配置 ZHIPU_API_KEY，请在 ai-note/.env 中填写');

  const messages = [
    { role: 'system', content: system || '你是一个严谨的学习助手。' },
    { role: 'user', content: user || '' }
  ];
  const models = [lxd_aiConf.model];
  if (lxd_aiConf.fallback && lxd_aiConf.fallback !== lxd_aiConf.model) models.push(lxd_aiConf.fallback);

  console.log('[lxd_ai] → system:', String(system).slice(0, 120));
  console.log('[lxd_ai] → user:', String(user).slice(0, 300));

  let lastErr = null;
  let rateLimited = false;

  // 主模型重试 2 次，仍被限流则自动降级到备用模型
  for (const model of models) {
    console.log('[lxd_ai] → 请求模型:', model);
    for (let attempt = 1; attempt <= 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      try {
        const resp = await fetch(lxd_aiConf.base.replace(/\/$/, '') + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + lxd_aiConf.key
          },
          body: JSON.stringify({ model, messages, temperature: 0.4, stream: false }),
          signal: ctrl.signal
        });
        const text = await resp.text();
        if (!resp.ok) {
          lastErr = new Error('智谱接口 HTTP ' + resp.status + '：' + text.slice(0, 160));
          rateLimited = resp.status === 429;
          console.error('[lxd_ai] ✕ ' + model + ' 第 ' + attempt + ' 次失败：', lastErr.message);
          if (resp.status === 429 || resp.status >= 500) {
            await new Promise(r => setTimeout(r, 1500 * attempt));
            continue;
          }
          throw lastErr;
        }
        const json = JSON.parse(text);
        const content = json.choices && json.choices[0] && json.choices[0].message
          ? json.choices[0].message.content : '';
        console.log('[lxd_ai] ← 模型 ' + (json.model || model) + ' 返回:', String(content).slice(0, 300).replace(/\n/g, ' '), '…');
        return { content, model: json.model || model };
      } catch (e) {
        lastErr = e;
        console.error('[lxd_ai] ✕ 异常：', e.message);
        if (e.name === 'AbortError') throw new Error('AI 响应超时，请重试');
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } finally {
        clearTimeout(timer);
      }
    }
  }
  if (rateLimited) throw new Error('模型当前访问量过大（429），已自动重试与降级，请稍后再试');
  throw lastErr || new Error('AI 调用失败');
}

/* ---------- 静态资源 MIME ---------- */
const lxd_mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* ---------- 静态文件服务 ---------- */
function lxd_static(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(lxd_root, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(lxd_root)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404 Not Found'); return; }
    res.writeHead(200, { 'Content-Type': lxd_mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

/* ---------- 路由 ---------- */
const lxd_server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { lxd_json(res, 204, {}); return; }

  if (req.url.startsWith('/api/health')) {
    lxd_json(res, 200, {
      code: 0, message: 'ok',
      data: { hasKey: !!lxd_aiConf.key, model: lxd_aiConf.model, provider: 'zhipu' }
    });
    return;
  }

  if (req.url.startsWith('/api/ai/chat') && req.method === 'POST') {
    try {
      const body = await lxd_body(req);
      const result = await lxd_chat(body.system, body.user);
      lxd_json(res, 200, { code: 0, message: 'ok', data: { content: result.content, model: result.model } });
    } catch (e) {
      console.error('[api/ai/chat] 失败：', e.message);
      lxd_json(res, 500, { code: 500, message: e.message, data: null });
    }
    return;
  }

  if (req.url.startsWith('/api/')) {
    lxd_json(res, 404, { code: 404, message: '接口不存在', data: null });
    return;
  }

  lxd_static(req, res);
});

lxd_server.listen(lxd_port, () => {
  console.log('====================================================');
  console.log(' AI 学习助手已启动: http://localhost:' + lxd_port);
  console.log(' 智谱模型: ' + lxd_aiConf.model + (lxd_aiConf.key ? '（已配置 Key）' : '（缺少 Key）'));
  console.log('====================================================');
});
