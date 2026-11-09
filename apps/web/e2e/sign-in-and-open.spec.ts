import { step, test } from "./athena-journey";

test("signed in, an educator opens the Today page", async ({ page }) => {
  await step(page, "/today", "What needs doing");
});
