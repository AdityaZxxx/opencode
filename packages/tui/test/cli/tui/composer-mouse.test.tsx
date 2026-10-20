/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { renderComposer } from "./composer-fixture"

test("clicking a tab label activates that tab", async () => {
  const composer = await renderComposer("subagents", {})
  try {
    expect(composer.app.captureCharFrame()).toContain("First")
    const shell = locate(composer.app.captureCharFrame(), "Shell")
    await composer.app.mockMouse.click(shell.x, shell.y)
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("bun test")
    expect(composer.app.captureCharFrame()).not.toContain("First")
  } finally {
    composer.app.renderer.destroy()
  }
})

test("clicking the activity hint toggles the subagent filter", async () => {
  const composer = await renderComposer("subagents", {})
  try {
    expect(composer.app.captureCharFrame()).toContain("First")
    expect(composer.app.captureCharFrame()).not.toContain("Third")

    const inactive = locate(composer.app.captureCharFrame(), "show inactive")
    await composer.app.mockMouse.click(inactive.x, inactive.y)
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("Third")
    expect(composer.app.captureCharFrame()).not.toContain("First")

    // A second click within the double-click window would become a text selection.
    composer.app.renderer.clearSelection()
    const active = locate(composer.app.captureCharFrame(), "show active")
    await composer.app.mockMouse.click(active.x, active.y)
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("First")
    expect(composer.app.captureCharFrame()).not.toContain("Third")
  } finally {
    composer.app.renderer.destroy()
  }
})

test("the subagent activity toggle shows and honors a configured binding", async () => {
  const composer = await renderComposer("subagents", { "composer.subagent.toggle-activity": "ctrl+u" })
  try {
    expect(composer.app.captureCharFrame()).toContain("ctrl+u")
    expect(composer.app.captureCharFrame()).not.toContain("ctrl+a")

    composer.app.mockInput.pressKey("u", { ctrl: true })
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("Third")
    expect(composer.app.captureCharFrame()).not.toContain("First")
  } finally {
    composer.app.renderer.destroy()
  }
})

test("the tab switch commands honor configured bindings", async () => {
  const composer = await renderComposer("subagents", { "composer.tab.next": "ctrl+n" })
  try {
    composer.app.mockInput.pressKey("n", { ctrl: true })
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("bun test")

    composer.app.mockInput.pressArrow("right")
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("bun test")
    expect(composer.app.captureCharFrame()).not.toContain("First")

    composer.app.mockInput.pressArrow("left")
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("First")
  } finally {
    composer.app.renderer.destroy()
  }
})

test("the tabs hint reflects the configured tab bindings", async () => {
  const composer = await renderComposer("subagents", {})
  try {
    expect(composer.app.captureCharFrame()).toContain("←/→")
  } finally {
    composer.app.renderer.destroy()
  }

  const rebound = await renderComposer("subagents", { "composer.tab.next": "ctrl+n" })
  try {
    expect(rebound.app.captureCharFrame()).toContain("←/ctrl+n")
    expect(rebound.app.captureCharFrame()).not.toContain("←/→")
  } finally {
    rebound.app.renderer.destroy()
  }
})

test("clicking the tabs hint switches to the next tab", async () => {
  const composer = await renderComposer("subagents", {})
  try {
    expect(composer.app.captureCharFrame()).toContain("First")
    const tabs = locate(composer.app.captureCharFrame(), "tabs")
    await composer.app.mockMouse.click(tabs.x, tabs.y)
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("bun test")
    expect(composer.app.captureCharFrame()).not.toContain("First")
  } finally {
    composer.app.renderer.destroy()
  }
})

test("clicking the kill hint removes the selected shell", async () => {
  const composer = await renderComposer("shell", {})
  try {
    expect(composer.app.captureCharFrame()).toContain("bun test")
    const kill = locate(composer.app.captureCharFrame(), "kill")
    await composer.app.mockMouse.click(kill.x, kill.y)
    await wait(() => composer.removed.length === 1)
    expect(composer.removed).toEqual(["sh-a"])
  } finally {
    composer.app.renderer.destroy()
  }
})

test("a none-bound activity toggle still runs from its hint", async () => {
  const composer = await renderComposer("subagents", { "composer.subagent.toggle-activity": "none" })
  try {
    expect(composer.app.captureCharFrame()).toContain("First")
    // The binding is gone, so the hint renders without a shortcut, but the click still dispatches the command.
    expect(composer.app.captureCharFrame()).not.toContain("ctrl+a")
    const hint = locate(composer.app.captureCharFrame(), "show inactive")
    await composer.app.mockMouse.click(hint.x, hint.y)
    await composer.app.renderOnce()
    expect(composer.app.captureCharFrame()).toContain("Third")
    expect(composer.app.captureCharFrame()).not.toContain("First")
  } finally {
    composer.app.renderer.destroy()
  }
})

function locate(frame: string, needle: string) {
  const rows = frame.split("\n")
  const y = rows.findIndex((row) => row.includes(needle))
  if (y < 0) throw new Error(`"${needle}" not found in frame:\n${frame}`)
  return { x: rows[y]!.indexOf(needle), y }
}

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}
