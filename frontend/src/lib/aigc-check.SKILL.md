---
name: aigc-check
description: 调用腾讯云朱雀大模型检测章节正文的 AIGC（AI 生成）占比，逐段标注并落盘 JSON 报告，供「去AI化润稿」定向改写。
---

# AIGC 检测（朱雀文本检测）

对章节正文调用腾讯云 EdgeOne Makers 网关上的朱雀文本检测模型，度量整章与逐段的
AI 生成占比。检测是**度量**，不是修改建议；改写方法论见
`.cinyuverse/skills/humanizer-chinese/SKILL.md`。

## 前置条件：API Key

需要 `ZHUQUE_API_KEY`（腾讯云 EdgeOne Makers 控制台 → API Key 管理 创建）。
按以下顺序查找，找到即用：

1. 项目根目录 `.env`（脚手架生成的 `.gitignore` 已忽略它，不会被提交）
2. 用户主目录 `~/.cinyuverse/.env`（多项目共用一把密钥时放这里）

两处都没有时：**停止执行**，告诉用户去
<https://console.cloud.tencent.com/edgeone/makers> 创建 API Key，参照项目根的
`.env.example` 写入 `.env` 后重试。禁止编造密钥，禁止把密钥值打印、复述或写进
任何输出。

## 调用方法

正文较长，先写入临时 payload 文件再 `--data-binary` 上传，避免命令行转义。
以下为 bash（Git Bash / Linux / macOS 均可）：

```bash
# 1) 提取密钥到环境变量（只引用变量，绝不回显值）
ZHUQUE_API_KEY="$(grep -E '^ZHUQUE_API_KEY=' .env | head -n1 | cut -d= -f2- | tr -d '\"' | tr -d "'")"

# 2) 准备 payload：text 为去掉章标题行的纯正文（保留段落换行），is_merge 固定 false
#    用工具把 JSON 写到 payload.json，例如 {"text": "……正文……", "is_merge": false}

# 3) 调用
curl -sS -X POST 'https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify' \
  -H "Authorization: Bearer $ZHUQUE_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @payload.json

# 4) 删除临时 payload 文件
rm -f payload.json
```

- 鉴权：仅 `Authorization: Bearer <key>`，无额外签名。
- 参数：`text`（待检文本）；`is_merge`：`false` 逐段标注（默认，章节检测必须用），
  `true` 只要整体占比（不要用，信息量不够）。
- 仅支持文本；免费额度每月 50 万 token（一章数千 token，日常足够）。

## 响应解读

```json
{
  "labels_ratio": { "0": 0.62, "1": 0.25, "2": 0.13 },
  "segment_labels": [
    { "label": 1, "conf": 0.98, "seg_start": 0, "seg_end": 45 }
  ],
  "softmax_confidence": 0.87,
  "usage": { "total_tokens": 1234 }
}
```

- `labels_ratio`：整体占比，键 `0`=人工、`1`=AI、`2`=疑似 AI。
- **`ai_ratio = label1 占比 + label2 占比`**，这是给用户看的 headline 数字。
- `segment_labels`：每个分段的 `label`、置信度 `conf` 与在提交文本中的位置；
  位置偏移对不齐时，按段落顺序与内容自行对应回正文段落。

## 报告落盘契约

把结果写入 `.cinyuverse/aigc/chapter-NN.json`（NN 与章节文件同名补零），
后续「去AI化润稿」模板会读取它定向改写：

```json
{
  "chapter": "chapter-07",
  "checkedAt": "2026-09-09T12:00:00+08:00",
  "charCount": 3120,
  "firstLine": "正文第一个非空行……",
  "lastLine": "正文最后一个非空行……",
  "labels_ratio": { "0": 0.62, "1": 0.25, "2": 0.13 },
  "ai_ratio": 0.38,
  "segments": [
    { "index": 3, "label": 1, "conf": 0.98, "excerpt": "该段开头约 30 字……" }
  ]
}
```

- `index` 为该段在正文中的段落序号（从 1 开始）；`excerpt` 取段落开头约 30 字，
  供改写时定位；只记录 `label != 0` 的段落即可，人工段落不必逐条列出。
- `charCount` / `firstLine` / `lastLine` 是变更检测指纹，必须如实填写。

对话中同步输出摘要：整体三类占比与 `ai_ratio`、AI / 疑似段落清单（序号 + 引文），
以及本次消耗的 token 数。

## 省额度规则

- 复检前先读旧报告：若当前正文的字数与首尾行和报告指纹一致，视为正文未变，
  直接引用旧报告，**不要重复调用**。
- 长文因长度报错时：按段落切分为每批 ≤ 8000 字符分别调用，合并各批
  `segment_labels`，整体占比按各批字符数加权平均，正常写入同一份报告。

## 边界

- 报告永远对应**检测那一刻的旧稿**；正文改写后报告即过期，需复检刷新。
- 检测结果只描述统计分布，不构成对文本质量的判断；不要依据检测分数删改情节。
- 密钥只存在于 `.env` 与环境变量中，不进报告、不进对话、不进 git。
