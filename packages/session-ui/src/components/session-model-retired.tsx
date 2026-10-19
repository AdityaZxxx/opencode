import { Button } from "@opencode/ui/button"
import { useI18n } from "@opencode/ui/context/i18n"
import type { SessionUserActions } from "../actions"

/** The provider no longer serves the step's model: a dead end only until another model is picked. */
export function SessionModelRetired(props: { actions: NonNullable<SessionUserActions["modelRetired"]> }) {
  const i18n = useI18n()

  return (
    <div data-component="session-model-retired" role="status">
      <div data-slot="session-model-retired-text">
        <div data-slot="session-model-retired-title">{i18n.t("ui.sessionTurn.modelRetired.title")}</div>
        <div data-slot="session-model-retired-description">{i18n.t("ui.sessionTurn.modelRetired.description")}</div>
      </div>
      <div data-slot="session-model-retired-actions">
        <Button size="small" variant="submit" onClick={() => props.actions.chooseModel()}>
          {i18n.t("ui.sessionTurn.modelRetired.chooseModel")}
        </Button>
      </div>
    </div>
  )
}
