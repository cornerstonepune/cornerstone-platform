"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deciding, mustSee } from "@/lib/decides";
import { sees } from "@/lib/reach";
import { EngineDown, engineSend, uploadTicket } from "@/lib/engine";

const UUID = /^[0-9a-f-]{36}$/;

/** A scan, by its Drive link, read without anyone at a terminal (N8, `POST /read/file`).
 *
 * The link is all that travels: the engine fetches the file into its own inbox, sorts the pages by
 * the code on each and reads every box on every copy printed for a child, after it has answered —
 * the papers appear on this page as they are read. The engine says in words why it will not take a
 * link, and that is what the person sees. */
export async function readScan(formData: FormData): Promise<void> {
  const me = await deciding("papers");
  // back to the page it was read from: Papers, or the scans and the reader's accuracy (goals/u9-papers.yaml)
  const from = String(formData.get("from") ?? "");
  const page = from === "/papers" || from === "/children/assessments" ? from : "/capture";
  const url = String(formData.get("url") ?? "")
    .trim()
    .slice(0, 400);
  if (!/^https:\/\/drive\.google\.com\//.test(url)) redirect(`${page}?read=not-a-link#read-scan`);
  try {
    const res = await engineSend("/read/file", { url, actor: me.email });
    if (!res.ok) {
      const why = ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? "";
      redirect(`${page}?read=refused&why=${encodeURIComponent(why.slice(0, 200))}#read-scan`);
    }
    const { pages } = (await res.json()) as { pages: number };
    revalidatePath("/capture");
    revalidatePath("/children/assessments");
    revalidatePath("/children/assessments");
    redirect(`${page}?read=started&pages=${Number(pages) || 0}#read-scan`);
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    redirect(`${page}?read=engine#read-scan`);
  }
}

/** A person says whose a page with no code is (goals/ux9a-no-guessed-pages.yaml, `POST /read/run/{id}/page`): the
 *  engine keeps their word on the file's run and reads the file again, the page as that child's. Until then the page is
 *  read as nobody's — the engine never guesses a page's child. The engine says in words why it will not. */
export async function givePage(formData: FormData): Promise<void> {
  const me = await deciding("papers");
  const from = String(formData.get("from") ?? "");
  const page = from === "/papers" || from === "/children/assessments" ? from : "/capture";
  const run = String(formData.get("run") ?? "");
  const child = String(formData.get("child") ?? "");
  const n = Number(formData.get("page"));
  if (!UUID.test(run) || !UUID.test(child) || !Number.isInteger(n) || n < 1) redirect(`${page}#read-scan`);
  // a page of a file the person put in, or given to a child they see
  if (!(await sees(me, [{ run }])) && !(await sees(me, [{ child }]))) redirect("/refused?kind=papers&paper=1");
  try {
    const res = await engineSend(`/read/run/${run}/page`, { page: n, child_id: child, by: me.email });
    if (!res.ok) {
      const why = ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? "";
      redirect(`${page}?read=refused&why=${encodeURIComponent(why.slice(0, 200))}#read-scan`);
    }
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    redirect(`${page}?read=engine#read-scan`);
  }
  revalidatePath("/capture");
  revalidatePath("/children/assessments");
  redirect(`${page}?read=given&pages=${n}#read-scan`);
}

/** A file already sent, read afresh (goals/ck2-photograph-is-its-page.yaml, `POST /read/run/{id}/again`): the engine reads
 *  every copy no person has worked on anew and supersedes only those readings; a person's checks stay. It takes no link
 *  — the file is the one the engine keeps — and says in words why it will not (still being read, no longer kept). */
export async function readAgain(formData: FormData): Promise<void> {
  const me = await deciding("papers");
  const from = String(formData.get("from") ?? "");
  const page = from === "/papers" || from === "/children/assessments" ? from : "/capture";
  const run = String(formData.get("run") ?? "");
  if (!UUID.test(run)) redirect(`${page}#read-scan`);
  await mustSee(me, "papers", [{ run }]);
  try {
    const res = await engineSend(`/read/run/${run}/again`, { by: me.email });
    if (!res.ok) {
      const why = ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? "";
      redirect(`${page}?read=refused&why=${encodeURIComponent(why.slice(0, 200))}#read-scan`);
    }
    const { pages } = (await res.json()) as { pages: number };
    revalidatePath("/capture");
    revalidatePath("/children/assessments");
    redirect(`${page}?read=again&pages=${Number(pages) || 0}#read-scan`);
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    redirect(`${page}?read=engine#read-scan`);
  }
}

/** Leave to send scans from this page straight to the engine (N8, `POST /read/upload`, ADR 0092): where to, and a
 *  token for this person that lives half an hour — asked for as each batch of files starts, so a page left open all
 *  morning still sends. Only someone who may put papers in is given one. */
export async function scanTicket(): Promise<{ url: string; token: string } | null> {
  const me = await deciding("papers");
  return uploadTicket(me.email);
}

