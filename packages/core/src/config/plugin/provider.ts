export * as ConfigProviderPlugin from "./provider.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Document, type Entry } from "@opencode/schema/config"
import { ConfigProvider } from "@opencode/schema/config/provider"
import { Effect } from "effect"
import { Config } from "../../config.js"
import { Model } from "../../model.js"
import { ConfigProviderOverlay } from "../provider-overlay.js"
import { ConfigEntryObserver } from "./entry-observer.js"

export const Plugin = define({
  id: "opencode.config.provider",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const loaded = yield* ConfigEntryObserver.observe(
      config,
      ctx.event,
      ctx.integration.reload().pipe(Effect.andThen(ctx.provider.reload())),
    )
    yield* ctx.integration.transform((integrations) => {
      for (const [id, provider] of configuredProviders(loaded.entries)) {
        const integrationID = id
        if (!integrations.get(integrationID)) {
          integrations.method.update({
            integrationID,
            method: { type: "key", label: "Manually enter API Key" },
          })
        }
        integrations.update(integrationID, (integration) => {
          integration.name = provider.name || integration.name
        })
        if (provider.env !== undefined) {
          integrations.method.update({
            integrationID,
            method: { type: "env", names: [...provider.env] },
          })
        }
      }
    })

    const sources = {
      defaultModel: undefined as Document["info"]["model"],
      models: new Map<
        ConfigProvider.Info,
        {
          readonly providerID: string
          readonly models: ReadonlyMap<string, { readonly inherit: boolean; readonly base?: Model.Info }>
        }
      >(),
    }
    yield* ctx.provider.transform((providers) => {
      const next: typeof sources.models = new Map()
      for (const [id, item] of configuredProviders(loaded.entries)) {
        const providerID = id
        const current = providers.get(providerID)
        const source = providers.get(item.canonical ?? current?.provider.canonical ?? providerID)
        const changed = item.canonical !== undefined && item.canonical !== current?.provider.canonical
        providers.update(providerID, (provider) => {
          if (changed && source && source.provider !== provider)
            Object.assign(provider, structuredClone(source.provider), {
              id: provider.id,
              integrationID: provider.integrationID,
            })
          provider.activation = "enabled"
          ConfigProviderOverlay.provider(provider, item)
        })
        const definitions = new Map<string, { readonly inherit: boolean; readonly base?: Model.Info }>()
        for (const [id, config] of Object.entries(item.models ?? {})) {
          const base = ConfigProviderOverlay.base(source, id, config)
          const inherit = changed || !current?.models.has(id)
          // Bind the source at this point in the provider fold. Later source edits/removal
          // and its credential availability must not change an already-defined alias.
          definitions.set(id, { inherit, base: base && structuredClone(base) })
          if (!inherit) continue
          providers.models.update(providerID, id, (model) => ConfigProviderOverlay.rebase(model, base, item))
        }
        next.set(item, { providerID, models: definitions })
      }
      for (const [item, definition] of next) {
        for (const [id, config] of Object.entries(item.models ?? {})) {
          if (config.limit === undefined) continue
          providers.models.update(definition.providerID, id, (model) => {
            model.limit = { ...model.limit, ...config.limit }
          })
        }
      }
      sources.defaultModel = Config.latest(loaded.entries, "model")
      sources.models = next
    })

    // Keep explicit model overrides in their late registration position, after external
    // model transforms. They can recreate or re-enable a model within an available provider.
    yield* ctx.model.transform((models) => {
      const configuredDefault = sources.defaultModel
      if (configuredDefault !== undefined) models.default.set(configuredDefault.providerID, configuredDefault.model)
      const editor = { update: models.update, provider: (id: string) => models.provider.get(id)?.provider }
      for (const [item, definition] of sources.models) {
        const providerID = definition.providerID
        for (const [id, config] of Object.entries(item.models ?? {})) {
          const source = definition.models.get(id)
          ConfigProviderOverlay.model(editor, {
            providerID,
            modelID: id,
            provider: item,
            model: config,
            base: source?.base,
            rebase: (source?.inherit || !models.get(providerID, id)) && source?.base !== undefined,
            inferVariants: true,
          })
        }
      }
    })
  }),
})

function configuredProviders(entries: readonly Entry[]) {
  return entries
    .filter((entry): entry is Document => entry.type === "document")
    .flatMap((file) => Object.entries(file.info.providers ?? {}))
}
