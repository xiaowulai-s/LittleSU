# LittleSU

**免费在线视频搜索与观看平台 —— 单仓库，多端产品。**

```
LittleSU/
├── apps/
│   ├── web/    网页版（Next.js 15 + Tailwind，可部署到 Vercel / Netlify / Docker）
│   └── app/    独立客户端（Tauri 2：Android APK + Windows / macOS / Linux 桌面端）
├── design/     品牌 LOGO 与设计源文件
└── .github/    按路径过滤的双发布流水线
```

| 仓库子项目 | 形态 | 无需电脑 | 出处链 |
|---|---|---|---|
| [`apps/web`](./apps/web) | 网页版（可部署站点） | —（部署即用） | [LibreTV](https://github.com/LibreSpark/LibreTV)（AGPL） |
| [`apps/app`](./apps/app) | 独立客户端（直连资源站，无服务器） | ✅ | [LibreTV-App](https://github.com/KeyRotate/LibreTV-App)（MIT）→ LibreTV（AGPL） |

## 功能

- **聚合搜索**：多苹果CMS采集源并行检索，跨源去重、流式返回
- **在线播放**：ArtPlayer + hls.js，自动连播、记忆进度、倍速
- **豆瓣推荐**：热门榜单 / Top250 / 分类筛选
- **独立客户端**：直连资源站、桌面端应用内自动更新、安卓更新提醒
- **直播 IPTV**（网页版/客户端）：M3U 订阅 + EPG 节目单

## 发布流程

```bash
# 改版本号（apps/app/package.json 与 apps/app/src-tauri/tauri.conf.json）
git tag v1.2.1 && git push origin v1.2.1
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

## 免责声明

本项目不存储、不制作任何视频内容，仅提供第三方公开接口的聚合与播放能力。
请尊重版权，勿用于商业侵权用途；内容的合法性由对应数据源负责。

## 许可证

- [`apps/web`](./apps/web/LICENSE)：AGPL-3.0（沿用 LibreTV 授权）
- [`apps/app`](./apps/app/LICENSE)：Apache-2.0（沿用 LibreTV-App 授权；其上游链条含 AGPL 内容，见各 NOTICE）

出处与授权链详见 [NOTICE.md](./NOTICE.md)。
