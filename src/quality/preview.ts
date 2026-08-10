type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function listItem(
  id: string,
  listKind: string,
  title: string,
  amountCents: number,
  status: string,
) {
  return {
    id,
    listKind,
    title,
    subtitle: "Maria Cliente",
    date: "2026-08-04",
    dueDate: "2026-08-10",
    amountCents,
    status,
    originType: "MANUAL",
    originId: null,
    contactId: "customer",
    recurrenceId: null,
  };
}

export function installQualityPreview() {
  if (!import.meta.env.DEV || "__TAURI_INTERNALS__" in window) return;

  const invoke: Invoke = async (command) => {
    if (command === "onboarding_status")
      return { isCompleted: true, licenseStatus: "ACTIVE" };
    if (command === "phase2_status")
      return {
        licenseStatus: "ACTIVE",
        licenseEdition: "ESSENTIAL",
        licenseCustomer: "Loja Horizonte",
        authorizedMajorVersion: 1,
        installationId: "quality-preview",
        demoDataLoaded: false,
        trialExpired: false,
        trialEndsAt: null,
        trialEntryLimit: null,
        trialUsageCount: 0,
        trialRemainingEntries: null,
      };
    if (command === "run_automatic_backup") return null;
    if (command === "management_dashboard")
      return {
        businessName: "Loja Horizonte",
        userName: "Maria Gestora",
        startDate: "2026-08-01",
        endDate: "2026-08-06",
        previousStartDate: "2026-07-26",
        previousEndDate: "2026-07-31",
        availableBalance: { currentCents: 250_000, previousCents: 200_000 },
        receivedInflow: { currentCents: 120_000, previousCents: 100_000 },
        paidOutflow: { currentCents: 60_000, previousCents: 50_000 },
        periodResult: { currentCents: 60_000, previousCents: 50_000 },
        totalReceivable: { currentCents: 85_000, previousCents: null },
        totalPayable: { currentCents: 40_000, previousCents: null },
        totalOverdue: { currentCents: 15_000, previousCents: null },
        goalProgressBasisPoints: 6_000,
        goalTargetCents: 200_000,
        goalActualCents: 120_000,
        goalDailyBusinessCents: 5_715,
        points: [
          {
            key: "2026-08-01",
            startDate: "2026-08-01",
            endDate: "2026-08-01",
            openingBalanceCents: 190_000,
            inflowCents: 50_000,
            outflowCents: 10_000,
            closingBalanceCents: 230_000,
          },
          {
            key: "2026-08-02",
            startDate: "2026-08-02",
            endDate: "2026-08-02",
            openingBalanceCents: 230_000,
            inflowCents: 70_000,
            outflowCents: 50_000,
            closingBalanceCents: 250_000,
          },
        ],
        expenseCategories: [
          {
            categoryId: "marketing",
            name: "Marketing",
            amountCents: 45_000,
            percentageBasisPoints: 7_500,
          },
          {
            categoryId: "office",
            name: "Escritório",
            amountCents: 15_000,
            percentageBasisPoints: 2_500,
          },
        ],
        upcomingPayables: [
          listItem("payable", "PAYABLE", "Internet", 20_000, "PENDING"),
        ],
        upcomingReceivables: [
          listItem(
            "receivable",
            "RECEIVABLE",
            "Projeto mensal",
            35_000,
            "PENDING",
          ),
        ],
        overdueAccounts: [
          listItem(
            "overdue",
            "RECEIVABLE",
            "Mensalidade vencida",
            15_000,
            "OVERDUE",
          ),
        ],
        largestExpenses: [
          listItem(
            "expense",
            "EXPENSE",
            "Campanha agosto",
            45_000,
            "SETTLED",
          ),
        ],
        latestMovements: [
          listItem("latest", "REVENUE", "Consultoria", 50_000, "SETTLED"),
        ],
      };
    throw new Error(`Comando não simulado: ${command}`);
  };

  (
    window as unknown as { __TAURI_INTERNALS__: { invoke: Invoke } }
  ).__TAURI_INTERNALS__ = { invoke };
}
