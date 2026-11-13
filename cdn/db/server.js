// 本地数据服务器：读取同目录 db.json 中的 poems 和 authors 数据对外提供接口，同时托管项目静态文件
const express = require('express');
const fs = require('fs');
const path = require('path');

const lxd_app = express();
const lxd_port = 3004;
const lxd_dbFile = path.join(__dirname, 'db.json');

// 读文件工具函数：每次请求都重新读，改完 db.json 不用重启服务器
function lxd_readDb(lxd_field) {
  return new Promise(function (resolve, reject) {
    fs.readFile(lxd_dbFile, 'utf8', function (err, lxd_raw) {
      if (err) { reject(new Error('读取 db.json 失败：' + err.message)); return; }
      try {
        const lxd_json = JSON.parse(lxd_raw);
        resolve(lxd_json[lxd_field] || []);
      } catch (lxd_err) { reject(new Error('db.json 不是合法 JSON：' + lxd_err.message)); }
    });
  });
}

// 接口 1：返回诗词数组
lxd_app.get('/api/poems', async function (req, res) {
  try { res.json(await lxd_readDb('poems')); }
  catch (lxd_err) { res.status(500).json({ error: lxd_err.message }); }
});

// 接口 2：返回作者列表（任务二新增）
lxd_app.get('/api/authors', async function (req, res) {
  try { res.json(await lxd_readDb('authors')); }
  catch (lxd_err) { res.status(500).json({ error: lxd_err.message }); }
});

// 托管工作区根目录的静态文件，让页面可以通过 http://localhost:3004/ 直接打开
lxd_app.use(express.static(path.join(__dirname, '..', '..')));

// 启动服务并打印可访问地址，方便直接复制到浏览器
lxd_app.listen(lxd_port, function () {
  console.log('数据服务器已启动：http://localhost:' + lxd_port);
  console.log('接口 1：http://localhost:' + lxd_port + '/api/poems');
  console.log('接口 2：http://localhost:' + lxd_port + '/api/authors');
  console.log('页面：http://localhost:' + lxd_port + '/poem-gallery.html');
});
