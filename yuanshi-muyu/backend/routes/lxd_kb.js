/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-25 | 大模型：DeepSeek-V4.1-Flash
 * 功能：知识库（RAG）接口——文件上传解析、切片入库、列表、删除、样例导入与检索
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const AdmZip = require('adm-zip');
const CFB = require('cfb');
const WordExtractor = require('word-extractor');
const pdfParse = require('pdf-parse');
const lxd_pool = require('../config/lxd_db');

const lxd_router = express.Router();
const lxd_upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// 支持的知识库文件类型
const lxd_supportExt = ['.txt', '.md', '.csv', '.doc', '.docx', '.ppt', '.pptx', '.pdf'];
const lxd_sampleDir = path.join(__dirname, '..', '知识库样例');

// 修复 multer 用 latin1 解码文件名导致的中文乱码
function lxd_fixName(lxd_name) {
  if (/[^\u0000-\u00ff]/.test(lxd_name)) { return lxd_name; }
  try {
    return Buffer.from(lxd_name, 'latin1').toString('utf8');
  } catch (lxd_e) {
    return lxd_name;
  }
}

// 还原 XML 里的转义字符
function lxd_unescape(lxd_s) {
  return lxd_s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (lxd_m, lxd_d) { return String.fromCharCode(Number(lxd_d)); })
    .replace(/&amp;/g, '&');
}

// 从 docx / pptx 的 XML 中按顺序抽取文字，段落结束补换行
function lxd_extractXmlText(lxd_xml) {
  var lxd_out = '';
  var lxd_re = /<(?:w|a):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|a):t>|<\/(?:w|a):p>/g;
  var lxd_m;
  while ((lxd_m = lxd_re.exec(lxd_xml)) !== null) {
    if (lxd_m[1] !== undefined) { lxd_out += lxd_unescape(lxd_m[1]); }
    else { lxd_out += '\n'; }
  }
  return lxd_out;
}

// 解析 docx：解压后读取 word/document.xml
function lxd_parseDocx(lxd_buf) {
  var lxd_zip = new AdmZip(lxd_buf);
  var lxd_entries = lxd_zip.getEntries().filter(function (lxd_e) {
    return /^word\/(document|header\d*|footer\d*)\.xml$/.test(lxd_e.entryName);
  });
  return lxd_entries.map(function (lxd_e) {
    return lxd_extractXmlText(lxd_zip.readAsText(lxd_e));
  }).join('\n');
}

// 解析 pptx：按幻灯片顺序读取 ppt/slides/slideN.xml
function lxd_parsePptx(lxd_buf) {
  var lxd_zip = new AdmZip(lxd_buf);
  var lxd_slides = lxd_zip.getEntries().filter(function (lxd_e) {
    return /^ppt\/slides\/slide\d+\.xml$/.test(lxd_e.entryName);
  }).sort(function (lxd_a, lxd_b) {
    var lxd_na = Number(lxd_a.entryName.match(/(\d+)/)[1]);
    var lxd_nb = Number(lxd_b.entryName.match(/(\d+)/)[1]);
    return lxd_na - lxd_nb;
  });
  return lxd_slides.map(function (lxd_e, lxd_i) {
    return '【第 ' + (lxd_i + 1) + ' 页】\n' + lxd_extractXmlText(lxd_zip.readAsText(lxd_e));
  }).join('\n');
}

// 解析旧版 .ppt：从 OLE 复合文档的 PowerPoint Document 流里提取 UTF-16 可读文本
function lxd_parsePpt(lxd_buf) {
  var lxd_cfb = CFB.read(lxd_buf, { type: 'buffer' });
  var lxd_stream = CFB.find(lxd_cfb, 'PowerPoint Document');
  if (!lxd_stream || !lxd_stream.content) { return ''; }

  var lxd_content = Buffer.from(lxd_stream.content);
  var lxd_out = [];
  var lxd_cur = '';
  for (var lxd_i = 0; lxd_i + 1 < lxd_content.length; lxd_i += 2) {
    var lxd_code = lxd_content.readUInt16LE(lxd_i);
    var lxd_ok = (lxd_code >= 0x4e00 && lxd_code <= 0x9fa5) ||
      (lxd_code >= 0x30 && lxd_code <= 0x7a) ||
      lxd_code === 0x3001 || (lxd_code >= 0xff01 && lxd_code <= 0xff5e);
    if (lxd_ok) {
      lxd_cur += String.fromCharCode(lxd_code);
    } else {
      if (lxd_cur.length >= 2) { lxd_out.push(lxd_cur); }
      lxd_cur = '';
    }
  }
  if (lxd_cur.length >= 2) { lxd_out.push(lxd_cur); }
  return lxd_out.join('\n');
}

