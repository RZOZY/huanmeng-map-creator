# 0.8.0 冗余审计与发布验收

本轮针对可证明的重复工作和失效发布路径做增量整改，不以“静态搜索没有引用”作为删除动态功能的依据。

## 已处理

| 项目 | 证据与整改 | 验证边界 |
|---|---|---|
| JSON 导出的 23 份中间列副本 | [导出实现](../../src/services/io/export-json.ts)原先把 pack 18 列、grid 5 列复制为普通数组，随后仅同步读取标量。现直接读取原列，保留输出字段、顺序和最终映射 | [7项回归](../../src/services/io/export-json.test.ts)保 wire JSON、NaN／Infinity／负零处理、乱序ID、空集合、源值和引用；不是整图性能或内存百分比承诺 |
| 无配置便携版仍初始化更新器 | [更新器](../../electron/updater.ts)在非打包或缺少 resources/app-update.yml 时提前返回，不注册检查、事件或计时器；有配置时保留原流程 | Electron mock 覆盖无配置零活动及有配置原行为；本次包实物确无更新配置，不启用 provider |
| 发布职责混杂 | [桌面工作流](../../.github/workflows/desktop-build.yml)仅手动构建 Windows x64 工件、contents:read；移除旧 Release 写入、安装器发布及覆盖上传路径 | [固定入口](../../package.json)使用 --dir 和 --publish never，手工发布 ZIP，不把这两个参数泛化为所有构建方式均无更新配置 |
| 过期介绍和元数据 | [README](../../README.md)改为功能、下载、使用、限制和开发入口；校正仓库URL、锁文件名称、公告与便携说明 | 不再保留过时词库计数、旧版本“当前”、必须绕过提交检查或自动更新承诺 |
| 随包来源说明缺口 | [打包配置](../../electron-builder.yml)显式附根 LICENSE 与 THIRD-PARTY-NOTICES.md，同时保留运行时许可 | 说明中文模板仅个人学习研究及素材原署名；不授予额外用途权利 |

## 保留或另行验证

- [Cloud旧wrapper](../../src/services/io/cloud.ts)虽然未找到内部调用，本轮不只凭静态引用删除可能的外部入口。
- [服务懒注册](../../src/services/index.ts)与[registry](../../src/utils/registry.ts)、classic脚本、全局桥和序列化机器键不是无效代码，保留。
- [自定义快捷键](../../electron/main.ts)与[原生菜单](../../electron/native-ui.ts)可能重叠的 DevTools 操作仅列为待原生验证，不宣称已复现双触发。
- 大图集正式地理内容、精确未保存检测、无损恢复、持久项目与完整离线仍按[路线图](localized-atlas-roadmap.md)继续，不因本次发布宣称完成。

## 运行时与实际便携包

Electron 从 43.5.0 升级到同主版本补丁 43.8.3，未关闭 sandbox 或 context isolation。上游[同型缺陷](https://github.com/electron/electron/issues/54149)与[修复](https://github.com/electron/electron/pull/54155)在未提交文档的脚本上下文初始化前检查 startup_data；[43.8.3 源码](https://github.com/electron/electron/blob/v43.8.3/shell/renderer/electron_sandboxed_renderer_client.cc)包含该保护。相似错误不自动证明本项目所有旧错误均为同因。

实际运行新构建的 Windows x64 便携 EXE：

- 6个独立新profile在较早 Runtime.enable 后完成启动，另1个新profile完成集成；观察窗口内均无 renderer exception 或 error console。不是“永不再现”或不带调试观察的全部冷启动证明。
- 产品0.8.0／Electron43.8.3；渲染页没有 Node require/process 桥。
- 真实载入私有测试地图，四种实际 JSON 导出与旧 collector 的纯转译结果比对；仅下载anchor边界受控，不代表OS下载流程。
- 实际调用保存序列化、由测试宿主写私有文件后重新载入，声明的 graph/frame、typed列、标签和标记SHA一致；不是OS保存窗口或全部模型无损证明。
- 原图及新包EXE／ASAR的SHA前后不变，所有测试进程退出。根许可存在、无 app-update.yml。此包没有有效 Authenticode 签名，不应绕过无法核实的安全提示。

本轮完整门禁：2992项普通测试通过、13跳过；24项Electron mock、52项脚本测试；TypeScript、588源文件只读Biome、版本一致性、差异、桌面构建与5个资源戳通过。未自动运行Playwright。

首轮导出回归发现 structuredClone 跨realm导致调用前 strict 快照即失败；保留失败后改为独立同realm factory，仍保调用前后 strict、每列引用与逐字wire断言，未改产品绕测。

本次 ZIP 共76个文件，路径统一使用 `/`，逐文件SHA与本次目录一致；根许可完整且无更新配置。169706410字节，SHA-256为 `d4e1e27e50a6b875039993be5d57ef06a5dd2d6bb614beac7f9312385d983706`。初次归档的反斜杠路径检查失败和一次缺少压缩程序集造成的空文件已隔离，未作为发布附件。

发布按[便携发布指南](release-guide.md)确认新标签／Release目标及上传后摘要；不要复用旧0.7.6产物。
