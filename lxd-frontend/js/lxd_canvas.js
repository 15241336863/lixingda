/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-20 | 大模型：DeepSeek-V4.1-Flash
 * 功能：首页 canvas 背景动画，粒子漂移并就近连线，鼠标位置产生轻微吸引
 */
(function () {
  var lxd_canvas = document.getElementById('lxd_canvas');
  var lxd_ctx = lxd_canvas.getContext('2d');
  var lxd_dpr = Math.min(window.devicePixelRatio || 1, 2);
  var lxd_w = 0;
  var lxd_h = 0;
  var lxd_particles = [];
  var lxd_mouse = { x: -9999, y: -9999 };
  var lxd_linkDist = 130;

  // 按窗口尺寸设置画布宽高，兼容高分屏
  function lxd_resize() {
    lxd_w = window.innerWidth;
    lxd_h = window.innerHeight;
    lxd_canvas.width = lxd_w * lxd_dpr;
    lxd_canvas.height = lxd_h * lxd_dpr;
    lxd_canvas.style.width = lxd_w + 'px';
    lxd_canvas.style.height = lxd_h + 'px';
    lxd_ctx.setTransform(lxd_dpr, 0, 0, lxd_dpr, 0, 0);
  }

  // 根据屏幕面积生成适量粒子，避免低配设备卡顿
  function lxd_createParticles() {
    var lxd_count = Math.round((lxd_w * lxd_h) / 16000);
    lxd_count = Math.max(36, Math.min(96, lxd_count));
    lxd_particles = [];
    for (var lxd_i = 0; lxd_i < lxd_count; lxd_i++) {
      lxd_particles.push({
        x: Math.random() * lxd_w,
        y: Math.random() * lxd_h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.8
      });
    }
  }

  // 每帧更新粒子位置并绘制圆点与连线
  function lxd_draw() {
    lxd_ctx.clearRect(0, 0, lxd_w, lxd_h);

    for (var lxd_i = 0; lxd_i < lxd_particles.length; lxd_i++) {
      var lxd_p = lxd_particles[lxd_i];

      lxd_p.x += lxd_p.vx;
      lxd_p.y += lxd_p.vy;

      // 碰到边界反弹，保证粒子始终在画面内
      if (lxd_p.x < 0 || lxd_p.x > lxd_w) { lxd_p.vx = -lxd_p.vx; }
      if (lxd_p.y < 0 || lxd_p.y > lxd_h) { lxd_p.vy = -lxd_p.vy; }

      // 鼠标靠近时轻微推开，形成可感知的互动
      var lxd_dx = lxd_p.x - lxd_mouse.x;
      var lxd_dy = lxd_p.y - lxd_mouse.y;
      var lxd_md = Math.sqrt(lxd_dx * lxd_dx + lxd_dy * lxd_dy);
      if (lxd_md < 110 && lxd_md > 0.1) {
        lxd_p.x += (lxd_dx / lxd_md) * 0.7;
        lxd_p.y += (lxd_dy / lxd_md) * 0.7;
      }

      lxd_ctx.beginPath();
      lxd_ctx.arc(lxd_p.x, lxd_p.y, lxd_p.r, 0, Math.PI * 2);
      lxd_ctx.fillStyle = 'rgba(140, 205, 255, .78)';
      lxd_ctx.fill();
    }

    // 距离足够近的两点之间画线，透明度随距离衰减
    for (var lxd_a = 0; lxd_a < lxd_particles.length; lxd_a++) {
      for (var lxd_b = lxd_a + 1; lxd_b < lxd_particles.length; lxd_b++) {
        var lxd_pa = lxd_particles[lxd_a];
        var lxd_pb = lxd_particles[lxd_b];
        var lxd_ddx = lxd_pa.x - lxd_pb.x;
        var lxd_ddy = lxd_pa.y - lxd_pb.y;
        var lxd_dist = Math.sqrt(lxd_ddx * lxd_ddx + lxd_ddy * lxd_ddy);
        if (lxd_dist < lxd_linkDist) {
          lxd_ctx.beginPath();
          lxd_ctx.moveTo(lxd_pa.x, lxd_pa.y);
          lxd_ctx.lineTo(lxd_pb.x, lxd_pb.y);
          lxd_ctx.strokeStyle = 'rgba(120, 180, 255, ' + (1 - lxd_dist / lxd_linkDist) * 0.28 + ')';
          lxd_ctx.lineWidth = 1;
          lxd_ctx.stroke();
        }
      }
    }

    requestAnimationFrame(lxd_draw);
  }

  // 监听窗口尺寸变化与鼠标移动，驱动重绘
  function lxd_bindEvents() {
    window.addEventListener('resize', function () {
      lxd_resize();
      lxd_createParticles();
    });

    window.addEventListener('mousemove', function (lxd_e) {
      lxd_mouse.x = lxd_e.clientX;
      lxd_mouse.y = lxd_e.clientY;
    });

    window.addEventListener('mouseout', function () {
      lxd_mouse.x = -9999;
      lxd_mouse.y = -9999;
    });
  }

  // 初始化画布、粒子与事件，然后启动动画循环
  function lxd_init() {
    lxd_resize();
    lxd_createParticles();
    lxd_bindEvents();
    lxd_draw();
  }

  lxd_init();
})();
