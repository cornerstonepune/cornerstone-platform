import "./school-tokens.css";

// The school's own areas (D-075) keep a white ground and the school's floor for a tap, inside the frame. The area's menu is
// gone: the bar's four doors (components/app-frame.tsx) reach every page of it.
export function EducatorArea({ children }: { children: React.ReactNode }) {
  return (
    <div data-educator className="flex-1 bg-[var(--ground)] text-[length:var(--text-body)] text-[var(--ink)] md:px-[var(--space-4)] md:pt-[var(--space-4)]">
      {children}
    </div>
  );
}
