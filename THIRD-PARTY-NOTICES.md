# 第三方软件声明 / Third-Party Notices

本文件列出**随 `pnpm build` 产物（`dist/`）一起分发**的第三方软件与素材，用于满足 MIT、BSD-3-Clause、Apache-2.0 与 SIL OFL-1.1 的署名与许可随附要求。

- **包清单是生成的**：`pnpm notices` 从**生产依赖闭包**重建下表，别手改标记之间的内容（脚本：`scripts/gen-notices.mjs`）。
- **许可证正文只存一份**：`LICENSES/<SPDX>.txt`（REUSE 的既有约定）。
- **分发副本**：`pnpm notices` 同时产出 `dist/THIRD-PARTY-NOTICES.txt` = 本文 + 附录（把用到的许可全文拼上）—— 这样署名与许可全文**一定跟着 `dist/` 走**（D170）。
- 逐路径的权威许可映射见 [`REUSE.toml`](REUSE.toml)，可用 `uvx --from reuse reuse lint` 校验。

## 目录

| 节 | 内容 |
|---|---|
| 1 | 打进 JS 产物的 npm 包（**生成**） |
| 2 | 随产物分发的字体 Inconsolata（SIL OFL-1.1） |
| 3 | 图标素材 Google Material Icons（Apache-2.0） |
| 4 | 运行时才加载的第三方内容（**不分发**） |
| 5 | 本仓库与上游的许可说明 |

---

## 1. 打进 JS 产物的 npm 包

口径：从 `package.json` 的 `dependencies` 出发走**生产闭包**（含 pnpm 的符号链接布局）。**构建期依赖不进产物**（TypeScript、Vite、Vitest、Playwright、Babel、cosmiconfig 等），因此不在这里，也无需署名。

> 依赖升版后跑 `pnpm notices` 重建；CI 可跑 `pnpm notices --check`（有漂移就退出码 1）。

<!-- gen:packages:start -->
共 **86** 个包（构建期依赖不进这里）。每种许可的正文只存一份，见 `LICENSES/`。

### BSD-3-Clause（4 个）

| 包 | 版本 | 版权 |
|---|---|---|
| `hoist-non-react-statics` | 3.3.2 | Copyright (c) 2015, Yahoo! Inc. All rights reserved. |
| `react-transition-group` | 4.4.5 | Copyright (c) 2018, React Community |
| `source-map` | 0.5.7 | Copyright (c) 2009-2011, Mozilla Foundation and contributors |
| `webrtc-adapter` | 9.0.6 | Copyright (c) 2014, The WebRTC project authors. All rights reserved. |

许可正文：`LICENSES/BSD-3-Clause.txt`

### ISC（3 个）

| 包 | 版本 | 版权 |
|---|---|---|
| `@msgpack/msgpack` | 2.8.0 | Copyright 2019 The MessagePack Community. |
| `picocolors` | 1.1.1 | Copyright (c) 2021-2024 Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov |
| `yaml` | 1.10.3 | Copyright 2018 Eemeli Aro <eemeli@gmail.com> |

许可正文：`LICENSES/ISC.txt`

### MIT（79 个）