// 解析旧版 .doc：用 word-extractor 读取正文
async function lxd_parseDoc(lxd_buf) {
  var lxd_tmp = path.join(os.tmpdir(), 'lxd_doc_' + Date.now() + '.doc');
  fs.writeFileSync(lxd_tmp, lxd_buf);
  try {
    var lxd_extractor = new WordExtractor();
    var lxd_doc = await lxd_extractor.extract(lxd_tmp);
    return lxd_doc.getBody();
  } finally {
    try { fs.unlinkSync(lxd_tmp); } catch (lxd_e) { /* 忽略清理失败 */ }
  }
}

// 按扩展名把文件内容解析成纯文本
async function lxd_parseFile(lxd_buf, lxd_ext) {
  if (lxd_ext === '.txt' || lxd_ext === '.md' || lxd_ext === '.csv') {
    return lxd_buf.toString('utf8');
  }
  if (lxd_ext === '.docx') { return lxd_parseDocx(lxd_buf); }
  if (lxd_ext === '.pptx') { return lxd_parsePptx(lxd_buf); }
  if (lxd_ext === '.doc') { return lxd_parseDoc(lxd_buf); }
  if (lxd_ext === '.ppt') { return lxd_parsePpt(lxd_buf); }
  if (lxd_ext === '.pdf') {
    var lxd_pdf = await pdfParse(lxd_buf);
    return lxd_pdf.text;
  }
  throw new Error('暂不支持的文件类型：' + lxd_ext);
}

// 把长文本切成带重叠的片段，优先在句号、换行处断开
function lxd_splitText(lxd_text, lxd_size, lxd_overlap) {
  var lxd_clean = String(lxd_text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!lxd_clean) { return []; }

  var lxd_chunks = [];
  var lxd_start = 0;
  while (lxd_start < lxd_clean.length) {
    var lxd_end = Math.min(lxd_start + lxd_size, lxd_clean.length);
    if (lxd_end < lxd_clean.length) {
      var lxd_win = lxd_clean.slice(lxd_start, lxd_end);
      var lxd_cut = Math.max(lxd_win.lastIndexOf('。'), lxd_win.lastIndexOf('\n'));
      if (lxd_cut > lxd_size * 0.5) { lxd_end = lxd_start + lxd_cut + 1; }
    }
    var lxd_piece = lxd_clean.slice(lxd_start, lxd_end).trim();
    if (lxd_piece) { lxd_chunks.push(lxd_piece); }
    if (lxd_end >= lxd_clean.length) { break; }
    lxd_start = Math.max(lxd_end - lxd_overlap, lxd_start + 1);
  }
  return lxd_chunks;
}

// 顾客口语与资料书面语的同义词映射，提升口语提问的召回率
const lxd_synonyms = {
  '开门': '营业', '打烊': '营业时间', '关门': '打烊', '几点': '营业时间',
  '送餐': '配送', '送货': '配送', '外卖': '配送', '送到': '配送',
  '多少钱': '价格', '几块': '价格', '价钱': '价格', '收费': '价格',
  '包间': '包厢', '订位': '预订', '订座': '预订',
  '小孩': '儿童', '婴儿': '儿童'
};

// 把文本切词：中文二元词权重 2、单字权重 1，英文数字整词权重 2
function lxd_tokenize(lxd_text) {
  var lxd_map = new Map();
  var lxd_low = String(lxd_text).toLowerCase();

  (lxd_low.match(/[a-z0-9]{2,}/g) || []).forEach(function (lxd_w) {
    lxd_map.set(lxd_w, 2);
  });

  (lxd_low.match(/[\u4e00-\u9fa5]+/g) || []).forEach(function (lxd_seg) {
    for (var lxd_i = 0; lxd_i < lxd_seg.length; lxd_i += 1) {
      var lxd_char = lxd_seg.charAt(lxd_i);
      if (!lxd_map.has(lxd_char)) { lxd_map.set(lxd_char, 1); }
      if (lxd_i < lxd_seg.length - 1) {
        lxd_map.set(lxd_seg.substr(lxd_i, 2), 2);
      }
    }
  });

  return lxd_map;
}

