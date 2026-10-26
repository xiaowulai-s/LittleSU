# 推荐源

本目录提供一份实测/整理的第三方源清单，用户不需要自己收集：

| 文件 | 用途 |
|---|---|
| `littlesu-sources.json` | 网页版「数据源订阅」可直接导入的 SourceList 文件（25 个点播源 + 4 个直播源） |
| `littlesu-app-settings.json` | 独立客户端「设置 → 导入配置」可直接导入的配置文件（25 个源，默认选中 10 个可用源） |

## 网页版导入

在「设置 → 数据源订阅」中粘贴以下任一地址：

- GitHub Raw：`https://raw.githubusercontent.com/xiaowulai-s/LittleSU/main/sources/littlesu-sources.json`
- jsDelivr：`https://cdn.jsdelivr.net/gh/xiaowulai-s/LittleSU@main/sources/littlesu-sources.json`

部署者也可以在 `.env` 中预置：

```ini
DEFAULT_SUBSCRIPTIONS=["https://raw.githubusercontent.com/xiaowulai-s/LittleSU/main/sources/littlesu-sources.json"]
```

## 独立客户端

从 v1.2.7 起，客户端已内置以下全部 25 个点播源，并新增「直播」页内置 5 个直播源；新安装默认勾选 10 个实测可用源，其余可在「设置 → 数据源管理」中勾选。

旧版本可在「设置 → 导入配置」中选择 `littlesu-app-settings.json`，导入后会新增 25 个自定义源并选中 10 个可用源：

`https://raw.githubusercontent.com/xiaowulai-s/LittleSU/main/sources/littlesu-app-settings.json`

## 点播源清单（2026-10-26）

| # | 名称 | 接口 | 状态 | 默认选中 |
|---|---|---|---|---|
| 1 | 量子资源 | `https://cj.lziapi.com/api.php/provide/vod` | 可用 | ✅ |
| 2 | 非凡影视 | `http://ffzy5.tv/api.php/provide/vod` | 可用 | ✅ |
| 3 | 非凡资源 | `https://cj.ffzyapi.com/api.php/provide/vod` | 可用 | ✅ |
| 4 | 暴风资源 | `https://bfzyapi.com/api.php/provide/vod` | 可用 | ✅ |
| 5 | 360资源 | `https://360zy.com/api.php/provide/vod` | 可用 | ✅ |
| 6 | 电影天堂 | `https://caiji.dyttzyapi.com/api.php/provide/vod` | 可用 | ✅ |
| 7 | 极速资源 | `https://jszyapi.com/api.php/provide/vod` | 可用 | ✅ |
| 8 | 最大资源 | `https://api.zuidapi.com/api.php/provide/vod` | 可用 | ✅ |
| 9 | 天涯资源 | `https://tyyszy.com/api.php/provide/vod` | 可用（偶发超时） | ✅ |
| 10 | 艾旦资源 | `http://lovedan.net/api.php/provide/vod` | 可用（偶发超时） | ✅ |
| 11 | 小猫咪资源 | `https://zy.xiaomaomi.cc/api.php/provide/vod` | 备用（当前 502） | — |
| 12 | 如意资源 | `https://cj.rycjapi.com/api.php/provide/vod` | 备用（当前不可达） | — |
| 13 | 豆瓣资源 | `https://dbzy.com/api.php/provide/vod` | 备用（当前超时） | — |
| 14 | 魔爪资源 | `https://mozhuazy.com/api.php/provide/vod` | 备用（当前不可达） | — |
| 15 | 樱花资源 | `https://m3u8.apiyhzy.com/api.php/provide/vod` | 备用（当前 403） | — |
| 16 | 旺旺短剧 | `https://wwzy.tv/api.php/provide/vod` | 备用（当前超时） | — |
| 17 | iKun资源 | `https://ikunzyapi.com/api.php/provide/vod` | 备用（当前不可达） | — |
| 18 | 最大资源2 | `http://zuidazy.me/api.php/provide/vod` | 备用（与最大资源同源） | — |
| 19 | 非凡2 | `https://ffzy.tv/api.php/provide/vod` | 备用（与非凡资源同源） | — |
| 20 | 红牛资源 | `https://www.hongniuzy2.com/api.php/provide/vod` | 备用（详情接口异常） | — |
| 21 | 速播资源 | `https://subocj.com/api.php/provide/vod` | 备用（当前超时） | — |
| 22 | 魔都资源 | `https://caiji.moduapi.cc/api.php/provide/vod` | 备用（当前超时） | — |
| 23 | 黑木耳 | `https://json.heimuer.xyz/api.php/provide/vod` | HTML 实验（搜索接口返回网页） | — |
| 24 | 卧龙资源 | `https://wolongzyw.com/api.php/provide/vod` | HTML 实验（搜索接口返回网页） | — |
| 25 | 华为吧 | `https://cjhwba.com/api.php/provide/vod` | HTML 实验（搜索接口返回网页） | — |

> 已排除成人内容源（百度云、无尽、虎牙、金鹰、光速、新浪等）和短链源，避免合规与失效问题。

## 直播源清单（Android 客户端内置）

| 名称 | 地址 | 频道数（实测） |
|---|---|---|
| IPTV·中国 | `https://iptv-org.github.io/iptv/countries/cn.m3u` | 149 |
| IPTV·香港 | `https://iptv-org.github.io/iptv/countries/hk.m3u` | 17 |
| IPTV·电影 | `https://iptv-org.github.io/iptv/categories/movies.m3u` | 776 |
| IPTV·纪录片 | `https://iptv-org.github.io/iptv/categories/documentary.m3u` | 253 |
| 简单TV | `http://iptv.ruyitv.cc/m3u/tv.txt` | 67 |

EPG：`https://epg.pw/xmltv/epg_CN.xml`（已写入中国源配置，当前客户端暂未展示节目单）。

## 维护说明

- 点播源来自公开 GitHub 配置；逐个实测搜索/详情，能用的默认勾选，失效的作为备用保留。
- 「HTML 实验」源的接口返回网页而非 JSON，当前无法搜索，仅保留占位，后续可单独适配。
- 源站随时可能失效或变更，重新发版前请复测；失效源可在设置中单独停用。
- 本项目不托管、不制作任何视频内容；源站内容与可用性由对应第三方负责，请遵守当地法律与版权要求。
