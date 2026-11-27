/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-25 | 大模型：DeepSeek-V4.1-Flash
 * 功能：AI 聊天代理接口，按 AI_PROVIDER 在硅基流动与七牛在线客服之间切换，避免前端暴露密钥
 */
const express = require('express');
const lxd_kb = require('./lxd_kb');
const lxd_multer = require('multer');
const lxd_router = express.Router();

// 语音文件上传：内存存储，单文件上限 20MB，交由接口转发给识别服务
const lxd_upload = lxd_multer({
  storage: lxd_multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// 读取服务商配置，只返回已配置密钥的服务商
function lxd_getProviders() {
  var lxd_all = [
    {
      id: 'siliconflow',
      name: '硅基流动',
      baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
      key: process.env.SILICONFLOW_API_KEY || '',
      models: [
        { id: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5-7B-Instruct' },
        { id: 'deepseek-ai/DeepSeek-V4.1-Flash', name: 'DeepSeek-V4.1-Flash' },
        { id: 'zai-org/GLM-5.3-Flash', name: 'GLM-5.3-Flash' }
      ]
    },
    {
      id: 'qiniu',
      name: '七牛在线客服',
      baseUrl: process.env.QINIU_CUSTOMER_SERVICE_BASE_URL || 'https://api.qnaigc.com/v1',
      key: process.env.QINIU_CUSTOMER_SERVICE_API_KEY || '',
      models: [
        { id: process.env.QINIU_CUSTOMER_SERVICE_MODEL || 'qiniu/conatus-free', name: 'conatus-free' }
      ]
    }
  ];
  return lxd_all.filter(function (lxd_p) { return !!lxd_p.key; });
}

// 根据模型 id 定位所属服务商，找不到时回退到 AI_PROVIDER 指定的服务商
function lxd_pickProvider(lxd_modelId) {
  var lxd_providers = lxd_getProviders();
  for (var lxd_i = 0; lxd_i < lxd_providers.length; lxd_i++) {
    for (var lxd_j = 0; lxd_j < lxd_providers[lxd_i].models.length; lxd_j++) {
      if (lxd_providers[lxd_i].models[lxd_j].id === lxd_modelId) {
        return lxd_providers[lxd_i];
      }
    }
  }
  var lxd_defaultId = process.env.AI_PROVIDER || 'siliconflow';
  var lxd_found = lxd_providers.filter(function (lxd_p) { return lxd_p.id === lxd_defaultId; })[0];
  return lxd_found || lxd_providers[0];
}

// 返回服务商与模型列表，供前端渲染下拉选项
lxd_router.get('/models', function (lxd_req, lxd_res) {
  var lxd_providers = lxd_getProviders();
  var lxd_defaultId = process.env.AI_PROVIDER || 'siliconflow';
  var lxd_default = lxd_providers.filter(function (lxd_p) { return lxd_p.id === lxd_defaultId; })[0] || lxd_providers[0];

  var lxd_list = [];
  lxd_providers.forEach(function (lxd_p) {
    lxd_p.models.forEach(function (lxd_m) {
      lxd_list.push({
        id: lxd_m.id,
        name: lxd_p.name + ' · ' + lxd_m.name,
        provider: lxd_p.id
      });
    });
  });

  lxd_res.json({
    code: 0,
    msg: '查询成功',
    data: {
      defaultProvider: lxd_default ? lxd_default.id : null,
      defaultModel: lxd_default ? lxd_default.models[0].id : null,
      list: lxd_list
    }
  });
});

// 请求服务商接口，遇到 429 限流自动重试，最多 3 次
async function lxd_requestModel(lxd_provider, lxd_model, lxd_messages) {
  var lxd_payload = JSON.stringify({
    model: lxd_model,
    messages: lxd_messages,
    stream: false,
    temperature: 0.7,
    max_tokens: 1024
  });

  for (var lxd_try = 1; lxd_try <= 3; lxd_try++) {
    var lxd_resp = await fetch(lxd_provider.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + lxd_provider.key
      },
      body: lxd_payload
    });
    var lxd_json = await lxd_resp.json();

    if (lxd_resp.ok || lxd_resp.status !== 429 || lxd_try === 3) {
      return { ok: lxd_resp.ok, status: lxd_resp.status, json: lxd_json, tries: lxd_try };
    }

    console.warn('[AI] 429 限流，第 ' + lxd_try + ' 次重试：' + lxd_model);
    await new Promise(function (lxd_r) { setTimeout(lxd_r, 1500 * lxd_try); });
  }
}

// 接收对话消息，转发到对应服务商并返回模型回答
lxd_router.post('/chat', async function (lxd_req, lxd_res) {
  var lxd_messages = lxd_req.body && lxd_req.body.messages;
  var lxd_modelId = (lxd_req.body && lxd_req.body.model) || '';
  var lxd_useKb = !!(lxd_req.body && lxd_req.body.lxd_useKb);
  var lxd_sources = [];

  if (!Array.isArray(lxd_messages) || !lxd_messages.length) {
    return lxd_res.json({ code: 1, msg: 'messages 不能为空', data: null });
  }

  var lxd_provider = lxd_pickProvider(lxd_modelId);
  if (!lxd_provider) {
    return lxd_res.json({ code: 1, msg: '未配置任何大模型服务商密钥，请检查 backend/.env', data: null });
  }

  var lxd_model = lxd_modelId || lxd_provider.models[0].id;
  console.log('[AI] provider=' + lxd_provider.id + ' model=' + lxd_model);

  // 开启知识库时，检索相关片段并注入 system，实现基于本地资料的问答
  if (lxd_useKb) {
    try {
      var lxd_lastQuestion = '';
      for (var lxd_i = lxd_messages.length - 1; lxd_i >= 0; lxd_i -= 1) {
        if (lxd_messages[lxd_i].role === 'user') { lxd_lastQuestion = lxd_messages[lxd_i].content; break; }
      }

      var lxd_hits = await lxd_kb.lxd_retrieve(lxd_lastQuestion, 3);
      if (lxd_hits.length) {
        var lxd_kbText = lxd_hits.map(function (lxd_h, lxd_idx) {
          return '【资料' + (lxd_idx + 1) + '｜' + lxd_h.lxd_file + '】\n' + lxd_h.lxd_content;
        }).join('\n\n');

        var lxd_kbPrompt = '【知识库参考】以下是门店资料中与该问题最相关的内容，回答时优先依据这些资料，不要编造资料以外的信息：\n' + lxd_kbText;

        lxd_messages = lxd_messages.slice();
        if (lxd_messages[0] && lxd_messages[0].role === 'system') {
          lxd_messages[0] = { role: 'system', content: lxd_messages[0].content + '\n\n' + lxd_kbPrompt };
        } else {
          lxd_messages.unshift({ role: 'system', content: lxd_kbPrompt });
        }

        lxd_sources = lxd_hits.map(function (lxd_h) {
          return {
            lxd_file: lxd_h.lxd_file,
            lxd_seq: lxd_h.lxd_seq,
            lxd_score: lxd_h.lxd_score,
            lxd_snippet: lxd_h.lxd_content.slice(0, 60)
          };
        });
        console.log('[KB] 命中 ' + lxd_hits.length + ' 条片段：' + lxd_sources.map(function (lxd_s) {
          return lxd_s.lxd_file + '#' + lxd_s.lxd_seq + '(' + lxd_s.lxd_score + ')';
        }).join(', '));
      } else {
        console.log('[KB] 未命中任何片段，按普通对话回答');
      }
    } catch (lxd_kbErr) {
      console.error('[KB] 检索失败：', lxd_kbErr.message);
    }
  }

  // 控制台输出实际发送给大模型的数据
  console.log('[AI] 发送给大模型的数据：' + JSON.stringify({ model: lxd_model, messages: lxd_messages }));

  try {
    var lxd_result = await lxd_requestModel(lxd_provider, lxd_model, lxd_messages);
    var lxd_resp = { ok: lxd_result.ok, status: lxd_result.status };
    var lxd_json = lxd_result.json;

    // 控制台输出从大模型接收到的数据
    console.log('[AI] 接收自大模型的数据：' + JSON.stringify(lxd_json));

    if (!lxd_resp.ok) {
      console.error('大模型服务返回错误：', lxd_provider.id, lxd_model, lxd_resp.status, lxd_json);
      var lxd_msg = lxd_json.message || lxd_json.msg || (lxd_json.error && lxd_json.error.message) || '未知错误';

      if (lxd_resp.status === 403 && /identity verification/i.test(lxd_msg)) {
        lxd_msg = '七牛账号未完成实名认证，免费模型暂不可用，请前往 https://portal.qiniu.com/developer/user/identity 完成认证后再试';
      } else if (lxd_resp.status === 429) {
        lxd_msg = '服务商限流（429），请稍后再试或切换其他模型';
      } else if (lxd_resp.status === 400 && /disabled/i.test(lxd_msg)) {
        lxd_msg = '该模型未在当前账号开通：' + lxd_model;
      } else if (lxd_resp.status === 502 && /retired|no longer available/i.test(lxd_msg)) {
        lxd_msg = '该模型已下线，请切换其他模型：' + lxd_model;
      }

      return lxd_res.json({
        code: lxd_resp.status,
        msg: lxd_msg,
        data: null
      });
    }

    var lxd_reply = lxd_json.choices && lxd_json.choices[0] && lxd_json.choices[0].message
      ? lxd_json.choices[0].message.content
      : '';

    if (!lxd_reply) {
      return lxd_res.json({ code: 1, msg: '模型未返回内容（免费模型可能被限流），请重试或切换其他模型', data: null });
    }

    lxd_res.json({
      code: 0,
      msg: '回答成功',
      data: {
        provider: lxd_provider.id,
        model: lxd_json.model || lxd_model,
        reply: lxd_reply,
        lxd_sources: lxd_sources,
        usage: lxd_json.usage || null
      }
    });
  } catch (lxd_err) {
    console.error('调用大模型失败：', lxd_err);
    lxd_res.json({ code: 1, msg: '调用大模型失败：' + lxd_err.message, data: null });
  }
});

// 图像识别：接收 base64 图片，调用视觉模型生成中文描述
lxd_router.post('/vision', async function (lxd_req, lxd_res) {
  var lxd_image = lxd_req.body && lxd_req.body.lxd_image;
  var lxd_prompt = (lxd_req.body && lxd_req.body.lxd_prompt) ||
    '请用简体中文详细描述这张图片：主要物体、场景、颜色、画面中的文字以及整体氛围。';

  if (!lxd_image || !/^data:image\//.test(lxd_image)) {
    return lxd_res.json({ code: 1, msg: '请上传图片（需为 data:image/... 的 base64 数据）', data: null });
  }
  // base64 体积约为原图的 1.33 倍，超过 12MB 时提示先压缩
  if (lxd_image.length > 12 * 1024 * 1024) {
    return lxd_res.json({ code: 1, msg: '图片过大，请压缩到 8MB 以内再试', data: null });
  }

  var lxd_providers = lxd_getProviders();
  var lxd_provider = lxd_providers.filter(function (lxd_p) { return lxd_p.id === 'siliconflow'; })[0] || lxd_providers[0];
  var lxd_model = process.env.SILICONFLOW_VISION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct';

  if (!lxd_provider) {
    return lxd_res.json({ code: 1, msg: '未配置视觉模型服务商密钥，请检查 backend/.env', data: null });
  }

  var lxd_messages = [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: lxd_image } },
      { type: 'text', text: lxd_prompt }
    ]
  }];

  console.log('[VISION] 发送给大模型的数据：' + JSON.stringify({
    model: lxd_model,
    lxd_prompt: lxd_prompt,
    lxd_imageChars: lxd_image.length
  }));

  try {
    var lxd_result = await lxd_requestModel(lxd_provider, lxd_model, lxd_messages);
    console.log('[VISION] 接收自大模型的数据：' + JSON.stringify(lxd_result.json));

    if (!lxd_result.ok) {
      var lxd_errMsg = (lxd_result.json.error && lxd_result.json.error.message) ||
        lxd_result.json.message || '视觉模型调用失败';
      return lxd_res.json({ code: lxd_result.status, msg: lxd_errMsg, data: null });
    }

    var lxd_choice = lxd_result.json.choices && lxd_result.json.choices[0];
    var lxd_desc = lxd_choice && lxd_choice.message ? lxd_choice.message.content : '';
    if (!lxd_desc) {
      return lxd_res.json({ code: 1, msg: '模型没有返回描述内容，请重试', data: null });
    }

    lxd_res.json({
      code: 0,
      msg: '识别成功',
      data: { provider: lxd_provider.id, model: lxd_model, lxd_description: lxd_desc }
    });
  } catch (lxd_err) {
    console.error('[VISION] 调用失败：', lxd_err);
    lxd_res.json({ code: 1, msg: '图像识别失败：' + lxd_err.message, data: null });
  }
});

