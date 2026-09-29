// 由 scripts/gen-notices.mjs 生成 —— 别手改（`pnpm gate` 的 --check 会比对）。
//
// 口径 = npm 生产闭包（package.json 的 dependencies 里真进产物的包）的 SPDX 标识，
// ∪ 随产物分发的素材：字体 OFL-1.1、Material Icons Apache-2.0（见 THIRD-PARTY-NOTICES.md §2/§3）。
// 用处：「关于」弹窗的 License 行（src/content/about.ts）与 README 的许可段。

/** 随产物分发的许可标识符（已排序） */
export const bundledLicenseIds = [
  "Apache-2.0",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "OFL-1.1",
] as const;

/** 上面的标识符覆盖多少个 npm 包（两个素材许可不算） */
export const bundledPackageCount = 86;
