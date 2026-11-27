# agents.md · 项目开发规则

> 项目：木语家居（源氏木语风格移动端电商网站）
> 姓名：李兴达　学号：24002120311
> 适用对象：所有参与本项目的开发者与 AI 编程助手

## 一、命名约定

- 前端 CSS 类名、id、JS 变量、JS 函数统一以 `li_` 开头（如 `li_page`、`li_card`、`li_products`、`li_renderList`）。
- 后端接口、数据库表与字段、后端变量统一以 `lxd_` 开头（如 `lxd_products`、`lxd_order_no`），`li_` 与 `lxd_` 均为本人姓名缩写前缀。
- 文件名、目录名全部使用英文小写与短横线，禁止汉字文件名。
- 接口路径统一使用 `/api/` 前缀，RESTful 风格：资源名 + 请求方法表达语义。

## 二、目录约定

```text
yuanshi-muyu/
├── index.html ~ *.html     # 前台页面（后台管理 admin.html 单独计算）
├── css/                    # 样式，主样式表固定为 lixingda.css
├── js/                     # 公共脚本与页面脚本
├── data/                   # 兜底 JSON 数据（离线演示用）
├── img/                    # 图片素材（全部本地）
├── icons/                  # iconfont 图标字体（全部本地）
├── backend/                # Express 接口服务（端口 8311）
│   ├── server.js           # 服务入口
│   ├── routes/             # 路由模块
│   ├── db/                 # SQLite 数据库文件
│   └── .env                # 密钥配置（禁止提交）
├── agents.md               # 本文件
├── README.md               # 项目说明与运行步骤
└── 24002120311-李兴达-*.md  # 提示词 / 接口 / 数据库文档
```

## 三、代码风格

- 原生 HTML5 + CSS3 + ES6，禁止使用 Vue / React / jQuery / Bootstrap 等框架。
- 除本地 ECharts、iconfont 外，禁止通过 CDN 引入任何在线资源。
- 每个文件头部必须包含注释：姓名、学号、时间、大模型；每个 JS 函数上方写一行功能注释。
- 使用 2 空格缩进，字符串统一单引号（JS），CSS 使用 `--li_` 前缀自定义变量。
- 所有接口返回统一结构：`{ "code": 0, "message": "ok", "data": ... }`，失败时 `code` 非 0。
- 前端请求统一走 `LI.request`（或 fetch 封装），数据与错误信息输出到浏览器控制台。

## 四、安全约定

- `backend/.env` 保存数据库与 AI 密钥，必须存在于 `.gitignore` 中，禁止提交或写入文档。
- 后台接口必须校验 `Authorization: Bearer <token>`，未登录返回 401，前端统一跳转登录页。
- 密码使用 `crypto.scrypt` 加盐哈希存储，禁止明文。
