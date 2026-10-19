export * as ConfigProviderOverlay from "./provider-overlay.js"

import type { ConfigProvider } from "@opencode/schema/config/provider"
import { Money } from "@opencode/schema/money"
import type { Types } from "effect"
import { Model } from "../model.js"
import { Provider } from "../provider.js"
import { Variant } from "../variant.js"

// Every provider config source, local config documents and the OpenCode Console alike, is a diff over the provider
// catalog applied with these rules. A field the overlay omits keeps the value the provider or model already has.

type ModelConfig = NonNullable<ConfigProvider.Info["models"]>[string]
type ModelDraft = Types.DeepMutable<Model.Info>

/**
 * - `canonical`, `package`: replace.
 * - `name`: replaces when non-empty.
 * - `compatibility`: shallow merge.
 * - `settings`, `body`: deep merge.
 * - `headers`: merge, comparing names case-insensitively.
 */
export function provider(draft: Types.DeepMutable<Provider.Info>, config: ConfigProvider.Info) {
  if (config.canonical !== undefined) draft.canonical = config.canonical
  if (config.name) draft.name = config.name
  if (config.package !== undefined) draft.package = config.package
  if (config.compatibility !== undefined) draft.compatibility = { ...draft.compatibility, ...config.compatibility }
  if (config.settings !== undefined) draft.settings = Provider.mergeOverlay(draft.settings, config.settings)
  if (config.headers !== undefined) draft.headers = Provider.mergeHeaders(draft.headers, config.headers)
  if (config.body !== undefined) draft.body = Provider.mergeOverlay(draft.body, config.body)
}

/** The definition a configured model inherits from its source provider: its `modelID`, then its key. */
export function base(
  source: { readonly models: ReadonlyMap<string, Model.Info> } | undefined,
  id: string,
  config: ModelConfig,
) {
  return source?.models.get(config.modelID ?? id) ?? source?.models.get(id)
}

/**
 * Restarts a model from the definition it inherits, then drops the inherited route the provider overlay replaces:
 * a provider `package` clears the model's package and a provider `settings.baseURL` clears the model's base URL, so
 * the provider's route applies unless the model overlay sets its own.
 */
export function rebase(draft: ModelDraft, inherited: Model.Info | undefined, config: ConfigProvider.Info) {
  if (inherited) Object.assign(draft, structuredClone(inherited))
  if (config.package !== undefined) draft.package = undefined
  if (config.settings?.baseURL !== undefined && draft.settings) delete draft.settings.baseURL
}

/** The provider or model editor the overlay applies to. */
export interface Models {
  readonly update: (providerID: string, modelID: string, update: (model: ModelDraft) => void) => void
  readonly provider: (providerID: string) => Provider.Info | undefined
}

export interface ModelInput {
  readonly providerID: string
  readonly modelID: string
  readonly provider: ConfigProvider.Info
  readonly model: ModelConfig
  /** The definition this model inherits; see `base`. */
  readonly base: Model.Info | undefined
  /**
   * Restart the model from `base` before the overlay; see `rebase`. The Console restarts every model it lists, since
   * its document is the whole diff for that provider. Local config restarts only models new to the provider or moved
   * to another canonical provider, so later documents layer onto earlier ones.
   */
  readonly rebase: boolean
  /**
   * Local config only. When the overlay neither describes reasoning nor lists variants, give a model without a base
   * the default effort variants, and respell variants inherited from `base` when the final package differs from it.
   * The Console derives only the variants it describes: its models may be custom deployments that reject reasoning
   * parameters.
   */
  readonly inferVariants: boolean
}

