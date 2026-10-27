# 首启与版本公告：中文与行为边界

状态：2026-10-27，源端中文、21项模块回归、完整门禁与16项真实桌面检查通过。不改变产品／存档版本、版本比较或启动时序；不是全应用或真实Web清缓存验收。

## 拥有者与明确变更

[版本拥有者](<D:/fmg-cn/dreammap/src/services/versioning.ts>)只对公告正文、标题、按钮、Web桌面版引导与patch提示做源端中文，不对地图／笔记／用户名称执行全文替换。品牌HuanMeng Map Creator、VERSION／MAP_FORMAT_VERSION、机器ID、存储键、onclick及全局路径保留。

公告的源码／反馈链接从旧仓库修为已核对的既有origin `https://github.com/RZOZY/huanmeng-map-creator`，保留原target；这是限定的路由修正，不是将URL作为英文文本翻译。未访问或验收外部GitHub页面，未替换上游署名。

- 无storedVersion的首启说明“当前版本为”，不谎称刚从旧版升级。
- 已存major／minor旧版仍6000ms后显示公告；patch旧版仍只立即记录当前version并给6000ms提示。equal／newer／非空非法值不因此新增公告。版本解析及合法性判定保留旧语义。
- Electron按钮为“重新载入”，因为原clearCache在Electron不清浏览器缓存；Web为“清理缓存并重新载入”。本阶段不改底层清理／注销／reload顺序。
- “关闭公告”仅执行原dialog close，不能因原英文Don't show again误加永久禁用键、清缓存、重载或模型写入。
- Web桌面版引导保留 `window.Services.AppOffer.open(); return false` 的原真实路径；AppOffer自身窗口、下载／更新与离线承诺不在本阶段验收。

## 验证

- [21项真实模块回归](<D:/fmg-cn/dreammap/src/services/versioning.ui.test.ts>)使用动态import、fake timers及iframe DOM，保持5999ms／6000ms边界、首启／major-minor／patch／equal-future-invalid分支、真实inline onclick与实际this关闭回调。`-1.99.99`仅是现有校验器可接受的synthetic major分支夹具，不是历史发布版本。
- 两后端调用的是原clearCache闭包；平台与CacheStorage／ServiceWorker／reload边界为mock。Web覆盖全部delete完成后才枚举SW、全部unregister完成后才reload，以及四种原error拒绝和无SW路径；不是实际浏览器清缓存／PWA验收。关闭断言直接覆盖fixture options.map及声明的用户DOM，不穷尽pack／grid／styles／mapHistory；源码也没有新增模型操作。
- [首轮15通过／6失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/targeted.log>)只涉及总fake-timer队列计数；收窄为拥有者6000ms schedule，不清理队列来规避被测断言。B另发现spy恢复顺序会重装旧fake setTimeout；新增真实timer身份哨兵[先红](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/timer-cleanup-red.log>)，只调整restoreAllMocks先于useRealTimers后[21项全绿](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/timer-cleanup-green.log>)。每例同时检查真实setTimeout身份与isFakeTimers=false。
- [最终完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/complete-final.log#L2347-L2692>)：普通2923通过／13跳过、独立Electron23、脚本52；TypeScript、577源Biome、diff、Electron构建与5资源戳绿。没有自动运行Playwright。
- [当前构建16项真实桌面](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/version-ui-native-v2.json>)在`entry=index-CG2BbG5g.js`／独立新profile／默认引擎参数下，核对首启、受控旧minor与patch、实际按钮和仓库链接。关闭采用真实DOM按钮点击，保声明用户DOM／存储及抽样模型引用；重新载入采用实际CDP鼠标输入。受监测reload文档未观测到CacheStorage／SW枚举或Storage.clear，不外推未被监测的进程初始期、真实Web后端或全部模型无损。
- Patch的只读MutationObserver记录真实tooltip `data-main`、当前版本、真实Electron标志及当时无可见公告，并另查app ready后无可见公告；不证明提示连续可见、实际像素或精确6000ms，严格时序由模块测试负责。最终异常／error console／cleanup数组为空，原图及renderer目录内全部JS／CSS产物前后SHA一致，私有进程已退出，原9333不动。
- [首轮失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase16/version-ui-native.json>)保留：前13项通过但ready后查询瞬时patch tip超时，同时记录`Electron sandboxed_renderer.bundle.js script failed to run`及`TypeError: Cannot destructure property 'preloadScripts' of 'binding.startupData' as it is null.`。未证实两者因果；v2只调整测试观测时点并使用新profile，严格保留全部错误门禁，未更改产品来绕测。重跑通过不等于定位或修复既有Electron内部启动故障。

## 原有风险与未完成项

[clearCache与cleanupData](<D:/fmg-cn/dreammap/src/services/versioning.ts#L83-L105>)保持原实现：缺Cache API或任一清理／注销Promise拒绝会向调用者拒绝并阻止reload；按钮没有本地捕获／错误反馈。删除或注销返回false仍可能继续reload。本轮不能以中文文案声称解决此问题。

该模块自身没有保存确认或map-io租约门禁。[shell](<D:/fmg-cn/dreammap/src/components/shell.ts#L20>)只在非localhost且非Electron设通用onbeforeunload；即使Web离页被取消，此前清理仍已发生，不是可回滚事务。Electron／localhost没有此全局兜底。真实桌面验收只用私有新profile的自动生成地图，不在用户当前地图上试验重载。

[AppOffer](<D:/fmg-cn/dreammap/src/services/app-offer.ts#L4-L5>)及[项目元数据](<D:/fmg-cn/dreammap/package.json#L6-L12>)仍有旧仓库路由，另属范围，不能称全库路由或完整更新链已修。该阶段不发布／安装／替换便携版，不提供性能收益、完整离线或全应用100%汉化结论。
