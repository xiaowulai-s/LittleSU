# LittleSU TV

免费在线视频搜索与观看平台：输入片名，即可在多个点播采集源中聚合搜索并在线播放。基于 Next.js 15（App Router）+ TypeScript + Tailwind CSS，播放内核为 ArtPlayer + hls.js。

> 本项目基于 [LibreTV](https://github.com/LibreSpark/LibreTV) 修改，遵循 **AGPL-3.0** 协议继续开源，感谢原项目作者与贡献者。出处声明见 [NOTICE](./NOTICE)。

## 功能特性

- **聚合搜索**：同时检索多个苹果CMS（MacCMS）格式采集源，按相关性排序、跨源去重、逐源流式返回
- **在线播放**：ArtPlayer + hls.js 内核，支持 m3u8/HLS，自动连播、记忆播放进度、倍速与快捷键
- **源管理**：内置源一键测活、健康度跟踪与坏源自动停用；支持订阅远程源列表（LittleSU/LibreTV-SourceList、TVBox 配置 JSON）与手动添加
- **直播 IPTV**：M3U 订阅解析，按分组浏览、搜索频道并站内播放（HLS + HTTP-FLV），支持 XMLTV 节目单（EPG）
- **豆瓣推荐**：热门电影/剧集榜单、Top250，豆瓣评分展示
- **本地数据**：观看历史、收藏、设置保存在浏览器 IndexedDB / localStorage，服务端无状态
- **PWA**：支持"添加到主屏幕"，移动端体验接近原生 App

## 快速开始（Node.js）

要求 Node.js 20+。

```bash
# 1. 安装依赖
npm ci

# 2. 配置环境变量
cp .env.example .env
#    按需编辑 .env（本分支不设置 PASSWORD 时为公开模式，详见下文）

# 3. 构建
npm run build

# 4. 启动
npm start          # 监听 http://localhost:8080
```

开发模式：

```bash
npm run dev        # http://localhost:8080，热更新
npm run typecheck  # 类型检查
npm test           # 单元测试
```

## Docker 部署

```bash
docker compose up -d --build
```

推送 `v*` 标签时，GitHub Actions 会自动构建多架构镜像并发布到
`ghcr.io/xiaowulai-s/littlesu-tv`（配置 Docker Hub 凭据后同步双发布）。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `PASSWORD` | 否 | 访问密码。**本分支不设置时为公开模式（免登录）**；公网部署强烈建议设置 |
| `PROXY_SECRET` | 否 | 会话/代理签名密钥，多实例部署建议显式设置（`openssl rand -hex 32`） |
| `DEFAULT_SOURCES` | 否 | 预置点播采集站，JSON 数组：`[{"name":"源名","url":"https://.../api.php/provide/vod"}]` |
| `DEFAULT_LIVE_SOURCES` | 否 | 预置直播源（M3U 订阅）：`[{"name":"源名","url":"https://.../list.m3u","epg":"https://.../epg.xml.gz"}]`，`epg` 可选 |
| `DEFAULT_SUBSCRIPTIONS` | 否 | 预置数据源订阅（SourceList JSON 链接，一次下发点播源 + 直播源） |
| `DEFAULT_RECOMMEND_SOURCE` | 否 | 首页推荐数据源默认值（`douban` / `bangumi` / `hot-list`） |
| `REQUEST_TIMEOUT` / `MAX_RETRIES` | 否 | 代理上游请求超时（毫秒）与重试次数 |
| `SEARCH_MAX_PAGES` | 否 | 每个搜索源最多抓取的页数（1-50，默认 5） |
| `SEARCH_SOURCE_TIMEOUT_MS` | 否 | 单个搜索源的总死线（毫秒，3s-60s，默认 10000） |
| `USER_AGENT` | 否 | 代理请求使用的 UA（豆瓣封面防盗链等场景） |
| `LIVE_ALLOW_PRIVATE` | 否 | 自建内网 IPTV 放行（默认关闭以维持 SSRF 防护） |
| `60S_API_BASE` | 否 | 影视榜单推荐源实例地址，官方公共实例有限流 |

### 采集源配置示例

```ini
DEFAULT_SOURCES=[{"name":"量子资源","url":"https://cj.lziapi.com/api.php/provide/vod"},{"name":"非凡资源","url":"https://cj.ffzyapi.com/api.php/provide/vod"}]
DEFAULT_LIVE_SOURCES=[{"name":"IPTV·中国","url":"https://iptv-org.github.io/iptv/countries/cn.m3u","epg":"https://epg.pw/xmltv/epg_CN.xml"}]
```

源站是否可用以实测为准；应用内置源测活与健康度自动停用，失效源会在 UI 中标记。

## 安全提示

- **公网部署请务必设置 `PASSWORD`**：公开模式下任何人都可以使用你的服务端代理请求第三方接口
- 服务端对所有用户提交的 URL 做 SSRF 校验（协议白名单 + 内网/保留地址拦截）
- 观看历史与设置仅存于本地浏览器，服务端不存储用户数据

## 独立客户端（桌面 / 安卓）

除网页版外，本项目同时发布**完全独立**的客户端：搜索与解析内置，无需部署任何服务器。

| 平台 | 获取方式 |
|---|---|
| Android | Release 中的 `LittleSU-TV-v*-android-universal.apk`，下载安装即可 |
| Windows / macOS / Linux | [LittleSU-TV-App](https://github.com/xiaowulai-s/LittleSU-TV-App/releases) 仓库的 Release |

客户端特性：

- **独立直连**：通过 Tauri 原生 HTTP 直连资源站，无 CORS 限制，不依赖本项目网页版的任何服务端
- **桌面端应用内自动更新**：v1.2.0 起内置 updater，启动时自动检查新版本并一键升级
- **安卓端更新提醒**：启动时比对 GitHub 最新版本，弹窗引导下载

客户端源码位于姊妹仓库 [LittleSU-TV-App](https://github.com/xiaowulai-s/LittleSU-TV-App)（基于 LibreTV-App）。

## 免责声明

本项目不存储、不制作、不上传任何视频内容，仅提供第三方公开接口的聚合与播放能力。
本项目与任何视频内容来源无关联，所有内容的合法性由对应数据源负责。
请尊重版权：接入自有版权或已获授权的内容，勿用于商业侵权用途。

## 许可证

本项目以 [AGPL-3.0-or-later](./LICENSE) 授权开源。
基于 [LibreTV](https://github.com/LibreSpark/LibreTV) 修改，详见 [NOTICE](./NOTICE)。
