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
