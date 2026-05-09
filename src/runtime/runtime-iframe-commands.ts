import {
  postRuntimeCommand,
  type RuntimeCommand,
} from "@/runtime/runtime-adapter";

export function postRuntimeIframeCommand(
  target: Window | null | undefined,
  command: RuntimeCommand
) {
  postRuntimeCommand(target, command);
}

export function focusRuntimeIframe(
  iframe: HTMLIFrameElement | null | undefined
) {
  iframe?.focus();
  iframe?.contentWindow?.focus();
  postRuntimeIframeCommand(iframe?.contentWindow, {
    type: "game-focus",
  });
}

export function scheduleRuntimeIframeFocus(
  iframe: HTMLIFrameElement | null | undefined
) {
  const focusId = window.setTimeout(() => {
    focusRuntimeIframe(iframe);
  }, 0);
  const followUpFocusId = window.setTimeout(() => {
    focusRuntimeIframe(iframe);
  }, 120);

  return () => {
    window.clearTimeout(focusId);
    window.clearTimeout(followUpFocusId);
  };
}
