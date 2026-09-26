/** 原版（touhou-card-player-v3）`Consts.tsx` 里每套卡面图集的说明文案，逐字保留。
 *
 * 上游这几段是**硬编码在代码里**、不随语言切换的，所以中文模式下同样保留原版文案（用户要求）。
 * 未知 id 回退到图集自己的第一个 origin，保证界面上总能看到图片来源。
 */
import type { ReactNode } from "react";

const CARD_SET_DESCRIPTIONS: Record<string, ReactNode> = {
  "dairi-sd": (
    <>
      Free super-deformed tachies from dairi Twitter <a href="https://x.com/dairi155">@dairi155</a>.
      I decided that some characters should look happier than others, and some gloomier.
    </>
  ),
  "dairi": (
    <>
      Free full-body tachies from dairi Twitter <a href="https://x.com/dairi155">@dairi155</a>.
      Respect to the very diligent illustrator.
    </>
  ),
  "enbu": (
    <>
      Free tachies from RPG game <a href="http://www.fo-lens.net/enbu_ap/">幻想人形演舞-ユメノカケラ-</a>.
      Well, don&apos;t blame me if some characters&apos; head seem greater than others&apos;.
    </>
  ),
  "enbu-dolls": (
    <>
      Free tachies from RPG game <a href="http://www.fo-lens.net/enbu_ap/">幻想人形演舞-ユメノカケラ-</a>.
      They were intended for the dolls as a part of the original game. Cute aren&apos;t they?
    </>
  ),
  "thbwiki-sd": (
    <>
      Art from <a href="https://thwiki.cc/">THBWiki</a>.
      Many thanks to the contributors of THBWiki for making these available.
    </>
  ),
  "zun": (
    <>
      Well, cheers for those who love ZUN&apos;s art. Who else on earth would use these for playing?
      I don&apos;t have the copyright and should not have used these here, but let&apos;s pray no one cares.
    </>
  ),
  // 本项目自己的图集：素材不随仓库分发（版权与体积），由用户自己放进 public/cards-otomads/。
  // 曲包角色文件里的 `card = [...]` 写的就是这套目录里的文件名（写法同 data/characters/*.toml）。
  "otomads": (
    <>
      Local art for the otomad pack: drop your files into <code>public/cards-otomads/</code>, named as the
      <code>card = […]</code> lists in <code>data/otomads/packs/otomads/*.toml</code> say.
    </>
  ),
  // 源封面（D153）：素材由**源**给（manifest 快照的 `characters[].covers`），所以这套图集没有目录、
  // 也没有 origin —— 每张卡面就是一条 B 站图床直链（703×1000 的裁切 webp，一首一张）。
  // 只在音MAD 模式、且源真的给了封面时才会出现在这个列表里；源不给，整套不显示。
  "otomads-cover": (
    <>
      One Bilibili video thumbnail per song, straight from the otomad source
      (<code>cover = "…"</code> on each <code>[[track]]</code> in <code>data/otomads/packs/otomads/*.toml</code>,
      served by the Bilibili image CDN, cropped to the card ratio). Only offered in Otomad mode, and only
      when the source actually provides covers. Art belongs to the respective video uploaders.
    </>
  ),
};

export function cardSetDescription(id: string, fallback: string): ReactNode {
  return CARD_SET_DESCRIPTIONS[id] ?? fallback;
}
