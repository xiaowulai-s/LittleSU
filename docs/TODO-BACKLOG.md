# LittleSU v1.5.0 未完成功能清单

> 排查时间：2026-10-27 · 基线：`ab40fc7`（v1.5.0）
> 方法：全仓只读扫描（未完成标记 / 空实现 / 前后端契约比对 / 双端功能面对比）

---

## 阅读前提

`apps/app/src-tauri/tauri.conf.json:7` 的 `frontendDist` 指向 `../ui-next/dist`，因此：

- **`apps/app/ui-next/` 才是客户端实际运行的代码**（React + Vite + TS）
- `apps/app/public/`、`apps/app/js/`、`apps/app/index.html` 是旧版影子副本，**不再被打包**，仅作回滚备份

排查结论已逐条核验。总体形态有四类：

1. **toast 假成功** —— 按钮提示"已完成"但实际什么也没做
2. **设置项无消费者** —— 写入了持久化状态，但没有任何代码读取它
3. **mock 数据混入生产路径** —— 真实数据为空时静默回退到硬编码假数据
4. **Rust 侧"将来可能用"的死代码** —— 精心配置了但从未接线

全仓**显式 TODO 极少**（真实代码级 TODO 仅 1 处），**无空函数体**，**无"前端调用了但后端不存在"的 command**。代码卫生比想象中好，问题藏在结构里。

---

## P0 — 用户可见的假成功（建议优先修）

这类问题最坑：用户以为功能可用，其实是个空壳。

| # | 功能 | 位置 | 现象 |
|---|---|---|---|
| 1 | 分享（详情页） | `ui-next/src/detail.tsx:143` | toast「已复制分享链接（原型）」+ 绿色 success，**从未调用剪贴板 API** |
| 2 | 分享（播放页） | `ui-next/src/pages/Player.tsx:532` | 同上 |
| 3 | 清理缓存 | `ui-next/src/pages/Settings.tsx:477` | toast「已发送清理请求」，**无任何清理逻辑**，全仓无对应实现 |
| 4 | 直播音量 | `ui-next/src/pages/Live.tsx:192` | toast「音量控制将在实现阶段接入」。但 `Player.tsx` 已有完整音量滑块，逻辑可复用 |
| 5 | 直播全屏 | `ui-next/src/pages/Live.tsx:193` | toast「全屏播放将在 Tauri 中生效」。但 `lib/window.ts:26 setFullscreen()` 已实现且 Player 在用 |

> 网页版的 `apps/web/src/lib/clipboard.ts` 有**真实剪贴板实现**，客户端 ui-next 未复用 —— 修复 #1/#2 成本很低。

---

## P1 — 设置项无效（用户改了没反应）

| # | 功能 | 位置 | 问题 |
|---|---|---|---|
| 6 | 默认清晰度 | `Settings.tsx:341` | `settings.quality` 写入后无任何读取点 |
| 7 | 界面密度 | `Settings.tsx:302` | `settings.density` 写入后无消费者；`styles.css:2081` 只有 `.density-row` 按钮容器，**无密度变体 CSS** |
| 8 | 自定义源「详情地址」 | `lib/sources.ts:67` | `detail` 字段被读取保留，但 `detailUrlFor()` **从不使用 `api.detail`** → 填了无效 |
| 9 | 自定义源「成人源」标记 | `lib/sources.ts:49` | `isAdult` 无任何消费者 → 死字段 |

---

## P2 — mock 数据混入生产路径

真实数据为空/失败时静默回退到硬编码假数据，用户无法分辨真假：

| # | 位置 | 表现 |
|---|---|---|
| 10 | `Home.tsx:43` | feed 为空时用 `mockTitles` 顶替；`Home.tsx:48` 假"继续观看" |
| 11 | `History.tsx:32` | 无真实历史时展示 5 条假记录 |
| 12 | `Live.tsx:31` | 直播源加载失败时展示 16 个假频道（`url: ''`） |
| 13 | `Player.tsx:23` | `mockEpisodes()` 生成假剧集列表 |
| 14 | `detail.tsx:59` / `Search.tsx:50` | "相关推荐"恒取 mockTitles，**与当前影片无关** |
| 15 | `hooks.ts:67` | 非 Tauri 环境搜索走 mock |
| 16 | `hooks.ts:244,248,253,267,270` | 真实数据 < 6 条时**整体退回 mock** |

---

## P3 — 功能性缺陷

| # | 功能 | 位置 | 问题 |
|---|---|---|---|
| 17 | 详情页选集 | `detail.tsx:192` | 所有选集按钮调用**同一个** `play()` —— 选第 5 集仍播第 1 集 |
| 18 | 移动端收藏入口 | `layout.tsx:21` | Android 底栏过滤掉了 `/favorites`，收藏页在移动端无导航入口 |
| 19 | 搜索列表视图 | `Search.tsx:155` | 切换按钮 toast「将在下一版提供」，恒为网格态 |
| 20 | 播放器「更多」菜单 | `Player.tsx:409` | 纯信息 toast，无菜单 |
| 21 | 移动端窗口命令 | `lib/window.ts:14-24` | Android 上 Rust 侧是 `#[cfg(not(desktop))]` 空实现，返回 `Ok(())` → 前端**误报成功** |
| 22 | 打开外部链接返回值 | `lib/window.ts:60-61` | `window.open` 成功却 `return false`，语义颠倒 |

---

## P4 — Rust 后端死代码

