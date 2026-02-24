import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setHeychatRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getHeychatRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Heychat runtime not initialized");
  }
  return runtime;
}
