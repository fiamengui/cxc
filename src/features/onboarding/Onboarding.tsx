import { zodResolver } from "@hookform/resolvers/zod";
import { toUserMessage } from "../../domain/errors";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Goal,
  ListChecks,
  LockKeyhole,
  Shapes,
  Tags,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { completeOnboarding } from "../../infrastructure/onboarding";

const businessTypes = [
  ["SERVICE_PROVIDER", "Prestador de serviços"],
  ["RETAIL", "Comércio"],
  ["BEAUTY", "Salão ou beleza"],
  ["REPAIR", "Oficina ou assistência"],
  ["FOOD", "Alimentação"],
  ["SALES", "Representação ou vendas"],
  ["PROFESSIONAL", "Profissional liberal"],
  ["GENERAL", "Negócio genérico"],
] as const;
const categoryOptions = [
  "Vendas",
  "Serviços",
  "Outras receitas",
  "Aluguel",
  "Fornecedores",
  "Utilidades",
  "Marketing",
  "Outras despesas",
];
const paymentOptions = [
  "Dinheiro",
  "Pix",
  "Débito",
  "Crédito",
  "Boleto",
  "Transferência",
  "Prazo",
  "Outro",
];
const moneyPattern = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;

const formSchema = z.object({
  businessName: z.string().trim().min(2, "Informe o nome do negócio."),
  businessType: z.enum([
    "SERVICE_PROVIDER",
    "RETAIL",
    "BEAUTY",
    "REPAIR",
    "FOOD",
    "SALES",
    "PROFESSIONAL",
    "GENERAL",
  ]),
  accountName: z.string().trim().min(2, "Informe o nome da conta."),
  openingBalance: z
    .string()
    .regex(moneyPattern, "Informe um valor válido, como 1.250,00."),
  openingBalanceDate: z.string().date("Informe uma data válida."),
  categories: z.array(z.string()).min(1, "Selecione ao menos uma categoria."),
  paymentMethods: z
    .array(z.string())
    .min(1, "Selecione ao menos uma forma de pagamento."),
  monthlyGoal: z
    .string()
    .refine(
      (value) => value === "" || moneyPattern.test(value),
      "Informe uma meta válida.",
    ),
  adminName: z.string().trim().min(2, "Informe seu nome."),
  username: z
    .string()
    .regex(
      /^[A-Za-z0-9_.]{3,64}$/,
      "Use 3 a 64 letras, números, ponto ou sublinhado.",
    ),
  password: z.string().min(12, "A senha deve ter pelo menos 12 caracteres."),
  loadDemoData: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;
type Step = { label: string; fields: (keyof FormValues)[] };
const steps: Step[] = [
  { label: "Dados do negócio", fields: ["businessName"] },
  { label: "Tipo do negócio", fields: ["businessType"] },
  { label: "Conta financeira inicial", fields: ["accountName"] },
  { label: "Saldo inicial", fields: ["openingBalance", "openingBalanceDate"] },
  { label: "Categorias sugeridas", fields: ["categories"] },
  { label: "Formas de pagamento", fields: ["paymentMethods"] },
  { label: "Meta mensal opcional", fields: ["monthlyGoal"] },
  {
    label: "Criação da senha local",
    fields: ["adminName", "username", "password"],
  },
  { label: "Confirmação", fields: ["loadDemoData"] },
];

function parseCents(value: string): number {
  const [whole, decimal = ""] = value.replaceAll(".", "").split(",");
  return Number(whole) * 100 + Number((decimal + "00").slice(0, 2));
}

function formatMoney(value: string): string {
  return value ? `R$ ${value}` : "Não definida";
}

export function Onboarding({ onCompleted }: { onCompleted: () => void }) {
  const [step, setStep] = useState(0);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: {
      businessName: "",
      businessType: "GENERAL",
      accountName: "Caixa",
      openingBalance: "0,00",
      openingBalanceDate: new Date().toISOString().slice(0, 10),
      categories: [...categoryOptions],
      paymentMethods: [...paymentOptions],
      monthlyGoal: "",
      adminName: "",
      username: "",
      password: "",
      loadDemoData: true,
    },
  });
  const values = form.watch();

  const next = async () => {
    if (await form.trigger(steps[step].fields))
      setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const submit = form.handleSubmit(async (input) => {
    setSubmissionError(null);
    try {
      await completeOnboarding({
        businessName: input.businessName,
        businessType: input.businessType,
        accountName: input.accountName,
        openingBalanceCents: parseCents(input.openingBalance),
        openingBalanceDate: input.openingBalanceDate,
        adminName: input.adminName,
        username: input.username,
        password: input.password,
        categories: input.categories,
        paymentMethods: input.paymentMethods,
        monthlyGoalCents: input.monthlyGoal
          ? parseCents(input.monthlyGoal)
          : null,
        loadDemoData: input.loadDemoData,
      });
      onCompleted();
    } catch (reason: unknown) {
      setSubmissionError(
        reason instanceof Error ? reason.message : String(reason),
      );
    }
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-surface sm:p-10">
        <header className="mb-7">
          <p className="text-sm font-semibold text-brand">Caixa no Controle</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">
            Vamos deixar tudo pronto
          </h1>
          <p className="mt-2 text-slate-600">
            Você pode voltar a qualquer etapa sem perder o que preencheu.
          </p>
        </header>
        <div
          aria-label={`Etapa ${step + 1} de ${steps.length}: ${steps[step].label}`}
          className="mb-8"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">{steps[step].label}</span>
            <span className="text-slate-500">
              Etapa {step + 1} de {steps.length}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
        <form onSubmit={submit} className="space-y-6">
          {step === 0 && (
            <div className="space-y-5">
              <SectionTitle
                icon={Building2}
                title="Qual é o nome do seu negócio?"
                description="Esse nome aparecerá nos relatórios e backups."
              />
              <Field
                label="Nome do negócio"
                error={form.formState.errors.businessName?.message}
              >
                <input autoFocus {...form.register("businessName")} />
              </Field>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-5">
              <SectionTitle
                icon={Shapes}
                title="Como você trabalha?"
                description="O tipo do negócio orientará sugestões e linguagem do sistema."
              />
              <Field
                label="Tipo de negócio"
                error={form.formState.errors.businessType?.message}
              >
                <select autoFocus {...form.register("businessType")}>
                  {businessTypes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-5">
              <SectionTitle
                icon={WalletCards}
                title="Crie sua primeira conta"
                description="Pode ser o caixa físico ou a conta bancária mais usada."
              />
              <Field
                label="Nome da conta financeira"
                error={form.formState.errors.accountName?.message}
              >
                <input autoFocus {...form.register("accountName")} />
              </Field>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-5">
              <SectionTitle
                icon={CircleDollarSign}
                title="Informe o saldo inicial"
                description="Use o saldo disponível na data escolhida. Pendências não entram neste valor."
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Saldo inicial (R$)"
                  error={form.formState.errors.openingBalance?.message}
                >
                  <input
                    autoFocus
                    inputMode="decimal"
                    {...form.register("openingBalance")}
                  />
                </Field>
                <Field
                  label="Data do saldo"
                  error={form.formState.errors.openingBalanceDate?.message}
                >
                  <input type="date" {...form.register("openingBalanceDate")} />
                </Field>
              </div>
            </div>
          )}
          {step === 4 && (
            <ChoiceStep
              icon={Tags}
              title="Escolha categorias sugeridas"
              description="Você poderá editar ou criar outras categorias depois."
              options={categoryOptions}
              register={form.register("categories")}
              error={form.formState.errors.categories?.message}
            />
          )}
          {step === 5 && (
            <ChoiceStep
              icon={ListChecks}
              title="Escolha formas de pagamento"
              description="A primeira selecionada será usada como padrão inicial."
              options={paymentOptions}
              register={form.register("paymentMethods")}
              error={form.formState.errors.paymentMethods?.message}
            />
          )}
          {step === 6 && (
            <div className="space-y-5">
              <SectionTitle
                icon={Goal}
                title="Defina uma meta mensal"
                description="É opcional e poderá ser alterada. Use a receita que deseja alcançar neste mês."
              />
              <Field
                label="Meta de receita (R$)"
                hint="Deixe em branco para configurar depois."
                error={form.formState.errors.monthlyGoal?.message}
              >
                <input
                  autoFocus
                  inputMode="decimal"
                  placeholder="Ex.: 10.000,00"
                  {...form.register("monthlyGoal")}
                />
              </Field>
            </div>
          )}
          {step === 7 && (
            <div className="space-y-5">
              <SectionTitle
                icon={LockKeyhole}
                title="Proteja seus dados"
                description="A senha fica somente neste computador, armazenada como hash Argon2id."
              />
              <Field
                label="Seu nome"
                error={form.formState.errors.adminName?.message}
              >
                <input autoFocus {...form.register("adminName")} />
              </Field>
              <Field
                label="Usuário"
                hint="Ex.: maria.silva"
                error={form.formState.errors.username?.message}
              >
                <input autoCapitalize="none" {...form.register("username")} />
              </Field>
              <Field
                label="Senha"
                hint="Use pelo menos 12 caracteres."
                error={form.formState.errors.password?.message}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  {...form.register("password")}
                />
              </Field>
            </div>
          )}
          {step === 8 && (
            <div className="space-y-5">
              <SectionTitle
                icon={CheckCircle2}
                title="Revise e escolha como começar"
                description="Nada será gravado até você concluir a configuração."
              />
              <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <Summary label="Negócio" value={values.businessName} />
                <Summary
                  label="Tipo"
                  value={
                    businessTypes.find(
                      ([value]) => value === values.businessType,
                    )?.[1] ?? values.businessType
                  }
                />
                <Summary
                  label="Conta e saldo"
                  value={`${values.accountName} · ${formatMoney(values.openingBalance)}`}
                />
                <Summary
                  label="Categorias"
                  value={`${values.categories.length} selecionadas`}
                />
                <Summary
                  label="Pagamentos"
                  value={`${values.paymentMethods.length} selecionados`}
                />
                <Summary label="Meta" value={formatMoney(values.monthlyGoal)} />
                <Summary label="Administrador" value={values.adminName} />
              </dl>
              <div className="rounded-xl border border-brand bg-blue-50 p-4">
                <p className="font-semibold text-ink">Modo demonstração</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Ao começar sem licença ativa, você poderá registrar 50
                  movimentações, sem prazo de expiração. Seus dados permanecem
                  após a ativação.
                </p>
              </div>
              <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-300 p-4">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  {...form.register("loadDemoData")}
                />
                <span>
                  <span className="block font-semibold text-ink">
                    Carregar dados demonstrativos
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    Desmarque para começar vazio. Os exemplos são identificados
                    e removíveis com um único comando.
                  </span>
                </span>
              </label>
              <p className="text-sm text-slate-600">
                Depois, escolha o plano mensal ou anual em Configurações. O pagamento é concluído com segurança no Mercado Pago.
              </p>
              {submissionError && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-critical"
                >
                  {toUserMessage(submissionError)}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-200 pt-6">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(current - 1, 0))}
              disabled={step === 0}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={18} />
              Voltar
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => void next()}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-blue-700"
              >
                Continuar
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {form.formState.isSubmitting
                  ? "Configurando…"
                  : "Concluir configuração"}
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
}) {
  return (
    <header>
      <Icon className="mb-3 text-brand" aria-hidden="true" />
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </header>
  );
}
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      <span>{label}</span>
      {hint && <span className="ml-2 font-normal text-slate-500">{hint}</span>}
      <span className="mt-1.5 block [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-slate-300 [&>input]:px-3 [&>input]:py-2.5 [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-slate-300 [&>select]:px-3 [&>select]:py-2.5">
        {children}
      </span>
      {error && (
        <span role="alert" className="mt-1 block text-sm text-critical">
          {error}
        </span>
      )}
    </label>
  );
}
function ChoiceStep({
  icon,
  title,
  description,
  options,
  register,
  error,
}: {
  icon: typeof Tags;
  title: string;
  description: string;
  options: string[];
  register: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle icon={icon} title={title} description={description} />
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium text-ink hover:border-brand"
          >
            <input type="checkbox" value={option} {...register} />
            {option}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">
        {value || "Não informado"}
      </dd>
    </div>
  );
}
