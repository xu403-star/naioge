# Git 小白使用指南

## 一、Git 是干什么的？

简单来说，**Git 就是一个保存代码历史版本的工具**。

你可以把它理解成代码的“时光机”：

- 你改错了代码，可以一键回到之前的版本
- 你写了很多新功能，可以把每一步改动都记录下来
- 你和别人一起写代码，可以看到谁改了什么

GitHub 是一个网站，用来把代码存到网上，方便分享和备份。

---

## 二、两个重要的概念

### 1. 本地仓库（在你电脑里）

就是 `C:\Users\18049\Desktop\niaoge\naioge` 这个文件夹里的 Git 记录。

你每次用 `git commit` 提交，代码历史就保存在这里。

### 2. 远程仓库（在 GitHub 上）

就是 `https://github.com/xu403-star/naioge` 这个网页里的代码。

你每次用 `git push`，就是把本地保存的记录上传到 GitHub。

### 一句话总结

> `git commit` = 把改动存到自己电脑
> `git push` = 把改动上传到 GitHub

---

## 三、修改代码后，按这个顺序做

假设你修改了 `server.js` 文件。

### 第一步：打开命令行，进入项目目录

```bash
cd C:/Users/18049/Desktop/niaoge/naioge
```

### 第二步：查看你改了哪些文件

```bash
git status
```

你会看到类似这样的内容：

```text
Changes not staged for commit:
  modified:   niaoge-cloud-bot/server.js
```

意思是：你修改了 `server.js` 这个文件。

### 第三步：把改动加入“待提交列表”

```bash
git add .
```

`.` 表示当前目录下的所有改动。

如果只想提交某个文件，也可以写：

```bash
git add niaoge-cloud-bot/server.js
```

### 第四步：正式保存到本地仓库

```bash
git commit -m "这里写你改了什么"
```

例如：

```bash
git commit -m "修复了登录失败的 bug"
```

`-m "..."` 里面的内容就是这次修改的说明，要写得让别人看得懂。

### 第五步：上传到 GitHub

```bash
git push
```

然后等命令行显示完成，刷新你的 GitHub 仓库页面，就能看到最新代码了。

---

## 四、完整流程示例

```bash
cd C:/Users/18049/Desktop/niaoge/naioge
git status
git add .
git commit -m "修复了某个 bug"
git push
```

---

## 五、常用的 Git 命令

| 命令 | 作用 | 什么时候用 |
|---|---|---|
| `git status` | 查看当前状态 | 每次提交前先看一眼 |
| `git add .` | 添加所有改动 | 确认要提交所有改动时 |
| `git commit -m "说明"` | 保存到本地仓库 | 想记录一次改动时 |
| `git push` | 上传到 GitHub | 本地提交完成后 |
| `git pull` | 从 GitHub 下载最新代码 | 别人修改了代码，你要同步时 |
| `git log` | 查看提交历史 | 想看之前都改过什么 |
| `git diff` | 查看具体改了哪些内容 | 想确认改动是否正确 |

---

## 六、重要提醒

### 1. 提交说明要写清楚

不要写这种：

```bash
git commit -m "1"
git commit -m "改"
```

要写这种：

```bash
git commit -m "修复用户登录时密码验证错误的问题"
git commit -m "新增商品列表分页功能"
```

### 2. 提交前先检查一下

每次提交前都用 `git status` 看看有没有不该上传的文件。

比如下面这些文件不应该上传：

- `node_modules/`：依赖文件夹，体积很大，里面都是下载的库
- `.env`：里面可能有密码、密钥等敏感信息
- 压缩包、日志文件、临时文件

这些已经写进 `.gitignore` 文件了，Git 会自动忽略。

### 3. 不要只 commit 不 push

有时候你 `git commit` 了，但忘记 `git push`，结果 GitHub 上还是旧代码。

提交后最好去 GitHub 页面刷新确认一下。

---

## 七、常见问题

### 问题 1：我改了文件，但是 `git status` 没显示？

可能是你改完后没有保存文件，或者改的是被 `.gitignore` 忽略的文件。

### 问题 2：`git push` 失败，说没有权限？

重新登录 GitHub 授权：

```bash
git credential-manager reject https://github.com
git push
```

然后会弹出登录窗口，重新登录即可。

### 问题 3：`git push` 失败，说远程仓库有更新？

先拉取最新代码，再推送：

```bash
git pull
git push
```

### 问题 4：我想撤销刚才的修改？

如果你还没 `git add`，可以撤销单个文件：

```bash
git checkout -- 文件名
```

如果你已经 `git add` 但还没 `git commit`，可以取消暂存：

```bash
git reset HEAD 文件名
```

---

## 八、最简单的记忆口诀

```
改完代码三件套：
    git add .
    git commit -m "说明"
    git push
```

多练几次就熟了。
