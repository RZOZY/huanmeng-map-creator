// 旧界面的运行时中文兼容入口，由 src/main.ts 加载一次。
// 新增或修复的应用文案应在源端明确本地化；模型键、技术标识和用户内容保持原样。
// translator 兜底转换既有 DOM 文案，美化与中文命名仍由 public/i18n 补丁提供。
import "./translator";
