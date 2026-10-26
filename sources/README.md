# 推荐源

本目录提供一份实测可用的第三方源清单，用户不需要自己收集：

| 文件 | 用途 |
|---|---|
| `littlesu-sources.json` | 网页版「数据源订阅」可直接导入的 SourceList 文件（含 8 个点播源 + 3 个直播源） |
| `littlesu-app-settings.json` | 独立客户端「设置 → 导入配置」可直接导入的配置文件（8 个自定义源并默认选中） |

## 网页版导入

在「设置 → 数据源订阅」中粘贴以下任一地址：

- GitHub Raw：`https://raw.githubusercontent.com/xiaowulai-s/LittleSU/main/sources/littlesu-sources.json`
- jsDelivr：`https://cdn.jsdelivr.net/gh/xiaowulai-s/LittleSU@main/sources/littlesu-sources.json`

部署者也可以在 `.env` 中预置：

```ini
DEFAULT_SUBSCRIPTIONS=["https://raw.githubusercontent.com/xiaowulai-s/LittleSU/main/sources/littlesu-sources.json"]
```

## 独立客户端导入

从 v1.2.5 起，客户端已内置下列 8 个源，新安装默认全部选中，无需导入。

旧版本（v1.2.4 及以前）可在「设置 → 导入配置」中选择 `littlesu-app-settings.json`，导入后会新增 8 个自定义源并设为选中。文件下载地址：

`https://raw.githubusercontent.com/xiaowulai-s/LittleSU/main/sources/littlesu-app-settings.json`

## 源清单（2026-10-26 实测）

| 名称 | 接口 | 说明 |
|---|---|---|
| 量子资源 | `https://cj.lziapi.com/api.php/provide/vod` | 搜索/详情正常 |
| 非凡影视 | `https://ffzy5.tv/api.php/provide/vod` | 搜索/详情正常 |
| 非凡资源 | `https://cj.ffzyapi.com/api.php/provide/vod` | 搜索/详情正常 |
| 暴风资源 | `https://bfzyapi.com/api.php/provide/vod` | 搜索/详情正常 |
| 360资源 | `https://360zy.com/api.php/provide/vod` | 搜索/详情正常 |
| 电影天堂 | `https://caiji.dyttzyapi.com/api.php/provide/vod` | 搜索/详情正常 |
| 极速资源 | `https://jszyapi.com/api.php/provide/vod` | 搜索/详情正常 |
| 最大资源 | `https://api.zuidapi.com/api.php/provide/vod` | 搜索/详情正常 |

直播源来自 [iptv-org](https://github.com/iptv-org/iptv)，EPG 来自 [epg.pw](https://epg.pw/)。

## 维护说明

- 清单只收录公开 GitHub 配置中列出的直连苹果 CMS 接口，并逐个实测「搜索 + 详情」可用。
- 已排除短链、成人内容与需要特殊解析的 HTML 源。
- 源站随时可能失效或变更，重新发版前请复测；失效源可在设置中单独停用。
- 本项目不托管、不制作任何视频内容；源站内容与可用性由对应第三方负责，请遵守当地法律与版权要求。
