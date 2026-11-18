# 面试助手 · DSH Interview Assistant

一个跑在 **DeepSeek Harness（DSH）** 右侧栏里的 Windows 面试助手：

- 实时监听系统回环音频，识别面试官的中文 / 日语 / 英语提问；
- 结合简历、岗位、行业知识和当前对话上下文，自动生成可直接照读的面试回答；
- 独立 WPF 悬浮窗展示对话、说话人、标音、翻译和 AI 回答；
- 支持日语振假名、AI 回答中文翻译、截图答题、长问题分析模式、Markdown 笔记导出。

> 本项目以 **GPL-3.0-or-later** 开源。第三方组件和模型权重的许可证见
> [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

---

## 功能

### 实时面试字幕

- WASAPI 回环采集，区分说话人；
- 中文 / 日语 / 韩语 / 粤语走 SenseVoice，英语及其他语言走 faster-whisper；
- 时间戳、说话人颜色、语言标签、非中文中文翻译；
- 日语内容显示汉字上方的平假名振假名。

### 自动 AI 作答

- 中文、日语、英语提问关键词与问句结构自动触发；
- 日语示例：`志望動機を教えてください`、`強みは何ですか`、`なぜ当社を選んだのですか`；
- 英语示例：`Tell me about your project`、`Why did you choose this company?`、`What are your strengths?`；
- 陈述句不会误触发，例如 `I have five years of experience.`；
- 识别到自我介绍（`自己紹介` / `introduce yourself`）时优先调出预设稿；
- 同一问题 20 秒内不重复触发，作答中的新问题排队。

### AI 回答翻译

右侧栏开关「AI 回答自动翻译成中文」：

- 非中文 AI 回答下方显示「译 …」；
- 日语回答同时保留振假名；
- 译文随原卡片一起隐藏；
- 译文写入 Markdown 笔记。

### 截图答题

- 标题栏「AI截图答题」：拖拽框选屏幕区域；
- `←` 单击：直接抓主屏快速作答；
- `←` 双击：抓主屏进入「长问题分析模式」，每次双击只分析、不显示；
- `←` 长按 2 秒：结束长问题模式，把所有分析当成一道大题统一长答；完成后可再次开启；
- 截图先隐藏悬浮窗再抓取，只使用主屏，不写临时图片。

### 悬浮窗

- 拖动移动、右下角缩放、透明度调节、字号 `A-` / `A+`；
- `→` 单击隐藏全部 AI 回复；`→` 双击或长按 2 秒触发 AI 作答；
- AI 区「全部隐藏」、每条「隐藏」；隐藏只影响悬浮窗，笔记仍保留；
- 按说话人/语言分组或时间线视图。

### 笔记

点「结束」后，在当前会话工作目录生成：

```text
面试助手-YYYYMMDD-HHmmss.md
```

包含时间戳、说话人、原文、中文译文、AI 作答、自我介绍稿和中文翻译。

---

## 环境要求

| 项目 | 要求 |
|---|---|
| 系统 | Windows 10/11 x64 |
| DSH | DeepSeek Harness 桌面版 |
| 依赖插件 | [`dsh-cixisound`](https://github.com/CixiSVesper/dsh-soundtry) 已安装并启用 |
| Python | 由 dsh-cixisound 的 `runtime\venv` 提供 |
| 模型 | faster-whisper small、SenseVoice、CAM++（约 750 MB，不提交到 Git） |
| 网络 | dsh-cixisound 首次准备需要 GitHub / PyPI / HuggingFace；本插件截图需要当前对话模型支持图片输入 |

当前对话模型建议使用 **`deepseek-flash`**（DeepSeek V4.1 Flash）；截图答题依赖它的图片输入能力。

---

## 安装

### 方式 1：下载 Release 离线包（推荐）

从 [Releases](https://github.com/Kkoroto/dsh-interview-assistant/releases/latest) 下载
`面试助手-离线包-v1.1.3.zip`，解压后：

1. 先安装并启用 `dsh-cixisound`；
2. 确认 `...\dsh-cixisound\runtime\venv\Scripts\python.exe` 存在；
3. DSH →「插件」→「添加插件」→ 选择解压后的 `dsh-live-caption` 目录；
4. 重启 DSH；
5. 打开一个新对话 → 右侧栏「面试助手」→ 填背景 → 保存 → 开始。

离线包已经包含模型和 `libs`，不需要再下载本插件模型。

### 方式 2：从源码安装

```powershell
git clone https://github.com/Kkoroto/dsh-interview-assistant.git
cd dsh-interview-assistant

# 模型（约 750 MB）
powershell -ExecutionPolicy Bypass -File .\scripts\fetch-models.ps1

# Python 运行库（写入 libs，不提交到 Git）
powershell -ExecutionPolicy Bypass -File .\scripts\setup-libs.ps1

# 可选：重新编译悬浮窗
powershell -ExecutionPolicy Bypass -File .\scripts\build-overlay.ps1
```

然后让 DSH 插件管理器安装当前目录（或把目录复制到 DSH 插件目录），重启 DSH。

模型、`libs`、`node_modules` 和 `*.zip` 都被 `.gitignore` 排除，避免 Git 大文件限制。

### dsh-cixisound

本插件不包含 `dsh-cixisound` 本体，只复用它的 Python venv 和 faster-whisper 运行时：

<https://github.com/CixiSVesper/dsh-soundtry>

首次准备会下载依赖，国内网络可能需要科学上网。安装后确认：

```text
...\dsh-cixisound\runtime\venv\Scripts\python.exe
```

如果 cixisound 装在非默认路径，在插件配置里设置：

```yaml
engine:
  soundPluginDir: "D:\\your-path\\dsh-cixisound"
```

---

## 使用

1. 打开一个新对话（新面试请新开对话，背景与对话绑定）；
2. 右侧栏「面试助手」填写简历、行业、公司、岗位、知识、自我介绍稿；
3. 点「保存背景」→「开始」；
4. 播放面试音频；
5. 结束后点「结束」导出笔记。

### 快捷键

| 操作 | 行为 |
|---|---|
| `→` 单击 | 隐藏全部 AI 回复 |
| `→` 双击 / 长按 2 秒 | 触发 AI 作答（可重复） |
| `←` 单击 | 截主屏快速作答 |
| `←` 双击 | 截主屏进入长问题分析模式 |
| `←` 长按 2 秒 | 结束长问题模式并统一长答 |
| `Esc` | 取消框选 |

快捷键只在悬浮窗获得焦点时生效，先点一下悬浮窗标题栏。

---

## 架构

```text
DSH 右侧栏
  └─ client.js                 标签页 UI / 背景 / 翻译开关
       └─ index.js             Host 路由 / 面试状态 / 自动作答 / 笔记
            ├─ host/engine.js   启动 Python 采集引擎
            ├─ host/llm.js      当前对话模型调用 / 图片输入 / 翻译
            ├─ host/overlay.js  悬浮窗 stdin/stdout 协议
            ├─ host/note.js     Markdown 笔记
            └─ host/furigana.js 日语振假名
                 └─ engine/
                      ├─ live_engine.py     回环采集 / ASR / 说话人
                      ├─ furigana.py        pykakasi 标音
                      └─ furigana_cli.py
overlay/Overlay.cs              WPF 悬浮窗（编译为 exe）
```

### 截图答题链路

```text
WPF 截图（内存 PNG）
  → Host 校验
  → ctx.attachments.saveImage()
  → ctx.llm.stream({ provider, model, content: [text, image] })
  → 当前对话的 deepseek-flash 同时完成图像理解 + OCR
  → 回到悬浮窗 AI 回答卡片
```

长问题模式：每张截图用视觉模型只分析，最后用文字模型统一长答；不会把每张图直接变成最终答案。

---

## 隐私

- 音频只在本地采集和识别；
- 截图只在内存中生成 PNG，通过 Host 交给当前对话模型；
- 不写入临时音频/图片文件；
- AI 作答/翻译会把识别文字、面试背景、最近对话发送给当前 DSH 模型 API；
- 背景/笔记保存在本地会话目录；
- 不读取、不打印 API Key。

---

## 已知限制

- Windows 独占全屏游戏无法覆盖悬浮窗；
- 截图只抓主屏；
- 当前模型路由必须支持图片输入，截图才能工作；
- 密集文档的精确坐标/逐字框选不如专门 OCR；
- 日语专有名词读音由 pykakasi 生成，个别姓名/地名可能误读；
- 模型思考档位过高时可能把输出预算用在思考上；截图任务已默认低思考档并自动重试。

---

## 开发

```powershell
node --check index.js
node --check client.js
python -c "import ast,pathlib; [ast.parse(p.read_text(encoding='utf-8')) for p in pathlib.Path('engine').glob('*.py')]"
powershell -ExecutionPolicy Bypass -File .\scripts\build-overlay.ps1
```

CI：`.github/workflows/check.yml` 在 Windows Runner 上做 JS 语法、Python AST 和悬浮窗编译，不下载模型。

---

## 许可证

本项目代码以 **GNU General Public License v3.0 or later** 发布，见 [`LICENSE`](LICENSE)。

第三方组件与模型权重不改变其原许可证，详见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
其中 `pykakasi` 为 GPL-3.0-or-later；本项目选择 GPL-3.0-or-later 以保持兼容。

## 致谢

- [dsh-cixisound](https://github.com/CixiSVesper/dsh-soundtry) 提供本地音频/推理运行时；
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 提供 SenseVoice / CAM++ 推理；
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) / OpenAI Whisper；
- [pykakasi](https://codeberg.org/miurahr/pykakasi) 日语读音；
- DeepSeek Harness 的插件、附件与模型服务。
