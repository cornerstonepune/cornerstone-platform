import { EducatorArea } from "@/components/educator/area";

// The K2 educator's screens (M1-09, D-075) in the frame's main column, on the school's ground.
export default function EducatorLayout({ children }: { children: React.ReactNode }) {
  return <EducatorArea>{children}</EducatorArea>;
}
