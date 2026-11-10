import screens from "../../../docs/frontend/screens.json";

// The blocks of SPEC §5 as docs/frontend/screens.json names them: the one list the gallery page, the files under
// components/ and the tests are all held to.
export const BLOCKS: readonly { name: string; contract: string }[] = Object.entries(screens.blocks as Record<string, string>).map(([name, contract]) => ({ name, contract }));

/** ChildGraph → child-graph (the file components/child-graph.tsx). */
export const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