// 检索与问题最相关的知识片段，返回前 topK 条
async function lxd_retrieve(lxd_question, lxd_topK) {
  // 口语同义词扩展后再切词，避免「几点开门」撞不上「营业时间」
  var lxd_expanded = String(lxd_question) + ' ' + Object.keys(lxd_synonyms).reduce(function (lxd_acc, lxd_k) {
    return lxd_question.indexOf(lxd_k) > -1 ? lxd_acc + ' ' + lxd_synonyms[lxd_k] : lxd_acc;
  }, '');

  var lxd_qMap = lxd_tokenize(lxd_expanded);
  if (lxd_qMap.size === 0) { return []; }

  var lxd_qWeight = 0;
  lxd_qMap.forEach(function (lxd_w) { lxd_qWeight += lxd_w; });

  var lxd_rows = await lxd_pool.query(
    'SELECT c.lxd_content, c.lxd_seq, f.lxd_name FROM lxd_kb_chunk c ' +
    'JOIN lxd_kb_file f ON f.lxd_id = c.lxd_file_id'
  );

  var lxd_scored = [];
  lxd_rows[0].forEach(function (lxd_row) {
    var lxd_cSet = new Set(lxd_tokenize(lxd_row.lxd_content).keys());
    var lxd_hitWeight = 0;
    lxd_qMap.forEach(function (lxd_w, lxd_t) {
      if (lxd_cSet.has(lxd_t)) { lxd_hitWeight += lxd_w; }
    });
    // 至少命中一个二元词（权重 2）才计入，避免单字巧合匹配
    if (lxd_hitWeight < 2) { return; }
    // 命中权重做长度归一化，再加问题覆盖率，避免长片段天然占优
    var lxd_score = lxd_hitWeight / Math.sqrt(lxd_cSet.size) + lxd_hitWeight / lxd_qWeight;
    lxd_scored.push({
      lxd_file: lxd_row.lxd_name,
      lxd_seq: lxd_row.lxd_seq,
      lxd_content: lxd_row.lxd_content,
      lxd_score: Number(lxd_score.toFixed(4))
    });
  });

  lxd_scored.sort(function (lxd_a, lxd_b) { return lxd_b.lxd_score - lxd_a.lxd_score; });
  return lxd_scored.slice(0, lxd_topK || 3);
}

// 解析、切片并写入数据库，返回入库结果
async function lxd_saveFile(lxd_name, lxd_ext, lxd_size, lxd_text) {
  var lxd_chunks = lxd_splitText(lxd_text, 400, 60);
  if (!lxd_chunks.length) { throw new Error('未能从文件中解析出文本内容'); }

  var lxd_result = await lxd_pool.query(
    'INSERT INTO lxd_kb_file (lxd_name, lxd_ext, lxd_size, lxd_chunk_count) VALUES (?, ?, ?, ?)',
    [lxd_name, lxd_ext, lxd_size, lxd_chunks.length]
  );
  var lxd_fileId = lxd_result[0].insertId;

  var lxd_values = lxd_chunks.map(function (lxd_c, lxd_i) { return [lxd_fileId, lxd_i + 1, lxd_c]; });
  for (var lxd_i = 0; lxd_i < lxd_values.length; lxd_i += 1) {
    await lxd_pool.query(
      'INSERT INTO lxd_kb_chunk (lxd_file_id, lxd_seq, lxd_content) VALUES (?, ?, ?)',
      lxd_values[lxd_i]
    );
  }

  return { lxd_id: lxd_fileId, lxd_name: lxd_name, lxd_chunk_count: lxd_chunks.length };
}

// 上传一个或多个知识库文件并解析入库
lxd_router.post('/upload', lxd_upload.any(), async function (lxd_req, lxd_res) {
  try {
    var lxd_files = lxd_req.files || [];
    if (!lxd_files.length) {
      return lxd_res.json({ code: 1, msg: '请先选择要上传的文件', data: null });
    }

    var lxd_okList = [];
    var lxd_failList = [];

    for (var lxd_i = 0; lxd_i < lxd_files.length; lxd_i += 1) {
      var lxd_f = lxd_files[lxd_i];
      var lxd_name = lxd_fixName(lxd_f.originalname);
      var lxd_ext = path.extname(lxd_name).toLowerCase();

      if (lxd_supportExt.indexOf(lxd_ext) === -1) {
        lxd_failList.push({ lxd_name: lxd_name, lxd_msg: '不支持的类型，仅支持 ' + lxd_supportExt.join(' ') });
        continue;
      }

      try {
        var lxd_text = await lxd_parseFile(lxd_f.buffer, lxd_ext);
        var lxd_saved = await lxd_saveFile(lxd_name, lxd_ext, lxd_f.size, lxd_text);
        lxd_okList.push(lxd_saved);
        console.log('[KB] 已入库：' + lxd_name + '（' + lxd_saved.lxd_chunk_count + ' 个片段）');
      } catch (lxd_err) {
        console.error('[KB] 解析失败：' + lxd_name, lxd_err.message);
        lxd_failList.push({ lxd_name: lxd_name, lxd_msg: lxd_err.message });
      }
    }

    lxd_res.json({
      code: lxd_okList.length ? 0 : 1,
      msg: '成功 ' + lxd_okList.length + ' 个，失败 ' + lxd_failList.length + ' 个',
      data: { lxd_ok: lxd_okList, lxd_fail: lxd_failList }
    });
  } catch (lxd_err) {
    lxd_res.json({ code: 1, msg: lxd_err.message, data: null });
  }
});

