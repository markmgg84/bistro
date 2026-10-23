export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
export type Venue = { id: string; name: string };
export type UserView = { name: string; role: Role; employeeId: string | null };
export type WorkspaceData = {
  venueId: string;
  range: { start: string; end: string };
  summary: {
    hours: number;
    revenue?: number;
    covers?: number;
    desserts?: number;
    cost?: number;
    monthRevenue?: number;
    previousRevenue?: number;
  };
  employees: {
    employeeId: string;
    name: string;
    jobTitle: string;
    hourlyCost?: number;
  }[];
  shifts: {
    id: string;
    employeeId: string;
    name: string;
    startsAt: string;
    endsAt: string;
  }[];
  attendances: {
    id: string;
    employeeId: string;
    name: string;
    startsAt: string;
    endsAt: string | null;
    pauseMinutes: number;
    pauses: { startsAt: string; endsAt: string | null }[];
    hours: number;
    version: number;
  }[];
  openAttendance: { id: string; paused: boolean; startsAt: string } | null;
  absences: {
    id: string;
    name: string;
    kind: string;
    status: string;
    startsAt: string;
    endsAt: string;
  }[];
  items: {
    product: string;
    category: string;
    quantity: number;
    revenue: number;
  }[];
  trend: { date: string; revenue: number }[];
  goal: {
    dessertPercent: number;
    revenueTarget: number;
    dailyRevenueTarget: number;
  };
  imports: {
    id: string;
    filename: string;
    createdAt: string;
    accepted: number;
    status: string;
  }[];
  audit: {
    id: string;
    action: string;
    reason: string;
    actor: string;
    createdAt: string;
  }[];
};
