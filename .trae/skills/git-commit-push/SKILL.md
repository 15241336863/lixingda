---
name: git-commit-push
description: Commit and push changes to the Gitee remote repository. Use when the user asks to submit commit, push to Gitee, 提交项目, or sync code to remote. Do not use for squash rebase or history rewrite.
---

# Git Commit & Push (Gitee)

将当前项目的变更提交并推送到 Gitee 远程仓库。

## 仓库信息

- **Git 仓库根目录**: `<workspaceFolder>/xiaoli/`（不是 workspace 根）
- **远程 origin**: `https://gitee.com/neusoft_wangyao_jsj/xiaoli.git`
- **目标分支**: `master`
- **操作系统**: Windows（PowerShell 5+ / cmd 等效）

## 执行步骤

严格按顺序执行，每一步确认后再进入下一步。

### Step 1 · 确认仓库位置

```powershell
git -C "xiaoli" remote -v
git -C "xiaoli" branch --show-current
```

- 确认 origin 指向 `https://gitee.com/neusoft_wangyao_jsj/xiaoli.git`
- 确认当前分支为 `master`（或按用户指定的分支）
- 如果仓库尚未初始化：`git -C "xiaoli" init` → `git -C "xiaoli" remote add origin https://gitee.com/neusoft_wangyao_jsj/xiaoli.git`

### Step 2 · 查看变更清单

```powershell
git -C "xiaoli" status
git -C "xiaoli" diff --stat
```

- 识别三类文件：`modified`（已修改）、`untracked`（新增未跟踪）、`deleted`（已删除）
- 将清单列给用户确认，避免把临时文件、日志、缓存误提交

### Step 3 · 审查 `.gitignore`

检查 `xiaoli/.gitignore` 是否已覆盖以下规则，缺失则追加：

```gitignore
# === 运行时 / 缓存 ===
__pycache__/
*.pyc
*.log
.tmp/
*.tmp

# === 编辑器 / OS ===
.vscode/
.idea/
.DS_Store
Thumbs.db

# === Node / npm ===
node_modules/

# === 大体积二进制 ===
*.zip
*.rar
*.7z
*.tar.gz

# === 本项目：不提交的大型生成资源 ===
# cdn/webfonts/*.ttf   （按需提交，默认不提交）
# cdn/lucide/*.min.js  （按需提交）
```

更新后提交 `.gitignore` 自身作为一次独立改动。

### Step 4 · 点名 add（避免全量）

**不要** `git add .` —— 点名要提交的具体文件/目录：

```powershell
git -C "xiaoli" add "相对路径/文件1" "相对路径/文件2"
git -C "xiaoli" add "相对路径/目录1/"
```

- 优先按用户口头指定提交；未指定时只提交 Step 2 中识别的源码文件
- 如果本次涉及的文件在 workspace 根目录而非 xiaoli 子目录，需要先将它们复制/移动到 xiaoli 仓库内合适位置再 add，或调整提交策略

### Step 5 · 结构化 commit message

```powershell
git -C "xiaoli" commit -m "feat: 简要描述本次改动"
```

格式：`<type>: <中文或英文简述>`，类型推荐：

| 类型 | 场景 |
|------|------|
| feat | 新功能 / 新页面 |
| fix | 修复 bug |
| style | 仅样式调整，不改逻辑 |
| refactor | 重构 / 清理 |
| docs | 文档 |
| chore | 构建 / 配置 / .gitignore |

**多行 message**（用 PowerShell here-string）：

```powershell
git -C "xiaoli" commit -m @'
feat: 新增 iconfont-3/4 移动端底部导航

- iconfont-3.html：字体图标方式（iconfont.css）
- iconfont-4.html：SVG Sprite 方式（inline symbol）
- 4 个 Tab 含 normal/active 两套图标
- 支持红点（收藏）与数字徽章（购物车）
- 含 iOS safe-area-inset-bottom 安全区适配
'@
```

### Step 6 · 推送

```powershell
git -C "xiaoli" push origin master
```

推送完成后输出：
- ✅ 成功：显示远程地址 + 最新 commit hash（短哈希即可）
- ❌ 失败：区分以下情况处理

### Step 7 · 失败处置表

| 报错 | 处置 |
|------|------|
| `non-fast-forward` / `rejected` | 远程已有新提交，先 `git -C "xiaoli" pull --rebase origin master` 再 push；告知用户需解决冲突时暂停 |
| `Authentication failed` / `403` | 提示用户 Gitee HTTPS 凭据失效，引导用 `git config credential.helper` 重设或改用 SSH key |
| `TLS certificate verification has been disabled` | 警告本机 Git 关闭了 SSL 校验（`http.sslVerify=false`），建议恢复：`git -C "xiaoli" config --unset http.sslVerify` 并说明安全风险 |
| `src refspec master does not match any` | 空仓库无初始提交，先执行 Step 5 创建 commit，再 push |
| `SSL certificate problem: self signed certificate` | 公司内网 CA 证书未导入，提示用户执行 `git config --global http.sslCAInfo <ca-bundle.crt>` |

### Step 8 · 完成输出

推送成功后向用户汇报：

```
✅ 已推送到 Gitee
  远程: https://gitee.com/neusoft_wangyao_jsj/xiaoli.git
  分支: master
  最新: abc1234 feat: xxx
  文件: N 个修改 / M 个新增
```

## 安全红线（不得做）

- 不得 `git push --force` 或 `--force-with-lease` 覆盖历史
- 不得在未确认的情况下全量 `git add .`（可能夹带临时/敏感文件）
- 不得在关闭 TLS 校验状态下长期进行凭据交互（风险：中间人攻击）
- 不得提交含个人密钥、令牌、密码的文件

## 何时不使用此 skill

- 用户只想"查看状态"而不 commit —— 只执行 Step 1 / Step 2，告知结果即可
- 用户要求合并分支 / 解决 rebase 冲突 —— 先解释 git 概念，按冲突文件逐一处理
- 用户想推送到别的仓库（非 Gitee xiaoli）—— 另行设定远程，不要修改既定 origin