| 包 | 版本 | 版权 |
|---|---|---|
| `@babel/code-frame` | 7.29.7 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/generator` | 7.29.8 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/helper-globals` | 7.29.7 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/helper-module-imports` | 7.29.7 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/helper-string-parser` | 7.29.7 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/helper-validator-identifier` | 7.29.7 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/parser` | 7.29.8 | Copyright (C) 2012-2014 by various contributors (see AUTHORS) |
| `@babel/runtime` | 7.29.7 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/template` | 7.29.7 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/traverse` | 7.29.8 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@babel/types` | 7.29.8 | Copyright (c) 2014-present Sebastian McKenzie and other contributors |
| `@emotion/babel-plugin` | 11.13.5 | Copyright (c) Emotion team and other contributors |
| `@emotion/cache` | 11.14.0 | Copyright (c) Emotion team and other contributors |
| `@emotion/hash` | 0.9.2 | Copyright (c) Emotion team and other contributors |
| `@emotion/is-prop-valid` | 1.4.0 | Copyright (c) Emotion team and other contributors |
| `@emotion/memoize` | 0.9.0 | Copyright (c) Emotion team and other contributors |
| `@emotion/react` | 11.14.0 | Copyright (c) Emotion team and other contributors |
| `@emotion/serialize` | 1.3.3 | Copyright (c) Emotion team and other contributors |
| `@emotion/sheet` | 1.4.0 | Copyright (c) Emotion team and other contributors |
| `@emotion/styled` | 11.14.1 | Copyright (c) Emotion team and other contributors |
| `@emotion/unitless` | 0.10.0 | Copyright (c) Emotion team and other contributors |
| `@emotion/use-insertion-effect-with-fallbacks` | 1.2.0 | Copyright (c) Emotion team and other contributors |
| `@emotion/utils` | 1.4.2 | Copyright (c) Emotion team and other contributors |
| `@emotion/weak-memoize` | 0.4.0 | Copyright (c) Emotion team and other contributors |
| `@jridgewell/gen-mapping` | 0.3.13 | Copyright 2024 Justin Ridgewell <justin@ridgewell.name> |
| `@jridgewell/resolve-uri` | 3.1.2 | Copyright 2019 Justin Ridgewell <jridgewell@google.com> |
| `@jridgewell/sourcemap-codec` | 1.6.0 | Copyright 2024 Justin Ridgewell <justin@ridgewell.name> |
| `@jridgewell/trace-mapping` | 0.3.31 | Copyright 2024 Justin Ridgewell <justin@ridgewell.name> |
| `@mui/core-downloads-tracker` | 7.3.11 | Copyright (c) 2014 Call-Em-All |
| `@mui/icons-material` | 7.3.11 | Copyright (c) 2014 Call-Em-All |
| `@mui/material` | 7.3.11 | Copyright (c) 2014 Call-Em-All |
| `@mui/private-theming` | 7.3.11 | Copyright (c) 2014 Call-Em-All |
| `@mui/styled-engine` | 7.3.10 | Copyright (c) 2014 Call-Em-All |
| `@mui/system` | 7.3.11 | Copyright (c) 2014 Call-Em-All |
| `@mui/types` | 7.4.12 | Copyright (c) 2014 Call-Em-All |
| `@mui/utils` | 7.3.11 | Copyright (c) 2014 Call-Em-All |
| `@popperjs/core` | 2.11.8 | Copyright (c) 2019 Federico Zivolo |
| `babel-plugin-macros` | 3.1.0 | Copyright (c) 2020 Kent C. Dodds |
| `callsites` | 3.1.0 | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) |
| `clsx` | 2.1.1 | Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com) |
| `convert-source-map` | 1.9.0 | Copyright 2013 Thorsten Lorenz. |
| `cosmiconfig` | 7.1.0 | Copyright (c) 2015 David Clark |
| `csstype` | 3.2.3 | Copyright (c) 2017-2018 Fredrik Nicol |
| `debug` | 4.4.3 | Copyright (c) 2014-2017 TJ Holowaychuk <tj@vision-media.ca> |
| `dom-helpers` | 5.2.1 | Copyright (c) 2015 Jason Quense |
| `error-ex` | 1.3.4 | Copyright (c) 2015 JD Ballard |
| `es-errors` | 1.3.0 | Copyright (c) 2024 Jordan Harband |
| `escape-string-regexp` | 4.0.0 | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) |
| `eventemitter3` | 4.0.7 | Copyright (c) 2014 Arnout Kazemier |
| `find-root` | 1.1.0 | Copyright © 2017 jsdnxx |
| `function-bind` | 1.1.2 | Copyright (c) 2013 Raynos. |
| `hasown` | 2.0.4 | Copyright (c) Jordan Harband and contributors |
| `import-fresh` | 3.3.1 | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) |
| `is-arrayish` | 0.2.1 | Copyright (c) 2015 JD Ballard |
| `is-core-module` | 2.16.2 | Copyright (c) 2014 Dave Justice |
| `js-tokens` | 4.0.0 | Copyright (c) 2014, 2015, 2016, 2017, 2018 Simon Lydell |
| `jsesc` | 3.1.0 | Copyright Mathias Bynens <https://mathiasbynens.be/> |
| `json-parse-even-better-errors` | 2.3.1 | Copyright 2017 Kat Marchán |
| `lines-and-columns` | 1.2.4 | Copyright (c) 2015 Brian Donovan |
| `loose-envify` | 1.4.0 | Copyright (c) 2015 Andres Suarez <zertosh@gmail.com> |
| `ms` | 2.1.3 | Copyright (c) 2020 Vercel, Inc. |
| `object-assign` | 4.1.1 | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) |
| `parent-module` | 1.0.1 | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) |
| `parse-json` | 5.2.0 | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) |
| `path-parse` | 1.0.7 | Copyright (c) 2015 Javier Blanco |
| `path-type` | 4.0.0 | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) |
| `peerjs` | 1.5.5 | Copyright (c) 2015 Michelle Bu and Eric Zhang, http://peerjs.com |
| `peerjs-js-binarypack` | 2.1.0 | Copyright (c) 2012 Eric Zhang, http://binaryjs.com |
| `prop-types` | 15.8.1 | Copyright (c) 2013-present, Facebook, Inc. |
| `react` | 19.3.0 | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `react-dom` | 19.3.0 | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `react-is` | 19.3.0 | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `resolve` | 1.22.12 | Copyright (c) 2012 James Halliday |
| `resolve-from` | 4.0.0 | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) |
| `scheduler` | 0.28.0 | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `sdp` | 3.2.2 | Copyright (c) 2017 Philipp Hancke |
| `stylis` | 4.2.0 | Copyright (c) 2016-present Sultan Tarimo |
| `supports-preserve-symlinks-flag` | 1.0.0 | Copyright (c) 2022 Inspect JS |
| `zustand` | 5.0.15 | Copyright (c) 2019 Paul Henschel |

许可正文：`LICENSES/MIT.txt`
<!-- gen:packages:end -->

---

## 2. 随产物分发的字体：Inconsolata（SIL OFL-1.1）

- 文件：`src/assets/Inconsolata-Medium.ttf` → `dist/assets/Inconsolata-Medium-<hash>.ttf`（Vite 打包，文件名带内容哈希）
- SPDX：`OFL-1.1`
- Copyright：Copyright 2006 The Inconsolata Project Authors
- 分发的是**未修改**的原文件，因此 OFL 的 Reserved Font Name 条款不触发；**请勿重命名该 TTF 或改动其内部名称表**
- 主题里的 `TMC Whitney` 与 `TMC YuGothic` 只走 CSS `local()`，**不分发**（商业字体，见 `docs/DECISIONS.md` D12）
- 许可正文：[`LICENSES/OFL-1.1.txt`](LICENSES/OFL-1.1.txt)

---

## 3. 图标素材：Google Material Icons（Apache-2.0）

`@mui/icons-material` 这个**包**以 MIT 分发（见 §1 表，其 `LICENSE` 只含 MIT 正文），但其中的图形来自 Google 的 Material Icons。Google 官方 [Material Icons Guide](https://developers.google.com/fonts/docs/material_icons) 写明：

> We have made these icons available for you to incorporate them into your products under the Apache License Version 2.0. Feel free to remix and re-share these icons and documentation in your products. We'd love attribution in your app's about screen, but it's not required.

- SPDX：`Apache-2.0`
- Copyright：Copyright Google LLC（Material Design icons）
- 本产物里有 **30 个图标模块**。上游 `@mui/icons-material` 并未附 Apache-2.0 声明，这里补上。
- 许可正文：[`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt)

