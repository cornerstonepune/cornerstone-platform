import "./screens.css";
import { EducatorArea } from "@/components/educator/area";

// The curriculum screens in the frame's main column (D-075).
export default function CurriculumLayout({ children }: { children: React.ReactNode }) {
  return (
    <EducatorArea>
      <div className="cs-page">{children}</div>
    </EducatorArea>
  );
}
