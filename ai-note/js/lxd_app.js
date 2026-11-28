/* ============================================================
   姓名：李兴达 | 学号：24002120311 | 时间：2026-11-28 | 大模型：DeepSeek-V4.1-Flash
   功能名称：AI 学习助手交互脚本（笔记整理 / 错题诊断 / 答案解析 / 复习清单）
   ============================================================ */
'use strict';

/* ---------- 全局状态与本地存储键 ---------- */
const lxd_store_keys = {
  notes: 'lxd_ai_notes_v1',
  wrongs: 'lxd_ai_wrongs_v1',
  checks: 'lxd_ai_checks_v1'
};

const lxd_state = {
  notes: [],
  wrongs: [],
  checks: {},
  noteResult: null,
  health: false,
  busy: false
};

/* ---------- 工具：选择器简写 ---------- */
function lxd_qs(id) { return document.getElementById(id); }
function lxd_esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}

/* ---------- 工具：轻提示 ---------- */
let lxd_toastTimer = null;
function lxd_toast(msg) {
  const el = lxd_qs('lxd_toast');
  el.textContent = msg;
  el.classList.add('lxd_show');
  clearTimeout(lxd_toastTimer);
  lxd_toastTimer = setTimeout(() => el.classList.remove('lxd_show'), 2200);
}

