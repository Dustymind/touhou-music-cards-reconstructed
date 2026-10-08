/** e2e 侧的公告内容：**用 `node:fs` 读同一批 `notices/*.md`**，再调应用自己的 `buildNoticeContent`。
 *
 * ---- 为什么不直接 `import { noticeContent } from "../src/content/notices"` ----
 *
 * 那个模块用了 Vite 专有语法（`?raw`）。Playwright **有自己的 TS 加载器**（不经过 Vite），
 * 它会把 `.md` 当 **JS 模块**去解析 —— `.md` 开头是 `---` 或汉字，于是每个 spec 都
 * `SyntaxError: Unexpected token (1:0)`、**一条用例都收不上来**（报 `Error: No tests found`）。
 *
 * 所以 e2e 侧的正文从磁盘取，但**解析与拼装用同一个 `buildNoticeContent`**（`src/content/noticeMeta`）——
 * 文件名清单（`NOTICE_FILES`）、frontmatter 解析、排序、指纹算法、规整口径都只有一份，
 * 不存在"两边各抄一遍"的漂移。**这里只是把同样的文件读进内存。**
 *
 * 路径按仓库既有口径：**相对 cwd 读**（`smoke.spec.ts` 读 `data/public/data/...` 也是这样），
 * 用例从仓库根跑。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildNoticeContent, NOTICE_FILES } from "../src/content/noticeMeta";

/** 公告所在目录（相对仓库根）。 */
const NOTICE_DIR = join("src", "content", "notices");

export const noticeContent = buildNoticeContent(
  Object.fromEntries(
    NOTICE_FILES.map((file) => [file, readFileSync(join(NOTICE_DIR, file), "utf8")]),
  ),
);
