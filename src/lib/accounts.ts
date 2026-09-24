const ACCOUNTS_KEY = "xmem.accounts";
const CURRENT_KEY = "xmem.account.current";

export interface KnownAccount {
  id: string;
  handle?: string;
  lastUsed: number;
}

export function parseAccountId(cookie: string): string | undefined {
  const match = /(?:^|; )twid=([^;]+)/.exec(cookie);
  if (match?.[1] === undefined) return undefined;
  const decoded = decodeURIComponent(match[1]);
  const id = /^u=(\d+)$/.exec(decoded)?.[1];
  return id;
}

export function dbNameFor(accountId: string): string {
  return `x-memory-${accountId}`;
}

export async function listAccounts(): Promise<KnownAccount[]> {
  const stored = await chrome.storage.local.get(ACCOUNTS_KEY);
  return (stored[ACCOUNTS_KEY] as KnownAccount[] | undefined) ?? [];
}

export async function rememberAccount(account: KnownAccount): Promise<void> {
  const accounts = (await listAccounts()).filter((entry) => entry.id !== account.id);
  accounts.unshift(account);
  await chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts.slice(0, 10) });
}

export async function readCurrentAccount(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(CURRENT_KEY);
  return stored[CURRENT_KEY] as string | undefined;
}

export async function currentDbName(): Promise<string | undefined> {
  if (typeof chrome === "undefined" || chrome.storage?.local === undefined) return undefined;
  const accountId = await readCurrentAccount();
  return accountId === undefined || accountId === "" ? undefined : dbNameFor(accountId);
}

export async function writeCurrentAccount(id: string): Promise<void> {
  await chrome.storage.local.set({ [CURRENT_KEY]: id });
}
