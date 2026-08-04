import { redirect } from "next/navigation";

// The only thing behind /admin so far. When blog authoring gets a UI this
// becomes the index that lists both.
export default function AdminIndex() {
  redirect("/admin/analytics");
}
