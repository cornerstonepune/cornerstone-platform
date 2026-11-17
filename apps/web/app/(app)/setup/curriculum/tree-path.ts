const HERE = "/setup/curriculum";
export type Path = { grade?: string; subject?: string; unit?: string; open?: string };

/** The address of a path through the tree: grade, subject, unit and the objective open in the panel; nothing chosen is nothing written. */
export const treeAt = (p: Path) => {
  const s = new URLSearchParams(Object.entries(p).flatMap(([k, v]) => (v ? [[k, v]] : [])));
  return s.size ? `${HERE}?${s}` : HERE;
};
