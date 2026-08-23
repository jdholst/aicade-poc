export function acceptedArtifact(gamePack) {
  return gamePack?.acceptedGeneratedMechanicArtifacts?.at(-1) ?? null;
}

export function assertion(id, passed, detail) {
  return { id, passed: Boolean(passed), detail };
}

export function finishProbe(assertions) {
  return {
    passed: assertions.length > 0 && assertions.every(({ passed }) => passed),
    assertions,
  };
}

export function hasCapabilities(artifact, capabilityIds) {
  const capabilities = new Set(artifact?.contract?.capabilities ?? []);
  return capabilityIds.every((capabilityId) => capabilities.has(capabilityId));
}

export function hasCallbacks(artifact, callbackKinds) {
  const callbacks = new Set(artifact?.contract?.lifecycle?.callbacks ?? []);
  return callbackKinds.every((callbackKind) => callbacks.has(callbackKind));
}

export async function runtimeAssertions(page, actionKey = null) {
  const frameCount = await page.locator("iframe").count();
  const beforeText = await page.locator("body").innerText();
  if (actionKey && frameCount > 0) {
    await page.locator("iframe").first().focus();
    await page.keyboard.press(actionKey);
    await page.waitForTimeout(400);
  }
  const afterText = await page.locator("body").innerText();

  return [
    assertion("editor_iframe_mounted", frameCount > 0, `${frameCount} iframe(s)`),
    assertion(
      "outer_runtime_healthy",
      !/An error has occurred|Generation stopped|runtime error/i.test(afterText),
      /An error has occurred|Generation stopped|runtime error/i.test(afterText)
        ? "The editor reported a runtime or generation error."
        : "No outer runtime error was reported."
    ),
    ...(actionKey
      ? [
          assertion(
            "action_dispatch_survived",
            frameCount > 0 && beforeText !== "" && afterText !== "",
            `Dispatched ${actionKey} while the runtime stayed mounted.`
          ),
        ]
      : []),
  ];
}

