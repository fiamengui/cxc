/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, History, Printer, ReceiptText } from "lucide-react";
import { centsInput, money, parseMoney } from "../../domain/display";
import {
  addMonthsClamped,
  splitInstallmentCents,
} from "../../domain/finance";
import {
  getFinancialEntry,
  saveFinancialEntry,
  settleFinancialEntry,
  type EntryDetail,
  type EntryInput,
  type EntrySummary,
  type EntryType,
  type FinanceOptions,
  type SettlementInput,
} from "../../infrastructure/finance";
import { EmptyState, Feedback, Field, Modal } from "../masters/components";

export const entryTypeLabels: Record<string, string> = {
  REVENUE: "Receita",
  EXPENSE: "Despesa",
  OWNER_CONTRIBUTION: "Aporte do proprietário",
  OWNER_WITHDRAWAL: "Retirada do proprietário",
  TRANSFER_IN: "Entrada de transferência",
  TRANSFER_OUT: "Saída de transferência",
  ADJUSTMENT_POSITIVE: "Ajuste positivo",
  ADJUSTMENT_NEGATIVE: "Ajuste negativo",
  REVERSAL: "Estorno",
};
export const statusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  PARTIAL: "Parcial",
  OVERDUE: "Atrasado",
  SETTLED: "Liquidado",
  CANCELED: "Cancelado",
  REVERSED: "Estornado",
};

export function isoToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function formatDate(value: string | null) {
  return value
    ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR")
    : "—";
}
export function installmentLabel(
  entry: Pick<EntrySummary, "installmentNumber" | "installmentCount">,
) {
  return entry.installmentCount > 1
    ? `${entry.installmentNumber}/${entry.installmentCount}`
    : "—";
}

