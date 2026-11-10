import base from "./playwright.config";
const servers = base.webServer as unknown as unknown[];
export default { ...base, webServer: [servers[1]] } as typeof base;