---

## 4. 运行时才加载的第三方内容（**不在 MIT 授权范围内**）

下列内容由页面在运行时从第三方地址取得，**不随本仓库分发**：

| 内容 | 来源 | 权利归属 |
|---|---|---|
| 卡面图（7 套图集） | 上游 R2 桶 / 上游 GitHub Pages / jsDelivr / raw.githubusercontent | 各图集原作者 |
| 曲目音频 | 网易云音乐 / THBWiki / 使用者自建的本地源 | 各曲目权利人 |
| 角色名、曲名、碟名 | 东方 Project 官方作品 | 上海アリス幻樂団 / ZUN 等 |

其中 `zun` 图集是 ZUN 本人的画作。这些内容不在本仓库 MIT 的授权范围内。

---

## 5. 其他说明

### 5.1 上游授权

本仓库部分代码移植自 `lightbulb128/touhou-card-player-v3` —— 该仓库**未附任何 LICENSE**（默认保留所有权利）。本项目已就授权范围与**可按 MIT 再许可**取得作者同意，记录见 `docs/permissions/upstream-authorization.md`。

### 5.2 本仓库自己的许可

MIT，见 [`LICENSE`](LICENSE)。逐路径的权威映射见 [`REUSE.toml`](REUSE.toml)。

### 5.3 数据子模块

`data/otomads/` 与 `data/custom/` 是独立仓库（git submodule），许可在各自仓库里声明。

### 5.4 东方 Project 二次创作

本项目是非官方二次创作，与 上海アリス幻樂団 / ZUN 无任何关联，遵循 [东方Project使用规定案](https://thbwiki.cc/%E4%B8%9C%E6%96%B9Project%E4%BD%BF%E7%94%A8%E8%A7%84%E5%AE%9A%E6%A1%88)。
