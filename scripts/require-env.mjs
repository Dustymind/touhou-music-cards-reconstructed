#!/usr/bin/env node
/**
 * 要求某个环境变量非空，否则报错退出。
 *
 * 原来内联在 `media:pull` 里，是 POSIX 写法：
 *
 *     [ -n "$OTOMADS_MEDIA_URL" ] || { echo "用法：…"; exit 1; }
 *
 * `cmd.exe` 不认。这里换成 Node，跨平台一致。
 *
 * 用法：`node scripts/require-env.mjs <变量名> [提示语]`
 */
const [name, hint] = process.argv.slice(2);

if (!name) {
  console.error("用法：node scripts/require-env.mjs <变量名> [提示语]");
  process.exit(2);
}

if (!process.env[name] || process.env[name].trim() === "") {
  console.error(hint ?? `需要环境变量 ${name}，但它没设或为空。`);
  process.exit(1);
}
