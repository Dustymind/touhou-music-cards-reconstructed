# 模式 3 的 e2e 素材

`custom-mode.spec.ts` 用同源的这几份文件当"使用者自己托管的源"：

- `manifest.json`：清单（**相对路径**写卡面与音频 —— 应用要按清单自己的目录解析）；
- `cover/*.png` / `media/*.mp3`：素材（几 KB 的纯色图与 1 秒静音，`ffmpeg` 生成）；
- `loudness/custom.json`：清单声明的响度表（表跟着源走，D139）。

**这份素材是测试夹具，不是应用数据**：应用自带的那份（`public/data/custom/`）恒为空兜底。
