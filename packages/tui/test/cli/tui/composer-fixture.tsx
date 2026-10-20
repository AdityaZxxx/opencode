/** @jsxImportSource @opentui/solid */
import { afterAll } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount, Show } from "solid-js"
import { ConfigProvider } from "../../../src/config"
import type { TuiKeybind } from "../../../src/config/keybind"
import { ClientProvider } from "../../../src/context/client"
import { DataProvider, useData } from "../../../src/context/data"
import { Keymap } from "../../../src/context/keymap"
import { LocationProvider } from "../../../src/context/location"
import { RouteProvider, useRoute } from "../../../src/context/route"
import { TuiAppProvider } from "../../../src/context/runtime"
import { StorageProvider } from "../../../src/context/storage"
import { ThemeProvider } from "../../../src/context/theme"
import { Composer } from "../../../src/routes/session/composer"
import { DialogProvider } from "../../../src/ui/dialog"
import { ToastProvider } from "../../../src/ui/toast"
import { tmpdir } from "../../fixture/fixture"
import { createApi, createEventStream, createFetch, directory, json } from "../../fixture/tui-client"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

const sessions = {
  parent: session("parent", "Parent"),
  "child-a": session("child-a", "First", "parent"),
  "child-b": session("child-b", "Second", "parent"),
  "child-c": session("child-c", "Third", "parent"),
}

const state = await tmpdir()
afterAll(() => state[Symbol.asyncDispose]())

const shells = [shell("sh-a", "bun test"), shell("sh-b", "bun dev"), shell("sh-c", "python3 - <<'PY'\nimport json")]

export async function renderComposer(
  defaultTab: "subagents" | "shell",
  keybinds: Partial<TuiKeybind.Keybinds>,
  focusedTextarea = false,
) {
  const events = createEventStream()
  const interrupted: string[] = []
  const removed: string[] = []
  const viewed: string[] = []
  const ready = Promise.withResolvers<void>()
  let closed = 0
  let dispatch!: ReturnType<typeof Keymap.use>["dispatch"]
  let route!: ReturnType<typeof useRoute>
  const calls = createFetch((url, request) => {
    if (url.pathname === "/api/session/active")
      return json({ data: { "child-a": { type: "running" }, "child-b": { type: "running" } } })
    const sessionID = url.pathname.match(/^\/api\/session\/([^/]+)$/)?.[1]
    if (sessionID && sessionID in sessions) return json({ data: sessions[sessionID as keyof typeof sessions] })
    const interruptID = url.pathname.match(/^\/api\/session\/([^/]+)\/interrupt$/)?.[1]
    if (interruptID && request.method === "POST") {
      interrupted.push(interruptID)
      return new Response(null, { status: 204 })
    }
    if (url.pathname === "/api/shell" && request.method === "GET") {
      const requestDirectory = url.searchParams.get("location[directory]") ?? directory
      return json({
        location: { directory: requestDirectory, project: { id: "proj_test", directory: requestDirectory } },
        data: shells,
      })
    }
    const shellID = url.pathname.match(/^\/api\/shell\/([^/]+)$/)?.[1]
    if (shellID && request.method === "GET") {
      viewed.push(shellID)
      return json({ location: { directory }, data: shells.find((shell) => shell.id === shellID) })
    }
    if (url.pathname.endsWith("/output")) {
      return json({ location: { directory }, data: { output: "", cursor: 0, size: 0, truncated: false } })
    }
    if (shellID && request.method === "DELETE") {
      removed.push(shellID)
      return new Response(null, { status: 204 })
    }
  }, events)

  function Content() {
    const data = useData()
    route = useRoute()
    dispatch = Keymap.use().dispatch
    onMount(() => {
      void Promise.all([
        data.session.sync("parent"),
        data.session.sync("child-a"),
        data.session.sync("child-b"),
        data.session.sync("child-c"),
        data.shell.sync(),
      ])
        .then(() => wait(() => data.session.status("child-a") === "running"))
        .then(() => ready.resolve(), ready.reject)
    })
    return (
      <>
        {focusedTextarea && <textarea focused={true} initialValue="draft" />}
        {/* Mirrors the app, which keys the session route by sessionID and remounts it on navigation. */}
        <Show when={route.data.type === "session" ? route.data.sessionID : undefined} keyed>
          {(sessionID) => (
            <Composer sessionID={sessionID} open={true} defaultTab={defaultTab} onClose={() => closed++} />
          )}
        </Show>
      </>
    )
  }

  function AppExit() {
    Keymap.createLayer(() => ({
      mode: "global",
      commands: [{ id: "app.exit", title: "Exit", group: "System", run: () => {} }],
    }))
    Keymap.createLayer(() => ({ bindings: ["app.exit"] }))
    return null
  }

  const app = await testRender(
    () => (
      <TestTuiContexts directory={directory} paths={{ state: state.path }}>
        <TuiAppProvider value={{ name: "test", version: "test", channel: "test" }}>
          <StorageProvider>
            <ConfigProvider config={createTuiResolvedConfig({ keybinds })}>
              <Keymap.Provider>
                <ClientProvider api={createApi(calls.fetch)}>
                  <DataProvider directory={process.cwd()}>
                    <LocationProvider>
                      <RouteProvider initialRoute={{ type: "session", sessionID: "parent" }}>
                        <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
                          <ToastProvider>
                            <DialogProvider>
                              <Content />
                            </DialogProvider>
                          </ToastProvider>
                        </ThemeProvider>
                      </RouteProvider>
                    </LocationProvider>
                  </DataProvider>
                </ClientProvider>
                <AppExit />
              </Keymap.Provider>
            </ConfigProvider>
          </StorageProvider>
        </TuiAppProvider>
      </TestTuiContexts>
    ),
    { width: 100, height: 20, kittyKeyboard: true },
  )
  await ready.promise
  await app.renderOnce()
  return {
    app,
    interrupted,
    removed,
    viewed,
    route: () => route.data,
    dispatch: (command: string) => dispatch(command),
    closed: () => closed,
  }
}

function session(id: string, title: string, parentID?: string) {
  return {
    id,
    projectID: "proj_test",
    title,
    agent: "build",
    location: { directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
    ...(parentID ? { parentID } : {}),
  }
}

function shell(id: string, command: string) {
  return {
    id,
    status: "running" as const,
    command,
    cwd: directory,
    shell: "/bin/sh",
    file: `/tmp/${id}`,
    metadata: { sessionID: "parent" },
    time: { started: 1 },
  }
}

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}
