# 木语家居 · 源氏木语风格移动端网站

> 课程：《高级网页设计I》
> 学号：**24002120311**　姓名：**李兴达**
> 选题：源氏木语（Yuanshi Muyu）小程序风格的原木家具电商网站模仿与再设计

---

## 一、项目介绍

本网站是一个**移动端优先**的原木风格家具电商网站，模仿「源氏木语」小程序的整体布局与视觉调性（米白底色、原木主色、底部 TabBar、双列商品瀑布流、金刚区分类入口等），并将个人作业素材（客厅、卧室、餐厅、办公四大系列家具图片）融入其中，完成了一个可用于手机浏览器直接访问的完整站点。

核心功能：**首页 / 商品分类 / 商品详情 / 搜索 / 购物车 / 收藏 / 个人中心 / 后台管理 / 登录 / 注册**，其中登录页与注册页不计入 8 个主页面。

## 二、技术架构

- **语言**：原生 HTML5 + CSS3 + JavaScript（ES6），**不使用**任何第三方框架与库（无 jQuery / Vue / React / Bootstrap / Tailwind）。
- **样式**：全局 `css/lixingda.css`，CSS 变量定义原木色系；所有布局选择器均以姓的拼音 `li_` 为前缀（如 `li_page`、`li_card`、`li_tabbar`）。
- **后端接口（路径 A：Node.js + Express + SQLite）**：
  - `backend/server.js`：Express 服务，端口 8311，托管前端静态资源并提供 `/api/` 接口；
  - `backend/routes/lxd_api.js`：商品/分类/订单/用户与统计接口，统一返回 `{ code, message, data }`；
  - `backend/db/lxd_sqlite.js`：使用 Node 内置 `node:sqlite`，首次启动自动建表并导入种子数据；
  - `backend/routes/lxd_ai.js`、`lxd_kb.js`：AI 客服与知识库（RAG）接口。
- **数据层（接口优先 + JSON 兜底）**：
  - 页面通过 `LI.request('/api/...')` 调用真实接口，支持分页、分类、搜索、详情；
  - 后端未启动或部署在 GitHub Pages 等纯静态环境时，自动回退读取 `data/*.json`（20 件商品、分类、轮播、评价、用户），保证页面仍可浏览；
  - 数据库：SQLite（`backend/db/muyu.db`），四张表 `lxd_products`、`lxd_categories`、`lxd_orders`、`lxd_users`，登录密码使用 `crypto.scrypt` 加盐哈希。
- **本地存储**：购物车、收藏、登录态、注册用户均存于 `localStorage`，刷新不丢失。
- **图标**：使用 SVG 与 emoji 实现，无外部字体库、无网络资源，全部本地化。

## 三、页面清单（≥8 页）

| 页面 | 层级 | 说明 |
|------|------|------|
| `index.html` | 一级（首页） | 搜索框、轮播、金刚区、热卖/新品瀑布流、口碑 |
| `list.html` | 二级（栏目首页） | 侧栏分类 + 销量/价格排序 |
| `detail.html` | 三级（内容页） | 商品大图、详情、相关推荐、加入购物车/收藏 |
| `search.html` | 自选 | 关键词即时搜索 |
| `all.html` | 自选（全部商品） | 标题+搜索+排序条+左图右文商品列表+5导航 |
| `cart.html` | 自选 | 购物车勾选/增减/结算 |
| `favorite.html` | 自选 | 收藏商品列表 |
| `profile.html` | 个人设置（我的） | 用户信息、订单、优惠券、功能菜单 |
| `admin.html` | 后台管理 | KPI 看板、商品表、订单概览 |
| `about.html` | 自选 | 品牌介绍 |
| `login.html` | 不计入8页 | 登录 |
| `register.html` | 不计入8页 | 注册 |

## 四、JavaScript 效果（≥6 个）

1. 首页**轮播图**自动播放 + 手势滑动 + 指示点联动；
2. **购物车**加入/减少/删除、勾选、合计实时计算；
3. **收藏**红心切换 + 心形飞入动画；
4. **搜索**输入即时过滤；
5. 列表页**排序**（销量 / 价格升降）；
6. 商品卡片**入场动画**（逐张上浮错落）、悬浮图片缩放、按钮流光；
7. 详情页**四标签切换**（商品/评论/详情/推荐）+ **限时抢倒计时**；
8. **在线客服**悬浮图标，点开即可与客服对话（含快捷关键词自动回复）；
9. 页面 **Toast** 轻提示、按钮点击脉冲反馈；
10. 数据 **fetch 异步加载** + 加载 Spinner。

## 五、安装与运行指南

本网站为纯静态站点，无需构建。

### 方式一：直接双击打开（最简单）

**直接双击 `index.html`** 即可在浏览器中完整浏览。因为脚本内置了数据兜底：当 `fetch` 在 `file://` 协议下被浏览器拦截时，会自动回退到脚本内置数据（与 `data/*.json` 内容一致），保证首页、分类、详情、购物车、收藏、搜索、后台等全部功能在双击打开时也能正常显示和点击。

### 方式二：本地静态服务器（推荐，数据走真实 fetch 接口）

```bash
# Python
cd 项目目录
python -m http.server 8080
# 浏览器访问 http://localhost:8080

# 或 VS Code 安装 "Live Server" 插件，右键 index.html → Open with Live Server
```

手机访问：将本项目部署到 GitHub Pages / Gitee Pages，或与电脑同一局域网后访问 `http://电脑IP:8080`。

## 六、目录结构

```
yuanshi-muyu/
├── index.html        # 首页（一级）
├── list.html         # 栏目首页（二级）
├── detail.html       # 内容页（三级）
├── search.html       # 搜索
├── cart.html         # 购物车
├── favorite.html     # 收藏
├── profile.html      # 我的（个人设置）
├── admin.html        # 后台管理
├── about.html        # 关于我们
├── login.html        # 登录（不计8页）
├── register.html     # 注册（不计8页）
├── README.md
├── css/
│   └── lixingda.css    # 全局样式（li_ 前缀）
├── js/
│   └── app.js        # 公共脚本（数据/购物车/收藏/登录/动画）
├── data/             # mock 数据接口
│   ├── categories.json
│   ├── products.json
│   ├── banners.json
│   ├── reviews.json
│   └── user.json
└── img/              # 图片（英文命名，本地资源）
```

## 七、测试账号

- 账号：`lixingda`　密码：`123456`
- 也可自行注册新账号。

## 八、AI 使用说明

本项目使用 AI 辅助完成整体结构规划、页面搭建与样式编写，人工完成素材整理、数据校对与功能调试，符合课程「鼓励使用 AI」的要求。