/**
 * Applies one model overlay, then derives the model's variants in a second update. The editor normalizes the package
 * after each update (`aisdk:@ai-sdk/openai` becomes `@opencode/ai/providers/openai`), so variants are built from the
 * final package and limit, never from the spelling in the overlay.
 *
 * - `modelID`, `family`, `package`: replace.
 * - `name`: replaces when non-empty.
 * - `releaseDate`: replaces the release time.
 * - `compatibility`, `limit`: shallow merge.
 * - `settings`, `body`: deep merge. `headers`: merge, comparing names case-insensitively.
 * - `capabilities`: `tools`, `input`, `output`, and `temperature` replace individually.
 * - `cost`: replaces; an omitted cache cost is zero.
 * - `disabled`: sets `enabled` to its opposite.
 * - `capabilities.reasoning`: replaces the variants with those it describes for the final package and limit.
 * - `variants`: merge by id onto the derived or inherited variants, with the same settings, body, and headers rules.
 *   New ids are appended.
 */
export function model(models: Models, input: ModelInput) {
  models.update(input.providerID, input.modelID, (draft) => {
    if (input.rebase) rebase(draft, input.base, input.provider)
    overlay(draft, input.model)
  })
  if (input.model.capabilities?.reasoning === undefined && input.model.variants === undefined && !input.inferVariants)
    return
  models.update(input.providerID, input.modelID, (draft) =>
    derive(draft, input, models.provider(input.providerID)?.package),
  )
}

function overlay(draft: ModelDraft, config: ModelConfig) {
  if (config.modelID !== undefined) draft.modelID = config.modelID
  if (config.family !== undefined) draft.family = config.family
  if (config.name) draft.name = config.name
  if (config.releaseDate !== undefined) draft.time = { released: Date.parse(config.releaseDate) }
  if (config.compatibility !== undefined) draft.compatibility = { ...draft.compatibility, ...config.compatibility }
  if (config.package !== undefined) draft.package = config.package
  if (config.settings !== undefined) draft.settings = Provider.mergeOverlay(draft.settings, config.settings)
  if (config.headers !== undefined) draft.headers = Provider.mergeHeaders(draft.headers, config.headers)
  if (config.body !== undefined) draft.body = Provider.mergeOverlay(draft.body, config.body)
  if (config.capabilities !== undefined)
    draft.capabilities = Model.mergeCapabilities(config.capabilities, draft.capabilities)
  if (config.limit !== undefined) draft.limit = { ...draft.limit, ...config.limit }
  if (config.cost !== undefined)
    draft.cost = (Array.isArray(config.cost) ? config.cost : [config.cost]).map((cost) => ({
      tier: cost.tier && { ...cost.tier },
      input: cost.input,
      output: cost.output,
      cache: {
        read: cost.cache?.read ?? Money.USDPerMillionTokens.zero,
        write: cost.cache?.write ?? Money.USDPerMillionTokens.zero,
      },
    }))
  if (config.disabled !== undefined) draft.enabled = !config.disabled
}

function derive(draft: ModelDraft, input: ModelInput, providerPackage: string | undefined) {
  const config = input.model
  const reasoning = config.capabilities?.reasoning
  const resolved = { ...draft, package: draft.package ?? providerPackage }
  if (reasoning !== undefined) draft.variants = [...Variant.resolve(resolved, Variant.supports(reasoning))]
  // Inherited variants are spelled for the base's package; a base without variants has no reasoning to respell.
  if (
    reasoning === undefined &&
    config.variants === undefined &&
    input.inferVariants &&
    (input.base === undefined || (input.base.variants.length > 0 && draft.package !== input.base.package))
  )
    draft.variants = [...Variant.resolve(resolved)]
  for (const variant of config.variants ?? []) {
    const existing = draft.variants.find((item) => item.id === variant.id)
    const target: ModelDraft["variants"][number] = existing ?? { id: variant.id }
    if (!existing) draft.variants.push(target)
    if (variant.settings !== undefined) target.settings = Provider.mergeOverlay(target.settings, variant.settings)
    if (variant.headers !== undefined) target.headers = Provider.mergeHeaders(target.headers, variant.headers)
    if (variant.body !== undefined) target.body = Provider.mergeOverlay(target.body, variant.body)
  }
}
