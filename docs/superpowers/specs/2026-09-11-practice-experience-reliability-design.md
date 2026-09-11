# Practice Experience and Reinforcement Design

## Status

The product direction was approved in conversation on 2026-09-11. This written design is pending final user review before implementation planning.

## Context

ACMCoder's focused Practice view currently combines a code editor, problem statement, local runner, model assistance, and progress tracking. Six reported problems reveal two missing boundaries rather than six unrelated defects:

1. Practice state is split between transient DOM state, browser storage, and server progress without one owner.
2. Browser requests have no shared lifecycle for reconnecting, refreshing the run token, cancelling work, or translating connection failures.

The visible symptoms are:

- long solutions cannot scroll inside the editor;
- AI advice has no conversation history and uses an eight-second model timeout;
- metadata such as `#206 · easy · linked-list · recursion · AC 4` has weak hierarchy;
- the problem statement is hidden until the user opens it;
- after learning a solution with AI, there is no quick way to reset and immediately solve the same problem again;
- after a long session, connection loss can surface as a raw `Failed to fetch` error.

Static investigation confirmed all six source-level gaps. Live browser reproduction is still required because the configured WSL host and tunnel were unavailable during design.

## Goals

- Make the solution editor a bounded, independently scrollable surface on desktop and mobile.
- Display the problem statement immediately without sacrificing a usable editor viewport.
- Give the problem number, title, difficulty, tags, and accepted count distinct meanings and visual hierarchy.
- Turn AI advice into a per-problem conversation that survives ordinary navigation and refreshes.
- Let the user archive the learned round and start a clean reinforcement round on the same problem with one action.
- Recover safely from a restarted server or short connection loss and replace raw browser errors with actionable Chinese messages.
- Preserve current runner, daily plan, library, import/export, progress, extension, and local-first behavior.

## Non-goals

- Accounts, cloud synchronization, or cross-device chat history.
- A permanent history of every failed run or every code snapshot.
- Spaced-repetition scheduling or automatic future reminders.
- Streaming model responses.
- Blindly retrying mutations whose execution outcome is unknown.
- Replacing the current editor with a third-party editor framework.

## Chosen Approach

Keep the current application architecture and introduce two small, explicit frontend boundaries:

1. A versioned practice-session store owns per-problem, per-language workspace state, the current AI conversation, the immediately previous learned round, and reinforcement status.
2. A shared API client owns fetch error classification, safe retry rules, run-token renewal, request cancellation, and connection status.

The existing server remains the authority for the problem library and accepted progress. Layout and semantic markup changes stay within the Practice view. This gives the requested behavior without introducing a database, account model, or large frontend framework.

Two alternatives were rejected:

- A minimal collection of CSS changes, a longer timeout, and a single remembered AI answer would be quick but would leave state and network behavior fragmented. It would also remain vulnerable to stale responses after switching problems.
- A server-side session database with streamed AI responses and full attempt history would support richer analytics, but adds migration, retention, and synchronization work that the requested workflow does not need.

## Practice Session State

Add a focused module such as `web/practice-session.js`. It exposes pure normalization, migration, load, and save functions and accepts a storage implementation so it can be unit tested without a browser.

The storage key is based on the canonical problem slug and language. The versioned value contains:

```js
{
  version: 2,
  code: "...",
  stdin: "...",
  expected: "...",
  lastResult: {
    status: "AC",
    message: "...",
    stdout: "...",
    stderr: "...",
    ranAt: "2026-09-11T..."
  },
  ai: {
    current: [
      { role: "user", content: "...", createdAt: "..." },
      { role: "assistant", content: "...", createdAt: "..." }
    ]
  },
  previousRound: {
    archivedAt: "2026-09-11T...",
    trigger: "accepted" | "ai-assisted",
    code: "...",
    result: {},
    aiConversation: []
  },
  reinforcement: {
    status: "idle" | "active" | "completed",
    startedAt: "...",
    completedAt: "..."
  }
}
```

Only the immediately previous round is retained. This supports “查看上轮思路” and accidental-reset recovery while keeping browser storage bounded. Existing `acmcoder.web.problem.<slug>.<language>` values are migrated on first load so current drafts are not lost.

The current server-side `progress.json` remains compatible and continues to store accepted count and last accepted time. Starting reinforcement does not increment progress. The next AC follows the existing accepted-progress path and also marks the local reinforcement round complete. The UI then shows “巩固完成”.

## Quick Reinforcement Flow

Two contextual entry points use the same action:

- After any successful AI answer, show “我懂了，马上重练”.
- After an AC result, show “再练一次”.

