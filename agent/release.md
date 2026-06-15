# BrainPlus 发布流程

## 1. 更新版本号

修改 `package.json` 中的 `version` 字段：

```json
"version": "0.23.0"
```

版本规则：`主版本.次版本.修订号`，功能积累 → 增次版本，修复 → 增修订号。

## 2. 提交并打 tag

```bash
git add -A
git commit -m "release: vX.Y.Z — 简要说明"
git push
git tag vX.Y.Z
git push origin vX.Y.Z
```

## 3. GitHub Actions 自动构建

推送 tag 后，`.github/workflows/release.yml` 自动触发：

- macOS → `.dmg` + `.zip`
- Windows → `.exe` + `.zip`  
- Linux → `.AppImage`

构建产物在 Actions → Artifacts 中下载，或自动创建 Draft Release。

## 4. 发布 Release Notes

在 GitHub Releases 页面编辑 Draft Release，将 `docs/releases/vX.Y.Z.md` 内容粘贴进去后发布。

---

## 快捷命令（一次性全部）

```bash
V="0.23.0" && sed -i '' "s/\"version\": .*/\"version\": \"$V\",/" package.json && git add -A && git commit -m "release: v$V" && git push && git tag "v$V" && git push origin "v$V"
```
