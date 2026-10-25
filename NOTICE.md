# NOTICE — 出处与授权说明

本仓库（LittleSU）为 monorepo，包含两个子项目，各自的上游出处与授权如下。

## apps/web（网页版）

- 上游：[LibreTV](https://github.com/LibreSpark/LibreTV)
- Copyright (c) LibreSpark contributors
- 授权：GNU Affero General Public License v3.0（AGPL-3.0-or-later）
- 授权全文：[`apps/web/LICENSE`](./apps/web/LICENSE)

## apps/app（独立客户端）

- 上游：[LibreTV-App](https://github.com/KeyRotate/LibreTV-App)（MIT）
  - 其上游：[LibreTV](https://github.com/LibreSpark/LibreTV)（AGPL-3.0-or-later）
- Copyright (c) bestZwei 及 LibreTV-App 贡献者
- 授权：Apache License 2.0
- 授权全文：[`apps/app/LICENSE`](./apps/app/LICENSE)

## 本仓库的修改

Copyright (c) 2026 xiaowulai-s

各子项目的修改与衍生部分分别沿用其所在目录的授权（apps/web → AGPL-3.0，
apps/app → Apache-2.0）。应用图标为本项目原创设计。

## 第三方组件（概要）

- Next.js / React — MIT
- ArtPlayer — MIT
- hls.js — Apache-2.0
- Tauri — MIT / Apache-2.0

详见各子应用 package.json 及依赖自带许可声明。
