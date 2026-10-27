# LittleSU

**免费在线视频搜索与观看平台 —— 单仓库，多端产品。**

```
LittleSU/
├── apps/
│   ├── web/      网页版（Next.js 15 + Tailwind，可部署到 Vercel / Netlify / Docker）
│   └── app/      独立客户端（Tauri 2：Android APK + Windows / macOS / Linux 桌面端）
│       └── ui-next/ 客户端界面（React + Vite + TypeScript，v1.3.0 起为正式入口）
├── design/     品牌 LOGO 与设计源文件
└── .github/    按路径过滤的双发布流水线
```

| 仓库子项目 | 形态 | 无需电脑 | 出处链 |
|---|---|---|---|
| [`apps/web`](./apps/web) | 网页版（可部署站点） | —（部署即用） | [LibreTV](https://github.com/LibreSpark/LibreTV)（AGPL） |
| [`apps/app`](./apps/app) | 独立客户端（直连资源站，无服务器） | ✅ | [LibreTV-App](https://github.com/KeyRotate/LibreTV-App)（Apache-2.0）→ LibreTV（AGPL） |

## 功能

- **聚合搜索**：多苹果CMS采集源并行检索，跨源去重、流式返回
- **在线播放**：ArtPlayer + hls.js，自动连播、记忆进度、倍速
- **豆瓣推荐**：热门榜单 / Top250 / 分类筛选
- **独立客户端**：直连资源站、桌面端应用内自动更新、安卓更新提醒
- **客户端播放**：音量/全屏、广告过滤、失败自动换源、源测活
- **直播 IPTV**（网页版/客户端）：M3U 订阅 + EPG 节目单

## 发布流程

两个子项目共用同一版本号。发版时先同步版本号，再推送标签：

```bash
(cd apps/web && npm version <x.y.z> --no-git-tag-version)
(cd apps/app && npm version <x.y.z> --no-git-tag-version)
(cd apps/app/ui-next && npm version <x.y.z> --no-git-tag-version)
# 再同步 apps/app/src-tauri/tauri.conf.json、Cargo.toml 与 ui-next/src/lib/version.ts
git commit -am "v<x.y.z>：版本号同步"
git tag v<x.y.z> && git push origin main v<x.y.z>
```

工作流跑完后由 `finalize_release` 统一收尾：

- 把 macOS（`darwin-aarch64`）条目合并进 `latest.json`，桌面端各平台都能收到更新；
- 用 updater 公钥对 `latest.json` 里的每个平台产物做 minisign 校验，并核对签名内嵌版本与清单版本一致；
- 生成覆盖全部发布资产的 `SHA256SUMS`，下载后可自检：

```bash
sha256sum -c SHA256SUMS
```

| 工作流 | 触发 | 产物 |
|---|---|---|
| `app-release` | `v*` 标签 | Android APK + Windows / macOS / Linux 安装包（自动签名 + latest.json） |
| `web-standalone` | `v*` 标签 | 服务器预构建包（node server.js 直跑） |
| `web-docker` | `v*` 标签 | 多架构 Docker 镜像（GHCR + Docker Hub） |

## 本地开发

```bash
# 网页版
cd apps/web && npm install && npm run dev

# 独立客户端（桌面）
cd apps/app && npm install && npx tauri dev
```

## 仓库沿革与归档

- v1.2.0 起，网页版与独立客户端合并到本单仓库。
- 原网页版仓库 [`LittleSU_TV`](https://github.com/xiaowulai-s/LittleSU_TV) 与原客户端仓库 [`LittleSU-TV-App`](https://github.com/xiaowulai-s/LittleSU-TV-App) 已归档（只读），代码分别迁入 `apps/web` 与 `apps/app`；旧提交历史与旧 Release 保留在原仓库。
- 新版本统一发布在本仓库的 [Releases](https://github.com/xiaowulai-s/LittleSU/releases)。
- 迁移与归档明细见 [docs/ARCHIVE.md](./docs/ARCHIVE.md)。

## 推荐源

仓库内置一份实测/整理的源清单，用户无需自行收集：

- **网页版**：设置 → 数据源订阅，粘贴 `https://raw.githubusercontent.com/xiaowulai-s/LittleSU/main/sources/littlesu-sources.json` 即可导入 25 个点播源 + 4 个直播源。
- **独立客户端**：v1.2.7 起内置全部 25 个点播源和 5 个直播源（新增「直播」页），默认勾选 10 个实测可用源，其余可在设置中启用；旧版本可导入 `sources/littlesu-app-settings.json`。
- 每个源的状态、默认选中项和免责声明见 [`sources/README.md`](./sources/README.md)。

## 免责声明

本项目不存储、不制作任何视频内容，仅提供第三方公开接口的聚合与播放能力。
请尊重版权，勿用于商业侵权用途；内容的合法性由对应数据源负责。

## 许可证

- [`apps/web`](./apps/web/LICENSE)：AGPL-3.0（沿用 LibreTV 授权）
- [`apps/app`](./apps/app/LICENSE)：Apache-2.0（沿用 LibreTV-App 授权；其上游链条含 AGPL 内容，见各 NOTICE）

出处与授权链详见 [NOTICE.md](./NOTICE.md)。
