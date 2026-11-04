/**
 * 新闻排行榜选项卡脚本（可复用组件）
 * 作者：李兴达
 * 建立时间：2026-11-04
 * 使用大模型：GLM-5.3-Flash
 * 功能名称：排行榜选项卡切换（先清除全部选中状态，再设置当前选中）
 */

// 对指定的选项卡容器绑定监听事件，实现选中状态与内容面板的切换；传入任意容器即可复用
function Lxd_initTabs(Lxd_container) {
  // 取出该容器内的全部选项卡按钮与页面上的全部内容面板
  var Lxd_btns = Lxd_container.querySelectorAll(".Lxd_tab_btn");
  var Lxd_panels = document.querySelectorAll(".Lxd_tab_panel");

  // 监听容器的点击事件（事件委托）：点击任意按钮后执行切换逻辑
  Lxd_container.addEventListener("click", function (Lxd_e) {
    // 从点击位置向上找按钮，点到空白处则不处理
    var Lxd_btn = Lxd_e.target.closest(".Lxd_tab_btn");
    if (!Lxd_btn) return;

    // 第一步：先清除所有选项卡的选中状态
    Lxd_btns.forEach(function (Lxd_b) {
      Lxd_b.classList.remove("Lxd_active");
    });

    // 第二步：再设置当前元素的选中状态
    Lxd_btn.classList.add("Lxd_active");

    // 面板同步：先隐藏所有面板，再显示当前按钮 data-tab 指向的面板
    Lxd_panels.forEach(function (Lxd_p) {
      Lxd_p.classList.remove("Lxd_active");
    });
    var Lxd_target = document.getElementById(Lxd_btn.getAttribute("data-tab"));
    if (Lxd_target) {
      Lxd_target.classList.add("Lxd_active");
    }
  });
}

// 页面加载后初始化排行榜选项卡容器；若新增选项卡组，再加一行 Lxd_initTabs(容器) 即可复用
Lxd_initTabs(document.getElementById("Lxd_rankTabs"));