// 语音识别：接收音频文件，调用七牛 Qwen-Audio-3.0-ASR-Flash 转成文字，异常时降级硅基流动
lxd_router.post('/asr', function (lxd_req, lxd_res) {
  lxd_upload.single('file')(lxd_req, lxd_res, async function (lxd_upErr) {
    if (lxd_upErr) {
      return lxd_res.json({ code: 1, msg: '音频上传失败：' + lxd_upErr.message, data: null });
    }
    if (!lxd_req.file) {
      return lxd_res.json({ code: 1, msg: '请上传音频文件', data: null });
    }

    // multer 会把 UTF-8 文件名按 latin1 解码，这里还原中文文件名
    var lxd_name = lxd_req.file.originalname || 'lxd_audio.wav';
    if (/^[\x00-\xff]*$/.test(lxd_name)) {
      var lxd_fixed = Buffer.from(lxd_name, 'latin1').toString('utf8');
      if (lxd_fixed.indexOf('\ufffd') === -1) { lxd_name = lxd_fixed; }
    }

    var lxd_qiniuBase = (process.env.QINIU_CUSTOMER_SERVICE_BASE_URL || 'https://api.qnaigc.com/v1').replace(/\/+$/, '');
    var lxd_qiniuKey = process.env.QINIU_CUSTOMER_SERVICE_API_KEY || '';
    var lxd_qiniuModel = process.env.QINIU_ASR_MODEL || 'qwen-audio-3.0-asr-flash';
    var lxd_sfBase = (process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
    var lxd_sfKey = process.env.SILICONFLOW_API_KEY || '';
    var lxd_sfModel = process.env.SILICONFLOW_ASR_MODEL || 'Qwen/Qwen3-ASR-1.7B';

    // 向指定平台的转写端点提交音频，429 限流时最多重试 3 次
    async function lxd_transcribe(lxd_base, lxd_key, lxd_model) {
      var lxd_last = null;
      for (var lxd_try = 1; lxd_try <= 3; lxd_try++) {
        var lxd_form = new FormData();
        lxd_form.append('file', new Blob([lxd_req.file.buffer], { type: lxd_req.file.mimetype || 'audio/wav' }), lxd_name);
        lxd_form.append('model', lxd_model);

        var lxd_r = await fetch(lxd_base + '/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + lxd_key },
          body: lxd_form
        });
        var lxd_j = await lxd_r.json().catch(function () { return {}; });
        lxd_last = { ok: lxd_r.ok, status: lxd_r.status, json: lxd_j };

        if (lxd_r.ok || lxd_r.status !== 429 || lxd_try === 3) { return lxd_last; }
        console.warn('[ASR] 429 限流，第 ' + lxd_try + ' 次重试：' + lxd_model);
        await new Promise(function (lxd_r2) { setTimeout(lxd_r2, 2000 * lxd_try); });
      }
      return lxd_last;
    }

    // 从各平台的返回结构里提取识别文本
    function lxd_pickText(lxd_j) {
      if (!lxd_j) { return ''; }
      if (typeof lxd_j.text === 'string') { return lxd_j.text; }
      if (lxd_j.data && typeof lxd_j.data.text === 'string') { return lxd_j.data.text; }
      if (Array.isArray(lxd_j.texts)) {
        return lxd_j.texts.map(function (lxd_t) { return lxd_t.text || ''; }).join('');
      }
      return '';
    }

    console.log('[ASR] 发送给大模型的数据：file=' + lxd_name +
      ' bytes=' + lxd_req.file.size + ' model=' + lxd_qiniuModel);

    try {
      var lxd_result = null;
      var lxd_usedProvider = 'qiniu';
      var lxd_usedModel = lxd_qiniuModel;

      if (lxd_qiniuKey) {
        lxd_result = await lxd_transcribe(lxd_qiniuBase, lxd_qiniuKey, lxd_qiniuModel);
      }

      // 七牛渠道异常（如上游 502）时降级到硅基流动的转写接口
      if ((!lxd_result || !lxd_result.ok) && lxd_sfKey) {
        console.warn('[ASR] 七牛识别失败，降级硅基流动：' + JSON.stringify(lxd_result && lxd_result.json));
        lxd_usedProvider = 'siliconflow';
        lxd_usedModel = lxd_sfModel;
        lxd_result = await lxd_transcribe(lxd_sfBase, lxd_sfKey, lxd_sfModel);
      }

      console.log('[ASR] 接收自大模型的数据：' + JSON.stringify(lxd_result && lxd_result.json));

      if (!lxd_result || !lxd_result.ok) {
        var lxd_msg = (lxd_result && lxd_result.json && lxd_result.json.error &&
          lxd_result.json.error.message) || '识别服务返回异常';
        return lxd_res.json({ code: 1, msg: '语音识别失败：' + lxd_msg, data: null });
      }

      var lxd_text = lxd_pickText(lxd_result.json).trim();
      if (!lxd_text) {
        return lxd_res.json({ code: 1, msg: '没有识别到有效语音，请说话清晰一些或换一段音频', data: null });
      }

      lxd_res.json({
        code: 0,
        msg: '识别成功',
        data: { provider: lxd_usedProvider, model: lxd_usedModel, lxd_text: lxd_text }
      });
    } catch (lxd_err) {
      console.error('[ASR] 调用失败：', lxd_err);
      lxd_res.json({ code: 1, msg: '语音识别失败：' + lxd_err.message, data: null });
    }
  });
});

module.exports = lxd_router;
