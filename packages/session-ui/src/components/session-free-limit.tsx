import { createMemo, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useI18n } from "@opencode/ui/context/i18n"
import type { SessionUserActions } from "../actions"

const DAY = 86_400_000

/** OpenCode's free daily allowance ran out: an expected limit with ways forward, not a failure. */
export function SessionFreeLimit(props: { resetAt?: number; actions: NonNullable<SessionUserActions["freeLimit"]> }) {
  const i18n = useI18n()

  const reset = createMemo(() => {
    const at = props.resetAt

    if (at === undefined) return

    // The allowance resets within a day; anything further out needs the date too.
    const format = new Intl.DateTimeFormat(
      i18n.locale(),
      at - Date.now() < DAY ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" },
    )

    return format.format(at)
  })

  return (
    <div data-component="session-free-limit" role="status">
      <div data-slot="session-free-limit-text">
        <div data-slot="session-free-limit-title">{i18n.t("ui.sessionTurn.freeLimit.title")}</div>
        <div data-slot="session-free-limit-description">
          <Show when={reset()} fallback={i18n.t("ui.sessionTurn.freeLimit.description")}>
            {(time) => i18n.t("ui.sessionTurn.freeLimit.descriptionReset", { time: time() })}
          </Show>
        </div>
      </div>
      <div data-slot="session-free-limit-actions">
        <Button size="small" variant="contrast" onClick={() => props.actions.upgrade()}>
          {i18n.t("ui.sessionTurn.freeLimit.upgrade")}
        </Button>
        <Button size="small" variant="neutral" onClick={() => props.actions.chooseModel()}>
          {i18n.t("ui.sessionTurn.freeLimit.chooseModel")}
        </Button>
        <Button size="small" variant="ghost-muted" onClick={() => props.actions.connectProvider()}>
          {i18n.t("ui.sessionTurn.freeLimit.connectProvider")}
        </Button>
      </div>
    </div>
  )
}
