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
};

export function cardSetDescription(id: string, fallback: string): ReactNode {
  return CARD_SET_DESCRIPTIONS[id] ?? fallback;
}
