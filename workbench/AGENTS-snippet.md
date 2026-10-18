# 项目经验库（可选项目钩子）

本仓库有 `procedures/`。只有当前任务依赖先前经验或历史决策时，才需要查：

```text
node workbench/cli.mjs search "<目标: 条件，决策/验证?>" --limit 5
```

先看路径和摘要，按需 `show` 1–2 张；不要全库扫描、不要整库注入。

踩到坑时先记一行：

```text
node workbench/cli.mjs inbox --add "现象：一句话"
```

不要自动捕获、不要自动写记忆、不要把项目专属数据写进任何共享位置。
