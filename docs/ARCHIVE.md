# 仓库沿革与归档记录

## 现行仓库

| 项目 | 地址 | 说明 |
|---|---|---|
| LittleSU（单仓库） | https://github.com/xiaowulai-s/LittleSU | 唯一维护仓库，网页版与独立客户端共用一套版本号与发布流程 |

目录结构：

- `apps/web` — 网页版（Next.js 15）
- `apps/app` — 独立客户端（Tauri 2，桌面端 + Android）
- `design` — 品牌与设计源文件
- `.github/workflows` — 按路径过滤的发布流水线

版本策略：两个子项目共用同一版本号；推送 `v*` 标签会同时触发网页版与客户端发布，产物统一发布在本仓库的 Releases。

## 已归档仓库

| 原仓库 | 原用途 | 归档日期 | 归档前最后版本 | 去向 |
|---|---|---|---|---|
| https://github.com/xiaowulai-s/LittleSU_TV | 网页版 | 2026-10-26 | v0.1.1（GitHub Release） | 代码迁入 `apps/web` |
| https://github.com/xiaowulai-s/LittleSU-TV-App | 独立客户端 | 2026-10-26 | v1.2.0 | 代码迁入 `apps/app` |

两个仓库已设为 GitHub archived（只读）：

- 代码、提交历史、标签与旧 Release 仍可查看和下载；
- 不再接受 Issue、PR 与新推送；
- 新版本、问题反馈与下载统一使用 LittleSU 单仓库。

## 迁移说明

1. 单仓库自 v1.2.0 起独立记录提交历史；旧仓库历史未拼接到单仓库，可在归档仓库中查阅。
2. 旧仓库的标签与 Release 未迁移；`v1.2.0` 起的新产物发布在 LittleSU Releases。
3. 客户端更新端点、安卓更新检查、页脚链接、包元数据与文档中的仓库地址均已切换到 LittleSU。
4. 本地开发环境变量、签名私钥等敏感文件不入库；发布所需的签名材料通过 GitHub Secrets 注入。
5. 本次归档同时修正了 Android 发布流水线的产物路径，v1.2.4 是单仓库首个包含 Android APK 的版本。
6. v1.2.5 起客户端内置推荐源；v1.2.6/1.2.7 扩展为全部 25 个点播源（默认勾选 10 个可用源）并新增直播页，网页版提供同清单的订阅文件，见 [`sources/README.md`](../sources/README.md)。
7. v1.3.0 起客户端界面切换为 `apps/app/ui-next`（React + Vite + TypeScript，Lightframe 设计），旧静态界面 `apps/app/public` 保留用于回滚。
8. v1.3.0 的 Android 构建失败（窗口命令未按平台区分），v1.3.1 修复并成为首个在 Android APK 中启用新前端的版本。
9. v1.4.0 桌面端恢复应用内自动更新（updater/process 插件），播放器补齐音量/全屏/广告过滤/失败自动换源与源测活，并修复 Android WebView 宽度误判导致的桌面布局问题。
10. v1.4.1 统一更新链路：macOS 更新包改为对 ad-hoc 签名后的 `.app` 重新打包并签名；发布收尾作业把 `darwin-aarch64` 合并进 `latest.json`，用 minisign 校验全部平台签名与内嵌版本，并生成覆盖全部资产的 `SHA256SUMS`；客户端开启 `requireSignedVersion`。
11. v1.5.0 补齐发现与源管理：豆瓣热门/高分榜单、自定义源增删改、搜索范围（推荐/全部/可用）真正参与请求、详情页按变体换源、Android 硬件返回键、直播 51zmt 节目单，以及测活失败源自动停用。
12. v1.5.1 收尾质量项：「清理缓存」真实清理内存缓存与 Cache Storage；移除 `apps/app/public` 旧静态界面与 Tailwind 构建脚本，批量搜索跳过 3 个返回网页的占位源；Release 正文改由 `docs/releases/<tag>.md` 自动填充。该版本因 `Cargo.lock` 中第三方依赖版本被误改而构建失败，仅 web-standalone 产物成功。
13. v1.5.2 恢复正确的 `Cargo.lock` 并只更新应用自身版本号，重新发布 v1.5.1 的全部改动。
14. 2026-10-28 应用内更新完成真实的旧版→新版回归（用户实测通过），v1.4.1 起的签名、清单与全资产校验链路在安装升级场景验证完毕。
15. v1.5.3 修复播放页控制条被原生 `<video>` 画面遮挡（视频 `z-index: 1`、控制条未设层级），真实取流播放时进度条与按钮恢复正常显示。
16. v1.5.4 补齐手机端播放操作：Android 用页面内全屏替代不可用的 Fullscreen API（返回键先退全屏），直播页全屏同样生效；新增后退/前进 10 秒、下一集，手机端补上倍速并隐藏音量控件。
17. v1.5.5 前端正式打包 hls.js，播放设置新增画中画、锁屏防误触、全屏亮度/音量手势、画面比例、字幕/音轨切换与全屏选集面板；设置面板改为整页底部弹层。
