- Allowed: `u70-feedback-rules.spec.ts` may differ from main by one line `const ZONE = "<string literal>";` and `, ZONE` as the second
  argument of its `issueBody(...)` calls. The proof undoes exactly that and requires the file to equal main's, byte for byte.
- Still forbidden: any other change, rename or delete of an existing file under `apps/web/tests` (other than `global-setup.ts`).