/* ---------- 工具：读写 localStorage ---------- */
function lxd_load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function lxd_save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- 工具：统一接口请求（自动带 JSON，输出日志） ---------- */
async function lxd_request(path, options) {
  const opt = options || {};
  const res = await fetch(path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  let json;
  try { json = await res.json(); } catch (e) {
    throw new Error('服务返回格式错误（HTTP ' + res.status + '）');
  }
  console.log('[lxd_request]', path, json);
  if (json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}

/* ---------- 检查后端与智谱 AI 连接状态 ---------- */
async function lxd_checkHealth() {
  const pill = lxd_qs('lxd_aiStatus');

  // GitHub Pages 等纯静态环境没有后端，直接提示「静态演示」
  if (/github\.io$/i.test(location.hostname) || /\.netlify\.app$/i.test(location.hostname)) {
    lxd_state.health = false;
    lxd_state.staticMode = true;
    pill.className = 'lxd_pill lxd_pill_status lxd_bad';
    pill.innerHTML = '<i class="lxd_dot"></i>静态演示 · AI 功能需本地运行 node server.js';
    console.warn('[lxd_checkHealth] 当前为纯静态托管，AI 接口不可用');
    return;
  }

  try {
    const data = await lxd_request('/api/health');
    lxd_state.health = !!data.hasKey;
    pill.className = 'lxd_pill lxd_pill_status ' + (data.hasKey ? 'lxd_ok' : 'lxd_bad');
    pill.innerHTML = '<i class="lxd_dot"></i>' +
      (data.hasKey ? '智谱 AI 已连接 · ' + lxd_esc(data.model) : '未配置 ZHIPU_API_KEY');
  } catch (e) {
    lxd_state.health = false;
    pill.className = 'lxd_pill lxd_pill_status lxd_bad';
    pill.innerHTML = '<i class="lxd_dot"></i>未连接（请先 node server.js）';
    console.warn('[lxd_checkHealth]', e.message);
  }
}

/* ---------- 调用大模型：system 设定角色，user 传入内容 ---------- */
async function lxd_ai(system, user) {
  if (lxd_state.staticMode) {
    throw new Error('当前是 GitHub Pages 静态演示，AI 功能请在本地运行 node server.js 后访问 http://localhost:8312');
  }
  if (!lxd_state.health) {
    await lxd_checkHealth();
    if (!lxd_state.health) throw new Error('AI 服务未连接，请先在 ai-note 目录运行 node server.js');
  }
  const data = await lxd_request('/api/ai/chat', {
    method: 'POST',
    body: { system, user }
  });
  return data.content || '';
}

/* ---------- 工具：从模型输出中解析 JSON ---------- */
function lxd_parseJson(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start > -1 && end > start) s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch (e) { console.warn('[lxd_parseJson] 解析失败', e); return null; }
}

/* ---------- 工具：简易 Markdown 渲染（标题 / 列表 / 加粗 / 引用） ---------- */
function lxd_markdown(text) {
  const lines = String(text || '').split(/\r?\n/);
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

  lines.forEach(raw => {
    const line = raw.trim();
    if (!line) { closeList(); return; }
    let m;
    if (/^#{1,4}\s+/.test(line)) {
      closeList();
      html += '<h4>' + lxd_inline(line.replace(/^#{1,4}\s+/, '')) + '</h4>';
    } else if (/^[-*•]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + lxd_inline(line.replace(/^[-*•]\s+/, '')) + '</li>';
    } else if (/^\d+[.、]\s*/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + lxd_inline(line.replace(/^\d+[.、]\s*/, '')) + '</li>';
    } else if (/^>\s?/.test(line)) {
      closeList();
      html += '<div class="lxd_quote">' + lxd_inline(line.replace(/^>\s?/, '')) + '</div>';
    } else {
      closeList();
      html += '<p>' + lxd_inline(line) + '</p>';
    }
  });
  closeList();
  return html;
}

function lxd_inline(text) {
  return lxd_esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/* ---------- 笔记整理：调用模型并渲染结构化结果 ---------- */
async function lxd_runNote() {
  const subject = lxd_qs('lxd_noteSubject').value;
  const text = lxd_qs('lxd_noteInput').value.trim();
  const out = lxd_qs('lxd_noteOut');

  if (text.length < 20) { lxd_toast('请先粘贴至少 20 字的笔记内容'); return; }
  if (lxd_state.busy) return;
  lxd_state.busy = true;
  lxd_qs('lxd_noteRun').disabled = true;
  out.innerHTML = '<div class="lxd_loading">AI 正在提炼要点</div>';

  const system = '你是严谨的大学课程笔记整理助手。请只输出 JSON，不要输出代码块标记或多余文字。JSON 结构：' +
    '{"title":"不超过18字的主题","summary":"一句话总结，60字以内","points":["核心要点1","核心要点2"],' +
    '"formulas":["公式或定义/名词解释"],"questions":["值得追问的问题"]}。' +
    '要求：points 3-6 条，每条不超过40字；formulas 0-4 条，没有则给空数组；questions 2-3 条。不要编造笔记中没有的内容。';

  try {
    const content = await lxd_ai(system, '学科：' + subject + '\n笔记原文：\n' + text);
    const data = lxd_parseJson(content);
    if (!data) {
      // 结构解析失败时，直接把原文按 Markdown 展示，保证可用
      lxd_state.noteResult = { subject, title: subject + '笔记', summary: '', points: [], formulas: [], questions: [], raw: content };
      out.innerHTML = lxd_markdown(content);
    } else {
      lxd_state.noteResult = {
        subject,
        title: data.title || subject + '笔记',
        summary: data.summary || '',
        points: Array.isArray(data.points) ? data.points : [],
        formulas: Array.isArray(data.formulas) ? data.formulas : [],
        questions: Array.isArray(data.questions) ? data.questions : [],
        raw: ''
      };
      out.innerHTML = lxd_renderNote(lxd_state.noteResult);
    }
    lxd_qs('lxd_noteSave').disabled = false;
    lxd_toast('整理完成');
  } catch (e) {
    out.innerHTML = '<div class="lxd_quote">' + lxd_esc(e.message) + '</div>';
    lxd_toast('AI 调用失败：' + e.message);
  } finally {
    lxd_state.busy = false;
    lxd_qs('lxd_noteRun').disabled = false;
  }
}

/* ---------- 渲染笔记整理结果 ---------- */
function lxd_renderNote(n) {
  let html = '';
  if (n.title) html += '<h4>' + lxd_esc(n.title) + '</h4>';
  if (n.summary) html += '<div class="lxd_quote">' + lxd_esc(n.summary) + '</div>';
  if (n.points.length) {
    html += '<h4>核心要点</h4><ul>' + n.points.map(p => '<li>' + lxd_esc(p) + '</li>').join('') + '</ul>';
  }
  if (n.formulas.length) {
    html += '<h4>公式 / 定义</h4><ul>' + n.formulas.map(p => '<li>' + lxd_esc(p) + '</li>').join('') + '</ul>';
  }
  if (n.questions.length) {
    html += '<h4>继续追问</h4><ul>' + n.questions.map(p => '<li>' + lxd_esc(p) + '</li>').join('') + '</ul>';
  }
  if (n.raw) html += lxd_markdown(n.raw);
  return html || '<div class="lxd_empty">没有生成内容，请调整笔记后重试</div>';
}

/* ---------- 保存笔记到复习清单 ---------- */
function lxd_saveNote() {
  const n = lxd_state.noteResult;
  if (!n) return;
  const item = Object.assign({}, n, {
    id: 'n' + Date.now(),
    createdAt: new Date().toLocaleString('zh-CN'),
    mastered: false
  });
  lxd_state.notes.unshift(item);
  lxd_save(lxd_store_keys.notes, lxd_state.notes);
  lxd_renderReview();
  lxd_qs('lxd_noteSave').disabled = true;
  lxd_toast('已存入复习清单');
}

/* ---------- 错题诊断：调用模型判断错因并保存 ---------- */
async function lxd_runWrong() {
  const subject = lxd_qs('lxd_wSubject').value;
  const knowledge = lxd_qs('lxd_wKnowledge').value.trim();
  const question = lxd_qs('lxd_wQuestion').value.trim();
  const mine = lxd_qs('lxd_wMine').value.trim();
  const right = lxd_qs('lxd_wRight').value.trim();
  const out = lxd_qs('lxd_wOut');

  if (!question) { lxd_toast('请先填写题目'); return; }
  if (lxd_state.busy) return;
  lxd_state.busy = true;
  lxd_qs('lxd_wRun').disabled = true;
  out.innerHTML = '<div class="lxd_loading">AI 正在分析错因</div>';

  const system = '你是经验丰富的大学课程助教。请只输出 JSON，不要代码块标记。结构：' +
    '{"knowledge":"本题知识点（12字内）","errorType":"概念不清/计算失误/审题偏差/方法不会 四选一",' +
    '"reason":"错因分析，80字以内","suggestion":"改进建议，60字以内","related":["同类考点1","同类考点2"]}。' +
    '判断要基于学生答案与正确答案的差异，不要编造。';

  const user = '学科：' + subject + '\n知识点（可能为空）：' + (knowledge || '未填写') +
    '\n题目：' + question + '\n学生答案：' + (mine || '未填写') + '\n正确答案：' + (right || '未填写');

  try {
    const content = await lxd_ai(system, user);
    const data = lxd_parseJson(content) || {};
    const item = {
      id: 'w' + Date.now(),
      subject,
      knowledge: knowledge || data.knowledge || '未标注',
      question,
      mine,
      right,
      errorType: data.errorType || '待分析',
      reason: data.reason || content,
      suggestion: data.suggestion || '',
      related: Array.isArray(data.related) ? data.related : [],
      analysis: '',
      mastered: false,
      createdAt: new Date().toLocaleString('zh-CN')
    };
    lxd_state.wrongs.unshift(item);
    lxd_save(lxd_store_keys.wrongs, lxd_state.wrongs);
    out.innerHTML =
      '<h4>知识点</h4><p>' + lxd_esc(item.knowledge) + '</p>' +
      '<h4>错因类型</h4><p><span class="lxd_tag">' + lxd_esc(item.errorType) + '</span></p>' +
      '<h4>错因分析</h4><p>' + lxd_esc(item.reason) + '</p>' +
      (item.suggestion ? '<h4>改进建议</h4><p>' + lxd_esc(item.suggestion) + '</p>' : '') +
      (item.related.length ? '<h4>同类考点</h4><ul>' + item.related.map(r => '<li>' + lxd_esc(r) + '</li>').join('') + '</ul>' : '');
    lxd_resetWrongForm();
    lxd_renderWrongs();
    lxd_renderReview();
    lxd_fillAnalysisPicker();
    lxd_toast('已诊断并加入错题本');
  } catch (e) {
    out.innerHTML = '<div class="lxd_quote">' + lxd_esc(e.message) + '</div>';
    lxd_toast('AI 调用失败：' + e.message);
  } finally {
    lxd_state.busy = false;
    lxd_qs('lxd_wRun').disabled = false;
  }
}

/* ---------- 清空错题表单 ---------- */
function lxd_resetWrongForm() {
  lxd_qs('lxd_wKnowledge').value = '';
  lxd_qs('lxd_wQuestion').value = '';
  lxd_qs('lxd_wMine').value = '';
  lxd_qs('lxd_wRight').value = '';
}

/* ---------- 渲染错题本列表（含搜索与学科筛选） ---------- */
function lxd_renderWrongs() {
  const kw = lxd_qs('lxd_wSearch').value.trim().toLowerCase();
  const subject = lxd_qs('lxd_wFilter').value;
  const list = lxd_state.wrongs.filter(w => {
    if (subject && w.subject !== subject) return false;
    if (!kw) return true;
    return (w.question + w.knowledge + w.subject).toLowerCase().indexOf(kw) > -1;
  });

  lxd_qs('lxd_wCount').textContent = '共 ' + lxd_state.wrongs.length + ' 道';
  const box = lxd_qs('lxd_wList');
  if (!list.length) {
    box.innerHTML = '<div class="lxd_empty">还没有错题，先在上方录入一道吧</div>';
    return;
  }
  box.innerHTML = list.map(w =>
    '<div class="lxd_wrong' + (w.mastered ? ' lxd_mastered' : '') + '">' +
      '<button class="lxd_wrong_del" data-del="' + w.id + '" title="删除">×</button>' +
      '<div class="lxd_wrong_top">' +
        '<span class="lxd_tag">' + lxd_esc(w.subject) + '</span>' +
        '<span class="lxd_tag lxd_tag_gray">' + lxd_esc(w.knowledge) + '</span>' +
        (w.analysis ? '<span class="lxd_tag lxd_tag_green">已解析</span>' : '') +
      '</div>' +
      '<div class="lxd_wrong_q">' + lxd_esc(w.question) + '</div>' +
      '<div class="lxd_wrong_more">错因：<b>' + lxd_esc(w.errorType) + '</b> · ' + lxd_esc(w.createdAt) + '</div>' +
    '</div>'
  ).join('');

  box.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => lxd_deleteWrong(btn.getAttribute('data-del')));
  });
}

/* ---------- 删除错题 ---------- */
function lxd_deleteWrong(id) {
  if (!confirm('确定删除这道错题吗？')) return;
  lxd_state.wrongs = lxd_state.wrongs.filter(w => w.id !== id);
  lxd_save(lxd_store_keys.wrongs, lxd_state.wrongs);
  lxd_renderWrongs();
  lxd_renderReview();
  lxd_fillAnalysisPicker();
  lxd_toast('已删除');
}

/* ---------- 填充「答案解析」的错题下拉框与学科筛选 ---------- */
function lxd_fillAnalysisPicker() {
  const pick = lxd_qs('lxd_aPick');
  const filter = lxd_qs('lxd_wFilter');
  const cur = pick.value;

  if (!lxd_state.wrongs.length) {
    pick.innerHTML = '<option value="">— 暂无可解析的错题 —</option>';
  } else {
    pick.innerHTML = '<option value="">请选择一道错题</option>' + lxd_state.wrongs.map(w =>
      '<option value="' + w.id + '">[' + lxd_esc(w.subject) + '] ' + lxd_esc(w.question.slice(0, 26)) + '</option>'
    ).join('');
  }
  if (cur) pick.value = cur;

  const subjects = Array.from(new Set(lxd_state.wrongs.map(w => w.subject)));
  filter.innerHTML = '<option value="">全部学科</option>' +
    subjects.map(s => '<option>' + lxd_esc(s) + '</option>').join('');

  lxd_qs('lxd_aRun').disabled = !pick.value;
  lxd_qs('lxd_aCopy').disabled = !pick.value;
  lxd_updateAnalysisPreview();
}

/* ---------- 更新解析区的题目预览 ---------- */
function lxd_updateAnalysisPreview() {
  const id = lxd_qs('lxd_aPick').value;
  const box = lxd_qs('lxd_aPreview');
  const w = lxd_state.wrongs.find(x => x.id === id);
  if (!w) {
    box.innerHTML = '<div class="lxd_empty">选择错题后，这里显示题目与你的答案</div>';
    return;
  }
  box.innerHTML =
    '<p><b>题目：</b>' + lxd_esc(w.question) + '</p>' +
    '<p><b>我的答案：</b>' + lxd_esc(w.mine || '未填写') + '</p>' +
    '<p><b>正确答案：</b>' + lxd_esc(w.right || '未填写') + '</p>' +
    (w.analysis ? '<p><b>状态：</b>已生成解析，可重新生成</p>' : '');
}

/* ---------- 生成错题详细解析 ---------- */
async function lxd_runAnalysis() {
  const id = lxd_qs('lxd_aPick').value;
  const w = lxd_state.wrongs.find(x => x.id === id);
  const out = lxd_qs('lxd_aOut');
  if (!w) { lxd_toast('请先选择一道错题'); return; }
  if (lxd_state.busy) return;

  lxd_state.busy = true;
  lxd_qs('lxd_aRun').disabled = true;
  out.innerHTML = '<div class="lxd_loading">AI 正在拆解这道题</div>';

  const system = '你是耐心的大学课程答疑老师。请用 Markdown 输出对一道错题的完整解析，必须包含以下四个二级标题：' +
    '## 考点定位、## 错因剖析、## 解题步骤、## 同类变式。' +
    '解题步骤要写清每一步的依据；同类变式给 1-2 道由浅入深的小题（只给题目与思路，不给完整答案）。' +
    '注意：公式一律用普通文本书写（例如 (e-1)/2、∫(0→1) x·e^(x^2) dx），禁止使用 $、\\(、\\frac 等 LaTeX 语法。' +
    '语言简洁，总字数控制在 500 字以内，不要输出与题目无关的内容。';

  const user = '学科：' + w.subject + '\n知识点：' + w.knowledge + '\n题目：' + w.question +
    '\n学生答案：' + (w.mine || '未填写') + '\n正确答案：' + (w.right || '未填写') +
    '\n已判定的错因类型：' + w.errorType + '\n错因分析：' + w.reason;

  try {
    const content = await lxd_ai(system, user);
    w.analysis = content;
    lxd_save(lxd_store_keys.wrongs, lxd_state.wrongs);
    out.innerHTML = lxd_markdown(content);
    lxd_renderWrongs();
    lxd_renderReview();
    lxd_updateAnalysisPreview();
    lxd_toast('解析已生成并保存');
  } catch (e) {
    out.innerHTML = '<div class="lxd_quote">' + lxd_esc(e.message) + '</div>';
    lxd_toast('AI 调用失败：' + e.message);
  } finally {
    lxd_state.busy = false;
    lxd_qs('lxd_aRun').disabled = false;
  }
}

/* ---------- 渲染复习清单（笔记 + 错题，支持搜索与类型筛选） ---------- */
function lxd_renderReview() {
  const kw = lxd_qs('lxd_rSearch').value.trim().toLowerCase();
  const kind = lxd_qs('lxd_rKind').value;

  const notes = lxd_state.notes.map(n => ({
    id: n.id, kind: 'note', tag: '笔记', subject: n.subject, title: n.title,
    body: n.summary || (n.points || []).join('；'), mastered: n.mastered, createdAt: n.createdAt
  }));
  const wrongs = lxd_state.wrongs.map(w => ({
    id: w.id, kind: 'wrong', tag: '错题', subject: w.subject,
    title: w.knowledge + ' · ' + w.errorType,
    body: w.question + (w.analysis ? '（含详细解析）' : ''),
    mastered: w.mastered, createdAt: w.createdAt
  }));

  let items = notes.concat(wrongs);
  if (kind !== 'all') items = items.filter(i => i.kind === kind);
  if (kw) items = items.filter(i => (i.title + i.body + i.subject).toLowerCase().indexOf(kw) > -1);

  const box = lxd_qs('lxd_rList');
  if (!items.length) {
    box.innerHTML = '<div class="lxd_empty">还没有内容，先去整理笔记或录入错题</div>';
    return;
  }
  box.innerHTML = items.map(i =>
    '<div class="lxd_review' + (i.mastered ? ' lxd_mastered' : '') + '">' +
      '<div class="lxd_review_top">' +
        '<span class="lxd_tag ' + (i.kind === 'note' ? '' : 'lxd_tag_gray') + '">' + i.tag + '</span>' +
        '<span class="lxd_tag lxd_tag_gray">' + lxd_esc(i.subject) + '</span>' +
        '<span class="lxd_hint">' + lxd_esc(i.createdAt) + '</span>' +
      '</div>' +
      '<p><b>' + lxd_esc(i.title) + '</b></p>' +
      '<p>' + lxd_esc(i.body) + '</p>' +
      '<label><input type="checkbox" data-mastered="' + i.kind + ':' + i.id + '"' + (i.mastered ? ' checked' : '') + '> 已掌握</label>' +
    '</div>'
  ).join('');

  box.querySelectorAll('[data-mastered]').forEach(cb => {
    cb.addEventListener('change', () => lxd_toggleMastered(cb.getAttribute('data-mastered'), cb.checked));
  });
}

/* ---------- 勾选「已掌握」 ---------- */
function lxd_toggleMastered(key, checked) {
  const parts = key.split(':');
  const kind = parts[0];
  const id = parts[1];
  const arr = kind === 'note' ? lxd_state.notes : lxd_state.wrongs;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  item.mastered = checked;
  lxd_save(kind === 'note' ? lxd_store_keys.notes : lxd_store_keys.wrongs, arr);
  lxd_renderReview();
  if (kind === 'wrong') lxd_renderWrongs();
  lxd_toast(checked ? '已标记为掌握' : '已取消标记');
}

/* ---------- 工具：生成并下载 Markdown ---------- */
function lxd_exportMarkdown() {
  const lines = ['# 我的复习清单', '', '> 导出时间：' + new Date().toLocaleString('zh-CN'), ''];

  if (lxd_state.notes.length) {
    lines.push('## 一、课堂笔记', '');
    lxd_state.notes.forEach(n => {
      lines.push('### ' + n.title + '（' + n.subject + '）', '');
      if (n.summary) lines.push(n.summary, '');
      (n.points || []).forEach(p => lines.push('- ' + p));
      (n.formulas || []).forEach(p => lines.push('- ' + p));
      lines.push('');
    });
  }
  if (lxd_state.wrongs.length) {
    lines.push('## 二、错题本', '');
    lxd_state.wrongs.forEach(w => {
      lines.push('### [' + w.subject + '] ' + w.knowledge, '');
      lines.push('**题目：** ' + w.question, '');
      lines.push('**我的答案：** ' + (w.mine || '未填写'), '');
      lines.push('**正确答案：** ' + (w.right || '未填写'), '');
      lines.push('**错因：** ' + w.errorType + ' —— ' + w.reason, '');
      if (w.analysis) lines.push(w.analysis, '');
    });
  }
  if (lines.length <= 4) { lxd_toast('暂无可导出的内容'); return; }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '我的复习清单.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  lxd_toast('已导出 Markdown');
}

/* ---------- 更新学习清单勾选状态 ---------- */
function lxd_bindChecklist() {
  document.querySelectorAll('#lxd_checklist input[type="checkbox"]').forEach(cb => {
    const key = cb.getAttribute('data-k');
    cb.checked = !!lxd_state.checks[key];
    cb.addEventListener('change', () => {
      lxd_state.checks[key] = cb.checked;
      lxd_save(lxd_store_keys.checks, lxd_state.checks);
    });
  });
}

/* ---------- 复制按钮 ---------- */
function lxd_bindCopy() {
  document.querySelectorAll('.lxd_copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(text);
        lxd_toast('已复制');
      } catch (e) {
        lxd_toast('复制失败，请手动选择');
      }
    });
  });
}

