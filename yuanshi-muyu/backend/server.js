/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-27 | 大模型：DeepSeek-V4.1-Flash
 * 功能：Express 服务入口，托管木语家居前端静态资源并提供 /api/ai、/api/kb 与业务接口
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const lxd_aiRouter = require('./routes/lxd_ai');
const lxd_kbRouter = require('./routes/lxd_kb');
const lxd_apiRouter = require('./routes/lxd_api');

const lxd_app = express();
const lxd_port = 8311; // 学号 24002120311 后三位为 311

// 开放全部跨域（仅课程作业使用）
lxd_app.use(cors());
// 解析 JSON 请求体，图片以 base64 提交时需要更大的体积上限
lxd_app.use(express.json({ limit: '20mb' }));
// 托管木语家居前端静态资源（项目根目录即为前端目录）
lxd_app.use(express.static(path.join(__dirname, '..')));
// AI 聊天 / 多模态接口
lxd_app.use('/api/ai', lxd_aiRouter);
// 知识库（RAG）接口
lxd_app.use('/api/kb', lxd_kbRouter);
// 业务接口：商品/分类/用户/后台管理/统计（SQLite）
lxd_app.use('/api', lxd_apiRouter);

// 统一错误响应，保证返回结构与成功响应一致
lxd_app.use(function (lxd_err, lxd_req, lxd_res, lxd_next) {
  lxd_res.status(500).json({
    code: 500,
    msg: lxd_err.message || '服务器内部错误',
    data: null
  });
});

// 启动服务并输出访问地址
lxd_app.listen(lxd_port, function () {
  console.log('木语家居 LLM 服务已启动：http://localhost:' + lxd_port);
});
