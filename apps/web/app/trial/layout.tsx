import "./trial.css";

// TRIAL ONLY (ATH-25, not for merge): three builds of the Today screen on fake data. Nothing here reads the engine.
export default function TrialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="trial" data-trial>
      {children}
    </div>
  );
}
