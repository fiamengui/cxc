import { invoke } from "@tauri-apps/api/core";

export type DashboardQuery = {
  startDate: string;
  endDate: string;
  grouping: "DAILY" | "MONTHLY";
};
export type DashboardIndicator = {
  currentCents: number;
  previousCents: number | null;
};
export type DashboardPoint = {
  key: string;
  startDate: string;
  endDate: string;
  openingBalanceCents: number;
  inflowCents: number;
  outflowCents: number;
  closingBalanceCents: number;
};
export type ExpenseCategory = {
  categoryId: string | null;
  name: string;
  amountCents: number;
  percentageBasisPoints: number;
};
export type DashboardListItem = {
  id: string;
  listKind: string;
  title: string;
  subtitle: string | null;
  date: string | null;
  dueDate: string | null;
  amountCents: number;
  status: string;
  originType: string;
  originId: string | null;
  contactId: string | null;
  recurrenceId: string | null;
};
export type DashboardResult = {
  businessName: string;
  userName: string;
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  availableBalance: DashboardIndicator;
  receivedInflow: DashboardIndicator;
  paidOutflow: DashboardIndicator;
  periodResult: DashboardIndicator;
  totalReceivable: DashboardIndicator;
  totalPayable: DashboardIndicator;
  totalOverdue: DashboardIndicator;
  goalProgressBasisPoints: number | null;
  goalTargetCents: number | null;
  goalActualCents: number;
  goalDailyBusinessCents: number | null;
  points: DashboardPoint[];
  expenseCategories: ExpenseCategory[];
  upcomingPayables: DashboardListItem[];
  upcomingReceivables: DashboardListItem[];
  overdueAccounts: DashboardListItem[];
  largestExpenses: DashboardListItem[];
  latestMovements: DashboardListItem[];
};
export type GoalInput = {
  referenceMonth: string;
  revenueGoalCents: number | null;
  expenseLimitCents: number | null;
  resultGoalCents: number | null;
  salesCountGoal: number | null;
  newCustomersGoal: number | null;
};
export type GoalMetric = {
  target: number | null;
  actual: number;
  previousActual: number;
  difference: number | null;
  progressBasisPoints: number | null;
  dailyCalendarAmount: number | null;
  dailyBusinessAmount: number | null;
  isLimit: boolean;
};
export type GoalPerformance = {
  referenceMonth: string;
  startDate: string;
  endDate: string;
  calendarDaysRemaining: number;
  businessDaysRemaining: number;
  revenue: GoalMetric;
  expenses: GoalMetric;
  result: GoalMetric;
  sales: GoalMetric;
  newCustomers: GoalMetric;
};

export const getManagementDashboard = (query: DashboardQuery) =>
  invoke<DashboardResult>("management_dashboard", { query });
export const getManagementGoal = (referenceMonth: string) =>
  invoke<GoalPerformance>("management_goal", { referenceMonth });
export const saveManagementGoal = (input: GoalInput) =>
  invoke<GoalPerformance>("save_management_goal", { input });
