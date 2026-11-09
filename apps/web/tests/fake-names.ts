// The one list of names in the repository (docs/frontend/wireframes/fake-names.json, the same lists). The repository is public:
// no real child's or staff member's name is in git. Every name a fixture makes, or a page is allowed to show, is one of these
// (alliterative animals, so nobody could take one for a real person). tests/u70-inventory.spec.ts fails on any rendered child name
// that is not here.
export const FAKE_CHILDREN = ["Alba Ant", "Bea Badger", "Cal Crow", "Dot Deer", "Eli Eel", "Finn Fox", "Gus Goat", "Hazel Hare", "Ivy Ibis", "Jo Jay", "Kit Koala", "Lou Lynx", "Mina Mouse", "Nat Newt", "Otto Owl", "Pia Panda", "Quin Quail", "Rex Rook", "Sam Seal", "Tia Toad", "Uri Urial", "Vik Vole", "Wren Wolf", "Xan Xerus", "Yara Yak", "Zed Zebra"] as const;
export const FAKE_STAFF = ["Asha Almond", "Bina Basil", "Chetan Clove", "Dev Dill", "Esha Elder", "Farah Fennel", "Gopal Ginger"] as const;
export const FAKE_NAMES: readonly string[] = [...FAKE_CHILDREN, ...FAKE_STAFF];
/** A child's first name, as the site draws it (the first word of the full fake name). */
export const FAKE_FIRST_NAMES: readonly string[] = FAKE_CHILDREN.map((n) => n.split(" ")[0]);
