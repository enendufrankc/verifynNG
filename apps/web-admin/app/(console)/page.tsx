import { redirect } from 'next/navigation';

// The console home was an E11 scaffold stub that no epic ever owned; the
// analytics overview (E12) is the de-facto dashboard, so land there.
export default function DashboardPage() {
  redirect('/analytics');
}
