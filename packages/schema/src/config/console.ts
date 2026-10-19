export * as ConfigConsole from "./console.js"

import { Option, Schema, SchemaGetter } from "effect"
import { Mcp } from "../mcp.js"
import { optional } from "../schema.js"
import { WebSearch } from "../websearch.js"
import { ConfigPolicy } from "./policy.js"
import { ConfigProvider } from "./provider.js"

// Drop statements whose action or effect is a value this version does not know, so a newer Console can
// extend either enum. Malformed statements still fail validation.
export const Policies = Schema.Array(Schema.Unknown).pipe(
  Schema.decodeTo(Schema.Unknown, {
    decode: SchemaGetter.transform((policies) =>
      policies.filter((policy) => {
        const action = Schema.decodeUnknownOption(Schema.Struct({ action: Schema.String }))(policy)
        if (Option.isSome(action) && !Schema.is(ConfigPolicy.Info.fields.action)(action.value.action)) return false
        const effect = Schema.decodeUnknownOption(Schema.Struct({ effect: Schema.String }))(policy)
        return Option.isNone(effect) || Schema.is(ConfigPolicy.Effect)(effect.value.effect)
      }),
    ),
    encode: SchemaGetter.passthrough({ strict: false }),
  }),
  Schema.decodeTo(Schema.Array(ConfigPolicy.Info)),
)
export type Policies = typeof Policies.Type

// A remote server in the same shape as local config. Only remote servers are accepted so the Console can never
// make the client run a command. `auth: "console"` asks the client to attach its own Console credential.
export interface McpServer extends Schema.Schema.Type<typeof McpServer> {}
export const McpServer = Schema.Struct({
  ...Mcp.RemoteConfig.fields,
  auth: Schema.Literal("console").pipe(optional),
}).annotate({ identifier: "ConfigConsole.McpServer" })

/**
 * `GET <console>/api/v2/config`. Providers are a diff the client overlays onto its own provider catalog with the same
 * rules as local config; credentials in their settings are ignored because the Console connection supplies them.
 */
export interface Response extends Schema.Schema.Type<typeof Response> {}
export const Response = Schema.Struct({
  providers: Schema.Record(Schema.String, ConfigProvider.Info),
  websearch: Schema.Struct({ providerID: WebSearch.ID }).pipe(optional),
  mcp: Schema.Struct({ servers: Schema.Record(Schema.String, McpServer) }).pipe(optional),
  // Organization policy compiled for the authenticated caller; omitted when there is none.
  // `experimental.policies` remains accepted alongside top-level `policies`.
  policies: Policies.pipe(optional),
  experimental: Schema.Struct({ policies: Policies.pipe(optional) }).pipe(optional),
}).annotate({ identifier: "ConfigConsole.Response" })
