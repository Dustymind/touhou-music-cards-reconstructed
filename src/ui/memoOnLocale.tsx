/** `memo()` 的替代品：多订阅一次**当前语言**，让切语言时这个组件自己也重渲染。
 *
 * 为什么必须有它：`t()` 读的是**模块级** locale，而 `memo` 只在 props 变化时才重渲染 ——
 * 切语言时这些面板的 props（`bundle` / `tables` / …）一个都没变，于是它们被整块跳过，
 * 里面的文案停在旧语言，要等它**因为别的原因**重渲染（切页签、展开分区、换图集…）才跟上。
 * 用户看到的就是"中英文反复切换时，部分字段卡住不切换"。
 *
 * 订阅一次 locale 就解决了：不必把 locale 逐层透传，也不必在每个子组件里各写一遍 ——
 * `memo` 挡住的只是**父组件驱动**的重渲染，组件自己订阅的状态变化照样会重渲染它。
 *
 * **约定**：这个仓库里凡是 `memo` 过的面板 / 分区，一律用它包（哪怕当前只渲染几个字），
 * 这样"新增一个文案"不会悄悄带回同一个 bug。
 */
import { memo, type ComponentType } from "react";

import { useSession } from "../store/session";

export function memoOnLocale<P extends object>(Component: ComponentType<P>) {
  return memo(function LocaleBound(props: P) {
    useSession((slice) => slice.locale);   // 值不用：订阅它是为了"语言一变就重渲染"
    return <Component {...props} />;
  });
}