/* ---------- 绑定全部事件 ---------- */
function lxd_bindEvents() {
  lxd_qs('lxd_recheck').addEventListener('click', lxd_checkHealth);
  lxd_qs('lxd_noteRun').addEventListener('click', lxd_runNote);
  lxd_qs('lxd_noteSave').addEventListener('click', lxd_saveNote);
  lxd_qs('lxd_noteClear').addEventListener('click', () => {
    lxd_qs('lxd_noteInput').value = '';
    lxd_qs('lxd_noteOut').innerHTML = '<div class="lxd_empty">整理结果会显示在这里</div>';
    lxd_qs('lxd_noteSave').disabled = true;
    lxd_state.noteResult = null;
  });

  lxd_qs('lxd_wRun').addEventListener('click', lxd_runWrong);
  lxd_qs('lxd_wReset').addEventListener('click', lxd_resetWrongForm);
  lxd_qs('lxd_wSearch').addEventListener('input', lxd_renderWrongs);
  lxd_qs('lxd_wFilter').addEventListener('change', lxd_renderWrongs);

  lxd_qs('lxd_aPick').addEventListener('change', () => {
    const has = !!lxd_qs('lxd_aPick').value;
    lxd_qs('lxd_aRun').disabled = !has;
    lxd_qs('lxd_aCopy').disabled = !has;
    lxd_updateAnalysisPreview();
    const w = lxd_state.wrongs.find(x => x.id === lxd_qs('lxd_aPick').value);
    lxd_qs('lxd_aOut').innerHTML = w && w.analysis
      ? lxd_markdown(w.analysis)
      : '<div class="lxd_empty">解析结果会显示在这里</div>';
  });
  lxd_qs('lxd_aRun').addEventListener('click', lxd_runAnalysis);
  lxd_qs('lxd_aCopy').addEventListener('click', async () => {
    const w = lxd_state.wrongs.find(x => x.id === lxd_qs('lxd_aPick').value);
    if (!w || !w.analysis) { lxd_toast('还没有可复制的解析'); return; }
    try { await navigator.clipboard.writeText(w.analysis); lxd_toast('解析已复制'); }
    catch (e) { lxd_toast('复制失败，请手动选择'); }
  });

  lxd_qs('lxd_rSearch').addEventListener('input', lxd_renderReview);
  lxd_qs('lxd_rKind').addEventListener('change', lxd_renderReview);
  lxd_qs('lxd_rExport').addEventListener('click', lxd_exportMarkdown);
}

/* ---------- 初始化 ---------- */
function lxd_init() {
  lxd_state.notes = lxd_load(lxd_store_keys.notes, []);
  lxd_state.wrongs = lxd_load(lxd_store_keys.wrongs, []);
  lxd_state.checks = lxd_load(lxd_store_keys.checks, {});

  lxd_bindEvents();
  lxd_bindCopy();
  lxd_bindChecklist();
  lxd_checkHealth();
  lxd_fillAnalysisPicker();
  lxd_renderWrongs();
  lxd_renderReview();
  console.log('[lxd_init] 笔记', lxd_state.notes.length, '错题', lxd_state.wrongs.length);
}

document.addEventListener('DOMContentLoaded', lxd_init);
