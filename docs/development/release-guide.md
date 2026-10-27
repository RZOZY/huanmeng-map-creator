# Windows 便携版发布

产品版本以 `src/services/versioning.ts` 的 VERSION 为准；只有地图存档结构确实变化并提供迁移时，才修改 MAP_FORMAT_VERSION。不要移动或复用已发布标签。

## 验收

1. 核对当前分支、未提交改动与远端，保留用户数据和原地图。
2. 更新产品版本与近期公告，运行 `npm run sync-version`，并核对仓库元数据。
3. 运行 `npm run test:all`、TypeScript、只读 Biome 和 `git diff --check`；静态资源有变时核对内容戳。不要以旧阶段的测试数字冒充本轮验收，不自动运行 Playwright。
4. 正常提交并检查 hook 是否修改了文件；不绕过检查，不用整树还原清理改动。

## 打包与验证

```sh
npm run package:portable
```

该命令固定 Windows x64、`--dir`、`--publish never`，输出 `release/win-unpacked`，不生成安装器或上传。默认不配置 publish provider。证书不可用时可在构建进程中设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`，但不得因此声称程序已签名。

- 必须使用本次重新构建的目录，不能上传旧 ZIP 或只分发 EXE。
- 根目录应包含主程序、运行时、`resources/app.asar`、上游 `LICENSE`、`THIRD-PARTY-NOTICES.md` 和 Electron/Chromium 原有许可。
- 采用独立用户目录实际启动便携程序，核对产品与 Electron 版本、启动错误、地图载入/保存及本轮改动；不复用用户正在使用的窗口。
- 当前便携包没有 `resources/app-update.yml`，更新器不应注册后台检查或安装。用户通过发布页手动更新。
- 完整离线、精确未保存检测、无损恢复与实验图集的正式内容不因一次冒烟通过而变成已完成。

压缩 `win-unpacked` 的**内容**，不要套额外目录，文件名为 `HuanMengMap-<版本>-win-x64-portable.zip`。生成 SHA256SUMS.txt，并只读打开 ZIP 核对路径、许可及校验值。产物已存在时先核对，禁止静默覆盖旧发布。

## 手动发布

1. 正常推送已验收提交并核对 origin/main。
2. 确认远端没有同名标签和 Release，再为该提交建立新的注释标签 `v<版本>` 并推送。
3. 用 `gh release create --repo RZOZY/huanmeng-map-creator --verify-tag` 手动上传本次 ZIP、校验清单和中文发布说明；不上传安装器、blockmap、latest*.yml 或私有地图。
4. 发布后核对标签指向、Release 状态、资产名称/大小/摘要和下载地址。

`.github/workflows/desktop-build.yml` 只接受手动触发、构建 Windows x64 工件，只有 contents:read 权限，不创建或覆盖 GitHub Release。发布说明基础模板位于 `.github/release-notes.md`。

## 许可与安全

保留上游 MIT、幻艺地图中文模板的个人学习研究限制及第三方素材署名；这不是额外用途授权。不要向用户建议绕过来源或签名不明的安全警告。
