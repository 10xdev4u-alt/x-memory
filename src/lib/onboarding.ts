const ONBOARDING_KEY = "xmem.onboarding";

export type OnboardingStep = "session" | "sync" | "brief" | "paper";

export const ONBOARDING_STEPS: OnboardingStep[] = ["session", "sync", "brief", "paper"];

export interface OnboardingState {
  done: OnboardingStep[];
  started: boolean;
}

export async function readOnboarding(): Promise<OnboardingState> {
  const stored = await chrome.storage.local.get(ONBOARDING_KEY);
  return (stored[ONBOARDING_KEY] as OnboardingState | undefined) ?? { done: [], started: false };
}

export async function startOnboarding(): Promise<OnboardingState> {
  const state = await readOnboarding();
  const next = { ...state, started: true };
  await chrome.storage.local.set({ [ONBOARDING_KEY]: next });
  return next;
}

export async function completeStep(step: OnboardingStep): Promise<OnboardingState> {
  const state = await readOnboarding();
  if (!state.done.includes(step)) state.done.push(step);
  const next = { done: state.done, started: true };
  await chrome.storage.local.set({ [ONBOARDING_KEY]: next });
  return next;
}

export function nextStep(state: OnboardingState): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((step) => !state.done.includes(step));
}

export function isOnboarded(state: OnboardingState): boolean {
  return nextStep(state) === undefined;
}

export async function resetOnboarding(): Promise<void> {
  await chrome.storage.local.remove(ONBOARDING_KEY);
}
