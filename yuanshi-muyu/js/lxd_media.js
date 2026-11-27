/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-25 | 大模型：DeepSeek-V4.1-Flash
 * 功能：多模态工具前端脚本，图片上传后请求 /api/ai/vision 返回描述，录音或音频上传后请求 /api/ai/asr 返回文字
 */
(function () {
  var lxd_visionInput = document.getElementById('lxd_vision_file');
  var lxd_visionBtn = document.getElementById('lxd_vision_btn');
  var lxd_visionPreview = document.getElementById('lxd_vision_preview');
  var lxd_visionStatus = document.getElementById('lxd_vision_status');
  var lxd_visionResult = document.getElementById('lxd_vision_result');

  var lxd_asrRecBtn = document.getElementById('lxd_asr_rec');
  var lxd_asrInput = document.getElementById('lxd_asr_file');
  var lxd_asrBtn = document.getElementById('lxd_asr_btn');
  var lxd_asrStatus = document.getElementById('lxd_asr_status');
  var lxd_asrResult = document.getElementById('lxd_asr_result');

  var lxd_imageData = '';        // 当前图片的 data URL
  var lxd_audioBlob = null;      // 待识别的音频（录音或本地文件）
  var lxd_audioName = '';        // 上传时使用的文件名
  var lxd_recorder = null;       // MediaRecorder 实例
  var lxd_recorderStream = null; // 麦克风媒体流
  var lxd_recorderTimer = null;  // 录音计时器
  var lxd_recorderSeconds = 0;   // 已录音秒数
  var lxd_recorderChunks = [];   // 录音分片

  // 统一更新提示条，kind 取 ok / err / info
  function lxd_tip(lxd_el, lxd_kind, lxd_text) {
    lxd_el.className = 'lxd_kb-status lxd_kb-' + lxd_kind;
    lxd_el.textContent = lxd_text;
  }

  // 把 data URL 填进预览区，图片按容器宽度等比显示
  function lxd_showPreview(lxd_dataUrl) {
    lxd_visionPreview.innerHTML = '';
    var lxd_img = document.createElement('img');
    lxd_img.src = lxd_dataUrl;
    lxd_img.alt = '待识别图片';
    lxd_visionPreview.appendChild(lxd_img);
  }

  // 读取图片文件为 data URL，超过 8MB 时提示压缩
  function lxd_onVisionPick() {
    var lxd_file = lxd_visionInput.files && lxd_visionInput.files[0];
    if (!lxd_file) { return; }

    if (lxd_file.size > 8 * 1024 * 1024) {
      lxd_imageData = '';
      lxd_visionPreview.textContent = '尚未选择图片';
      lxd_tip(lxd_visionStatus, 'err', '图片超过 8MB，请压缩后再上传');
      return;
    }

    var lxd_reader = new FileReader();
    lxd_reader.onload = function () {
      lxd_imageData = String(lxd_reader.result || '');
      lxd_showPreview(lxd_imageData);
      lxd_tip(lxd_visionStatus, 'info',
        '已选择：' + lxd_file.name + '（' + Math.round(lxd_file.size / 1024) + ' KB）');
      console.log('[VISION] 已读取图片：', lxd_file.name, lxd_file.size, '字节');
    };
    lxd_reader.readAsDataURL(lxd_file);
  }

  // 提交图片给后端，拿到模型返回的中文描述
  function lxd_runVision() {
    if (!lxd_imageData) {
      lxd_tip(lxd_visionStatus, 'err', '请先选择一张图片');
      return;
    }

    lxd_visionBtn.disabled = true;
    lxd_visionBtn.textContent = '识别中…';
    lxd_visionResult.textContent = '';
    lxd_tip(lxd_visionStatus, 'info', '正在请求 /api/ai/vision …');

    var lxd_payload = {
      lxd_image: lxd_imageData,
      lxd_prompt: '请用简体中文详细描述这张图片：主要物体、场景、颜色、画面中的文字以及整体氛围。'
    };
    console.log('[VISION] 发送给大模型的数据：', {
      model: 'SILICONFLOW_VISION_MODEL',
      lxd_prompt: lxd_payload.lxd_prompt,
      lxd_imageChars: lxd_payload.lxd_image.length
    });

    fetch('/api/ai/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lxd_payload)
    })
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('[VISION] 接收自大模型的数据：', lxd_json);
        if (lxd_json.code !== 0) {
          lxd_tip(lxd_visionStatus, 'err', lxd_json.msg || '识别失败');
          return;
        }
        lxd_visionResult.textContent = lxd_json.data.lxd_description;
        lxd_tip(lxd_visionStatus, 'ok',
          '识别成功 · ' + lxd_json.data.model);
      })
      .catch(function (lxd_err) {
        console.error('[VISION] 请求失败：', lxd_err);
        lxd_tip(lxd_visionStatus, 'err', location.protocol === 'file:'
          ? '请改用 http://localhost:8311/ai-chat.html 打开本页'
          : '请求失败，请确认后端已在 8311 端口启动');
      })
      .finally(function () {
        lxd_visionBtn.disabled = false;
        lxd_visionBtn.textContent = '识别并描述';
      });
  }

  // 把任意浏览器录音格式解码并重采样成 16kHz 单声道 WAV
  async function lxd_blobToWav(lxd_blob) {
    var lxd_ctx = new (window.AudioContext || window.webkitAudioContext)();
    var lxd_buffer = await lxd_ctx.decodeAudioData(await lxd_blob.arrayBuffer());
    var lxd_frames = Math.max(1, Math.ceil(lxd_buffer.duration * 16000));
    var lxd_offline = new OfflineAudioContext(1, lxd_frames, 16000);
    var lxd_source = lxd_offline.createBufferSource();
    lxd_source.buffer = lxd_buffer;
    lxd_source.connect(lxd_offline.destination);
    lxd_source.start();
    var lxd_rendered = await lxd_offline.startRendering();
    lxd_ctx.close();
    return lxd_encodeWav(lxd_rendered.getChannelData(0), 16000);
  }

  // 把浮点采样编码成标准 PCM16 WAV 文件
  function lxd_encodeWav(lxd_samples, lxd_rate) {
    var lxd_bytes = lxd_samples.length * 2;
    var lxd_buf = new ArrayBuffer(44 + lxd_bytes);
    var lxd_view = new DataView(lxd_buf);

    function lxd_writeStr(lxd_offset, lxd_str) {
      for (var lxd_i = 0; lxd_i < lxd_str.length; lxd_i += 1) {
        lxd_view.setUint8(lxd_offset + lxd_i, lxd_str.charCodeAt(lxd_i));
      }
    }

    lxd_writeStr(0, 'RIFF');
    lxd_view.setUint32(4, 36 + lxd_bytes, true);
    lxd_writeStr(8, 'WAVE');
    lxd_writeStr(12, 'fmt ');
    lxd_view.setUint32(16, 16, true);
    lxd_view.setUint16(20, 1, true);
    lxd_view.setUint16(22, 1, true);
    lxd_view.setUint32(24, lxd_rate, true);
    lxd_view.setUint32(28, lxd_rate * 2, true);
    lxd_view.setUint16(32, 2, true);
    lxd_view.setUint16(34, 16, true);
    lxd_writeStr(36, 'data');
    lxd_view.setUint32(40, lxd_bytes, true);

    var lxd_pos = 44;
    for (var lxd_j = 0; lxd_j < lxd_samples.length; lxd_j += 1) {
      var lxd_s = Math.max(-1, Math.min(1, lxd_samples[lxd_j]));
      lxd_view.setInt16(lxd_pos, lxd_s < 0 ? lxd_s * 0x8000 : lxd_s * 0x7fff, true);
      lxd_pos += 2;
    }

    return new Blob([lxd_buf], { type: 'audio/wav' });
  }

  // 开始录音，按钮变为「停止录音」并显示计时
  async function lxd_startRecord() {
    try {
      lxd_recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (lxd_err) {
      lxd_tip(lxd_asrStatus, 'err', '无法访问麦克风：' + lxd_err.message);
      return;
    }

    lxd_recorderChunks = [];
    lxd_recorderSeconds = 0;
    lxd_recorder = new MediaRecorder(lxd_recorderStream);

    lxd_recorder.ondataavailable = function (lxd_e) {
      if (lxd_e.data && lxd_e.data.size) { lxd_recorderChunks.push(lxd_e.data); }
    };

    lxd_recorder.onstop = async function () {
      lxd_recorderStream.getTracks().forEach(function (lxd_t) { lxd_t.stop(); });
      clearInterval(lxd_recorderTimer);

      var lxd_raw = new Blob(lxd_recorderChunks, {
        type: (lxd_recorderChunks[0] && lxd_recorderChunks[0].type) || 'audio/webm'
      });
      console.log('[ASR] 录音结束，原始大小：' + lxd_raw.size + ' 字节');

      try {
        lxd_audioBlob = await lxd_blobToWav(lxd_raw);
        lxd_audioName = 'lxd_record.wav';
        lxd_tip(lxd_asrStatus, 'ok', '录音完成：' + lxd_recorderSeconds + ' 秒，已转为 16kHz WAV（' +
          Math.round(lxd_audioBlob.size / 1024) + ' KB），可以点「转成文字」');
      } catch (lxd_err) {
        lxd_audioBlob = lxd_raw;
        lxd_audioName = 'lxd_record.webm';
        lxd_tip(lxd_asrStatus, 'info', '录音完成（保留原始格式上传）：' + lxd_recorderSeconds + ' 秒');
        console.warn('[ASR] 转 WAV 失败，直接上传原始录音：', lxd_err);
      }
    };

    lxd_recorder.start();
    lxd_asrRecBtn.textContent = '停止录音（0s）';
    lxd_tip(lxd_asrStatus, 'info', '正在录音…请对着麦克风说话');

    lxd_recorderTimer = setInterval(function () {
      lxd_recorderSeconds += 1;
      lxd_asrRecBtn.textContent = '停止录音（' + lxd_recorderSeconds + 's）';
    }, 1000);
  }

  // 停止录音，释放麦克风
  function lxd_stopRecord() {
    if (lxd_recorder && lxd_recorder.state !== 'inactive') {
      lxd_recorder.stop();
    }
    lxd_asrRecBtn.textContent = '开始录音';
  }

  // 录音按钮在开始与停止之间切换
  function lxd_toggleRecord() {
    if (lxd_recorder && lxd_recorder.state === 'recording') {
      lxd_stopRecord();
    } else {
      lxd_startRecord();
    }
  }

  // 选择本地音频文件作为识别输入
  function lxd_onAudioPick() {
    var lxd_file = lxd_asrInput.files && lxd_asrInput.files[0];
    if (!lxd_file) { return; }

    if (lxd_file.size > 15 * 1024 * 1024) {
      lxd_tip(lxd_asrStatus, 'err', '音频超过 15MB，请裁剪后再上传');
      return;
    }

    lxd_audioBlob = lxd_file;
    lxd_audioName = lxd_file.name;
    lxd_tip(lxd_asrStatus, 'info', '已选择：' + lxd_file.name + '（' +
      Math.round(lxd_file.size / 1024) + ' KB），可以点「转成文字」');
    console.log('[ASR] 已选择音频：', lxd_file.name, lxd_file.size, '字节');
  }

  // 上传音频到后端，显示识别出的文字
  function lxd_runAsr() {
    if (!lxd_audioBlob) {
      lxd_tip(lxd_asrStatus, 'err', '请先录音或选择音频文件');
      return;
    }

    lxd_asrBtn.disabled = true;
    lxd_asrBtn.textContent = '识别中…';
    lxd_asrResult.textContent = '';
    lxd_tip(lxd_asrStatus, 'info', '正在请求 /api/ai/asr …');

    var lxd_form = new FormData();
    lxd_form.append('file', lxd_audioBlob, lxd_audioName || 'lxd_audio.wav');
    console.log('[ASR] 发送给大模型的数据：', {
      file: lxd_audioName,
      bytes: lxd_audioBlob.size,
      model: 'qwen-audio-3.0-asr-flash'
    });

    fetch('/api/ai/asr', { method: 'POST', body: lxd_form })
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('[ASR] 接收自大模型的数据：', lxd_json);
        if (lxd_json.code !== 0) {
          lxd_tip(lxd_asrStatus, 'err', lxd_json.msg || '识别失败');
          return;
        }
        lxd_asrResult.textContent = lxd_json.data.lxd_text;
        lxd_tip(lxd_asrStatus, 'ok', '识别成功 · ' + lxd_json.data.model);
      })
      .catch(function (lxd_err) {
        console.error('[ASR] 请求失败：', lxd_err);
        lxd_tip(lxd_asrStatus, 'err', location.protocol === 'file:'
          ? '请改用 http://localhost:8311/ai-chat.html 打开本页'
          : '请求失败，请确认后端已在 8311 端口启动');
      })
      .finally(function () {
        lxd_asrBtn.disabled = false;
        lxd_asrBtn.textContent = '转成文字';
      });
  }

  // 绑定多模态工具的交互事件
  function lxd_initMedia() {
    lxd_visionInput.addEventListener('change', lxd_onVisionPick);
    lxd_visionBtn.addEventListener('click', lxd_runVision);
    lxd_asrRecBtn.addEventListener('click', lxd_toggleRecord);
    lxd_asrInput.addEventListener('change', lxd_onAudioPick);
    lxd_asrBtn.addEventListener('click', lxd_runAsr);
  }

  lxd_initMedia();
})();
