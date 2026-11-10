import { EducatorArea } from "@/components/educator/area";

// The K2 pictures in the frame's main column (D-075). The engine decides who may look: the educator switch, or the staff
// preview (`educator.preview_roles`).
export default function K2Layout({ children }: { children: React.ReactNode }) {
  return <EducatorArea>{children}</EducatorArea>;
}
