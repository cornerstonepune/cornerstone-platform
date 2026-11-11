/** A short form of labelled fields; one main button. A required field left empty shows its message and submits nothing
 *  (the browser's own `required` check). `main`: the button is the page's one main action. */
export function Form({ fields, submit, action, main = false }: { fields: readonly { name: string; label: string; value?: string; numeric?: boolean; required?: boolean; message?: string; type?: "email" | "password" | "text"; autoComplete?: string }[]; submit: string; action?: string | ((data: FormData) => void | Promise<void>); main?: boolean }) {
  return (
    <form data-block="Form" className="b-form" action={action} method={typeof action === "function" ? undefined : "get"}>
      {fields.map((f) => (
        <div className="b-field" key={f.name}>
          <label htmlFor={`f-${f.name}`}>{f.label}</label>
          <input id={`f-${f.name}`} name={f.name} defaultValue={f.value} inputMode={f.numeric ? "numeric" : undefined} required={f.required} title={f.message} type={f.type} autoComplete={f.autoComplete} />
        </div>
      ))}
      <div>
        <button className="b-btn b-btn-main" type="submit" data-press data-main={main ? "" : undefined}>
          {submit}
        </button>
      </div>
    </form>
  );
}
