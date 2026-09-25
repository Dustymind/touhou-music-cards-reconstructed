/** 启动期 URL 参数（对齐上游的彩蛋入口）。 */

function params(): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

/** `?g=`：卡片随机倾斜（确定性哈希，两端一致） */
export function glitchEnabled(): boolean {
  return params().has("g");
}

/** `?local=1`：卡面优先走本地目录（用户自己放了图集时） */
export function preferLocalCards(): boolean {
  return params().has("local");
}

/** `?r2=`：卡面走 R2（我们的默认 origin 就是 R2，这里只用于显式确认） */
export function preferR2Cards(): boolean {
  return params().has("r2");
}