When invoked, the client performs one atomic session transition before changing the visible editor:

1. Archive the current code, latest result, and AI conversation as `previousRound`.
2. Mark reinforcement as active and record whether it was triggered by AI learning or AC.
3. Restore the selected problem's initial template for the active language.
4. Clear stdin, expected output, visible run result, and the current AI conversation.
5. Keep the problem statement and selected problem unchanged.
6. Move focus to the editor and show a compact “巩固练习中” state with a “查看上轮思路” action.

Viewing the previous round never silently adds its AI messages to the new round. It is a read-only reference. The user may close it and continue solving without hints. If the user triggered reinforcement accidentally, a one-step “恢复上一轮” action restores the archived code, result, and conversation until the new round has produced meaningful edits or a run.

When the reinforcement round receives AC, the state changes to completed, the existing accepted count updates, and the result panel shows “巩固完成”. The user may start another reinforcement round; it replaces the single archived previous round.

Daily recommendations keep their current behavior: “加入并练习” resolves and saves the problem into “我的题库” before opening Practice. Reinforcement never creates a duplicate library item.

## AI Conversation

Replace the single answer `<pre>` with a compact transcript of user and assistant messages. Conversations are isolated by canonical problem slug and language and restored from the practice-session store.

Each request contains:

- a fresh snapshot of problem title and statement, language, current code, test input, expected output, and latest run result;
- the bounded current-round user/assistant transcript;
- the new user question.

The server accepts only `user` and `assistant` history roles, rejects malformed entries, and caps both message count and total characters before calling the configured OpenAI-compatible endpoint. The system instruction remains server-owned. The previous reinforcement round is never included automatically.

The default model timeout changes from 8 seconds to 60 seconds. While a request is running, the UI shows elapsed state and a “取消” action. Cancelling the browser request also aborts the upstream model request on the server. Errors distinguish cancellation, model timeout, upstream HTTP failure, and loss of the local ACMCoder service.

Every request records its problem slug and a local request id. A response is rendered only if it still belongs to the currently selected problem and current request. Switching problems or starting reinforcement cannot allow an old response to overwrite the new conversation.

The current transcript is bounded to the most recent 12 user/assistant messages and a fixed character budget. When trimming is needed, complete oldest pairs are removed rather than leaving an orphaned assistant answer.

## Practice Layout and Problem Identity

### Desktop

At wide desktop widths, Practice becomes a three-surface workspace:

- a visible problem-statement column on the left;
- the solution editor in the center;
- test, result, and AI tabs on the right.

The statement column has its own scroll area and can be collapsed, but it is open by default when entering a new problem. The editor and utility dock keep bounded heights so each can scroll independently.

At intermediate desktop widths, the statement remains open by default as a bounded region above the editor/utility split. The user may collapse it after reading. The collapse preference is retained for the current browser, but selecting a different problem makes its statement visible at least once.

### Mobile

Mobile keeps the existing Problem, Code, and Result workspace tabs. Entering a newly selected problem activates Problem first so the statement is directly visible. Moving to Code gives the editor the full remaining viewport. Starting reinforcement activates Code immediately because the user has already read the same statement.

### Semantic identity

Replace the concatenated eyebrow with distinct elements:

- main heading: `#206 反转链表`;
- localized difficulty badge: `简单`;
- individual tag chips: `链表`, `递归`;
- explicit progress text: `通过次数 4`;
- reinforcement state when applicable: `巩固练习中` or `巩固完成`.

Missing problem numbers or tags omit only that element. Long titles and tags wrap on narrow screens instead of being silently truncated. Accessible names contain the complete text and do not rely on color alone.

## Editor Scrolling

The textarea becomes the sole scroll source for code:

- remove content-driven editor expansion from `syncHighlight`;
- keep the editor grid at the height assigned by the Practice workspace;
- use `overflow: auto` on the textarea and do not clip it through ancestor overflow rules;
- copy textarea `scrollTop` and `scrollLeft` to the syntax-highlight overlay;
- copy textarea `scrollTop` to line numbers;
- preserve horizontal scrolling for long unwrapped lines.

The syntax-highlight overlay remains non-interactive. Resizing the viewport recalculates available panel height but does not resize the editor to its entire content. This corrects the regression caused by combining the older auto-grow behavior with the newer fixed-height Practice workspace.

## API Client and Connection Recovery

Add a small module such as `web/api-client.js` and route browser API calls through it.

### Run token

The server creates a new run token whenever it restarts. The current page caches the first token forever, so a restarted server leaves `/api/run` returning 401 until refresh.

