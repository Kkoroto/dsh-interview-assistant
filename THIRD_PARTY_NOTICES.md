# 第三方组件与许可证

本项目以 **GPL-3.0-or-later** 发布（见 `LICENSE`）。仓库内的原创代码、悬浮窗和文档适用该许可证；以下第三方组件与模型权重归原作者，遵循各自许可证。

- 项目：<https://github.com/Kkoroto/dsh-interview-assistant>
- 本文档同时适用于 Git 仓库和 GitHub Release 离线包。

## 插件依赖（不包含在仓库内）

- **dsh-cixisound**：DSH 本地听觉插件，MIT License。  
  项目：<https://github.com/CixiSVesper/dsh-soundtry>  
  本插件复用其 Python venv 与 faster-whisper 运行时，但**没有**把 cixisound 本体打包进 Git 仓库；Release 离线包也不包含 cixisound 本体。

## 仓库/Release 中的第三方组件

| 组件 | 位置 | 许可证 / 来源 |
|---|---|---|
| **pykakasi** 2.3.0 | Release 的 `libs/pykakasi` | **GPL-3.0-or-later**；<https://codeberg.org/miurahr/pykakasi>；许可证全文见 `libs/pykakasi-2.3.0.dist-info/COPYING` |
| jaconv 0.5.0 | Release 的 `libs/jaconv` | MIT；<https://github.com/ikegami-yukino/jaconv> |
| wrapt 2.5.2 | Release 的 `libs/wrapt` | BSD-2-Clause；<https://github.com/GrahamDumpleton/wrapt> |
| deprecated 3.0.1 | Release 的 `libs/deprecated` | MIT；<https://github.com/tantale/deprecated> |
| **sherpa-onnx** 2.0.1 | Release 的 `libs/sherpa_onnx` | Apache-2.0；<https://github.com/k2-fsa/sherpa-onnx> |
| soundcard 0.4.6 | Release 的 `libs/soundcard` | BSD-3-Clause；<https://github.com/bastibe/SoundCard> |
| cffi / pycparser | Release 的 `libs/cffi`, `libs/pycparser` | MIT / BSD-3-Clause |
| **faster-whisper small** 模型 | Release 的 `assets/models/small` | 模型来自 Systran/faster-whisper-small（OpenAI Whisper 权重，MIT）；见 HuggingFace 仓库许可 |
| **SenseVoice-Small** int8 模型 | Release 的 `assets/models/sensevoice` | FunAudioLLM/SenseVoice；模型权重来源：<https://huggingface.co/FunAudioLLM/SenseVoiceSmall>；请遵循上游许可 |
| **CAM++ 说话人模型** | Release 的 `assets/models/speaker-campplus.onnx` | 3D-Speaker（Apache-2.0）；模型来自 sherpa-onnx speaker-recognition-models 发布页 |

## 关于 pykakasi 的特别说明（重要）

`pykakasi` 使用 **GPL-3.0-or-later**。它包含在 Release 离线包的 `libs/` 中，不提交到 Git 仓库；本项目整体选择 **GPL-3.0-or-later** 以保持兼容。

- 个人/内部使用没有问题；
- 对外再分发包含 pykakasi 的整包时，需要遵守 GPL-3.0 的源码与许可证义务；
- 如果你需要闭源/商业分发，建议把标音实现替换成 MIT/BSD 的日语读音库（入口：`engine/furigana.py`、`host/furigana.js`）。

## 原创部分

`dsh-live-caption` / DSH Interview Assistant 的插件代码、悬浮窗、安装脚本与文档由本项目维护，按 **GPL-3.0-or-later** 发布。

## 模型说明

Release 离线包包含：

- faster-whisper small（约 484 MB）
- SenseVoice-Small int8（约 239 MB）
- CAM++（约 28 MB）

Git 仓库**不包含**这些大文件；源码用户可运行 `scripts/fetch-models.ps1`，或直接使用 Release 离线包。模型下载地址：

- <https://huggingface.co/Systran/faster-whisper-small>
- <https://huggingface.co/FunAudioLLM/SenseVoiceSmall>
- <https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models>

⚠️ 在中国大陆网络下，HuggingFace/GitHub 下载可能需要科学上网。
