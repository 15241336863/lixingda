/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-25 | 大模型：DeepSeek-V4.1-Flash
 * 功能：知识库（RAG）前端脚本，负责文件上传、列表展示、删除与示例导入
 */
(function () {
  var lxd_fileInput = document.getElementById('lxd_kb_file');
  var lxd_uploadBtn = document.getElementById('lxd_kb_upload');
  var lxd_samplesBtn = document.getElementById('lxd_kb_samples');
  var lxd_status = document.getElementById('lxd_kb_status');
  var lxd_list = document.getElementById('lxd_kb_list');

  // 提示条文案，kind 取 ok / err / info
  function lxd_tip(lxd_kind, lxd_text) {
    lxd_status.className = 'lxd_kb-status lxd_kb-' + lxd_kind;
    lxd_status.textContent = lxd_text;
  }

  // 把字节数格式化成 KB
  function lxd_kbSize(lxd_bytes) {
    return (lxd_bytes / 1024).toFixed(1) + ' KB';
  }

  // 渲染知识库文件列表，含删除按钮
  function lxd_renderList(lxd_items) {
    lxd_list.innerHTML = '';

    if (!lxd_items.length) {
      lxd_list.innerHTML = '<p class="lxd_kb-empty">知识库为空，可上传文件或点击「导入 2 个示例知识库」</p>';
      return;
    }

    lxd_items.forEach(function (lxd_item) {
      var lxd_row = document.createElement('div');
      lxd_row.className = 'lxd_kb-item';

      var lxd_info = document.createElement('div');
      lxd_info.className = 'lxd_kb-info';

      var lxd_name = document.createElement('p');
      lxd_name.className = 'lxd_kb-name';
      lxd_name.textContent = lxd_item.lxd_name;

      var lxd_meta = document.createElement('p');
      lxd_meta.className = 'lxd_kb-meta';
      lxd_meta.textContent = lxd_item.lxd_ext.replace('.', '').toUpperCase() + ' · ' +
        lxd_kbSize(lxd_item.lxd_size) + ' · ' + lxd_item.lxd_chunk_count + ' 个片段 · ' +
        String(lxd_item.lxd_created_at).slice(0, 19).replace('T', ' ');

      lxd_info.appendChild(lxd_name);
      lxd_info.appendChild(lxd_meta);

      var lxd_del = document.createElement('button');
      lxd_del.className = 'lxd_kb-del';
      lxd_del.type = 'button';
      lxd_del.textContent = '删除';
      lxd_del.addEventListener('click', function () { lxd_remove(lxd_item); });

      lxd_row.appendChild(lxd_info);
      lxd_row.appendChild(lxd_del);
      lxd_list.appendChild(lxd_row);
    });
  }

  // 读取知识库文件列表
  function lxd_loadList() {
    fetch('/api/kb/list')
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('[KB] 文件列表：', lxd_json);
        if (lxd_json.code !== 0) {
          lxd_tip('err', lxd_json.msg || '读取列表失败');
          return;
        }
        lxd_renderList(lxd_json.data.list);
        lxd_tip('info', '共 ' + lxd_json.data.list.length + ' 个知识库文件');
      })
      .catch(function (lxd_err) {
        console.error('[KB] 列表请求失败：', lxd_err);
        lxd_tip('err', '无法访问后端接口，请用 http://localhost:8311/ai-chat.html 访问');
      });
  }

  // 上传所选文件并解析入库
  function lxd_upload() {
    var lxd_files = lxd_fileInput.files;
    if (!lxd_files || !lxd_files.length) {
      lxd_tip('err', '请先选择要上传的文件');
      return;
    }

    var lxd_form = new FormData();
    for (var lxd_i = 0; lxd_i < lxd_files.length; lxd_i += 1) {
      lxd_form.append('file', lxd_files[lxd_i]);
    }

    lxd_uploadBtn.disabled = true;
    lxd_tip('info', '正在上传并解析…');

    fetch('/api/kb/upload', { method: 'POST', body: lxd_form })
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('[KB] 上传结果：', lxd_json);
        if (lxd_json.code === 0) {
          lxd_tip('ok', '上传成功：' + lxd_json.msg);
        } else {
          var lxd_failText = (lxd_json.data && lxd_json.data.lxd_fail || [])
            .map(function (lxd_f) { return lxd_f.lxd_name + '：' + lxd_f.lxd_msg; }).join('；');
          lxd_tip('err', (lxd_json.msg || '上传失败') + (lxd_failText ? '（' + lxd_failText + '）' : ''));
        }
        lxd_fileInput.value = '';
        lxd_loadList();
      })
      .catch(function (lxd_err) {
        console.error('[KB] 上传失败：', lxd_err);
        lxd_tip('err', '上传失败，请确认后端已启动');
      })
      .finally(function () { lxd_uploadBtn.disabled = false; });
  }

  // 删除指定知识库文件（含其全部片段）
  function lxd_remove(lxd_item) {
    if (!window.confirm('确定删除「' + lxd_item.lxd_name + '」及其全部片段吗？')) { return; }

    fetch('/api/kb/file/' + lxd_item.lxd_id, { method: 'DELETE' })
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('[KB] 删除结果：', lxd_json);
        lxd_tip(lxd_json.code === 0 ? 'ok' : 'err', lxd_json.msg || '删除完成');
        lxd_loadList();
      })
      .catch(function (lxd_err) {
        console.error('[KB] 删除失败：', lxd_err);
        lxd_tip('err', '删除失败，请确认后端已启动');
      });
  }

  // 一键导入项目内置的两个示例知识库
  function lxd_importSamples() {
    lxd_samplesBtn.disabled = true;
    lxd_tip('info', '正在导入示例知识库…');

    fetch('/api/kb/samples', { method: 'POST' })
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('[KB] 导入示例结果：', lxd_json);
        lxd_tip(lxd_json.code === 0 ? 'ok' : 'err', lxd_json.msg || '导入完成');
        lxd_loadList();
      })
      .catch(function (lxd_err) {
        console.error('[KB] 导入示例失败：', lxd_err);
        lxd_tip('err', '导入失败，请确认后端已启动');
      })
      .finally(function () { lxd_samplesBtn.disabled = false; });
  }

  lxd_uploadBtn.addEventListener('click', lxd_upload);
  lxd_samplesBtn.addEventListener('click', lxd_importSamples);
  lxd_loadList();
})();
