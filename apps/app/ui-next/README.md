# Lightframe · LittleSU TV 新前端

LittleSU TV 独立客户端（Windows + Android）的新界面与新数据层：React + Vite + TypeScript。v1.3.0 起为客户端正式入口；v1.5.0 起旧版 `apps/app/public` 已移除，回滚需从 git 历史检出。

## 运行（浏览器预览）

```bash
cd apps/app/ui-next
npm install
npm run dev
```

打开 http://localhost:5174

- 默认显示**原型预览外框**：底部工具条可切换 **Windows / Android** 与 **深色 / 浅色**
- 在链接后加 `&standalone=1`（放在 `#` 之前）可隐藏预览外框，模拟客户端真实全屏布局：
  `http://localhost:5174/?standalone=1&device=windows&theme=dark#/`
- 浏览器内没有 Tauri 命令，搜索会自动回退到示例数据；直播仍可直接解析公开 M3U

![客户端界面](./docs/screenshots/app-windows.png)

## 在 Tauri 中运行

v1.3.0 起客户端入口已切换到本前端（`apps/app/src-tauri/tauri.conf.json` 的 `frontendDist` 指向 `ui-next/dist`），
`beforeDevCommand` / `beforeBuildCommand` 会自动处理前端构建。

```bash
# 开发：tauri dev 会自动启动 Vite（5174）并等待其就绪
cd apps/app
npm run dev

# 打包：自动执行 npm ci + 前端构建，然后构建安装包
cd apps/app
npm run tauri build
```

单独调试前端：`cd apps/app/ui-next && npm run dev`，浏览器打开 http://localhost:5174。

旧静态界面已在 v1.5.0 移除；需要对照旧实现时从 git 历史（v1.4.x 及更早）检出。

## 预览链接

| 页面 | 链接 |
|---|---|
| Windows 首页（深色） | `http://localhost:5174/?device=windows&theme=dark#/` |
| Windows 首页（浅色） | `http://localhost:5174/?device=windows&theme=light#/` |
| Android 首页 | `http://localhost:5174/?device=android&theme=dark#/` |
| 搜索 | `#/search?q=庆余年` |
| 直播 | `#/live` |
| 播放页 | `#/player/qingyu-nian-2` |
| Android 详情页 | `?device=android#/title/qingyu-nian-2` |
| 源管理 | `#/settings?section=sources` |

## 已接入的真实能力

- 源选择、历史、收藏、主题、播放偏好全部落 `localStorage`，兼容旧版 `selectedAPIs` / `customAPIs` / `viewingHistory` 键
- 搜索：调用 Tauri 命令 `search_videos` 并行聚合已启用源，跨源去重、失败源提示、分页加载更多；单源超时（8–30 秒）与失败重试（0–2 次）可在设置中配置；浏览器内自动回退示例数据
- 详情：按 `ids` 拉取 CMS 详情，解析剧集与简介；`vod_play_from` 多线路按 `$$$` 拆分，详情与播放器均可切换线路；HTML 详情源做 m3u8 兜底
- 播放：内置 hls.js + `fetch_text_native` / `fetch_bytes_native` 自定义 loader，绕过 WebView CORS；分享页解析、音量/静音、±10 秒、倍速、清晰度切换、失败重试（签名地址过期时自动回源重解析）、屏幕常亮、系统媒体卡片、下一集、页面内全屏（Android）、画中画、锁屏、亮度/音量手势、画面比例、字幕/音轨、全屏选集、广告过滤、逐集进度/倍速/比例记忆、自动连播与失败自动换源；Android 前台服务支持点播/直播后台播放与播放通知
- 桌面更新：设置页与启动检查均可下载并安装更新（Tauri updater），安装完成后自动重启；Android 通过原生桥下载 APK 并拉起系统安装器（v1.4.1 起 macOS 也进入 `latest.json`，并启用 `requireSignedVersion` 绑定签名版本）
- 源测活：真实搜索测活、延迟/失败展示并持久化；测活失败的已启用源会自动停用
- 搜索范围：推荐源 / 全部源 / 测活可用 三种范围真正影响请求的源集合与并发
- 搜索体验：历史记录与输入联想、网格/列表视图切换并记忆
- 分享：系统分享优先，回退到复制标题/来源/链接
- 相关推荐：详情页从已启用源搜索同类内容，不再使用示例数据
- 豆瓣：热门 / 高分 / Top250 / 最新与电影/剧集分类筛选
- 直播收藏：频道收藏与「收藏」筛选，保存在本机
- 源管理：自定义源启停、单源测活；自定义直播源（M3U/TXT）
- 播放器：本地 SRT/VTT 外挂字幕、Remote Playback 投屏入口、桌面音量/静音快捷键
- 外观：紧凑 / 舒适 / 大屏密度真实生效
- 自定义源：设置 → 数据源里新增 / 编辑 / 删除苹果 CMS 接口，保存后立即参与搜索、详情与测活
- 豆瓣推荐：客户端内直连豆瓣热门 / 高分榜单，点击片名跳到已启用源搜索可播放地址
- 详情换源：按同片变体切换播放源，重新拉取该源详情与剧集；从收藏/历史进入且缺少变体时自动按片名回查补全
- 直播：真实解析 5 个内置 M3U / TXT 源（分组、搜索、频道播放），并按频道加载 51zmt 节目单（今天 / 明天，当前与下一档）
- 设置：导出 / 导入配置（含 SHA-256 校验），与旧版配置文件互通
- 双端布局：Windows 侧栏 + 自定义标题栏与真实窗口控制；Android 按 UA 识别，顶栏 + 5 项底栏，硬件返回键映射到路由返回（根页面退出应用）

## 目录

- `src/lib/env.ts` — Tauri 检测、原生命令调用、浏览器回退
- `src/lib/sources.ts` — 25 个内置源注册表与源选择持久化
- `src/lib/cms.ts` — 苹果 CMS 搜索 / 详情解析、跨源去重
- `src/lib/hooks.ts` — 搜索、详情、首页数据流、直播频道 hooks
- `src/lib/hlsNativeLoader.ts` — hls.js 原生取流 loader
- `src/lib/storage.ts` — localStorage 键、历史迁移、设置
- `src/store.tsx` — 设备 / 主题 / 收藏 / 历史 / 源选择 / Toast
- `src/layout.tsx`、`src/ui.tsx`、`src/detail.tsx`、`src/pages/` — 界面
- `docs/screenshots/` — 关键页面截图

## 待完成

1. HTML 实验源适配（当前保留占位，不参与批量搜索）
2. Android 真机回归截图

截图仅用于设计确认；实际以运行中的界面为准。