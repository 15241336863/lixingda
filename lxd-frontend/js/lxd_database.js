/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-20 | 大模型：DeepSeek-V4.1-Flash
 * 功能：数据库连接测试页脚本，预填默认账号并调用 /api/db/test 显示连接结果
 */
(function () {
  var lxd_form = document.getElementById('lxd_db_form');
  var lxd_host = document.getElementById('lxd_db_host');
  var lxd_user = document.getElementById('lxd_db_user');
  var lxd_password = document.getElementById('lxd_db_password');
  var lxd_name = document.getElementById('lxd_db_name');
  var lxd_submit = document.getElementById('lxd_db_submit');
  var lxd_result = document.getElementById('lxd_db_result');
  var lxd_resultTitle = document.getElementById('lxd_db_result_title');
  var lxd_resultMsg = document.getElementById('lxd_db_result_msg');
  var lxd_resultData = document.getElementById('lxd_db_result_data');

  // 显示成功或失败提示，data 有内容时以格式化 JSON 展示
  function lxd_showResult(lxd_type, lxd_title, lxd_msg, lxd_data) {
    lxd_result.hidden = false;
    lxd_result.classList.remove('lxd_ok', 'lxd_err');
    lxd_result.classList.add(lxd_type === 'ok' ? 'lxd_ok' : 'lxd_err');
    lxd_resultTitle.textContent = lxd_title;
    lxd_resultMsg.textContent = lxd_msg;

    if (lxd_data) {
      lxd_resultData.hidden = false;
      lxd_resultData.textContent = JSON.stringify(lxd_data, null, 2);
    } else {
      lxd_resultData.hidden = true;
      lxd_resultData.textContent = '';
    }
  }

  // 从后端读取 .env 中的默认账号，避免把密码写在前端代码里
  function lxd_loadDefault() {
    fetch('/api/db/default')
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('默认连接配置：', lxd_json);
        if (lxd_json.code === 0 && lxd_json.data) {
          if (lxd_json.data.host) { lxd_host.value = lxd_json.data.host; }
          if (lxd_json.data.user) { lxd_user.value = lxd_json.data.user; }
          if (lxd_json.data.password) { lxd_password.value = lxd_json.data.password; }
        }
      })
      .catch(function (lxd_err) {
        console.error('读取默认配置失败：', lxd_err);
      });
  }

  // 提交表单，请求后端尝试连接 MySQL 并展示结果
  function lxd_connect(lxd_event) {
    lxd_event.preventDefault();

    if (!lxd_user.value.trim()) {
      lxd_showResult('err', '无法连接', '请先填写用户名。');
      return;
    }

    lxd_submit.disabled = true;
    lxd_submit.textContent = '连接中…';

    var lxd_payload = {
      host: lxd_host.value.trim() || 'localhost',
      user: lxd_user.value.trim(),
      password: lxd_password.value,
      database: lxd_name.value.trim()
    };

    fetch('/api/db/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lxd_payload)
    })
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('连接测试返回：', lxd_json);
        if (lxd_json.code === 0) {
          lxd_showResult('ok', '连接成功', lxd_json.msg, lxd_json.data);
        } else {
          lxd_showResult('err', '连接失败', lxd_json.msg, lxd_json.data);
        }
      })
      .catch(function (lxd_err) {
        console.error('请求接口出错：', lxd_err);
        lxd_showResult('err', '请求出错', lxd_requestHint());
      })
      .finally(function () {
        lxd_submit.disabled = false;
        lxd_submit.textContent = '连接数据库';
      });
  }

  // 根据当前页面地址给出针对性的排查提示，区分双击打开与端口不对两种情况
  function lxd_requestHint() {
    if (location.protocol === 'file:') {
      return '当前是直接双击打开的本地文件（file://），浏览器禁止页面请求接口。请先双击 lxd/start-backend.bat 启动后端，再用 http://localhost:8311/database.html 访问本页。';
    }
    if (location.port !== '8311') {
      return '当前页面地址是 ' + location.origin + '，不是后端服务地址。请改访问 http://localhost:8311/database.html。';
    }
    return '无法访问后端接口，请确认后端服务仍在 8311 端口运行（可重新双击 lxd/start-backend.bat）。';
  }

  // 绑定提交事件并在打开页面时预填默认配置
  function lxd_init() {
    lxd_form.addEventListener('submit', lxd_connect);
    lxd_loadDefault();
  }

  lxd_init();
})();