| # | 死代码 | 位置 |
|---|---|---|
| 23 | `ApiType::Html` 枚举分支 | `lib.rs:12` —— 从不 match |
| 24 | `detail_base_url` | `lib.rs:19`（31 处赋值）—— 从不读取，详情全由前端 JS 拼 URL |
| 25 | `detail_path` | `lib.rs:22` —— 从不读取，`ffzy`/`heimuer` 的 HTML 详情模板完全无效 |
| 26 | `SearchResultItem` / `SearchResponse` | `lib.rs:252-268` —— 从未实例化 |
| 27 | `search_path` 覆盖机制 | `lib.rs:318` —— 25 个源全是 `None`，形同虚设 |
| 28 | `tauri_plugin_log` | `lib.rs:501,611-617,626-630` —— 日志插件初始化被注释，未启用 |

**结构性问题**：Rust 源表（`lib.rs:27-235`，手写 25 源）与前端 `lib/sources.ts:18-43`（另写 25 源）**双份维护**，改一处必须改两处；`lib.rs:34` 的 `dyttzy` 注释还写着「Assuming it's JSON, adjust if it's HTML」—— 典型的"写了一半"。

---

## P5 — 客户端相对网页版的能力缺口

网页版有、客户端**完全缺失**：

| # | 能力 | 网页版实现 |
|---|---|---|
| 29 | 视频下载 / 下载管理器 | `download-manager.tsx` + `m3u8-downloader.ts` + `mp4-transmuxer.ts`（TS→MP4 转封装） |
| 30 | 跳过片头 / 片尾标记 | `skip-mark-panel.tsx` + `skip-marks.ts` |
| 31 | 画质实测（真实分辨率） | `quality-probe.ts` + `quality-badge.tsx`（客户端"清晰度"只是源声明值） |
| 32 | 直播源 M3U 订阅增删改 | `live-source-manager.tsx`（客户端直播源硬编码） |
| 33 | 点播源远程订阅同步 | `subscription-sync.ts` + `source-list.ts` |
| 34 | 搜索历史 | `search-history.tsx`（客户端只有 6 条硬编码热门词） |
| 35 | 豆瓣多维筛选器 | 旧版 `douban_filters.js`（635 行）；ui-next 仅 4 个固定标签 |
| 36 | 访问密码 / 登录 | `auth.ts` + `api/auth/route.ts` |
| 37 | FLV 直播 | `live-player.tsx:230` 动态 import `mpegts.js` |
| 38 | Bangumi 每日放送 | `bangumi.ts` + `api/bangumi/calendar/route.ts` |
| 39 | 播放预取 / 缓存 | `video-prefetcher.ts` + `video-cache.ts` + `live-cache.ts` |
| 40 | 控制条自动隐藏 | `control-hide.ts` |

客户端**独有**（网页版没有）：应用内自动更新、Android 硬件返回键映射、真实窗口控制、直连第三方源不经自家服务器。

---

## P6 — 遗留代码与文档

| # | 项 | 位置 | 说明 |
|---|---|---|---|
| 41 | 旧版影子副本 | `apps/app/public/`（41 文件 ~7.5k 行） | 不再被打包 |
| 42 | **第三份副本** | `apps/app/js/` + `apps/app/index.html` | 与 `public/js/` 部分文件**内容不同**（config.js / password.js / douban.js 的 md5 不一致）→ 版本漂移风险 |
| 43 | 空壳文件 | `apps/app/public/js/player.js:1` | 全文仅一行 `// This file is now a placeholder.`，但 `public/player.html:229` 仍在引入 |
| 44 | 脱节伪代码 | `apps/app/Implementation.md`（43.8 KB） | 大量"后续处理"伪代码 |
| 45 | 任务列表被截断 | `apps/app/Todos.md:52` | 文件自己写着"由于篇幅限制只展示部分任务"，无法核对完整待办 |
| 46 | iOS 代码签名 | `apps/app/Todos.md:28` | 未勾选 |
| 47 | 文档过期 | `sources/README.md:73` | 称"客户端暂未展示节目单"，但 ui-next 已实现（走 51zmt 接口） |
| 48 | 死配置 | `ui-next/src/data.ts:335` | `epg: 'https://epg.pw/xmltv/epg_CN.xml'` 从无读取（实际 EPG 走 51zmt） |
| 49 | HTML 实验源 | `Settings.tsx:435` | 3 个源（黑木耳/卧龙/华为吧）接口返回网页而非 JSON，明确"保留占位"无法搜索 |

---

## 建议的修复顺序

**第一批（用户可感知，成本低）**
1. 分享按钮接真实剪贴板，或改成"暂不支持"
2. 直播音量/全屏接现成的 `lib/window.ts` + Player 音量逻辑
3. "清理缓存"实现或移除按钮

**第二批（消除静默失效）**
4. `quality` / `density` 要么实现消费逻辑，要么隐藏 UI
5. `CustomApi.detail` / `isAdult` 补表单字段并接线

**第三批（结构性）**
6. Rust 死代码清理（`lib.rs` 6 处）
7. Rust 源表与前端 `sources.ts` 改为构建期生成，消除双份维护
8. 清理 `apps/app/js/` 与 `apps/app/public/` 影子副本

**第四批（能力补齐，按优先级选做）**
9. 下载管理、跳过片头片尾、画质实测、直播源 M3U 管理、点播源远程订阅
10. mock 回退改为显式"暂无数据"提示，而非静默替换

---

## 附：其他事实

- 全仓真实代码级 TODO 仅 1 处（`apps/app/Implementation.md:106`，属文档内历史残留）
- 无空函数体（`onClick={() => {}}`）
- 无前端调用不存在的后端 command；8 个 Tauri command 全部对上
- `tauri_plugin_log` 未启用 → 运行时排障能力受限