export function StatusBadge({ status }: { status: string }) {
  const style =
    status === "SETTLED"
      ? "bg-green-50 text-positive"
      : status === "OVERDUE"
        ? "bg-red-50 text-critical"
        : status === "PARTIAL"
          ? "bg-amber-50 text-amber-800"
          : status === "CANCELED" || status === "REVERSED"
            ? "bg-slate-100 text-slate-600"
            : status === "DRAFT"
              ? "bg-violet-50 text-violet-700"
              : "bg-blue-50 text-brand";
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${style}`}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}

export function entryToInput(
  entry: EntrySummary,
  duplicate = false,
): EntryInput {
  return {
    id: duplicate ? null : entry.id,
    entryType: entry.entryType as EntryType,
    originType: duplicate ? "MANUAL" : entry.originType,
    originId: duplicate ? null : entry.originId,
    contactId: entry.contactId,
    categoryId: entry.categoryId,
    financialAccountId: entry.financialAccountId,
    paymentMethodId: entry.paymentMethodId,
    description: duplicate
      ? `Cópia de ${entry.description}`
      : entry.description,
    documentReference: entry.documentReference,
    issueDate: duplicate ? isoToday() : entry.issueDate,
    competenceDate: duplicate ? isoToday() : entry.competenceDate,
    dueDate: duplicate ? isoToday() : entry.dueDate,
    grossAmountCents: entry.grossAmountCents,
    status:
      duplicate || entry.persistedStatus === "SETTLED"
        ? "PENDING"
        : (entry.persistedStatus as EntryInput["status"]),
    installmentCount: 1,
    installmentDueDates: [],
    recurrence: null,
    notes: entry.notes,
  };
}

export function emptyEntry(
  options: FinanceOptions,
  entryType: EntryType = "REVENUE",
): EntryInput {
  const today = isoToday();
  return {
    id: null,
    entryType,
    originType: "MANUAL",
    originId: null,
    contactId: null,
    categoryId: null,
    financialAccountId: options.defaultFinancialAccountId,
    paymentMethodId: options.defaultPaymentMethodId,
    description: "",
    documentReference: null,
    issueDate: today,
    competenceDate: today,
    dueDate: today,
    grossAmountCents: 0,
    status: "PENDING",
    installmentCount: 1,
    installmentDueDates: [],
    recurrence: null,
    notes: null,
  };
}

export function EntryForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: FinanceOptions;
  initial: EntryInput;
  onClose: () => void;
  onSaved: (ids: string[]) => void;
}) {
  const [value, setValue] = useState(initial);
  const [amount, setAmount] = useState(centsInput(initial.grossAmountCents));
  const [recurring, setRecurring] = useState(initial.recurrence !== null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const installmentAmounts = useMemo(() => {
    const cents = parseMoney(amount);
    return Number.isSafeInteger(cents) && (cents ?? 0) > 0
      ? splitInstallmentCents(cents!, value.installmentCount)
      : [];
  }, [amount, value.installmentCount]);
  const income = [
    "REVENUE",
    "OWNER_CONTRIBUTION",
    "ADJUSTMENT_POSITIVE",
  ].includes(value.entryType);
  const categories = options.categories.filter(
    (item) => item.detail === (income ? "REVENUE" : "EXPENSE"),
  );
  const setInstallments = (count: number) => {
    const normalized = Math.max(1, Math.min(120, count || 1));
    const baseDate = value.dueDate || value.issueDate;
    setValue((current) => ({
      ...current,
      installmentCount: normalized,
      status: normalized > 1 ? "PENDING" : current.status,
      installmentDueDates:
        normalized > 1
          ? Array.from(
              { length: normalized },
              (_, index) =>
                current.installmentDueDates[index] ??
                addMonthsClamped(baseDate, index),
            )
          : [],
      recurrence: normalized > 1 ? null : current.recurrence,
    }));
    if (normalized > 1) setRecurring(false);
  };
  const setText =
    (field: keyof EntryInput) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((current) => ({
        ...current,
        [field]: event.target.value || null,
      }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null || Number.isNaN(cents) || cents <= 0) {
      setError("Informe um valor maior que zero no formato brasileiro.");
      return;
    }
    if (value.description.trim().length < 2 || !value.categoryId) {
      setError("Informe descrição e categoria.");
      return;
    }
    if (
      value.status === "SETTLED" &&
      (!value.financialAccountId || !value.paymentMethodId)
    ) {
      setError("Uma movimentação liquidada exige conta e forma de pagamento.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const recurrence = recurring
        ? (value.recurrence ?? {
            frequency: "MONTHLY" as const,
            intervalValue: 1,
            startDate: value.issueDate,
            endDate: null,
            maximumOccurrences: null,
          })
        : null;
      const result = await saveFinancialEntry({
        ...value,
        grossAmountCents: cents,
        recurrence,
      });
      onSaved(result.entryIds);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={initial.id ? "Editar movimentação" : "Nova movimentação"}
      onClose={onClose}
      wide
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Feedback error={error} />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo" required>
            <select
              value={value.entryType}
              disabled={initial.id !== null}
              onChange={(event) =>
                setValue({
                  ...value,
                  entryType: event.target.value as EntryType,
                  categoryId: null,
                })
              }
            >
              {Object.entries(entryTypeLabels)
                .filter(
                  ([code]) =>
                    !["TRANSFER_IN", "TRANSFER_OUT", "REVERSAL"].includes(code),
                )
                .map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Situação" required>
            <select
              value={value.status}
              onChange={(event) =>
                setValue({
                  ...value,
                  status: event.target.value as EntryInput["status"],
                })
              }
            >
              <option value="DRAFT">Rascunho</option>
              <option value="PENDING">Pendente</option>
              {value.installmentCount === 1 && !recurring && (
                <option value="SETTLED">Liquidado</option>
              )}
            </select>
          </Field>
          <Field label="Valor total (R$)" required>
            <input
              inputMode="decimal"
              value={amount}
              disabled={initial.id !== null && initial.installmentCount > 1}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Descrição" required>
          <input
            autoFocus
            value={value.description}
            onChange={(event) =>
              setValue({ ...value, description: event.target.value })
            }
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Categoria" required>
            <select
              value={value.categoryId ?? ""}
              onChange={(event) =>
                setValue({ ...value, categoryId: event.target.value || null })
              }
            >
              <option value="">Selecione</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contato">
            <select
              value={value.contactId ?? ""}
              onChange={(event) =>
                setValue({ ...value, contactId: event.target.value || null })
              }
            >
              <option value="">Sem contato</option>
              {options.contacts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Referência documental">
            <input
              value={value.documentReference ?? ""}
              onChange={setText("documentReference")}
            />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Emissão" required>
            <input
              type="date"
              value={value.issueDate}
              onChange={(event) =>
                setValue({ ...value, issueDate: event.target.value })
              }
            />
          </Field>
          <Field label="Competência">
            <input
              type="date"
              value={value.competenceDate ?? ""}
              onChange={setText("competenceDate")}
            />
          </Field>
          <Field label="Vencimento" required={value.status === "PENDING"}>
            <input
              type="date"
              value={value.dueDate ?? ""}
              onChange={setText("dueDate")}
            />
          </Field>
        </div>
        {(value.status === "SETTLED" ||
          value.financialAccountId ||
          value.paymentMethodId) && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Conta financeira"
              required={value.status === "SETTLED"}
            >
              <select
                value={value.financialAccountId ?? ""}
                onChange={(event) =>
                  setValue({
                    ...value,
                    financialAccountId: event.target.value || null,
                  })
                }
              >
                <option value="">Definir na liquidação</option>
                {options.accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ·{" "}
                    {money.format((item.currentBalanceCents ?? 0) / 100)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Forma de pagamento"
              required={value.status === "SETTLED"}
            >
              <select
                value={value.paymentMethodId ?? ""}
                onChange={(event) =>
                  setValue({
                    ...value,
                    paymentMethodId: event.target.value || null,
                  })
                }
              >
                <option value="">Definir na liquidação</option>
                {options.paymentMethods.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {!initial.id && (
          <div className="grid gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
            <Field label="Quantidade de parcelas">
              <input
                type="number"
                min="1"
                max="120"
                value={value.installmentCount}
                onChange={(event) =>
                  setInstallments(Number(event.target.value))
                }
              />
            </Field>
            <label className="flex items-center gap-2 self-end rounded-lg bg-white p-3 text-sm">
              <input
                type="checkbox"
                checked={recurring}
                disabled={value.installmentCount > 1}
                onChange={(event) => {
                  setRecurring(event.target.checked);
                  setValue((current) => ({
                    ...current,
                    status: "PENDING",
                    recurrence: event.target.checked
                      ? {
                          frequency: "MONTHLY",
                          intervalValue: 1,
                          startDate: current.issueDate,
                          endDate: null,
                          maximumOccurrences: null,
                        }
                      : null,
                  }));
                }}
              />
              Repetir automaticamente
            </label>
          </div>
        )}
        {value.installmentCount > 1 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">
              Vencimentos editáveis
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {value.installmentDueDates.map((dueDate, index) => (
                <Field
                  key={index}
                  label={`Parcela ${index + 1}/${value.installmentCount}${installmentAmounts[index] === undefined ? "" : ` · ${money.format(installmentAmounts[index] / 100)}`}`}
                >
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) =>
                      setValue((current) => ({
                        ...current,
                        installmentDueDates: current.installmentDueDates.map(
                          (date, position) =>
                            position === index ? event.target.value : date,
                        ),
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              A diferença de arredondamento será aplicada à última parcela.
            </p>
          </div>
        )}
        {recurring && value.recurrence && (
          <div className="grid gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-3">
            <Field label="Frequência">
              <select
                value={value.recurrence.frequency}
                onChange={(event) =>
                  setValue({
                    ...value,
                    recurrence: {
                      ...value.recurrence!,
                      frequency: event.target.value as RecurrenceInputFrequency,
                    },
                  })
                }
              >
                {Object.entries(frequencyLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Intervalo">
              <input
                type="number"
                min="1"
                max="120"
                value={value.recurrence.intervalValue}
                onChange={(event) =>
                  setValue({
                    ...value,
                    recurrence: {
                      ...value.recurrence!,
                      intervalValue: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Início">
              <input
                type="date"
                value={value.recurrence.startDate}
                onChange={(event) =>
                  setValue({
                    ...value,
                    recurrence: {
                      ...value.recurrence!,
                      startDate: event.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Término">
              <input
                type="date"
                value={value.recurrence.endDate ?? ""}
                onChange={(event) =>
                  setValue({
                    ...value,
                    recurrence: {
                      ...value.recurrence!,
                      endDate: event.target.value || null,
                    },
                  })
                }
              />
            </Field>
            <Field label="Máximo de ocorrências">
              <input
                type="number"
                min="1"
                value={value.recurrence.maximumOccurrences ?? ""}
                onChange={(event) =>
                  setValue({
                    ...value,
                    recurrence: {
                      ...value.recurrence!,
                      maximumOccurrences: event.target.value
                        ? Number(event.target.value)
                        : null,
                    },
                  })
                }
              />
            </Field>
          </div>
        )}
        <Field label="Observações">
          <textarea
            rows={3}
            value={value.notes ?? ""}
            onChange={setText("notes")}
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
          >
            Cancelar
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? "Salvando…"
              : value.installmentCount > 1
                ? `Gerar ${value.installmentCount} parcelas`
                : "Salvar movimentação"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type RecurrenceInputFrequency = NonNullable<
  EntryInput["recurrence"]
>["frequency"];
export const frequencyLabels: Record<string, string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
};

export function SettlementModal({
  entry,
  options,
  partial,
  onClose,
  onSaved,
}: {
  entry: EntrySummary;
  options: FinanceOptions;
  partial?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial: SettlementInput = {
    entryId: entry.id,
    settlementDate: isoToday(),
    financialAccountId:
      entry.financialAccountId ?? options.defaultFinancialAccountId ?? "",
    paymentMethodId:
      entry.paymentMethodId ?? options.defaultPaymentMethodId ?? "",
    amountCents: entry.remainingAmountCents,
    discountAmountCents: 0,
    feeAmountCents: 0,
    interestAmountCents: 0,
    penaltyAmountCents: 0,
    notes: null,
  };
  const [value, setValue] = useState(initial);
  const [amount, setAmount] = useState(
    partial ? "" : centsInput(initial.amountCents),
  );
  const [discount, setDiscount] = useState("");
  const [fee, setFee] = useState("");
  const [interest, setInterest] = useState("");
  const [penalty, setPenalty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = (text: string) => {
    const result = parseMoney(text);
    return result === null ? 0 : result;
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cash = parseMoney(amount);
    const adjustments = [
      parsed(discount),
      parsed(fee),
      parsed(interest),
      parsed(penalty),
    ];
    if (cash === null || [cash, ...adjustments].some(Number.isNaN)) {
      setError("Revise os valores da liquidação.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await settleFinancialEntry({
        ...value,
        amountCents: cash,
        discountAmountCents: adjustments[0],
        feeAmountCents: adjustments[1],
        interestAmountCents: adjustments[2],
        penaltyAmountCents: adjustments[3],
      });
      onSaved();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`${entry.entryType === "REVENUE" ? "Receber" : "Pagar"}: ${entry.description}`}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Feedback error={error} />
        <p className="rounded-lg bg-slate-50 p-3 text-sm">
          Saldo pendente:{" "}
          <strong>{money.format(entry.remainingAmountCents / 100)}</strong>.
          Para uma baixa parcial, informe apenas o valor efetivamente
          movimentado agora.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data" required>
            <input
              type="date"
              value={value.settlementDate}
              onChange={(event) =>
                setValue({ ...value, settlementDate: event.target.value })
              }
            />
          </Field>
          <Field label="Valor efetivamente liquidado (R$)" required>
            <input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Conta financeira" required>
            <select
              value={value.financialAccountId}
              onChange={(event) =>
                setValue({ ...value, financialAccountId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {options.accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forma de pagamento" required>
            <select
              value={value.paymentMethodId}
              onChange={(event) =>
                setValue({ ...value, paymentMethodId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {options.paymentMethods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Desconto (R$)">
            <input
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </Field>
          <Field label="Taxa (R$)">
            <input
              inputMode="decimal"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </Field>
          <Field label="Juros (R$)">
            <input
              inputMode="decimal"
              value={interest}
              onChange={(event) => setInterest(event.target.value)}
            />
          </Field>
          <Field label="Multa (R$)">
            <input
              inputMode="decimal"
              value={penalty}
              onChange={(event) => setPenalty(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Observação">
          <textarea
            rows={3}
            value={value.notes ?? ""}
            onChange={(event) =>
              setValue({ ...value, notes: event.target.value || null })
            }
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
          >
            Cancelar
          </button>
          <button
            disabled={
              busy || !value.financialAccountId || !value.paymentMethodId
            }
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Registrando…" : "Confirmar liquidação"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EntryDetailModal({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onEdit?: (entry: EntrySummary) => void;
}) {
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("detail");
  useEffect(() => {
    void getFinancialEntry(id)
      .then(setDetail)
      .catch((reason) => setError(String(reason)));
  }, [id]);
  return (
    <Modal
      title={detail?.description ?? "Detalhe da movimentação"}
      onClose={onClose}
      wide
    >
      <Feedback error={error} />
      {!detail && !error ? (
        <p className="text-slate-500">Carregando…</p>
      ) : (
        detail && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusBadge status={detail.displayStatus} />
                <span className="text-sm text-slate-500">
                  {entryTypeLabels[detail.entryType] ?? detail.entryType}
                </span>
              </div>
              <div className="flex gap-2">
                {onEdit &&
                  ["DRAFT", "PENDING"].includes(detail.persistedStatus) &&
                  detail.settledPrincipalCents === 0 && (
                    <button
                      onClick={() => onEdit(detail)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                    >
                      Editar
                    </button>
                  )}
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                >
                  <Printer size={16} />
                  Imprimir
                </button>
              </div>
            </div>
            <div className="mt-5 flex gap-1 border-b border-slate-200">
              {[
                ["detail", ReceiptText, "Detalhes"],
                ["settlements", CalendarClock, "Liquidações"],
                ["history", History, "Histórico"],
              ].map(([key, Icon, label]) => (
                <button
                  key={String(key)}
                  onClick={() => setTab(String(key))}
                  className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === key ? "border-brand text-brand" : "border-transparent text-slate-500"}`}
                >
                  <Icon size={15} />
                  {String(label)}
                </button>
              ))}
            </div>
            {tab === "detail" && (
              <div className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-4">
                <Info
                  label="Valor original"
                  value={money.format(detail.grossAmountCents / 100)}
                />
                <Info
                  label="Saldo pendente"
                  value={money.format(detail.remainingAmountCents / 100)}
                />
                <Info label="Parcela" value={installmentLabel(detail)} />
                <Info label="Emissão" value={formatDate(detail.issueDate)} />
                <Info
                  label="Competência"
                  value={formatDate(detail.competenceDate)}
                />
                <Info label="Vencimento" value={formatDate(detail.dueDate)} />
                <Info label="Contato" value={detail.contactName ?? "—"} />
                <Info label="Categoria" value={detail.categoryName ?? "—"} />
                <Info
                  label="Conta"
                  value={detail.financialAccountName ?? "—"}
                />
                <Info
                  label="Pagamento"
                  value={detail.paymentMethodName ?? "—"}
                />
                <Info label="Origem" value={detail.originType} />
                <Info
                  label="Documento"
                  value={detail.documentReference ?? "—"}
                />
                {detail.notes && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Info label="Observações" value={detail.notes} />
                  </div>
                )}
                {detail.cancelReason && (
                  <div className="sm:col-span-2">
                    <Info
                      label="Motivo do cancelamento"
                      value={detail.cancelReason}
                    />
                  </div>
                )}
                {detail.reversalReason && (
                  <div className="sm:col-span-2">
                    <Info
                      label="Motivo do estorno"
                      value={detail.reversalReason}
                    />
                  </div>
                )}
              </div>
            )}
            {tab === "settlements" && (
              <div className="py-5">
                {detail.settlements.length === 0 ? (
                  <EmptyState
                    title="Nenhuma liquidação"
                    text="As baixas totais e parciais aparecerão aqui."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          <th className="p-2">Data</th>
                          <th className="p-2">Conta</th>
                          <th className="p-2">Pagamento</th>
                          <th className="p-2 text-right">Principal</th>
                          <th className="p-2 text-right">Valor efetivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.settlements.map((item) => (
                          <tr key={item.id} className="border-t">
                            <td className="p-2">
                              {formatDate(item.settlementDate)}
                            </td>
                            <td className="p-2">{item.financialAccountName}</td>
                            <td className="p-2">{item.paymentMethodName}</td>
                            <td className="p-2 text-right">
                              {money.format(item.principalAmountCents / 100)}
                            </td>
                            <td className="p-2 text-right">
                              {money.format(item.netAmountCents / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {tab === "history" && (
              <div className="space-y-3 py-5">
                {detail.history.map((item, index) => (
                  <article
                    key={`${item.createdAt}-${index}`}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="font-medium">{item.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.action} ·{" "}
                      {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </>
        )
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap font-medium text-ink">{value}</p>
    </div>
  );
}

export function ReasonModal({
  title,
  requireDate,
  onClose,
  onConfirm,
}: {
  title: string;
  requireDate?: boolean;
  onClose: () => void;
  onConfirm: (reason: string, date: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(isoToday());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim().length < 3) {
            setError("Informe um motivo com pelo menos três caracteres.");
            return;
          }
          setBusy(true);
          setError(null);
          void onConfirm(reason, date)
            .catch((value) => setError(String(value)))
            .finally(() => setBusy(false));
        }}
        className="space-y-4"
      >
        <Feedback error={error} />
        {requireDate && (
          <Field label="Data" required>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        )}
        <Field label="Motivo" required>
          <textarea
            autoFocus
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
          >
            Voltar
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-critical px-4 py-2 font-semibold text-white"
          >
            {busy ? "Confirmando…" : "Confirmar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RescheduleModal({
  currentDate,
  onClose,
  onConfirm,
}: {
  currentDate: string | null;
  onClose: () => void;
  onConfirm: (date: string) => Promise<void>;
}) {
  const [date, setDate] = useState(currentDate ?? isoToday());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Reagendar vencimento" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void onConfirm(date)
            .catch((value) => setError(String(value)))
            .finally(() => setBusy(false));
        }}
        className="space-y-4"
      >
        <Feedback error={error} />
        <Field label="Novo vencimento" required>
          <input
            autoFocus
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
          >
            Voltar
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white"
          >
            Salvar data
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function useFinanceCategories(
  options: FinanceOptions | null,
  nature: "REVENUE" | "EXPENSE",
) {
  return useMemo(
    () => options?.categories.filter((item) => item.detail === nature) ?? [],
    [options, nature],
  );
}
