# 插件-pnpm版本不存在

> **Scope**: general
> **触发**：pnpm 安装 DSH 插件时报 `ERR_PNPM_NO_MATCHING_VERSION`，或 lockfile 的某个可选依赖版本在 registry 不存在，`pnpm install` 被 supply-chain policy 拦截。
> **验证**：`pnpm install --offline` 通过，且 `pnpm-lock.yaml` 不再包含那个不存在的版本。

## 首选
在 profile 的 `pnpm-workspace.yaml` 里忽略这个可选包，并清掉 lockfile 里的旧条目：

```yaml
ignoredOptionalDependencies:
  - '@dsh-ops/bash-win32-x64'
```

然后 `pnpm install --offline`。若 lockfile 仍钉着旧版本，删掉该 package/snapshot 条目或重建 lockfile。

## 被挡时
- 用 `pnpm view <pkg> versions` 确认 registry 确实没有该版本。
- 临时把依赖换成 registry 上存在的版本，再重试。

## 别再来
| 弯路 | 为什么不通 |
| --- | --- |
| 反复 `pnpm install` | 版本在 registry 根本不存在，重试不会出现 |
| 只删 `node_modules` | lockfile 仍会把旧版本带回来 |

## 注意
- 这是 pnpm 可选依赖 + lockfile 的通用问题，不是某个插件代码坏了。
- 优先忽略可选包，不要为此改动 DSH 本体。

证据：DSH desktop 0.2.1 安装 `@dsh-ops/bash-win32-x64@0.2.1` 时的 `ERR_PNPM_NO_MATCHING_VERSION`；本机 `pnpm-workspace.yaml` + lockfile 修复。
