/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-20 | 大模型：DeepSeek-V4.1-Flash
 * 功能：科技新闻列表页脚本，调用 /api/news/list 渲染新闻并支持搜索与栏目筛选
 */
(function () {
  var lxd_list = document.getElementById('lxd_nw_list');
  var lxd_status = document.getElementById('lxd_nw_status');
  var lxd_search = document.getElementById('lxd_nw_search');
  var lxd_tags = document.querySelectorAll('.lxd_nw-tag');
  var lxd_apiUrl = document.getElementById('lxd_nw_api_url');

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

  // 把接口返回的 ISO 时间格式化为“YYYY-MM-DD HH:mm”
  function lxd_fmtTime(lxd_raw) {
    if (!lxd_raw) { return ''; }
    var lxd_d = new Date(lxd_raw);
    if (isNaN(lxd_d.getTime())) { return String(lxd_raw); }
    function lxd_pad(lxd_n) { return lxd_n < 10 ? '0' + lxd_n : '' + lxd_n; }
    return lxd_d.getFullYear() + '-' + lxd_pad(lxd_d.getMonth() + 1) + '-' + lxd_pad(lxd_d.getDate()) +
      ' ' + lxd_pad(lxd_d.getHours()) + ':' + lxd_pad(lxd_d.getMinutes());
  }

  // 渲染新闻列表，为空时给出提示
  function lxd_render(lxd_rows) {
    if (!lxd_rows.length) {
      lxd_list.innerHTML = '<p class="lxd_nw-empty">没有符合条件的新闻，换个关键词试试。</p>';
      return;
    }

    var lxd_html = '';
    lxd_rows.forEach(function (lxd_item) {
      lxd_html +=
        '<article class="lxd_nw-item">' +
          '<div class="lxd_nw-thumb">' +
            '<img src="' + lxd_escape(lxd_item.lxd_image) + '" alt="' + lxd_escape(lxd_item.lxd_title) + '" loading="lazy">' +
          '</div>' +
          '<div class="lxd_nw-main">' +
            '<div class="lxd_nw-item-top">' +
              '<h2 class="lxd_nw-title">' + lxd_escape(lxd_item.lxd_title) + '</h2>' +
              '<span class="lxd_nw-cat">' + lxd_escape(lxd_item.lxd_category) + '</span>' +
            '</div>' +
            '<p class="lxd_nw-summary">' + lxd_escape(lxd_item.lxd_summary) + '</p>' +
            '<div class="lxd_nw-meta">' +
              '<span>来源：' + lxd_escape(lxd_item.lxd_source) + '</span>' +
              '<span>作者：' + lxd_escape(lxd_item.lxd_author) + '</span>' +
              '<span>' + lxd_fmtTime(lxd_item.lxd_publish_time) + '</span>' +
              '<span>浏览 ' + lxd_escape(lxd_item.lxd_views) + '</span>' +
            '</div>' +
          '</div>' +
        '</article>';
    });
    lxd_list.innerHTML = lxd_html;
  }

  // 按当前关键词与栏目请求接口，并同步页面上的接口链接
  function lxd_load() {
    var lxd_query = '?keyword=' + encodeURIComponent(lxd_keyword) +
      '&category=' + encodeURIComponent(lxd_category);
    var lxd_url = '/api/news/list' + lxd_query;

    lxd_apiUrl.href = lxd_url;
    lxd_apiUrl.textContent = lxd_url;

    lxd_status.classList.remove('lxd_err');
    lxd_status.textContent = '正在加载新闻…';

    fetch(lxd_url)
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('新闻接口返回：', lxd_json);
        if (lxd_json.code !== 0) {
          lxd_status.classList.add('lxd_err');
          lxd_status.textContent = lxd_json.msg;
          lxd_list.innerHTML = '';
          return;
        }
        lxd_status.textContent = '共 ' + lxd_json.data.total + ' 条新闻';
        lxd_render(lxd_json.data.list);
      })
      .catch(function (lxd_err) {
        console.error('新闻请求失败：', lxd_err);
        lxd_status.classList.add('lxd_err');
        lxd_status.textContent = location.protocol === 'file:'
          ? '当前是直接双击打开的本地文件，请改用 http://localhost:8311/news.html 访问。'
          : '请求失败，请确认后端已在 8311 端口启动。';
        lxd_list.innerHTML = '';
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

  // 点击栏目：先清空全部选中态，再给当前项加选中态
  function lxd_onTagClick(lxd_event) {
    var lxd_btn = lxd_event.currentTarget;
    lxd_tags.forEach(function (lxd_b) { lxd_b.classList.remove('lxd_on'); });
    lxd_btn.classList.add('lxd_on');
    lxd_category = lxd_btn.dataset.category || '';
    lxd_load();
  }

  // 绑定搜索与栏目事件，并加载首屏新闻
  function lxd_init() {
    lxd_search.addEventListener('input', lxd_onSearchInput);
    lxd_tags.forEach(function (lxd_btn) {
      lxd_btn.addEventListener('click', lxd_onTagClick);
    });
    lxd_load();
  }

  lxd_init();
})();
