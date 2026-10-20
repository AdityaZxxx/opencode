/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { renderComposer } from "./composer-fixture"

test("disabled subagent bindings have no component fallbacks", async () => {
  const composer = await renderComposer("subagents", {
    "composer.subagent.up": "none",
    "composer.subagent.down": "none",
    "composer.subagent.select": "none",
    "composer.subagent.interrupt": "none",
  })
  try {
    expect(composer.app.captureCharFrame()).toContain("First")
    composer.app.mockInput.pressArrow("up")
    composer.app.mockInput.pressEnter()
    composer.app.mockInput.pressKey("d", { ctrl: true })
    await composer.app.renderOnce()
    expect(composer.closed()).toBe(0)
    expect(composer.route()).toMatchObject({ type: "session", sessionID: "parent" })
    expect(composer.interrupted).toEqual([])

    composer.app.mockInput.pressArrow("down")
    composer.dispatch("composer.subagent.select")
    expect(composer.route()).toMatchObject({ type: "session", sessionID: "child-a" })
  } finally {
    composer.app.renderer.destroy()
  }
})

test("the inactive subagent filter only changes with its toggle", async () => {
  const composer = await renderComposer("subagents", {})
  try {
    expect(composer.app.captureCharFrame()).toContain("First")
    expect(composer.app.captureCharFrame()).not.toContain("Third")

    composer.app.mockInput.pressKey("a", { ctrl: true })
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("Third")
    expect(composer.app.captureCharFrame()).not.toContain("First")

    composer.app.mockInput.pressEnter()
    expect(composer.route()).toMatchObject({ type: "session", sessionID: "child-c" })
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("Third")
    expect(composer.app.captureCharFrame()).toContain("show active")
    expect(composer.app.captureCharFrame()).not.toContain("First")

    composer.app.mockInput.pressKey("a", { ctrl: true })
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("First")
    expect(composer.app.captureCharFrame()).not.toContain("Third")
  } finally {
    composer.app.renderer.destroy()
  }
})

test("disabled shell bindings have no component fallbacks", async () => {
  const composer = await renderComposer("shell", {
    "composer.shell.up": "none",
    "composer.shell.down": "none",
    "composer.shell.select": "none",
    "composer.shell.kill": "none",
  })
  try {
    expect(composer.app.captureCharFrame()).toContain("bun test")
    composer.app.mockInput.pressArrow("up")
    composer.app.mockInput.pressEnter()
    composer.app.mockInput.pressKey("d", { ctrl: true })
    await composer.app.renderOnce()
    expect(composer.closed()).toBe(0)
    expect(composer.removed).toEqual([])
    expect(composer.viewed).toEqual([])

    composer.app.mockInput.pressArrow("down")
    composer.dispatch("composer.shell.kill")
    await wait(() => composer.removed.length === 1)
    expect(composer.removed).toEqual(["sh-a"])
  } finally {
    composer.app.renderer.destroy()
  }
})

test("shell list shows one line per command", async () => {
  const composer = await renderComposer("shell", {})
  try {
    const frame = composer.app.captureCharFrame()
    expect(frame).toContain("python3 - <<'PY'")
    expect(frame).not.toContain("import json")
  } finally {
    composer.app.renderer.destroy()
  }
})

test("configured composer bindings work with a focused textarea", async () => {
  const composer = await renderComposer("subagents", { "composer.shell.kill": "ctrl+u" }, true)
  try {
    composer.app.mockInput.pressArrow("right")
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("bun test")
    composer.app.mockInput.pressKey("u", { ctrl: true })
    await wait(() => composer.removed.length === 1)
    expect(composer.removed).toEqual(["sh-a"])
  } finally {
    composer.app.renderer.destroy()
  }
})

test("ctrl+c closes the active composer", async () => {
  const composer = await renderComposer("shell", {})

  try {
    composer.app.mockInput.pressKey("c", { ctrl: true })
    await composer.app.waitFor(() => composer.closed() === 1)
  } finally {
    composer.app.renderer.destroy()
  }
})

test("shell output respects a configured binding with a focused textarea", async () => {
  const composer = await renderComposer("shell", { "composer.shell.select": "ctrl+o" }, true)
  try {
    composer.app.mockInput.pressEnter()
    await composer.app.renderOnce()
    expect(composer.viewed).toEqual([])
    composer.app.mockInput.pressKey("o", { ctrl: true })
    await wait(() => composer.viewed.length > 0)
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("Shell output")
    expect(composer.viewed).toEqual(["sh-a"])
  } finally {
    composer.app.renderer.destroy()
  }
})

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}