For `/api/run` only, an explicit 401 means the server rejected the request before execution. The client clears its cached token, fetches a new token, and retries exactly once. A second 401 is surfaced and never loops.

### Network failures

Idempotent GET requests may retry a small fixed number of times with bounded backoff. A POST or DELETE with an unknown network outcome is not retried automatically because the server may already have applied it. The UI keeps the user's local work and presents a manual retry action.

Raw browser errors are translated into actionable Chinese states, for example:

- “无法连接 ACMCoder 本地服务；请确认 WSL 已启动且本地隧道可用。”
- “服务刚刚重启，正在重新建立运行会话。”
- “请求结果未知，为避免重复提交未自动重试。”

Add a cheap `/api/health` endpoint for connection recovery instead of repeatedly running the full toolchain doctor. The two-second memory poll becomes visibility-aware and uses failure backoff up to 30 seconds. After health recovers, the client refreshes memory pages and runner state and clears the connection warning.

## Server Changes

The server changes remain narrow:

- validate and forward bounded AI history;
- use a 60-second default model timeout;
- connect browser cancellation to the upstream model request;
- add the cheap health response;
- preserve the existing session-token requirement for code execution;
- keep accepted progress and recommendation-to-library behavior compatible.

No credentials, raw API headers, or hidden environment data are written into practice-session state or error messages.

## Error Handling

- A failed template load during reinforcement leaves the archived round intact and does not clear the visible editor.
- A browser-storage quota or parse failure falls back to the current in-memory round, reports a non-blocking local-save warning, and never prevents code execution.
- A malformed AI history entry is rejected with a clear 400 response; the API key is never echoed.
- Starting a second AI request cancels or supersedes the first request for that problem.
- Switching problems preserves each problem's current session independently.
- A network failure during `/api/run` keeps the submitted code and reports an unknown outcome; it does not increment local AC state without a confirmed response.
- If the service restarts, only the safely rejected 401 run request is retried automatically.

## Testing Strategy

### Automated unit and API tests

- Migrate the existing workspace cache without losing code, stdin, or expected output.
- Isolate session state by canonical problem slug and language.
- Archive one learned round, reset the active round, restore the previous round, and complete reinforcement after AC.
- Bound AI history by valid roles, message pairs, count, and total characters.
- Verify the second AI request includes the first user/assistant pair.
- Verify responses from a stale problem or request id are ignored.
- Verify a response slower than eight seconds but faster than the new limit succeeds.
- Verify browser cancellation aborts the upstream request.
- Simulate a stale run token: first run returns 401, the client fetches one new token, retries once, and the server executes once.
- Verify network-uncertain POST requests are not retried, while idempotent GET retries remain bounded.
- Verify health polling backs off while disconnected and resumes memory synchronization after recovery.
- Preserve current progress import/export and daily-plan behavior.

### Browser acceptance

Use Playwright against the WSL-hosted service through `http://127.0.0.1:43117`:

- Desktop and 390-pixel mobile viewports load at least 100 lines of code, scroll to the final line, and keep code, highlight, and line numbers aligned.
- A newly selected problem displays its statement without first clicking “题目”.
- Long titles and multiple tags remain readable at desktop and mobile widths.
- Two AI turns visibly form one conversation; refreshing restores it.
- “我懂了，马上重练” and “再练一次” archive the prior round, reset the workspace, expose “查看上轮思路”, and show “巩固完成” after the next AC.
- Restarting the service while the page remains open renews the run token without executing twice.
- Temporarily interrupting the tunnel produces an actionable Chinese connection state; recovery clears it without losing the draft.

### Project verification

After Mac edits synchronize, run the complete test suite in the registered WSL worktree:

```sh
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && npm test'
```

For server changes, restart `acmcoder-v3.service`, verify its status, then run browser acceptance through the existing localhost tunnel.

## Acceptance Criteria

- Long code scrolls inside solution at desktop and mobile sizes, with aligned highlighting and line numbers.
- Problem statement and structured identity are visible immediately on entering a new problem.
- AI advice supports bounded per-problem follow-up conversation, a 60-second timeout, cancellation, refresh restoration, and stale-response protection.
- AI learning or AC exposes a one-action clean reinforcement round; prior reasoning remains viewable but is not fed into the new round automatically.
- The next AC visibly completes reinforcement and continues to update the existing accepted count.
- Daily recommendation items still join “我的题库” before Practice opens and never duplicate during reinforcement.
- Server restart and temporary connection loss do not expose a raw `Failed to fetch`, lose the draft, loop on tokens, or duplicate an uncertain mutation.
- Existing local/Docker execution, daily planning, problem management, import/export, extension integration, and responsive behavior continue to pass.
