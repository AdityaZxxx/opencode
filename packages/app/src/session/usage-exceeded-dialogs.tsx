import { useWorkspaceLocation } from "@/workspaces/location"
import { Persist, persisted } from "@/runtime/persistence/storage"
import type { SessionStatus, SessionStepFailed } from "@opencode/client/promise"
import { onCleanup } from "solid-js"
import { Schema } from "effect"
import { Persistence } from "@/runtime/persistence/schema"
import { useSessionLayout } from "./session-layout"
import { useDialog, useI18n } from "@opencode/ui/context"
import { DialogUsageExceeded } from "@/providers/connect/usage-exceeded"

const GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT = "go_upsell_account_rate_limit_last_seen_at"

const GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW = "go_upsell_account_rate_limit_dont_show"

const GO_UPSELL_WINDOW = 86_400_000 // 24 hrs

const GO_UPSELL_PROVIDERS = new Set(["opencode", "opencode-go"])

const CHATGPT_USAGE_LIMIT_WINDOW = 86_400_000 // 24 hrs

export function isChatGPTUsageLimit(error: SessionStepFailed["data"]["error"]) {
  return (
    error.message ===
    "ChatGPT usage limit reached. Try again after your allowance resets; check ChatGPT Settings → Usage for details."
  )
}

// The free daily allowance shows inline in the timeline (`provider.free-limit`), so only account limits use a dialog.
export const GoUpsellState = Persistence.struct({
  [GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT]: Schema.NullOr(Schema.Finite),
  [GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW]: Schema.NullOr(Schema.Finite),
})

function isAccountRateLimit(status: SessionStatus) {
  return (
    status.type === "retry" &&
    !!status.action &&
    GO_UPSELL_PROVIDERS.has(status.action.provider) &&
    status.action.reason === "account_rate_limit"
  )
}

export function useUsageExceededDialogs() {
  const sdk = useWorkspaceLocation()
  const dialog = useDialog()
  const { params } = useSessionLayout()
  const { tDynamic } = useI18n()

  const [goUpsellState, setGoUpsellState] = persisted(Persist.global("go-upsell"), GoUpsellState, {
    [GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT]: null,
    [GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW]: null,
  })

  const [chatgptUsageLimit, setChatGPTUsageLimit] = persisted(
    Persist.global("chatgpt-usage-limit"),
    Persistence.struct({ lastSeenAt: Schema.NullOr(Schema.Finite) }),
    { lastSeenAt: null },
  )

  onCleanup(
    sdk().event.on("session.step.failed", (evt) => {
      if (evt.data.sessionID !== params.id) return

      if (!isChatGPTUsageLimit(evt.data.error) || dialog.active) return

      if (chatgptUsageLimit.lastSeenAt && Date.now() - chatgptUsageLimit.lastSeenAt < CHATGPT_USAGE_LIMIT_WINDOW) return

      void import("@/providers/connect/chatgpt-usage-limit").then((usage) => {
        if (dialog.active) return
        setChatGPTUsageLimit("lastSeenAt", Date.now())
        dialog.show(() => <usage.DialogChatGPTUsageLimit />)
      })
    }),
  )

  onCleanup(
    sdk().event.on("session.status", (evt) => {
      if (evt.data.sessionID !== params.id) return

      const status = evt.data.status

      if (status.type !== "retry" || !status.action || !isAccountRateLimit(status) || dialog.active) return
      const action = status.action

      const seen = goUpsellState[GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT]

      if (seen && Date.now() - seen < GO_UPSELL_WINDOW) return

      if (goUpsellState[GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW]) return

      dialog.show(() => (
        <DialogUsageExceeded
          title={tDynamic("dialog.usageExceeded.accountRateLimit.title", action.title)}
          description={tDynamic("dialog.usageExceeded.accountRateLimit.description", action.message)}
          actionLabel={tDynamic("dialog.usageExceeded.accountRateLimit.actionLabel", action.label)}
          link={action.link}
          onClose={(dontShowAgain) => {
            setGoUpsellState(GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT, Date.now())

            if (dontShowAgain) setGoUpsellState(GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW, Date.now())
          }}
        />
      ))
    }),
  )
}
