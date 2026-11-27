/**
 * 姓名：李兴达 | 学号：24002120311 | 时间：2026-11-20 | 大模型：DeepSeek-V4.1-Flash
 * 功能：创建 MySQL 连接池，凭据全部来自 backend/.env
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const lxd_pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

module.exports = lxd_pool;
