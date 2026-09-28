/** 「关于」弹窗的**全部文字**都在这个文件里 —— 标题、每一行的标签与内容、关闭按钮。
 *  改这一个文件就够了（`pnpm dev` 存盘即热更新），不用碰组件，也不用跑数据管线。
 *
 * ---- 想改什么，改哪儿 ----
 *
 * | 想改什么 | 改这里 |
 * |---|---|
 * | 弹窗标题（也是应用栏 ⓘ 按钮的名字） | `title` |
 * | 每一行的标签（"项目作者"这类） | 该行的 `label`（**不写这一行 = 只要内容那一行**，见下） |
 * | 每一行的内容（人名 / 仓库名） | 该行的 `name` |
 * | 每一行点开的地址 | 该行的 `url`（**不写这一行**就只显示白色的文字，不是链接） |
 * | 关闭按钮 | `close` |
 * | 加行 / 删行 / 换顺序 | `rows` 数组：**顺序就是弹窗里从上到下的顺序**，加一行就往下抄一个 `{ … }` |
 * | 外置曲库（音MAD）曲目作者的**名单** | 不用写 —— `{ auto: "pack-authors" }` 那一行会**自动**列出（见下） |
 *
 * ---- 两条填写规则（`about.test.ts` 会替你把关）----
 *
 * 1. **要写两份的**：`title` / `close` / 每一行的 `label` 都是 `{ en, zh }` ——
 *    界面的语言开关（右上角 en/zh）切的就是它们，两份都不能留空。
 * 2. **只写一份的**：每一行的 `name`（人名、仓库名这类专有名词，两种语言下一样）。
 *    `url` 写**完整地址**（`https://…`），点一下在新标签页打开。
 *    **不想要链接就别写 `url`**（留空 `""` 也一样）：那一行的文字直接是白的，页面上**不会**出现空链接。
 * 3. **可以不写标签**：某一行**不写 `label`**（或两份都留空）时，那一行就**只有内容一行**
 *    （不再显示上面那行小字标签）—— 适合"这一行本身就是一句说明"的写法。
 * 4. **自动行**：`{ auto: "pack-authors", label: … }` 这一行的**内容不在这里写** ——
 *    它列出**外置曲库（音MAD 曲包）曲目的署名**，名字从已载入的数据里自动收集、去重，
 *    按"英文/拼音首字母"排序（拉丁 → 汉字拼音 → 假名）。你只定**位置**（放哪一行）与**标签**。
 *    只在**本地曲库助手真的在跑**（本地源载入成功）时显示；没在跑时整行不出现（连标签都不显示）。
 *
 * 文案按**纯文本**渲染：不认 Markdown（写 `**粗体**` 会原样显示出来）。
 * 检查用 `pnpm typecheck && pnpm test`。
 */
import type { Localized } from "../i18n/localization";

/** 弹窗里的一行：普通行（自己写内容）或**自动行**（内容来自运行时数据）。 */
export type AboutRow = AboutEntryRow | AboutAutoRow;

/** 普通行：标签（双语，可省）+ 内容（专有名词）+ 地址（可省）。 */
export interface AboutEntryRow {
  /** 这一行的标签（两种语言各一份）。**整条不写 = 没有标签，这一行只有内容一行** */
  label?: Localized;
  /** 显示的内容：人名 / 仓库名（只写一份） */
  name: string;
  /** 完整地址（`https://…`）。**不写 / 空串 / 只有空白 = 这一行没有链接**：文字直接是白的 */
  url?: string;
}

/** 自动行：**内容不在这里写**，运行时从数据里填；这里只定位置与标签。 */
export interface AboutAutoRow {
  /** 自动行的种类。目前只有一种：外置曲库（音MAD 曲包）曲目的署名 */
  auto: "pack-authors";
  /** 这一行的标签（自动行**必须**写标签，否则读者不知道这堆名字是什么） */
  label: Localized;
  /** 排版：`"paragraph"`（默认，一段文字用「、」连接）或 `"lines"`（一行一个作者） */
  layout?: "paragraph" | "lines";
}

