import { describe, expect } from "bun:test"
import { Document, Info } from "@opencode/schema/config"
import { Effect, Schema } from "effect"
import { Config } from "@opencode/core/config"
import { ConfigProviderPlugin } from "@opencode/core/config/plugin/provider"
import { Credential } from "@opencode/core/credential"
import { Integration } from "@opencode/core/integration"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { OpencodePlugin } from "@opencode/core/plugin/provider/opencode"
import { Provider } from "@opencode/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "../plugin/fixture"

const it = testEffect(PluginTestLayer)

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected value")
  return value
}

// The same provider overlay, once sent by the Console and once written in local config.
const overlay = {
  package: "aisdk:@ai-sdk/openai",
  settings: { baseURL: "https://gateway.example/v1" },
  models: {
    claude: {
      modelID: "claude-sonnet-4-5",
      package: "aisdk:@ai-sdk/anthropic",
      capabilities: { reasoning: { supported: true, budget: { min: 1024 } } },
      variants: [{ id: "max", headers: { "x-tier": "max" } }],
      limit: { output: 20_000 },
      disabled: true,
    },
  },
}

describe("provider config overlay", () => {
  it.live("applies a Console overlay and the same local config overlay to the same model", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => Bun.serve({ port: 0, fetch: () => Response.json({ providers: { remote: overlay } }) })),
      (server) =>
        Effect.gen(function* () {
          const credentials = yield* Credential.Service
          const models = yield* Model.Service
          const plugin = yield* Plugin.Service
          yield* credentials.create({
            integrationID: Integration.ID.make("opencode"),
            value: Credential.Key.make({ type: "key", key: "secret", metadata: { server: server.url.origin } }),
          })
          yield* OpencodePlugin.effect(yield* PluginHost.make(plugin))
          yield* ConfigProviderPlugin.Plugin.effect(yield* PluginHost.make(plugin)).pipe(
            Effect.provide(
              Config.testLayer([
                new Document({
                  type: "document",
                  info: Schema.decodeUnknownSync(Info)({ providers: { local: overlay } }),
                }),
              ]),
            ),
          )

          const remote = required(yield* models.get(Provider.ID.make("remote"), Model.ID.make("claude")))
          const local = required(yield* models.get(Provider.ID.make("local"), Model.ID.make("claude")))
          expect(remote).toMatchObject({
            package: "@opencode/ai/providers/anthropic",
            enabled: false,
            limit: { output: 20_000 },
          })
          // Budgets fit under the overlaid output limit, and the configured variant merges onto the derived one.
          expect(remote.variants).toEqual([
            { id: Model.VariantID.make("high"), settings: { thinking: { type: "enabled", budgetTokens: 10_000 } } },
            {
              id: Model.VariantID.make("max"),
              settings: { thinking: { type: "enabled", budgetTokens: 19_999 } },
              headers: { "x-tier": "max" },
            },
          ])
          expect({ ...local, providerID: remote.providerID }).toEqual(remote)
        }),
      (server) => Effect.promise(() => server.stop(true)),
    ),
  )
})
