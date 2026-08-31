# pi-ask-user-question

`pi-ask-user-question` 是一个面向 [Pi](https://pi.dev) coding agent 的交互式扩展。它向模型注册 `ask_user_question` 工具，让模型在需求、偏好或实现方案需要用户决策时，以结构化选择器而不是普通文本提问。

插件可以独立使用；同时安装 [`pi-open-tui`](https://github.com/CoderDoubleflower/pi-open-tui) 后，还会通过公开 Event Bus 与其 Spinner 联动，在等待回答时显示 `Waiting for your answer…`。

## 核心功能

- 单次调用可询问 1–4 个相关问题，每题提供 2–4 个选项。
- 支持单选和多选；单个单选问题选中后可直接提交。
- UI 自动追加 `Other`，并提供内联文本输入，模型无需自行生成兜底选项。
- 多问题支持 `Tab`、`Shift+Tab` 和左右方向键导航，并在提交前进入 Review 页面。
- 提供 `Chat about this`，可退出选择器并回到普通对话继续澄清。
- 支持 `Esc` 取消、`AbortSignal` 中断和 `session_shutdown` 清理，不会遗留悬挂 Promise。
- 工具使用顺序执行模式，避免多个交互工具同时争抢 Pi 的 editor slot。
- 对窄终端进行宽度保护；在 `rpc`、`json`、`print` 等非 TUI 模式下安全回退。
- 工具调用与结果使用紧凑渲染，并可选联动 `pi-open-tui` Spinner。

## 安装

### 环境要求

- Pi `>=0.84.2 <0.85.0`
- Node.js `>=22.19.0`

### 从 GitHub 全局安装

```bash
pi install git:github.com/CoderDoubleflower/pi-ask-user-question
```

### 仅在当前项目安装

在项目目录中执行：

```bash
pi install -l git:github.com/CoderDoubleflower/pi-ask-user-question
```

### 更新

```bash
pi update --extensions
```

安装或更新后，重启 Pi，或者在会话中执行：

```text
/reload
```

## 使用方式

安装后无需额外命令。模型会在用户答案会实质影响后续实现时调用：

```text
ask_user_question
```

你也可以在提示词中明确要求模型使用结构化问题，例如：

```text
在开始修改前，请使用 ask_user_question 让我选择数据库和部署方式。
```

### 调用示例

```json
{
  "questions": [
    {
      "question": "项目应使用哪种数据库？",
      "header": "数据库",
      "multiSelect": false,
      "options": [
        {
          "label": "SQLite（推荐）",
          "description": "无需额外服务，适合本地或轻量项目。"
        },
        {
          "label": "PostgreSQL",
          "description": "适合需要独立数据库服务的生产环境。"
        }
      ]
    },
    {
      "question": "需要启用哪些可观测性能力？",
      "header": "可观测性",
      "multiSelect": true,
      "options": [
        {
          "label": "日志",
          "description": "输出结构化应用日志。"
        },
        {
          "label": "指标",
          "description": "采集运行时与业务指标。"
        }
      ]
    }
  ]
}
```

### 参数限制

- `questions`：1–4 项。
- `options`：每题 2–4 项。
- 同一次调用中的问题文本必须唯一。
- 同一题中的 option `label` 必须唯一。
- `Other` 和 `Type something` 是保留 label，由 UI 自动提供。
- `multiSelect` 省略时默认为 `false`。
- 推荐选项应放在第一项，并在 label 末尾标注 `(Recommended)`。

## 键盘操作

| 场景 | 按键 | 行为 |
|---|---|---|
| 选项列表 | `↑` / `↓` | 移动焦点 |
| 选项列表 | `Enter` / `Space` | 选择或切换选项 |
| 多问题 | `Tab` / `→` | 下一题或进入 Review |
| 多问题 | `Shift+Tab` / `←` | 上一题 |
| Other 输入 | `Enter` | 保存自定义答案 |
| Other 输入 | `Esc` | 返回选项列表 |
| Review | `↑` / `↓` | 选择提交、返回编辑或继续讨论 |
| 任意非输入状态 | `Esc` | 取消问答 |

标准选择动作通过 Pi 的 `KeybindingsManager` 解析，因此会尊重用户对 `tui.select.*` 和 `tui.input.tab` 的自定义绑定。

## `Chat about this`

选择 `Chat about this` 后，工具会返回结构化的 `clarify` 结果，而不是伪造新的 user message。模型会知道：

- 当前选项尚未被正式接受；
- 应先询问用户希望澄清的内容；
- 只有结构化选择仍然有帮助时，才再次调用 `ask_user_question`；
- 已完成的部分选择会作为上下文保留。

## 与 pi-open-tui 联动

插件不会导入 `pi-open-tui` 的内部模块，而是使用共享事件：

```text
open-tui:spinner:override:v1
```

问答开始时注册 source 为 `pi-ask-user-question` 的 Spinner override，问答结束、取消或异常时按 source 精确清除。多个 Spinner provider 并存时，清除当前 source 后会恢复之前仍然有效的 override。

未安装 `pi-open-tui`、未启用 Spinner 或监听器发生异常时，问答工具本身仍可正常工作。

## 非 TUI 模式

在 `rpc`、`json` 或 `print` 模式中，插件不会尝试打开终端组件，而会返回 `unavailable` 结果，提示模型改用普通回复询问最关键的问题。

## 开发

```bash
npm install
npm test
npm run typecheck
```

测试覆盖参数校验、单选/多选、Other、Review、澄清流程、并发协调、窄终端渲染、TUI 执行、Spinner 联动和非 TUI 回退。

## 许可证

[MIT](LICENSE)
