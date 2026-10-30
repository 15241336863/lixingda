---
name: github-commit-push
description: Commit the current project and push it to the GitHub repo 15241336863/lixingda over SSH. Use when the user asks to submit to GitHub, push to lixingda, or sync this project to github.com. Do not use for Gitee pushes, which belong to git-commit-push.
---

# GitHub 提交与推送

## 仓库与远程

- 本地 Git 仓库：`xiaoli/`（位于工作区根目录下，分支 `master`）
- GitHub 目标：`git@github.com:15241336863/lixingda.git`（SSH，对应 HTTPS `https://github.com/15241336863/lixingda`）
- 密钥：`C:\Users\HW\.ssh\id_ed25519`（公钥 `.pub` 已在 GitHub 账号注册）
- `origin` 仍指向 Gitee，**不要覆盖**；GitHub 用独立远程名 `github`

## 步骤

1. 确认变更范围：`git -C xiaoli status --short`
2. 按路径点名添加文件，**不要** `git add .`；本次无关的旧未跟踪文件不要夹带
3. 提交，信息格式 `<type>: <简述>`（feat/fix/style/refactor/docs/chore），多行说明用 here-string
4. 配置远程：
   - 不存在时 `git -C xiaoli remote add github git@github.com:15241336863/lixingda.git`
   - 已存在但地址不符时 `git -C xiaoli remote set-url github git@github.com:15241336863/lixingda.git`
5. 推送：`git -C xiaoli push github master`
6. 首次推送前先 `ssh -T git@github.com` 验证密钥（首次连接需接受主机指纹）

## 失败处置

| 报错 | 处置 |
| --- | --- |
| `Permission denied (publickey)` | 公钥未注册或 ssh-agent 未加载；把 `id_ed25519.pub` 整行加到 GitHub Settings → SSH and GPG keys |
| `Repository not found` | 仓库不存在、拼写错误或账号无权限；让用户确认网址 |
| `Host key verification failed` | 首次连接未信任主机；`ssh-keyscan github.com` 写入 `~/.ssh/known_hosts` 或加 `-o StrictHostKeyChecking=accept-new` |
| `non-fast-forward` / `fetch first` | `git -C xiaoli pull github master --rebase` 后重推，**禁止** force push |
| `Please tell me who you are` | 缺 `user.name` / `user.email`；向用户索取，不要编造 |
| PowerShell 传空参数报错 | `ssh-keygen -N '""'` 用字面双引号表示空密码短语 |

## 禁忌

- 禁止 `git push --force`
- 禁止 `git add .` 或 `git add -A`
- 禁止提交或打印私钥内容；公钥可以展示
- 推送前用 `git status --short` 复核，避免把缓存、密钥、无关文件带上去
