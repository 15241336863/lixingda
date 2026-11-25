/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-20 | 大模型：DeepSeek-V4.1-Flash
 * 功能：菜谱展示页脚本，请求 /api/recipe/list 渲染卡片并支持搜索与分类筛选
 */
(function () {
  var lxd_grid = document.getElementById('lxd_rc_grid');
  var lxd_status = document.getElementById('lxd_rc_status');
  var lxd_search = document.getElementById('lxd_rc_search');
  var lxd_tags = document.querySelectorAll('.lxd_rc-tag');

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

  // 把菜谱数组渲染成卡片，列表为空时给出提示
  function lxd_render(lxd_list) {
    if (!lxd_list.length) {
      lxd_grid.innerHTML = '<p class="lxd_rc-empty">没有符合条件的菜谱，换个关键词试试。</p>';
      return;
    }

    var lxd_html = '';
    lxd_list.forEach(function (lxd_item) {
      lxd_html +=
        '<article class="lxd_rc-card">' +
          '<div class="lxd_rc-card-top">' +
            '<h2 class="lxd_rc-name">' + lxd_escape(lxd_item.lxd_name) + '</h2>' +
            '<span class="lxd_rc-cat">' + lxd_escape(lxd_item.lxd_category) + '</span>' +
          '</div>' +
          '<div class="lxd_rc-meta">' +
            '<span>难度：' + lxd_escape(lxd_item.lxd_difficulty) + '</span>' +
            '<span>耗时：' + lxd_escape(lxd_item.lxd_minutes) + ' 分钟</span>' +
          '</div>' +
          '<span class="lxd_rc-label">主要食材</span>' +
          '<p class="lxd_rc-text">' + lxd_escape(lxd_item.lxd_ingredients) + '</p>' +
          '<span class="lxd_rc-label">做法</span>' +
          '<p class="lxd_rc-text">' + lxd_escape(lxd_item.lxd_steps) + '</p>' +
        '</article>';
    });
    lxd_grid.innerHTML = lxd_html;
  }

  // 按当前关键词与分类请求接口，并更新状态文字
  function lxd_load() {
    var lxd_url = '/api/recipe/list?keyword=' + encodeURIComponent(lxd_keyword) +
      '&category=' + encodeURIComponent(lxd_category);

    lxd_status.classList.remove('lxd_err');
    lxd_status.textContent = '正在加载菜谱…';

    fetch(lxd_url)
      .then(function (lxd_res) { return lxd_res.json(); })
      .then(function (lxd_json) {
        console.log('菜谱接口返回：', lxd_json);
        if (lxd_json.code !== 0) {
          lxd_status.classList.add('lxd_err');
          lxd_status.textContent = lxd_json.msg;
          lxd_grid.innerHTML = '';
          return;
        }
        lxd_status.textContent = '共 ' + lxd_json.data.total + ' 道菜谱';
        lxd_render(lxd_json.data.list);
      })
      .catch(function (lxd_err) {
        console.error('菜谱请求失败：', lxd_err);
        lxd_status.classList.add('lxd_err');
        lxd_status.textContent = '请求失败，请确认后端已在 8311 端口启动。';
        lxd_grid.innerHTML = '';
      });
  }

  // 输入关键词时做 300ms 防抖，减少接口请求次数
  function lxd_onSearchInput() {
    clearTimeout(lxd_timer);
    lxd_timer = setTimeout(function () {
      lxd_keyword = lxd_search.value.trim();
      lxd_load();
    }, 300);
  }

  // 点击分类标签：先清空全部选中态，再给当前标签加选中态
  function lxd_onTagClick(lxd_event) {
    var lxd_btn = lxd_event.currentTarget;
    lxd_tags.forEach(function (lxd_b) { lxd_b.classList.remove('lxd_on'); });
    lxd_btn.classList.add('lxd_on');
    lxd_category = lxd_btn.dataset.category || '';
    lxd_load();
  }

  // 绑定搜索与分类事件，并加载首屏数据
  function lxd_init() {
    lxd_search.addEventListener('input', lxd_onSearchInput);
    lxd_tags.forEach(function (lxd_btn) {
      lxd_btn.addEventListener('click', lxd_onTagClick);
    });
    lxd_load();
  }

  lxd_init();
})();
