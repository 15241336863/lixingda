/**
 * 新闻 Tab 选项卡脚本（可复用组件）
 * 作者：李兴达
 * 建立时间：2026-11-04
 * 使用大模型：GLM-5.3-Flash
 * 功能名称：Tab 选项卡切换（先清除全部选中，再设置当前选中）
 */

// 对指定的选项卡容器绑定监听事件，实现选中状态与内容面板的切换；传入任意容器即可复用
function lxd_initTabs(lxd_container) {
  // 取出该容器内的全部选项卡按钮与页面上的全部内容面板
  var lxd_btns = lxd_container.querySelectorAll(".lxd_tab_btn");
  var lxd_panels = document.querySelectorAll(".lxd_tab_panel");

  // 监听容器的点击事件（事件委托）：点击任意按钮后执行切换逻辑
  lxd_container.addEventListener("click", function (lxd_e) {
    // 从点击位置向上找按钮，点到空白处则不处理
    var lxd_btn = lxd_e.target.closest(".lxd_tab_btn");
    if (!lxd_btn) return;

    // 第一步：先清除所有选项卡的选中状态
    lxd_btns.forEach(function (lxd_b) {
      lxd_b.classList.remove("lxd_active");
    });

    // 第二步：再设置当前元素的选中状态
    lxd_btn.classList.add("lxd_active");

    // 面板同步：先隐藏所有面板，再显示当前按钮 data-tab 指向的面板
    lxd_panels.forEach(function (lxd_p) {
      lxd_p.classList.remove("lxd_active");
    });
    var lxd_target = document.getElementById(lxd_btn.getAttribute("data-tab"));
    if (lxd_target) {
      lxd_target.classList.add("lxd_active");
    }
  });
}

// 页面加载后初始化选项卡容器；若页面新增 tab 组，再加一行 lxd_initTabs(容器) 即可复用
lxd_initTabs(document.getElementById("lxd_newsTabs"));
