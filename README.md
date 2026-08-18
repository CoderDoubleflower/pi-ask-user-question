# pi-ask-user-question

一个独立的 Pi 扩展，为模型提供 Claude Code 风格的结构化提问工具 `ask_user_question`。

它可以单独运行；安装了 [`pi-open-tui`](https://github.com/CoderDoubleflower/pi-open-tui) 时，还会自动通过其公开 Event Bus API 联动 Spinner。问答界面打开期间，Spinner 会显示 `Waiting for your answer…`，结束后按 source 精确清除，并恢复其他仍然有效的 Spinner provider。

## 功能

- 一次询问 1–4 个相关问题。
- 每题提供 2–4 个选项。
- 单选和多选。
- UI 自动追加 `Other`，模型不需要生成兜底选项。
- `Other` 内联文本编辑器。
- 多问题 Tab / 左右方向导航。
- 单个单选问题选中后自动提交。
- Review 页面。
- `Chat about this`：退出选择器，回到普通对话继续澄清。
- Esc 取消。
- `AbortSignal` 和 `session_shutdown` 清理，不遗留悬挂 Promise。
- `executionMode: "sequential"`，避免多个交互工具争抢 Pi 的 editor slot。
- 24 列窄终端宽度保护。
- TUI 之外的 `rpc` / `json` / `print` 模式安全回退。

## 安装

### 推荐：与 pi-open-tui 并存

解压 `pi-ask-user-question-0.1.0.zip` 后，用独立的本地 package source 安装：

```bash
pi install /absolute/path/to/pi-ask-user-question-0.1.0
```

也可以在解压目录的父目录中使用相对路径：

```bash
pi install ./pi-ask-user-question-0.1.0
```

Pi 的 local package source 指向解压后的目录，而不是 `.tgz` 文件。附带的 `.tgz` 是 npm 发布包，可用于 `npm publish`。

### GitHub 源码镜像

独立包源码同时保存在 `pi-open-tui` 仓库的 `pi-ask-user-question` 分支：

```bash
pi install git:github.com/CoderDoubleflower/pi-open-tui@pi-ask-user-question
```

该分支根目录只注册 `pi-ask-user-question`，不会加载 `pi-open-tui` 主插件。不过 Pi 会按 Git 仓库 URL（忽略 ref）识别 package 身份：如果你的 `pi-open-tui` 本身也是从这个 Git 仓库安装的，就不要再用上述 Git 命令安装问答插件，否则两个 ref 会被视为同一个 package。此时使用前面的 ZIP/local-path 方式即可正常并存。若 `pi-open-tui` 是通过 npm 安装的，则 Git 分支来源与 npm 来源是不同 package identity，可以并存。

### 临时加载源码

```bash
pi -e ./extensions/ask-user-question/index.ts
```

发布到 npm 后可使用：

```bash
pi install npm:pi-ask-user-question
```

要求：

- Node.js `>=22.19.0`
- `@earendil-works/pi-coding-agent >=0.80`
- `@earendil-works/pi-tui >=0.80`

## 模型工具

工具名称：

```text
ask_user_question
```

输入示例：

```json
{
  "questions": [
    {
      "question": "Which database should the project use?",
      "header": "Database",
      "multiSelect": false,
      "options": [
        {
          "label": "SQLite (Recommended)",
          "description": "Simple embedded storage with no separate service."
        },
        {
          "label": "PostgreSQL",
          "description": "A production relational database with a separate server."
        }
      ]
    },
    {
      "question": "Which observability features should be enabled?",
      "header": "Observability",
      "multiSelect": true,
      "options": [
        {
          "label": "Logging",
          "description": "Structured application logs."
        },
        {
          "label": "Metrics",
          "description": "Runtime and business metrics."
        }
      ]
    }
  ]
}
```

限制：

- `questions`: 1–4 项。
- `options`: 每题 2–4 项。
- 同一个调用中的问题文本必须唯一。
- 同一题中的 option label 必须唯一。
- `Other` / `Type something` 为保留 label，由 UI 自动提供。
- `multiSelect` 省略时为 `false`。

## 键盘操作

| 状态 | 按键 | 行为 |
|---|---|---|
| 选项列表 | `↑` / `↓` | 移动焦点 |
| 选项列表 | `Enter` / `Space` | 选择或切换选项 |
| 多问题 | `Tab` / `→` | 下一题或 Review |
| 多问题 | `Shift+Tab` / `←` | 上一题 |
| Other 输入 | `Enter` | 保存自定义答案 |
| Other 输入 | `Esc` | 返回选项列表 |
| Review | `↑` / `↓` | 选择动作 |
| 任意非输入状态 | `Esc` | 取消问答 |

标准选择动作通过 Pi 注入的 `KeybindingsManager` 解析，因此会尊重用户对 `tui.select.*` 和 `tui.input.tab` 的自定义绑定。

## `Chat about this`

选择 `Chat about this` 时，工具会正常返回一个结构化 `clarify` 结果，而不是伪造额外 user message。模型会收到以下约束：

- 当前 option 尚未被正式接受；
- 先询问用户希望澄清什么；
- 只有在结构化选项仍然有帮助时，才重新调用 `ask_user_question`；
- 已经做出的部分选择会作为参考保留。

## pi-open-tui 联动

插件不导入 `pi-open-tui` 的内部文件，而是使用它现有的共享 Event Bus provider API：

```text
open-tui:spinner:override:v1
```

问答开始：

```ts
pi.events.emit("open-tui:spinner:override:v1", {
  version: 1,
  source: "pi-ask-user-question",
  message: "Waiting for your answer",
  scope: "agent"
});
```

问答结束：

```ts
pi.events.emit("open-tui:spinner:override:v1", {
  version: 1,
  source: "pi-ask-user-question",
  message: null,
  scope: "agent"
});
```

这种联动方式具有以下性质：

- `pi-open-tui` 未安装时，事件无人监听，问答工具仍正常工作。
- Spinner 未开启时，不影响问答工具。
- 清除当前 source 后，`pi-open-tui` 会恢复之前仍有效的 override。
- `scope: "agent"` 会在 `agent_end` 自动兜底清理。
- 监听器异常不会破坏问答工具。

## 非 TUI 模式

在 `rpc`、`json` 或 `print` 模式中，插件不会尝试打开终端组件，而会返回 `unavailable` 结果，要求模型在普通回复里直接询问最关键的问题。

## 开发

```bash
npm install
npm test
npm run typecheck
```

测试覆盖：

- 参数归一化和语义校验；
- 单选、多选、Other、Review 和澄清状态机；
- coordinator 并发保护；
- 24–80 列渲染宽度；
- TUI 工具执行；
- pi-open-tui override begin/end 配对；
- 非 TUI 回退。

## License

MIT
