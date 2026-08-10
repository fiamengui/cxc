import { invoke } from "@tauri-apps/api/core";

export type OnboardingStatus = { isCompleted: boolean; licenseStatus: string | null };
export type InitialConfiguration = {
  businessName: string;
  businessType: string;
  accountName: string;
  openingBalanceCents: number;
  openingBalanceDate: string;
  adminName: string;
  username: string;
  defaultViewRegime: string;
  theme: string;
  categoryCount: number;
  paymentMethodCount: number;
  monthlyGoalCents: number | null;
};

export type OnboardingInput = {
  businessName: string;
  businessType: string;
  accountName: string;
  openingBalanceCents: number;
  openingBalanceDate: string;
  adminName: string;
  username: string;
  password: string;
  categories: string[];
  paymentMethods: string[];
  monthlyGoalCents: number | null;
  loadDemoData: boolean;
};

export function getOnboardingStatus(): Promise<OnboardingStatus> {
  return invoke<OnboardingStatus>("onboarding_status");
}

export function getInitialConfiguration(): Promise<InitialConfiguration> {
  return invoke<InitialConfiguration>("initial_configuration");
}

export function completeOnboarding(input: OnboardingInput): Promise<OnboardingStatus> {
  return invoke<OnboardingStatus>("complete_onboarding", { input });
}
