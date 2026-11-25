/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-20 | 大模型：DeepSeek-V4.1-Flash
 * 功能：图文列表页脚本，调用 /api/gallery/list 渲染图片卡片并支持搜索与分类筛选
 */
(function () {
  var lxd_grid = document.getElementById('lxd_gl_grid');
  var lxd_status = document.getElementById('lxd_gl_status');
  var lxd_search = document.getElementById('lxd_gl_search');
  var lxd_tags = document.querySelectorAll('.lxd_nw-tag');
  var lxd_apiUrl = document.getElementById('lxd_gl_api_url');

  var lxd_keyword = '';
  var lxd_category = '';
  var lxd_timer = null;

  // 转义文本，避免数据中的特殊字符破坏页面结构
  function lxd_escape(lxd_str) {
    return String(lxd_str == null ? '' : lxd_str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 把接口返回的时间格式化为“YYYY-MM-DD”
  function lxd_fmtDate(lxd_raw) {
    if (!lxd_raw) { return ''; }
    var lxd_d = new Date(lxd_raw);
    if (isNaN(lxd_d.getTime())) { return String(lxd_raw); }
    function lxd_pad(lxd_n) { return lxd_n < 10 ? '0' + lxd_n : '' + lxd_n; }
    return lxd_d.getFullYear() + '-' + lxd_pad(lxd_d.getMonth() + 1) + '-' + lxd_pad(lxd_d.getDate());
  }

  // 渲染图文卡片，列表为空时给出提示
  function lxd_render(lxd_rows) {
    if (!lxd_rows.length) {
      lxd_grid.innerHTML = '<p class="lxd_gl-empty">没有符合条件的图文，换个关键词试试。</p>';
      return;
    }

    var lxd_html = '';
    lxd_rows.forEach(function (lxd_item) {
      lxd_html +=
        '<article class="lxd_gl-card">' +
          '<div class="lxd_gl-thumb">' +
            '<img src="' + lxd_escape(lxd_item.lxd_image) + '" alt="' + lxd_escape(lxd_item.lxd_title) + '" loading="lazy">' +
            '<span class="lxd_gl-cat">' + lxd_escape(lxd_item.lxd_category) + '</span>' +
          '</div>' +
          '<div class="lxd_gl-body-box">' +
            '<h2 class="lxd_gl-title">' + lxd_escape(lxd_item.lxd_title) + '</h2>' +
            '<p class="lxd_gl-desc">' + lxd_escape(lxd_item.lxd_desc) + '</p>' +
            '<div class="lxd_gl-meta">' +
              '<span>' + lxd_escape(lxd_item.lxd_author) + '</span>' +
              '<span>♥ ' + lxd_escape(lxd_item.lxd_likes) + '</span>' +
              '<span>' + lxd_fmtDate(lxd_item.lxd_publish_time) + '</span>' +
            '</div>' +
          '</div>' +
        '</article>';
    });
    lxd_grid.innerHTML = lxd_html;
  }

  // 按当前关键词与分类请求接口，并同步页面上的接口链接
  function lxd_load() {
    var lxd_url = '/api/gallery/list?keyword=' + encodeURIComponent(lxd_keyword) +
      '&category=' + encodeURIComponent(lxd_category);

    lxd_apiUrl.href = lxd_url;
    lxd_apiUrl.textContent = lxd_url;

    lxd_status.classList.remove('lxd_err');
    lxd_status.textContent = '正在加载图文…';

    fetch(lxd_url)
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('图文接口返回：', lxd_json);
        if (lxd_json.code !== 0) {
          lxd_status.classList.add('lxd_err');
          lxd_status.textContent = lxd_json.msg;
          lxd_grid.innerHTML = '';
          return;
        }
        lxd_status.textContent = '共 ' + lxd_json.data.total + ' 组图文';
        lxd_render(lxd_json.data.list);
      })
      .catch(function (lxd_err) {
        console.error('图文请求失败：', lxd_err);
        lxd_status.classList.add('lxd_err');
        lxd_status.textContent = location.protocol === 'file:'
          ? '当前是直接双击打开的本地文件，请改用 http://localhost:8311/gallery.html 访问。'
          : '请求失败，请确认后端已在 8311 端口启动。';
        lxd_grid.innerHTML = '';
      });
  }

  // 输入关键词时做 300ms 防抖后重新请求
  function lxd_onSearchInput() {
    clearTimeout(lxd_timer);
    lxd_timer = setTimeout(function () {
      lxd_keyword = lxd_search.value.trim();
      lxd_load();
    }, 300);
  }

  // 点击分类：先清空全部选中态，再给当前项加选中态
  function lxd_onTagClick(lxd_event) {
    var lxd_btn = lxd_event.currentTarget;
    lxd_tags.forEach(function (lxd_b) { lxd_b.classList.remove('lxd_on'); });
    lxd_btn.classList.add('lxd_on');
    lxd_category = lxd_btn.dataset.category || '';
    lxd_load();
  }

  // 绑定搜索与分类事件，并加载首屏图文
  function lxd_init() {
    lxd_search.addEventListener('input', lxd_onSearchInput);
    lxd_tags.forEach(function (lxd_btn) {
      lxd_btn.addEventListener('click', lxd_onTagClick);
    });
    lxd_load();
  }

  lxd_init();
})();