// 知识库文件列表（含片段数）
lxd_router.get('/list', async function (lxd_req, lxd_res) {
  try {
    var lxd_rows = await lxd_pool.query(
      'SELECT lxd_id, lxd_name, lxd_ext, lxd_size, lxd_chunk_count, lxd_created_at ' +
      'FROM lxd_kb_file ORDER BY lxd_id DESC'
    );
    lxd_res.json({ code: 0, msg: '查询成功', data: { list: lxd_rows[0] } });
  } catch (lxd_err) {
    lxd_res.json({ code: 1, msg: lxd_err.message, data: null });
  }
});

// 删除知识库文件及其全部片段
lxd_router.delete('/file/:lxd_id', async function (lxd_req, lxd_res) {
  try {
    var lxd_id = Number(lxd_req.params.lxd_id);
    if (!lxd_id) { return lxd_res.json({ code: 1, msg: '文件 ID 不合法', data: null }); }

    await lxd_pool.query('DELETE FROM lxd_kb_chunk WHERE lxd_file_id = ?', [lxd_id]);
    await lxd_pool.query('DELETE FROM lxd_kb_file WHERE lxd_id = ?', [lxd_id]);
    lxd_res.json({ code: 0, msg: '已删除', data: { lxd_id: lxd_id } });
  } catch (lxd_err) {
    lxd_res.json({ code: 1, msg: lxd_err.message, data: null });
  }
});

// 一键导入项目内置的两个示例知识库文件
lxd_router.post('/samples', async function (lxd_req, lxd_res) {
  try {
    if (!fs.existsSync(lxd_sampleDir)) {
      return lxd_res.json({ code: 1, msg: '未找到示例目录：' + lxd_sampleDir, data: null });
    }

    var lxd_exist = await lxd_pool.query('SELECT lxd_name FROM lxd_kb_file');
    var lxd_existNames = lxd_exist[0].map(function (lxd_r) { return lxd_r.lxd_name; });

    var lxd_okList = [];
    var lxd_skipList = [];
    var lxd_names = fs.readdirSync(lxd_sampleDir);

    for (var lxd_i = 0; lxd_i < lxd_names.length; lxd_i += 1) {
      var lxd_name = lxd_names[lxd_i];
      if (lxd_existNames.indexOf(lxd_name) > -1) {
        lxd_skipList.push(lxd_name);
        continue;
      }
      var lxd_full = path.join(lxd_sampleDir, lxd_name);
      var lxd_buf = fs.readFileSync(lxd_full);
      var lxd_ext = path.extname(lxd_name).toLowerCase();
      try {
        var lxd_text = await lxd_parseFile(lxd_buf, lxd_ext);
        lxd_okList.push(await lxd_saveFile(lxd_name, lxd_ext, lxd_buf.length, lxd_text));
      } catch (lxd_err) {
        console.error('[KB] 示例解析失败：' + lxd_name, lxd_err.message);
      }
    }

    lxd_res.json({
      code: 0,
      msg: '导入 ' + lxd_okList.length + ' 个，跳过已存在 ' + lxd_skipList.length + ' 个',
      data: { lxd_ok: lxd_okList, lxd_skip: lxd_skipList }
    });
  } catch (lxd_err) {
    lxd_res.json({ code: 1, msg: lxd_err.message, data: null });
  }
});

// 直接检索知识库片段，便于验证检索效果
lxd_router.post('/search', async function (lxd_req, lxd_res) {
  try {
    var lxd_question = (lxd_req.body.lxd_question || '').trim();
    if (!lxd_question) { return lxd_res.json({ code: 1, msg: '请输入检索问题', data: null }); }
    var lxd_hits = await lxd_retrieve(lxd_question, 3);
    lxd_res.json({ code: 0, msg: '检索完成，命中 ' + lxd_hits.length + ' 条', data: { list: lxd_hits } });
  } catch (lxd_err) {
    lxd_res.json({ code: 1, msg: lxd_err.message, data: null });
  }
});

module.exports = lxd_router;
module.exports.lxd_retrieve = lxd_retrieve;
