import type { Metadata } from "next";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";

export const metadata: Metadata = { title: "Maintenance" };
export default function MaintenancePage() { return <MaintenanceScreen />; }
