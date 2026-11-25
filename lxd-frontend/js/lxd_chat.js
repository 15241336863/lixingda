/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-25 | 大模型：DeepSeek-V4.1-Flash
 * 功能：AI 聊天页脚本，维护对话上下文并调用后端 /api/ai/chat
 */
(function () {
  var lxd_box = document.getElementById('lxd_chat_box');
  var lxd_input = document.getElementById('lxd_chat_input');
  var lxd_sendBtn = document.getElementById('lxd_chat_send');
  var lxd_clearBtn = document.getElementById('lxd_chat_clear');
  var lxd_modelSel = document.getElementById('lxd_chat_model');

  // 客服人设提示词：用店铺事实 + 职责边界 + 越界兜底话术约束模型
  var lxd_systemPrompt = [
    '你是「中华美食街」的在线客服小食。',
    '【店铺信息】营业时间：每天 10:00-21:30，节假日不休；招牌菜：番茄牛腩煲 58 元、扬州炒饭 22 元、蒜蓉粉丝虾 68 元、可乐鸡翅 32 元；配送范围：门店 5 公里内，满 30 元起送，配送费 3 元，超过 5 公里暂不配送；门店电话：400-800-1234。',
    '【职责范围】只回答三类问题：1. 营业时间；2. 招牌菜与价格；3. 配送范围与配送费。',
    '【回答要求】使用简体中文，亲切简短，不超过 3 句话；先给结论，再礼貌邀请顾客到店或下单。',
    '【越界处理】遇到职责范围以外的问题（写代码、新闻、天气、股票、医疗建议、其他商家等），只回一句统一话术：「不好意思，我是中华美食街的客服小食，只能回答营业时间、招牌菜和配送范围，其他问题请留言或拨打 400-800-1234。」不要提供建议、科普或替代渠道，不要展开展望、不要举例。',
    '【禁止编造】只使用以上店铺信息作答，不要提及入驻商户差异、外卖平台、小程序、地图等未提供内容；不确定的信息请顾客留言确认。'
  ].join('\n');
  var lxd_history = [{ role: 'system', content: lxd_systemPrompt }];
  var lxd_busy = false;

  // 追加一条消息气泡并返回文本节点，role 取 ai / user / err / sys
  function lxd_append(lxd_role, lxd_text) {
    var lxd_wrap = document.createElement('div');
    lxd_wrap.className = 'lxd_msg lxd_' + (lxd_role === 'user' ? 'user' : lxd_role);

    // 系统提示只显示一行居中文字，不带身份标签
    if (lxd_role === 'sys') {
      var lxd_note = document.createElement('p');
      lxd_note.className = 'lxd_msg-text';
      lxd_note.textContent = lxd_text || '';
      lxd_wrap.appendChild(lxd_note);
      lxd_box.appendChild(lxd_wrap);
      lxd_box.scrollTop = lxd_box.scrollHeight;
      return lxd_note;
    }

    var lxd_who = document.createElement('span');
    lxd_who.className = 'lxd_msg-who';
    lxd_who.textContent = lxd_role === 'user' ? '我' : (lxd_role === 'err' ? '系统提示' : 'AI');

    var lxd_p = document.createElement('p');
    lxd_p.className = 'lxd_msg-text';
    lxd_p.textContent = lxd_text || '';

    lxd_wrap.appendChild(lxd_who);
    lxd_wrap.appendChild(lxd_p);
    lxd_box.appendChild(lxd_wrap);
    lxd_box.scrollTop = lxd_box.scrollHeight;
    return lxd_p;
  }

  // 显示等待动画气泡，返回整体元素便于结束后移除
  function lxd_showTyping() {
    var lxd_wrap = document.createElement('div');
    lxd_wrap.className = 'lxd_msg lxd_ai';
    lxd_wrap.innerHTML = '<span class="lxd_msg-who">AI</span>' +
      '<p class="lxd_msg-text lxd_dots"><span></span><span></span><span></span></p>';
    lxd_box.appendChild(lxd_wrap);
    lxd_box.scrollTop = lxd_box.scrollHeight;
    return lxd_wrap;
  }

  // 逐字显示 AI 回复，制造打字机效果
  function lxd_typewriter(lxd_el, lxd_text) {
    var lxd_i = 0;
    lxd_el.textContent = '';
    var lxd_timer = setInterval(function () {
      lxd_i += 2;
      lxd_el.textContent = lxd_text.slice(0, lxd_i);
      lxd_box.scrollTop = lxd_box.scrollHeight;
      if (lxd_i >= lxd_text.length) {
        clearInterval(lxd_timer);
        lxd_el.textContent = lxd_text;
      }
    }, 16);
  }

  // 切换发送按钮的可用状态，避免重复提交
  function lxd_setBusy(lxd_flag) {
    lxd_busy = lxd_flag;
    lxd_sendBtn.disabled = lxd_flag;
    lxd_sendBtn.textContent = lxd_flag ? '思考中' : '发送';
  }

  // 发送当前输入内容，调用后端接口并渲染回复
  function lxd_send() {
    var lxd_text = lxd_input.value.trim();
    if (!lxd_text || lxd_busy) { return; }

    lxd_append('user', lxd_text);
    lxd_history.push({ role: 'user', content: lxd_text });
    lxd_input.value = '';
    lxd_setBusy(true);

    var lxd_typing = lxd_showTyping();

    // 是否携带知识库检索结果，可勾选开关实时控制
    var lxd_kbSwitch = document.getElementById('lxd_kb_use');
    var lxd_payload = {
      model: lxd_modelSel.value,
      messages: lxd_history,
      lxd_useKb: !!(lxd_kbSwitch && lxd_kbSwitch.checked)
    };

    // 控制台输出本次发送给大模型的数据（与后端日志内容一致）
    console.log('[KB] 发送给大模型的数据：', lxd_payload);

    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lxd_payload)
    })
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('[KB] 接收自大模型的数据：', lxd_json);
        lxd_typing.remove();

        if (lxd_json.code !== 0) {
          lxd_append('err', lxd_json.msg || '请求失败');
          lxd_history.pop();
          return;
        }

        var lxd_reply = lxd_json.data.reply || '（模型没有返回内容）';
        lxd_history.push({ role: 'assistant', content: lxd_reply });
        var lxd_p = lxd_append('ai', '');
        lxd_typewriter(lxd_p, lxd_reply);

        // 展示命中的知识库片段来源，便于核对答案出处
        if (lxd_json.data.lxd_sources && lxd_json.data.lxd_sources.length) {
          var lxd_src = document.createElement('div');
          lxd_src.className = 'lxd_msg-src';
          lxd_src.textContent = '知识库引用：' + lxd_json.data.lxd_sources.map(function (lxd_s) {
            return lxd_s.lxd_file + ' 第 ' + lxd_s.lxd_seq + ' 段（相关度 ' + lxd_s.lxd_score + '）';
          }).join('；');
          lxd_p.parentNode.appendChild(lxd_src);
          lxd_box.scrollTop = lxd_box.scrollHeight;
        }
      })
      .catch(function (lxd_err) {
        console.error('AI 请求失败：', lxd_err);
        lxd_typing.remove();
        lxd_history.pop();
        lxd_append('err', location.protocol === 'file:'
          ? '当前是直接双击打开的本地文件，请改用 http://localhost:8311/ai-chat.html 访问。'
          : '请求失败，请确认后端已在 8311 端口启动。');
      })
      .finally(function () {
        lxd_setBusy(false);
        lxd_input.focus();
      });
  }

  // 清空对话并重置上下文
  function lxd_clear() {
    lxd_history = [{ role: 'system', content: lxd_systemPrompt }];
    lxd_box.innerHTML = '';
    lxd_append('ai', '对话已清空，可以开始新的提问。');
  }

  // 接口不可用时的兜底模型，保证两个平台的下拉项始终可见
  var lxd_fallbackModels = [
    { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5-7B-Instruct', provider: 'siliconflow' },
    { id: 'deepseek-ai/DeepSeek-V4.1-Flash', name: 'DeepSeek-V4.1-Flash', provider: 'siliconflow' },
    { id: 'zai-org/GLM-5.3-Flash', name: 'GLM-5.3-Flash', provider: 'siliconflow' },
    { id: 'qiniu/conatus-free', name: 'conatus-free', provider: 'qiniu' }
  ];

  // 按服务商分组渲染下拉选项，optgroup 让两个平台一眼可辨
  function lxd_renderModels(lxd_list, lxd_default) {
    var lxd_groups = {};
    lxd_list.forEach(function (lxd_m) {
      var lxd_gn = lxd_m.provider === 'qiniu' ? '七牛在线客服' : '硅基流动';
      if (!lxd_groups[lxd_gn]) { lxd_groups[lxd_gn] = []; }
      // 接口返回的 name 形如「硅基流动 · Qwen2.5-7B-Instruct」，分组后只保留模型名
      var lxd_label = lxd_m.name.indexOf(' · ') > -1 ? lxd_m.name.split(' · ')[1] : lxd_m.name;
      lxd_groups[lxd_gn].push({ id: lxd_m.id, label: lxd_label });
    });

    var lxd_html = '';
    Object.keys(lxd_groups).forEach(function (lxd_gn) {
      lxd_html += '<optgroup label="' + lxd_gn + '">';
      lxd_groups[lxd_gn].forEach(function (lxd_item) {
        lxd_html += '<option value="' + lxd_item.id + '">' + lxd_item.label + '</option>';
      });
      lxd_html += '</optgroup>';
    });

    lxd_modelSel.innerHTML = lxd_html;
    if (lxd_default) { lxd_modelSel.value = lxd_default; }
  }

  // 从后端读取可选模型列表并填充下拉框，失败时使用兜底列表并提示
  function lxd_loadModels() {
    fetch('/api/ai/models')
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        if (lxd_json.code !== 0 || !lxd_json.data.list.length) {
          lxd_renderModels(lxd_fallbackModels, 'Qwen/Qwen2.5-7B-Instruct');
          return;
        }
        lxd_renderModels(lxd_json.data.list, lxd_json.data.defaultModel);
      })
      .catch(function (lxd_err) {
        console.error('获取模型列表失败：', lxd_err);
        lxd_renderModels(lxd_fallbackModels, 'Qwen/Qwen2.5-7B-Instruct');
        lxd_append('err', location.protocol === 'file:'
          ? '当前是本地文件方式打开的，浏览器禁止访问接口：请改用 http://localhost:8311/ai-chat.html 访问本页'
          : '模型列表加载失败，已使用兜底列表，请确认后端已在 8311 端口启动');
      });
  }

  // 绑定发送、清空与键盘事件，并初始化模型列表
  function lxd_init() {
    lxd_sendBtn.addEventListener('click', lxd_send);
    lxd_clearBtn.addEventListener('click', lxd_clear);
    // 切换模型时插入系统提示，便于确认当前生效的平台
    lxd_modelSel.addEventListener('change', function () {
      lxd_append('sys', '已切换到：' + lxd_modelSel.options[lxd_modelSel.selectedIndex].text);
    });
    lxd_input.addEventListener('keydown', function (lxd_e) {
      if (lxd_e.key === 'Enter' && !lxd_e.shiftKey) {
        lxd_e.preventDefault();
        lxd_send();
      }
    });
    lxd_loadModels();
  }

  lxd_init();
})();