export interface AboutContent {
  /** 弹窗标题（同时是应用栏 ⓘ 按钮的无障碍名字） */
  title: Localized;
  /** 关闭按钮的文字（颜色是主题的正文色：白） */
  close: Localized;
  /** 弹窗里的行：**数组顺序 = 从上到下的顺序** */
  rows: AboutRow[];
}

export const aboutContent: AboutContent = {
  title: { en: "About", zh: "关于" },
  close: { en: "Close", zh: "关闭" },

  rows: [
    {
      label: { en: "Project author", zh: "项目作者" },
      name: "multimode_Liu",
      url: "https://github.com/Dustymind",
    },
    {
      name: "feat. Deepseek V4.1 Flash / Deepseek V4 Pro",
    },
    // （数据仓库为独立仓库：https://github.com/Dustymind/touhou-music-cards-otomads-data）
    {
      label: { en: "Repository", zh: "源代码仓库（AI 生成警告）" },
      name: "Dustymind/touhou-music-cards-reconstructed",
      url: "https://github.com/Dustymind/touhou-music-cards-reconstructed",
      // Make it public anyway.
    },
    // 许可：本仓库是聚合（代码 / 字体 / 数据各有各的），所以这里只列**标识符**，
    // 细节全部指向 THIRD-PARTY-NOTICES.md —— 这一行按纯文本渲染，放不下那张表。
    {
      label: { en: "License", zh: "开源许可" },
      name: "MIT · OFL-1.1 · BSD-3-Clause · Apache-2.0",
      url: "https://github.com/Dustymind/touhou-music-cards-reconstructed/blob/main/THIRD-PARTY-NOTICES.md",
    },
    {
      label: { en: "Otomads data set", zh: "音 MAD 数据集" },
      name: "Dustymind/touhou-music-cards-otomads-data",
      url: "https://github.com/Dustymind/touhou-music-cards-otomads-data",
    },
    // 模式 3（自定义）的说明（Q8）：素材来自使用者自己的源；数据仓库里**只有工具**、没有卡数据。
    // 那个仓库还没有公开，所以与上面那行同一个处理：写名字、不写 url。**不放外链**是有意的。
    {
      label: {
        en: "Custom mode: one card is one name, one cover and one track - all of them come from the source you host yourself. The tool that downloads your source files lives in its own repository.",
        zh: "自定义模式：一张卡 = 一个卡名 + 一张卡面 + 一首曲目，全部来自你自己托管的源；负责下载源文件的工具在它自己的仓库里。",
      },
      name: "Dustymind/touhou-music-cards-custom-data",
    },
    {
      label: { en: "Original version author", zh: "原版歌牌游戏作者" },
      name: "lightbulb128",
      url: "https://github.com/lightbulb128",
    },
    {
      label: { en: "Repository of original work", zh: "原版歌牌游戏" },
      name: "https://lightbulb128.github.io/touhou-card-player-v3/",
      url: "https://lightbulb128.github.io/touhou-card-player-v3/",
    },
    {
      name: "lightbulb128/touhou-card-player-v3",
      url: "https://github.com/lightbulb128/touhou-card-player-v3",
    },
    // 外置曲库（音MAD 曲包）曲目的作者：**名单自动来**，这里只定位置与标签。
    // 放在这一行 = 显示在下面的「原作」上方；想换个位置就把整块搬到别处。
    // `layout` 不写 = 一段文字（用「、」连接）；写成 "lines" = 一行一个作者。
    {
      auto: "pack-authors",
      label: { en: "Extra pack music author", zh: "外置曲库曲目作者（按拼音首字母排序）" },
    },
    {
      label: { en: "Original", zh: "原作" },
      name: "上海アリス幻樂団 / 黄昏フロンティア ",
    },
  ],
};
