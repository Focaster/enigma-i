# 发布到 GitHub / GitHub Pages

这份清单假设你已经有一个 GitHub 账号，并准备把 **`enigma/` 目录本身作为仓库根目录**。所有文件已经放在正确位置，不需要改目录结构。

## 0. 已经准备好的东西

```text
index.html               ← GitHub Pages 入口
styles.css
enigma-core.js
app.js
enigma-standalone.html   单文件版本
favicon.svg
LICENSE                  MIT
.gitignore
.gitattributes           统一 LF 换行，避免 CI 构建差异
.nojekyll               告诉 GitHub Pages 不要跑 Jekyll
package.json             无依赖，仅提供 npm test / npm run build
.github/workflows/tests.yml
preview/desktop.png
preview/mobile.png
preview/social.png       1280×640 社交预览图
test/engine.test.js
test/fixtures.json
README.md
PUBLISHING.md
```

这个项目是纯静态站点，**不需要构建就能部署**；`enigma-standalone.html` 只是方便单独分享，CI 会检查它是否与源码同步。

## 1. 在 GitHub 上新建仓库

1. 打开 <https://github.com/new>。
2. Repository name 建议：
   - `enigma`（地址最短）
   - `enigma-i`
   - `enigma-machine`
3. 选择 **Public**。
4. **不要**勾选 “Add a README file”“Add .gitignore”“Choose a license”——这些文件已经存在。
5. 点击 **Create repository**。

## 2. 在本地初始化并推送

在 **`enigma` 目录**中执行（不是它的上一级目录）：

> 如果不用命令行、改用 GitHub 网页的 “Upload files”，请把 `enigma` **目录里面的内容**拖到仓库根目录，而不是把 `enigma` 文件夹本身拖进去；否则 Pages 根目录不会直接包含 `index.html`。

```bash
git init -b main
git add .
git status                 # 确认 .nojekyll、.github、preview 都被加入
git commit -m "feat: interactive Enigma I (M3) replica"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果这台机器还没有配置 Git 身份，先执行一次：

```bash
git config user.name "你的名字"
git config user.email "你的邮箱"
```

（也可以加 `--global`，但建议只在本仓库设置。）

如果已经安装并登录 GitHub CLI，可以一条命令建仓并推送：

```bash
gh repo create <仓库名> --public --source=. --remote=origin --push
```

## 3. 开启 GitHub Pages

1. 进入仓库的 **Settings → Pages**。
2. **Build and deployment → Source** 选择 **Deploy from a branch**。
3. Branch 选择 **main**，文件夹选择 **/ (root)**。
4. 点击 **Save**。
5. 等待约 1–2 分钟，访问：

```text
https://<你的用户名>.github.io/<仓库名>/
```

例如仓库叫 `enigma`，地址就是 `https://<用户名>.github.io/enigma/`。

不需要选择 “GitHub Actions” 作为 Pages 来源；项目没有构建步骤，直接用分支根目录最省事。

## 4. 仓库信息与展示

在仓库首页右侧点击齿轮 **Edit repository details**：

**Description**

```text
Interactive Enigma I (M3) simulator — rotors, plugboard, double stepping and a live signal path. Vanilla HTML/CSS/JS, offline-ready.
```

**Website**

```text
https://focaster.github.io/enigma-i/
```

**Topics**（建议）

```text
enigma
enigma-machine
cryptography
history
ww2
vanilla-javascript
html
css
interactive
simulator
github-pages
education
```

**Social preview**

在 **Settings → General → Social preview** 上传：

```text
preview/social.png
```

这张图是 1280×640，已经包含标题、机器截图和功能关键词。

## 5. README 徽章

CI 第一次运行通过后，可以在 README 顶部加：

```markdown
![tests](https://github.com/Focaster/enigma-i/actions/workflows/tests.yml/badge.svg)
```

还可以加：

```markdown
![license](https://img.shields.io/badge/license-MIT-d4af69)
```

这两个徽章已经加入当前 README；如果以后改仓库名，记得同步修改链接。

## 6. OG / 社交分享图

`index.html` 里已经写入与当前仓库对应的绝对地址：

```html
<meta property="og:image" content="https://focaster.github.io/enigma-i/preview/social.png">
<meta property="og:url" content="https://focaster.github.io/enigma-i/">
```

如果以后改了用户名、仓库名或自定义域名，需要同步修改这两行，以及 `<link rel="canonical">` 和 `twitter:image`。这样 Twitter/X、Slack、Discord 等平台才能稳定显示大图。

## 7. 可选：自定义域名

1. 在仓库根目录添加 `CNAME`，内容为你的域名，例如 `enigma.example.com`。
2. 在 DNS 服务商处添加 CNAME 记录指向 `<用户名>.github.io`。
3. Settings → Pages → Custom domain 填入域名并勾选 Enforce HTTPS。

## 8. 可选：打一个版本标签

```bash
git tag v1.0.0
git push origin v1.0.0
```

然后在 GitHub 的 **Releases** 页面基于该标签创建 Release，附上截图和更新说明。

## 9. 以后更新

```bash
git add .
git commit -m "fix: ..."
git push
```

GitHub Pages 会自动重新发布；`tests` 工作流会在每次 push / PR 时运行模型测试，并检查 `enigma-standalone.html` 是否与源码同步。修改源码后记得：

```bash
npm run build
git add enigma-standalone.html
```

## 10. 发布前最后检查

- [ ] 仓库根目录能看到 `index.html`
- [ ] `LICENSE` 的版权署名已改成你的名字（当前为 `Enigma I contributors`）
- [ ] `node --test test/engine.test.js` 本地通过（17 个测试）
- [ ] `.nojekyll` 已提交（`git ls-files -- .nojekyll`）
- [ ] Pages 已设为 `main / (root)`
- [ ] 手机打开线上地址检查键盘、插线板和报文区域
- [ ] 分享链接在新标签页打开后能恢复密钥
- [ ] Social preview 已上传 `preview/social.png`
- [ ] README 顶部的在线演示地址已替换成真实 URL

## 常见问题

**页面 404？**  
确认 Pages 来源是 `main` 和 `/ (root)`，并等待部署完成；也检查仓库根目录是否直接包含 `index.html`。

**样式或脚本 404？**  
确认 `styles.css`、`app.js`、`enigma-core.js` 与 `index.html` 在同一目录；本项目全部使用相对路径，子路径部署不需要改配置。

**分享按钮复制失败？**  
GitHub Pages 是 HTTPS，通常可用；代码里也有 `execCommand` 回退。若浏览器禁用剪贴板，会弹出可手动复制的链接。

**为什么没有 Pages 的 GitHub Actions 工作流？**  
静态站点用 “Deploy from a branch” 最简单，也不需要额外的 Actions 权限。现有的 `tests.yml` 只负责测试，不参与部署。
