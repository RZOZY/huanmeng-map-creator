# 桌面版下载提示

状态：2026-10-27，拥有者中文、已核对的仓库路由、44项模块回归及完整门禁通过；隔离渲染器首轮严格失败、同断言完整复跑一次12项通过。不是稳定性、发布、安装或自动更新完成声明。

## 范围

- 只改[下载提示拥有者](<D:/fmg-cn/dreammap/src/services/app-offer.ts>)的界面文案、发布查询／发布页路由及局部UA类型；不改检测顺序、ARM默认、六种安装包后缀、资产URL／版本／大小、关闭回调或异步流程。
- 目标检测是启发式推荐，不保证实际系统／架构识别正确。浏览器保存位置与安装／运行方式取决于环境及发布说明。
- 有发布但无可识别安装包，不等于项目尚未发布。当前[打包配置](<D:/fmg-cn/dreammap/electron-builder.yml#L40-L44>)注明只手工发布便携ZIP且无provider；本轮不扩安装包匹配、不启用发布或安装。
- 更新可用性与方式取决于安装包及发布配置；联网功能仍需网络，不声称完整离线或自动安装。遇系统安全提示应先核实来源，不指导绕过未知来源保护。

## 验证

- [44项真实模块回归](<D:/fmg-cn/dreammap/src/services/app-offer.test.ts>)在jsdom直接使用AppOffer及platform模块，仅模拟fetch／UA／matchMedia／jQuery壳，核对loading与并行等待、手持零请求、窄桌面、各OS／架构回退、失败与ZIP无匹配、六URL／target／版本／大小及真实this关闭。声明的冻结模型fixture、英文用户DOM、存储与下载／保存调用保持不变；不是任意真实用户地图的证明。
- [完整门禁](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase18/complete.log>)普通2985通过／13跳过、Electron23、脚本52、TypeScript、580源Biome、diff、桌面构建及5资源戳通过。首次定向44与类型均过，仅新测试两处格式失败；之后只用格式器改该测试再完整回归，无自动Playwright。
- [实际重建renderer](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase18/app-offer-native-v2.json>)的12项检查通过：新profile／默认引擎参数，`entry=index-bRJHIicL.js`／Electron43.5.0；实际Services.AppOffer.open和真实dialog／loading／六链接／条件性中文、ZIP无匹配／网络拒绝／受控手持零API调用、实际CDP鼠标关闭，以及声明用户DOM／存储／模型引用保持。不是安装器或packaged app。
- 仅受测AppOffer fetch／UA被控制，其他应用／主进程网络未全隔离；没有激活任何资产链接。不能据模拟响应声称GitHub发布存在、资产可达、真实机型兼容或下载／安装成功。finally恢复原fetch／UA属性，受监测异常／error console／下载事件／cleanup最终均空，原两张地图和renderer目录全部JS／CSS SHA前后不变，私有进程SIGTERM已退出、9333不动。
- [首轮整体失败](<D:/DSH工作区/小说世界搭建/_run/map-next-20261027/phase18/app-offer-native.json>)11项场景断言虽过，第12项因两条Electron内部 `sandboxed_renderer.bundle.js`／`binding.startupData` null console error严格拒绝。原记录保留，不称错误无关或已修复；只更换output／新profile完整复跑一次，源码／断言／最终错误门禁不改，未继续反复刷新至绿。

## 仍开放

- [包元数据](<D:/fmg-cn/dreammap/package.json#L6-L12>)及[桌面更新拥有者](<D:/fmg-cn/dreammap/electron/updater.ts>)的其他历史路由／配置未在此修复。
- 共享alert的迟到异步结果归属、外部API字段插入HTML的完整净化未在此审计；不是并发提示隔离或安全净化证明。
- 没有实际Web／OS／离线、更新服务、性能、完整模型无损或便携版替换证明。原图和用户窗口保持不变。
