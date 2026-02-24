import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { heychatPlugin } from "./src/channel.js";
import { setHeychatRuntime } from "./src/runtime.js";

const plugin = {
  id: "heychat",
  name: "Heychat",
  description: "Heychat (黑盒语音) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setHeychatRuntime(api.runtime);
    api.registerChannel({ plugin: heychatPlugin });
  },
};

export default plugin;
