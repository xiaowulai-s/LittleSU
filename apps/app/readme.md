# LittleSU TV App

**免费在线视频搜索与观看平台 —— 独立客户端版**：搜索、播放、豆瓣推荐全部内置，**无需任何服务器、无需电脑、无需域名**，安装即用。

> 本目录是 [LittleSU 单仓库](../..) 的独立客户端子项目；网页版源码见 [`apps/web`](../web)。
>
> 本应用基于 [LibreTV-App](https://github.com/KeyRotate/LibreTV-App)（Apache-2.0）修改，其上游为 [LibreTV](https://github.com/LibreSpark/LibreTV)（AGPL）。出处声明见 [NOTICE](./NOTICE)。

## 特性

- **完全独立运行**：聚合搜索与解析内置在应用内，通过 Tauri 原生 HTTP 直连资源站（无 CORS 限制）
- **内置实测可用源**：量子 / 非凡 / 暴风 / 360（可在设置中增删自定义 API）
- **跨平台**：Windows / macOS / Linux 桌面端 + Android APK
- **应用内自动更新**（桌面端）：启动时检查新版本 → 提示 → 下载进度 → 自动安装重启
- **播放体验**：ArtPlayer 内核，自动连播、记忆进度、倍速、快捷键
- **豆瓣推荐**：热门榜单 / Top250 / 分类筛选
- **移动端适配**：底部导航、沉浸式界面

## 下载

前往 [LittleSU Releases](https://github.com/xiaowulai-s/LittleSU/releases/latest)：

| 平台 | 文件 |
|---|---|
| Android | `LittleSU-TV-v*-android-universal.apk` |
| Windows | `LittleSU.TV_*_x64-setup.exe`（NSIS 安装包）或 `*.msi` |
| macOS | `LittleSU.TV-v*-ARM64.dmg` |
| Linux | `*.AppImage` / `*.deb` / `*.rpm` |

桌面端内置自动更新：安装 v1.2.0 及以上版本后，后续新版本会在启动时提示一键升级。

## 从源码构建

环境要求：Node.js 18+、Rust（桌面端）、Android SDK/NDK（安卓端）。以下命令均在 `apps/app` 目录执行。

```bash
npm install

# 桌面端（Windows 需 MSVC 工具链）
npx tauri build

# 安卓端
npx tauri android init   # 首次
npx tauri android build --apk --target aarch64
```

推送 `v*` 标签会触发 GitHub Actions 自动构建全平台安装包并发布 Release。

## 内置源

v1.2.7 起内置 25 个直连点播源，默认勾选 10 个实测可用源：量子、非凡影视、非凡资源、暴风、360、电影天堂、极速、最大、天涯、艾旦；其余备用/实验源可在「设置 → 数据源管理」中勾选。

底部导航新增「直播」页，内置 5 个直播源（IPTV 中国/香港/电影/纪录片、简单TV），支持频道分组、搜索与 HLS 播放。

## 界面与构建

v1.3.0 起客户端界面切换为 `ui-next`（React + Vite + TypeScript，Lightframe 设计）：

```bash
cd apps/app
npm run dev            # 自动启动 Vite（5174）与 Tauri
npm run tauri build    # 自动 npm ci + 构建前端，再打包安装包
npm run test:ui-next   # 前端解析层单测
```

v1.5.0 起旧静态界面 `public/` 与 Tailwind 构建脚本已移除，前端只保留 `ui-next`；需要回滚旧界面可从 git 历史检出对应提交。

## 更新与播放（v1.4.0）

- **桌面端应用内更新**：启动时检查新版本，设置 → 关于可下载、安装并自动重启；Android 端引导下载新 APK
- **播放器**：音量/静音、全屏、广告分段过滤、记忆进度、自动连播，播放失败时按其他源自动换源
- **源测活**：设置 → 数据源可真实测活，展示延迟与失败状态，结果保存在本机
- **双端布局**：Android 按 UA 识别并启用移动端布局，修复 WebView 宽度误判导致的桌面界面问题

源站可能失效，可在设置中单独停用；旧版本可导入仓库根目录 `sources/littlesu-app-settings.json` 获得同一清单。

## 更新链路（v1.4.1）

- macOS 更新包在 ad-hoc 签名后重新打包并签名，更新后的应用与 DMG 安装的应用一致
- Release 的 `latest.json` 包含 `darwin-aarch64`，Windows / Linux / macOS 都能收到应用内更新
- 客户端开启 `requireSignedVersion`，拒绝签名版本与清单版本不一致的产物
- 每个 Release 附带覆盖全部资产的 `SHA256SUMS`：`sha256sum -c SHA256SUMS`
- 已实测完成一次旧版 → 新版的应用内更新（2026-10-28）

## 发现与源管理（v1.5.0）

- **豆瓣推荐**：首页按热门/高分切换电影与剧集榜单，点击片名到已启用源中搜索
- **自定义源**：设置 → 数据源支持新增、编辑、删除苹果 CMS 接口，立即参与搜索与测活
- **搜索范围**：推荐源 / 全部源 / 测活可用 三种范围真正决定发起请求的源集合
- **详情换源**：同一影片聚合到多个源时，可在详情页直接切换并重新拉取剧集
- **Android 返回键**：硬件返回先关抽屉/回退路由，根页面才退出应用
- **直播节目单**：按频道加载 51zmt 节目单（今天/明天），显示正在播与下一档

## 播放器操作（v1.5.3 / v1.5.4 / v1.5.5）

- 控制条常显：播放/暂停、±10 秒、进度、时长、音量（桌面）、倍速、下一集、更多、全屏
- Android 用页面内全屏（WebView 不支持 Fullscreen API），竖屏时优先请求系统横屏，失败则旋转播放层铺满；返回键先退全屏；直播页同样支持
- 触控端隐藏音量控件，给 ±10 秒、倍速与下一集留空间
- 播放设置（更多）：画面比例（自适应/填满）、字幕与音轨、选集、画中画（支持时）、锁定屏幕
- 全屏手势：左侧上下滑调亮度，右侧调音量；锁定后只保留解锁按钮
- 前端内置 hls.js，字幕/音轨信息来自源的 HLS 清单

## 修改内置采集源

内置源在 `ui-next/src/lib/sources.ts` 的 `SOURCES` 中维护（标准苹果 CMS JSON 接口）；用户自定义源在「设置 → 数据源」里添加，保存在本机 `customAPIs`。返回网页而非 JSON 的实验源保留为占位，不参与批量搜索。

## 目录说明

- `ui-next/` — 正式前端（React + Vite + TypeScript）
- `src-tauri/` — Tauri 壳（Rust）与平台配置
- `sources/`（仓库根目录）— 内置源清单与导入文件
- 仓库根目录 `.github/workflows/app-release.yml` — 全平台发布流水线（本目录内不再单独维护工作流）

## 免责声明

本应用不存储、不制作任何视频内容，仅提供第三方公开接口的聚合与播放能力。
请尊重版权，勿用于商业侵权用途；内容的合法性由对应数据源负责。

## 许可证

[Apache-2.0](./LICENSE)（沿用上游授权；上游链条含 AGPL 的 LibreTV，详见 [NOTICE](./NOTICE)）
