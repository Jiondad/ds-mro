import { createClient, PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  AuditLogRecord,
  Category,
  CompanyProfile,
  InventoryItem,
  OrderHistoryRecord,
  ProductionLine,
  Unit,
  UsageLog,
  UserAccount,
  UserLevel,
  Vendor,
} from '../types';
import {
  INITIAL_COMPANY_PROFILE,
  INITIAL_MEMO,
  INITIAL_UNITS,
  INITIAL_USER_ACCOUNTS,
} from '../mockData';
import { compareUserAccountsByAffiliation, TODAY_STR } from '../utils/calculations';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  updatedAt?: string;
}

export interface SupabaseMutationResult<T = unknown> {
  ok: boolean;
  data?: T;
  errorMessage?: string;
  errorCode?: string;
  isRlsError?: boolean;
  isForeignKeyError?: boolean;
}

const envSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const envSupabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

let runtimeSupabaseConfig: SupabaseConfig | null = null;

export function getSavedSupabaseConfig(): SupabaseConfig {
  if (runtimeSupabaseConfig && runtimeSupabaseConfig.url && runtimeSupabaseConfig.anonKey) {
    return runtimeSupabaseConfig;
  }
  return {
    url: envSupabaseUrl,
    anonKey: envSupabaseAnonKey,
  };
}

export function setRuntimeSupabaseConfig(config: SupabaseConfig | null): void {
  runtimeSupabaseConfig = config;
  getSupabaseClient();
}

let supabaseInstance: SupabaseClient | null = null;
let currentConfiguredUrl = '';
let currentConfiguredKey = '';

/**
 * 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) 또는
 * 최고관리자 런타임 DB 연결 설정으로 싱글톤 Supabase 클라이언트를 반환합니다.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSavedSupabaseConfig();
  if (!url || !anonKey) {
    supabaseInstance = null;
    currentConfiguredUrl = '';
    currentConfiguredKey = '';
    return null;
  }

  if (
    !supabaseInstance ||
    currentConfiguredUrl !== url ||
    currentConfiguredKey !== anonKey
  ) {
    try {
      supabaseInstance = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      currentConfiguredUrl = url;
      currentConfiguredKey = anonKey;
    } catch (e) {
      console.error('[Supabase] 클라이언트 초기화 실패:', e);
      return null;
    }
  }

  return supabaseInstance;
}

export const supabase: SupabaseClient | null = getSupabaseClient();

/**
 * Supabase 에러 객체를 상세 분석하여 콘솔에 명확히 로깅하고
 * 사용자 화면(토스트 및 폼 에러)에 표시할 구체적인 에러 정보를 반환합니다.
 */
function handleSupabaseException<T = unknown>(
  table: string,
  operation: string,
  err: unknown
): SupabaseMutationResult<T> {
  console.error(`[Supabase DB Error] table="${table}" operation="${operation}"`, err);

  if (err && typeof err === 'object' && 'message' in err) {
    const pgErr = err as Partial<PostgrestError> & { message: string; status?: number };
    const code = pgErr.code || (pgErr.status ? String(pgErr.status) : '');
    const rawMsg = `${pgErr.message || ''} ${pgErr.details || ''} ${pgErr.hint || ''}`;

    const isRlsError =
      code === '42501' ||
      /row-level security|permission denied|new row violates row-level security/i.test(rawMsg);
    const isForeignKeyError =
      code === '23503' || /foreign key|violates.*constraint/i.test(rawMsg);
    const isMissingTable =
      code === '42P01' ||
      code === 'PGRST205' ||
      /relation .* does not exist|could not find the table/i.test(rawMsg);
    const isMissingColumn =
      code === 'PGRST204' ||
      code === '42703' ||
      /could not find the .* column|column .* does not exist/i.test(rawMsg);

    let detailMessage = pgErr.message;
    if (pgErr.details) detailMessage += ` (${pgErr.details})`;
    if (pgErr.hint) detailMessage += ` [힌트: ${pgErr.hint}]`;
    if (code) detailMessage = `[${code}] ${detailMessage}`;

    if (isRlsError) {
      return {
        ok: false,
        errorCode: code,
        isRlsError: true,
        errorMessage: `RLS 보안 정책 차단 (${table}): ${detailMessage}`,
      };
    }

    if (isForeignKeyError) {
      return {
        ok: false,
        errorCode: code,
        isForeignKeyError: true,
        errorMessage: `외래 키 참조 제약조건 오류 (${table}): ${detailMessage}`,
      };
    }

    if (isMissingTable) {
      return {
        ok: false,
        errorCode: code,
        errorMessage: `Supabase에 '${table}' 테이블이 존재하지 않습니다 (404). ${detailMessage}`,
      };
    }

    if (isMissingColumn) {
      return {
        ok: false,
        errorCode: code,
        errorMessage: `'${table}' 테이블 컬럼 매핑 오류 (400): ${detailMessage}`,
      };
    }

    return {
      ok: false,
      errorCode: code,
      errorMessage: `Supabase '${table}' ${operation} 오류: ${detailMessage}`,
    };
  }

  const fallbackMsg = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    errorMessage: `Supabase '${table}' ${operation} 실패: ${fallbackMsg}`,
  };
}

/**
 * 입력받은 Supabase Project URL 및 Anon Key로 실제 연결 및 실제 public 스키마 테이블 접근 가능 여부를 테스트합니다.
 */
export async function testSupabaseConnection(
  url: string,
  anonKey: string
): Promise<{ ok: boolean; message: string }> {
  const trimmedUrl = url.trim().replace(/\/+$/, '');
  const trimmedKey = anonKey.trim();

  if (!trimmedUrl.startsWith('https://') && !trimmedUrl.startsWith('http://')) {
    return {
      ok: false,
      message: '유효한 Supabase Project URL 형식(https://...)을 입력해주세요.',
    };
  }

  if (trimmedKey.length < 20) {
    return {
      ok: false,
      message: '유효한 Supabase Anon API Key를 입력해주세요.',
    };
  }

  try {
    const tempClient = createClient(trimmedUrl, trimmedKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error } = await tempClient.from('company_profile').select('id').limit(1);
    if (error) {
      throw error;
    }

    return {
      ok: true,
      message: 'Supabase 클라우드 데이터베이스 연결 테스트에 성공했습니다.',
    };
  } catch (err) {
    console.error('[Supabase Connection Test Exception]:', err);
    const msg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : err instanceof Error
        ? err.message
        : '네트워크 또는 URL 오류';
    return {
      ok: false,
      message: `연결 테스트 실패: ${msg}`,
    };
  }
}

// ============================================================================
// [Single Source of Truth] 실제 Supabase DB public 스키마 명세 (1:1 매칭)
// ----------------------------------------------------------------------------
// 1. public.company_profile:
//    - id (text, NOT NULL, PK, default 'default')
//    - data (jsonb, NOT NULL)
//    - updated_at (timestamptz, YES)
//    => JSONB 문서 저장소로서 다음 ID 레코드들을 관리합니다:
//       * id = 'default'        : CompanyProfile (회사 프로필 및 월 예산)
//       * id = 'user_accounts'  : { accounts: UserAccountDbRow[], passwords: Record<string, string> }
//       * id = 'mro_audit_logs' : { logs: AuditLogRecord[] }
//       * id = 'app_metadata'   : { units, memo, lastAuditTimestamp, itemExtensions, categoryExtensions }
//
// 2. public.inventory_items (snake_case 27개 컬럼 1:1 매칭):
//    id, line, category_id, vendor_id, item_name, spec, pack_unit, base_unit,
//    unit_conversion, current_pack_stock, daily_usage, unit_price, moq_description,
//    lead_time_days, order_status, order_date, expected_arrival_date, ordered_pack_qty,
//    last_order_date, last_audit_date, purpose, trigger_pack_qty, fixed_order_pack_qty,
//    receiver_name, receiver_phone, delivery_detail_location, updated_at
//
// 3. public.categories (snake_case 9개 컬럼 1:1 매칭):
//    id, name, order_policy_type, safety_days, order_cycle_days,
//    default_trigger_pack_qty, default_order_pack_qty, description, delivery_location
//
// 4. public.vendors (snake_case 8개 컬럼 1:1 매칭):
//    id, name, default_lead_time, is_active, phone, email, contact_person, address
//
// 5. public.order_history (snake_case 19개 컬럼 1:1 매칭):
//    id, item_id, order_date, expected_arrival_date, completed_date, vendor_name,
//    vendor_id, line, item_name, spec, ordered_pack_qty, pack_unit, unit_conversion,
//    base_unit, unit_price, total_amount, delivery_location, status, note
//
// 6. public.usage_logs (snake_case 16개 컬럼 1:1 매칭):
//    id, item_id, item_name, spec, line, category_id, category_name, date, month,
//    pack_used_qty, base_used_qty, unit_price, total_cost, base_unit, pack_unit, recorded_via
// ============================================================================

const COMPANY_PROFILE_DOC_IDS = {
  COMPANY_PROFILE: 'default',
  USER_ACCOUNTS: 'user_accounts',
  AUDIT_LOGS: 'mro_audit_logs',
  APP_METADATA: 'app_metadata',
} as const;

interface ItemExtensionMeta {
  receiverLoginId?: string;
  lastAuditedBy?: string | null;
  lastAuditUpdatedAt?: number | null;
}

interface CategoryExtensionMeta {
  lineDeliveryLocations?: Partial<Record<ProductionLine, string>>;
}

interface AppMetadataPayload {
  units: Unit[];
  memo: string;
  lastAuditTimestamp: string;
  itemExtensions: Record<string, ItemExtensionMeta>;
  categoryExtensions: Record<string, CategoryExtensionMeta>;
}

let cachedAppMetadata: AppMetadataPayload = {
  units: INITIAL_UNITS,
  memo: INITIAL_MEMO,
  lastAuditTimestamp: `${TODAY_STR} 실사 대기`,
  itemExtensions: {},
  categoryExtensions: {},
};

let cachedUserAccounts: UserAccount[] = [];
let cachedUserPasswords: Record<string, string> = { admin: '1234' };

async function upsertCompanyProfileDoc<T>(
  docId: string,
  payload: T
): Promise<SupabaseMutationResult<T>> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        'Supabase DB가 연결되지 않았습니다. 우측 상단 [DB 연결 설정]에서 URL과 Anon Key를 확인해 주세요.'
      );
    }

    const { error } = await client.from('company_profile').upsert(
      {
        id: docId,
        data: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw error;
    }

    return { ok: true, data: payload };
  } catch (error: unknown) {
    return handleSupabaseException<T>(`company_profile(${docId})`, 'UPSERT', error);
  }
}

async function fetchCompanyProfileDoc<T>(docId: string): Promise<T | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('company_profile')
      .select('id, data, updated_at')
      .eq('id', docId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data || data.data === undefined || data.data === null) {
      return null;
    }

    return data.data as T;
  } catch (error: unknown) {
    handleSupabaseException(`company_profile(${docId})`, 'SELECT', error);
    return null;
  }
}

async function persistAppMetadata(): Promise<SupabaseMutationResult> {
  return upsertCompanyProfileDoc(COMPANY_PROFILE_DOC_IDS.APP_METADATA, cachedAppMetadata);
}

// ============================================================================
// 1. 사용자 계정 (user_accounts 스펙 1:1 정규화 & company_profile('user_accounts') 저장)
//    컬럼 규격: id, username, password, name, level, roleLabel, affiliation, department, phone, isActive, createdAt
// ============================================================================

export interface UserAccountDbRow {
  id: string;
  username: string;
  password: string;
  name: string;
  level: UserLevel;
  roleLabel: string;
  affiliation: string;
  department: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

interface UserAccountsDocPayload {
  accounts: UserAccountDbRow[];
  passwords: Record<string, string>;
}

function normalizeUserAccountToDbRow(
  account: UserAccount,
  passwordMap?: Record<string, string>
): UserAccountDbRow {
  const rawLevel = Number(account.level);
  const validLevel: UserLevel =
    rawLevel === 0 || rawLevel === 1 || rawLevel === 2 || rawLevel === 3
      ? (rawLevel as UserLevel)
      : 2;

  const username = String(account.username || '').trim();
  const isDefaultAdmin = username === 'admin';
  const finalLevel: UserLevel = isDefaultAdmin ? 0 : validLevel;

  const defaultRoleLabel =
    finalLevel === 0
      ? 'LV.0 최고관리자'
      : finalLevel === 1
      ? 'LV.1 현장관리자'
      : finalLevel === 2
      ? 'LV.2 현장사용자'
      : 'LV.3 사무실사용자';

  const resolvedPassword = isDefaultAdmin
    ? account.password || passwordMap?.admin || '1234'
    : account.password || passwordMap?.[username] || '1234';

  const affiliation = String(account.affiliation || '포승공장').trim();
  const department = String(account.department || affiliation || '포승공장').trim();

  return {
    id: String(account.id || `usr_${username}`),
    username,
    password: resolvedPassword,
    name: String(account.name || '').trim(),
    level: finalLevel,
    roleLabel: isDefaultAdmin
      ? 'LV.0 최고관리자'
      : String(account.roleLabel || defaultRoleLabel),
    affiliation,
    department,
    phone: account.phone?.trim() ? account.phone.trim() : null,
    isActive: isDefaultAdmin ? true : account.isActive !== false,
    createdAt: String(account.createdAt || TODAY_STR).substring(0, 10),
  };
}

function mapDbRowToUserAccount(row: Record<string, any>): UserAccount {
  const rawLevel = Number(row.level);
  const validLevel: UserLevel =
    rawLevel === 0 || rawLevel === 1 || rawLevel === 2 || rawLevel === 3
      ? (rawLevel as UserLevel)
      : 2;
  const username = String(row.username || '').trim();
  const isDefaultAdmin = username === 'admin';
  const finalLevel: UserLevel = isDefaultAdmin ? 0 : validLevel;

  return {
    id: String(row.id || `usr_${username}`),
    username,
    password: row.password ? String(row.password) : '1234',
    name: String(row.name || ''),
    level: finalLevel,
    roleLabel: isDefaultAdmin
      ? 'LV.0 최고관리자'
      : String(row.roleLabel ?? row.role_label ?? `LV.${finalLevel}`),
    affiliation: row.affiliation ? String(row.affiliation) : '포승공장',
    department: row.department
      ? String(row.department)
      : row.affiliation
      ? String(row.affiliation)
      : '포승공장',
    phone: row.phone ? String(row.phone) : undefined,
    isActive: isDefaultAdmin ? true : (row.isActive ?? row.is_active) !== false,
    createdAt: String(row.createdAt ?? row.created_at ?? TODAY_STR).substring(0, 10),
  };
}

/**
 * 클라우드 DB 계정 목록에 기본 최고관리자(admin, 초기비번 1234) 계정이 누락되지 않도록 보장합니다.
 */
export function ensureDefaultAdminAccount(accounts: UserAccount[]): UserAccount[] {
  const defaultAdmin = INITIAL_USER_ACCOUNTS.find((a) => a.username === 'admin') || {
    id: 'usr_admin',
    username: 'admin',
    password: '1234',
    name: '김종현 실장',
    level: 0 as UserLevel,
    roleLabel: 'LV.0 최고관리자',
    affiliation: '포승공장',
    department: '관리팀 / 총괄',
    phone: '010-8899-7700',
    isActive: true,
    createdAt: '2026-01-01',
  };

  const hasAdmin = accounts.some((a) => a.username === 'admin');
  const merged = hasAdmin
    ? accounts.map((a) =>
        a.username === 'admin'
          ? {
              ...defaultAdmin,
              ...a,
              level: 0 as UserLevel,
              isActive: true,
              password: a.password || '1234',
            }
          : a
      )
    : [defaultAdmin, ...accounts];

  const deduped = new Map<string, UserAccount>();
  merged.forEach((acc) => {
    if (acc && acc.username) {
      deduped.set(acc.id || `usr_${acc.username}`, acc);
    }
  });

  return Array.from(deduped.values()).sort(compareUserAccountsByAffiliation);
}

async function saveUserAccountsPayloadToSupabase(
  accounts: UserAccount[],
  passwords?: Record<string, string>
): Promise<SupabaseMutationResult<UserAccount[]>> {
  const ensured = ensureDefaultAdminAccount(accounts);
  const nextPasswords: Record<string, string> = {
    admin: '1234',
    ...cachedUserPasswords,
    ...(passwords || {}),
  };

  const normalizedRows = ensured.map((acc) => {
    const row = normalizeUserAccountToDbRow(acc, nextPasswords);
    nextPasswords[row.username] = row.password;
    return row;
  });

  const docPayload: UserAccountsDocPayload = {
    accounts: normalizedRows,
    passwords: nextPasswords,
  };

  const res = await upsertCompanyProfileDoc(COMPANY_PROFILE_DOC_IDS.USER_ACCOUNTS, docPayload);
  if (!res.ok) {
    return {
      ok: false,
      errorMessage: res.errorMessage,
      errorCode: res.errorCode,
      isRlsError: res.isRlsError,
      isForeignKeyError: res.isForeignKeyError,
    };
  }

  cachedUserAccounts = normalizedRows.map(mapDbRowToUserAccount);
  cachedUserPasswords = nextPasswords;

  return {
    ok: true,
    data: cachedUserAccounts,
  };
}

export async function fetchUserAccountsFromSupabase(): Promise<UserAccount[] | null> {
  const doc = await fetchCompanyProfileDoc<UserAccountsDocPayload | UserAccountDbRow[]>(
    COMPANY_PROFILE_DOC_IDS.USER_ACCOUNTS
  );

  if (!doc) {
    return null;
  }

  const rawList = Array.isArray(doc)
    ? doc
    : Array.isArray(doc.accounts)
    ? doc.accounts
    : [];

  const mapped = ensureDefaultAdminAccount(rawList.map(mapDbRowToUserAccount));
  const pwMap: Record<string, string> = {
    admin: '1234',
    ...(!Array.isArray(doc) && doc.passwords ? doc.passwords : {}),
  };

  mapped.forEach((acc) => {
    if (acc.username && acc.password) {
      pwMap[acc.username] = acc.password;
    }
  });

  cachedUserAccounts = mapped;
  cachedUserPasswords = pwMap;
  return mapped;
}

export async function insertUserAccountToSupabase(
  account: UserAccount,
  allAccounts?: UserAccount[]
): Promise<SupabaseMutationResult<UserAccount>> {
  try {
    const baseList =
      allAccounts && allAccounts.length > 0
        ? allAccounts
        : cachedUserAccounts.length > 0
        ? cachedUserAccounts
        : (await fetchUserAccountsFromSupabase()) || INITIAL_USER_ACCOUNTS;

    const normalizedTarget = mapDbRowToUserAccount(
      normalizeUserAccountToDbRow(account, cachedUserPasswords)
    );

    const filtered = baseList.filter(
      (a) =>
        a.id !== normalizedTarget.id &&
        a.username.toLowerCase() !== normalizedTarget.username.toLowerCase()
    );
    const nextList = ensureDefaultAdminAccount([...filtered, normalizedTarget]);
    const nextPasswords = {
      ...cachedUserPasswords,
      [normalizedTarget.username]: normalizedTarget.password || '1234',
    };

    const res = await saveUserAccountsPayloadToSupabase(nextList, nextPasswords);
    if (!res.ok) {
      return {
        ok: false,
        errorMessage: res.errorMessage,
        errorCode: res.errorCode,
        isRlsError: res.isRlsError,
      };
    }

    return {
      ok: true,
      data: normalizedTarget,
    };
  } catch (error: unknown) {
    return handleSupabaseException<UserAccount>('user_accounts', 'INSERT', error);
  }
}

export async function updateUserAccountInSupabase(
  account: UserAccount,
  allAccounts?: UserAccount[]
): Promise<SupabaseMutationResult<UserAccount>> {
  try {
    const baseList =
      allAccounts && allAccounts.length > 0
        ? allAccounts
        : cachedUserAccounts.length > 0
        ? cachedUserAccounts
        : (await fetchUserAccountsFromSupabase()) || INITIAL_USER_ACCOUNTS;

    const normalizedTarget = mapDbRowToUserAccount(
      normalizeUserAccountToDbRow(account, cachedUserPasswords)
    );

    const exists = baseList.some((a) => a.id === normalizedTarget.id);
    const updatedList = exists
      ? baseList.map((a) => (a.id === normalizedTarget.id ? normalizedTarget : a))
      : [...baseList, normalizedTarget];

    const nextPasswords = {
      ...cachedUserPasswords,
      [normalizedTarget.username]: normalizedTarget.password || '1234',
    };

    const res = await saveUserAccountsPayloadToSupabase(updatedList, nextPasswords);
    if (!res.ok) {
      return {
        ok: false,
        errorMessage: res.errorMessage,
        errorCode: res.errorCode,
        isRlsError: res.isRlsError,
      };
    }

    return {
      ok: true,
      data: normalizedTarget,
    };
  } catch (error: unknown) {
    return handleSupabaseException<UserAccount>('user_accounts', 'UPDATE', error);
  }
}

export async function batchUpsertUserAccountsToSupabase(
  accounts: UserAccount[]
): Promise<SupabaseMutationResult> {
  const res = await saveUserAccountsPayloadToSupabase(accounts, cachedUserPasswords);
  return {
    ok: res.ok,
    errorMessage: res.errorMessage,
    errorCode: res.errorCode,
    isRlsError: res.isRlsError,
  };
}

export async function updateUserPasswordInSupabase(
  username: string,
  newPassword: string
): Promise<SupabaseMutationResult> {
  try {
    const baseList =
      cachedUserAccounts.length > 0
        ? cachedUserAccounts
        : (await fetchUserAccountsFromSupabase()) || INITIAL_USER_ACCOUNTS;

    const nextPasswords = {
      ...cachedUserPasswords,
      [username]: newPassword,
    };

    const nextAccounts = baseList.map((acc) =>
      acc.username === username ? { ...acc, password: newPassword } : acc
    );

    const res = await saveUserAccountsPayloadToSupabase(nextAccounts, nextPasswords);
    if (!res.ok) {
      return res;
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('user_accounts', 'UPDATE_PASSWORD', error);
  }
}

export async function saveUserPasswordsToSupabase(
  passwords: Record<string, string>
): Promise<SupabaseMutationResult> {
  const baseList =
    cachedUserAccounts.length > 0
      ? cachedUserAccounts
      : (await fetchUserAccountsFromSupabase()) || INITIAL_USER_ACCOUNTS;

  const nextAccounts = baseList.map((acc) => ({
    ...acc,
    password: passwords[acc.username] || acc.password || '1234',
  }));

  const res = await saveUserAccountsPayloadToSupabase(nextAccounts, passwords);
  return {
    ok: res.ok,
    errorMessage: res.errorMessage,
  };
}

export async function deleteUserAccountFromSupabase(
  accountId: string,
  remainingAccounts?: UserAccount[]
): Promise<SupabaseMutationResult> {
  try {
    const baseList =
      remainingAccounts && remainingAccounts.length > 0
        ? remainingAccounts
        : (
            cachedUserAccounts.length > 0
              ? cachedUserAccounts
              : (await fetchUserAccountsFromSupabase()) || INITIAL_USER_ACCOUNTS
          ).filter((a) => a.id !== accountId);

    const res = await saveUserAccountsPayloadToSupabase(baseList, cachedUserPasswords);
    if (!res.ok) {
      return res;
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('user_accounts', 'DELETE', error);
  }
}

// ============================================================================
// 2. 자재·소모품 마스터 및 재고 (public.inventory_items) 1:1 Direct CRUD
//    실제 DB 컬럼 (27개):
//    id, line, category_id, vendor_id, item_name, spec, pack_unit, base_unit,
//    unit_conversion, current_pack_stock, daily_usage, unit_price, moq_description,
//    lead_time_days, order_status, order_date, expected_arrival_date, ordered_pack_qty,
//    last_order_date, last_audit_date, purpose, trigger_pack_qty, fixed_order_pack_qty,
//    receiver_name, receiver_phone, delivery_detail_location, updated_at
// ============================================================================

export interface InventoryItemDbRow {
  id: string;
  line: string;
  category_id: string;
  vendor_id: string;
  item_name: string;
  spec: string;
  pack_unit: string;
  base_unit: string;
  unit_conversion: number;
  current_pack_stock: number;
  daily_usage: number;
  unit_price: number;
  moq_description: string | null;
  lead_time_days: number;
  order_status: string;
  order_date: string | null;
  expected_arrival_date: string | null;
  ordered_pack_qty: number | null;
  last_order_date: string | null;
  last_audit_date: string | null;
  purpose: string | null;
  trigger_pack_qty: number | null;
  fixed_order_pack_qty: number | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  delivery_detail_location: string | null;
  updated_at: string;
}

function mapInventoryItemToDbRow(item: InventoryItem): InventoryItemDbRow {
  return {
    id: String(item.id),
    line: String(item.line || 'SL1'),
    category_id: String(item.categoryId || ''),
    vendor_id: String(item.vendorId || ''),
    item_name: String(item.itemName || ''),
    spec: String(item.spec || ''),
    pack_unit: String(item.packUnit || 'EA'),
    base_unit: String(item.baseUnit || 'EA'),
    unit_conversion: Number.isFinite(Number(item.unitConversion))
      ? Number(item.unitConversion)
      : 1,
    current_pack_stock: Number.isFinite(Number(item.currentPackStock))
      ? Number(item.currentPackStock)
      : 0,
    daily_usage: Number.isFinite(Number(item.dailyUsage)) ? Number(item.dailyUsage) : 0,
    unit_price: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
    moq_description: item.moqDescription ? String(item.moqDescription) : null,
    lead_time_days: Math.max(1, Math.round(Number(item.leadTimeDays ?? 3))),
    order_status:
      item.orderStatus === '발주완료(입고대기)' ? '발주완료(입고대기)' : '발주대기',
    order_date: item.orderDate || null,
    expected_arrival_date: item.expectedArrivalDate || null,
    ordered_pack_qty:
      item.orderedPackQty !== undefined && item.orderedPackQty !== null
        ? Number(item.orderedPackQty)
        : null,
    last_order_date: item.lastOrderDate || null,
    last_audit_date: item.lastAuditDate || null,
    purpose: item.purpose ? String(item.purpose) : null,
    trigger_pack_qty:
      item.triggerPackQty !== undefined && item.triggerPackQty !== null
        ? Number(item.triggerPackQty)
        : null,
    fixed_order_pack_qty:
      item.fixedOrderPackQty !== undefined && item.fixedOrderPackQty !== null
        ? Number(item.fixedOrderPackQty)
        : null,
    receiver_name: item.receiverName ? String(item.receiverName) : null,
    receiver_phone: item.receiverPhone ? String(item.receiverPhone) : null,
    delivery_detail_location: item.deliveryDetailLocation
      ? String(item.deliveryDetailLocation)
      : null,
    updated_at: new Date().toISOString(),
  };
}

function syncItemExtensionToCache(item: InventoryItem): boolean {
  const prev = cachedAppMetadata.itemExtensions[item.id];
  const next: ItemExtensionMeta = {
    receiverLoginId: item.receiverLoginId,
    lastAuditedBy: item.lastAuditedBy ?? null,
    lastAuditUpdatedAt: item.lastAuditUpdatedAt ?? null,
  };
  const changed =
    !prev ||
    prev.receiverLoginId !== next.receiverLoginId ||
    prev.lastAuditedBy !== next.lastAuditedBy ||
    prev.lastAuditUpdatedAt !== next.lastAuditUpdatedAt;

  cachedAppMetadata.itemExtensions[item.id] = next;
  return changed;
}

function mapRowToInventoryItem(
  row: Record<string, any>,
  extMap: Record<string, ItemExtensionMeta>,
  accounts: UserAccount[]
): InventoryItem {
  const id = String(row.id);
  const ext = extMap[id];
  const receiverName = row.receiver_name ? String(row.receiver_name) : undefined;
  let receiverLoginId = ext?.receiverLoginId;

  if (!receiverLoginId && receiverName) {
    const matchedAcc = accounts.find(
      (a) =>
        a.name.trim() === receiverName.trim() ||
        (a.title && `${a.name} ${a.title}`.trim() === receiverName.trim())
    );
    if (matchedAcc) {
      receiverLoginId = matchedAcc.username;
    }
  }

  return {
    id,
    line: (row.line || 'SL1') as ProductionLine,
    categoryId: String(row.category_id ?? ''),
    vendorId: String(row.vendor_id ?? ''),
    itemName: String(row.item_name ?? ''),
    spec: String(row.spec ?? ''),
    packUnit: String(row.pack_unit ?? 'EA'),
    baseUnit: String(row.base_unit ?? 'EA'),
    unitConversion: Number(row.unit_conversion ?? 1),
    currentPackStock: Number(row.current_pack_stock ?? 0),
    dailyUsage: Number(row.daily_usage ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    moqDescription: String(row.moq_description ?? ''),
    leadTimeDays: Number(row.lead_time_days ?? 3),
    orderStatus:
      row.order_status === '발주완료(입고대기)' ? '발주완료(입고대기)' : '발주대기',
    orderDate: row.order_date ?? null,
    expectedArrivalDate: row.expected_arrival_date ?? null,
    orderedPackQty:
      row.ordered_pack_qty !== undefined && row.ordered_pack_qty !== null
        ? Number(row.ordered_pack_qty)
        : null,
    lastOrderDate: row.last_order_date ?? null,
    lastAuditDate: row.last_audit_date ?? null,
    lastAuditedBy: ext?.lastAuditedBy ?? (row.last_audit_date ? receiverName || '현장담당' : null),
    lastAuditUpdatedAt: ext?.lastAuditUpdatedAt ?? null,
    purpose: String(row.purpose ?? ''),
    triggerPackQty:
      row.trigger_pack_qty !== undefined && row.trigger_pack_qty !== null
        ? Number(row.trigger_pack_qty)
        : null,
    fixedOrderPackQty:
      row.fixed_order_pack_qty !== undefined && row.fixed_order_pack_qty !== null
        ? Number(row.fixed_order_pack_qty)
        : null,
    receiverLoginId,
    receiverName,
    receiverPhone: row.receiver_phone ? String(row.receiver_phone) : undefined,
    deliveryDetailLocation: row.delivery_detail_location
      ? String(row.delivery_detail_location)
      : undefined,
  };
}

export async function fetchInventoryItemsFromSupabase(): Promise<InventoryItem[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('inventory_items').select('*');
    if (error) {
      throw error;
    }
    if (!data) return null;
    return data.map((row) =>
      mapRowToInventoryItem(row, cachedAppMetadata.itemExtensions, cachedUserAccounts)
    );
  } catch (error: unknown) {
    handleSupabaseException('inventory_items', 'SELECT', error);
    return null;
  }
}

export async function upsertInventoryItemToSupabase(
  item: InventoryItem,
  _allItems?: InventoryItem[]
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase DB가 연결되지 않았습니다.');
    }

    const dbRow = mapInventoryItemToDbRow(item);
    const { error } = await client
      .from('inventory_items')
      .upsert(dbRow, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    if (syncItemExtensionToCache(item)) {
      await persistAppMetadata();
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('inventory_items', 'UPSERT', error);
  }
}

export async function batchUpsertInventoryItemsToSupabase(
  itemsToUpsert: InventoryItem[],
  _allItems?: InventoryItem[]
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase DB가 연결되지 않았습니다.');
    }

    if (itemsToUpsert.length === 0) {
      return { ok: true };
    }

    const dbRows = itemsToUpsert.map(mapInventoryItemToDbRow);
    const { error } = await client
      .from('inventory_items')
      .upsert(dbRows, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    let metaChanged = false;
    itemsToUpsert.forEach((it) => {
      if (syncItemExtensionToCache(it)) {
        metaChanged = true;
      }
    });
    if (metaChanged) {
      await persistAppMetadata();
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('inventory_items', 'BATCH_UPSERT', error);
  }
}

export async function deleteInventoryItemFromSupabase(
  itemId: string,
  _allItems?: InventoryItem[]
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase DB가 연결되지 않았습니다.');
    }

    const { error } = await client
      .from('inventory_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      throw error;
    }

    if (itemId in cachedAppMetadata.itemExtensions) {
      delete cachedAppMetadata.itemExtensions[itemId];
      await persistAppMetadata();
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('inventory_items', 'DELETE', error);
  }
}

// ============================================================================
// 3. 카테고리 (public.categories) 1:1 Direct CRUD
//    실제 DB 컬럼 (9개):
//    id, name, order_policy_type, safety_days, order_cycle_days,
//    default_trigger_pack_qty, default_order_pack_qty, description, delivery_location
// ============================================================================

export interface CategoryDbRow {
  id: string;
  name: string;
  order_policy_type: string | null;
  safety_days: number;
  order_cycle_days: number;
  default_trigger_pack_qty: number | null;
  default_order_pack_qty: number | null;
  description: string | null;
  delivery_location: string | null;
}

function mapCategoryToDbRow(c: Category): CategoryDbRow {
  return {
    id: String(c.id),
    name: String(c.name || ''),
    order_policy_type: c.orderPolicyType || 'DAYS_BASED',
    safety_days: Math.max(0, Math.round(Number(c.safetyDays ?? 15))),
    order_cycle_days: Math.max(0, Math.round(Number(c.orderCycleDays ?? 30))),
    default_trigger_pack_qty:
      c.defaultTriggerPackQty !== undefined && c.defaultTriggerPackQty !== null
        ? Number(c.defaultTriggerPackQty)
        : null,
    default_order_pack_qty:
      c.defaultOrderPackQty !== undefined && c.defaultOrderPackQty !== null
        ? Number(c.defaultOrderPackQty)
        : null,
    description: c.description ? String(c.description) : null,
    delivery_location: c.deliveryLocation ? String(c.deliveryLocation) : null,
  };
}

export async function fetchCategoriesFromSupabase(): Promise<Category[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('categories').select('*');
    if (error) {
      throw error;
    }
    if (!data) return null;
    return data.map((r: Record<string, any>) => {
      const id = String(r.id);
      const ext = cachedAppMetadata.categoryExtensions[id];
      return {
        id,
        name: String(r.name || ''),
        orderPolicyType: (r.order_policy_type ||
          'DAYS_BASED') as Category['orderPolicyType'],
        safetyDays: Number(r.safety_days ?? 15),
        orderCycleDays: Number(r.order_cycle_days ?? 30),
        defaultTriggerPackQty:
          r.default_trigger_pack_qty !== undefined && r.default_trigger_pack_qty !== null
            ? Number(r.default_trigger_pack_qty)
            : undefined,
        defaultOrderPackQty:
          r.default_order_pack_qty !== undefined && r.default_order_pack_qty !== null
            ? Number(r.default_order_pack_qty)
            : undefined,
        description: r.description ?? undefined,
        deliveryLocation: r.delivery_location ?? undefined,
        lineDeliveryLocations: ext?.lineDeliveryLocations ?? undefined,
      };
    });
  } catch (error: unknown) {
    handleSupabaseException('categories', 'SELECT', error);
    return null;
  }
}

export async function saveCategoriesToSupabase(
  categories: Category[]
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase DB가 연결되지 않았습니다.');
    }

    if (categories.length === 0) return { ok: true };

    const dbRows = categories.map(mapCategoryToDbRow);
    const { error } = await client
      .from('categories')
      .upsert(dbRows, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    let extChanged = false;
    categories.forEach((c) => {
      if (c.lineDeliveryLocations) {
        cachedAppMetadata.categoryExtensions[c.id] = {
          lineDeliveryLocations: c.lineDeliveryLocations,
        };
        extChanged = true;
      }
    });

    if (extChanged) {
      await persistAppMetadata();
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('categories', 'UPSERT', error);
  }
}

export async function deleteCategoryFromSupabase(
  categoryId: string
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase DB가 연결되지 않았습니다.');

    const { error } = await client.from('categories').delete().eq('id', categoryId);
    if (error) throw error;

    if (categoryId in cachedAppMetadata.categoryExtensions) {
      delete cachedAppMetadata.categoryExtensions[categoryId];
      await persistAppMetadata();
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('categories', 'DELETE', error);
  }
}

// ============================================================================
// 4. 공급업체 (public.vendors) 1:1 Direct CRUD
//    실제 DB 컬럼 (8개):
//    id, name, default_lead_time, is_active, phone, email, contact_person, address
// ============================================================================

export interface VendorDbRow {
  id: string;
  name: string;
  default_lead_time: number;
  is_active: boolean;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  address: string | null;
}

function mapVendorToDbRow(v: Vendor): VendorDbRow {
  return {
    id: String(v.id),
    name: String(v.name || ''),
    default_lead_time: Math.max(1, Math.round(Number(v.defaultLeadTime ?? 3))),
    is_active: v.isActive !== false,
    phone: v.phone ? String(v.phone) : null,
    email: v.email ? String(v.email) : null,
    contact_person: v.contactPerson ? String(v.contactPerson) : null,
    address: v.address ? String(v.address) : null,
  };
}

export async function fetchVendorsFromSupabase(): Promise<Vendor[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('vendors').select('*');
    if (error) {
      throw error;
    }
    if (!data) return null;
    return data.map((r: Record<string, any>) => ({
      id: String(r.id),
      name: String(r.name || ''),
      defaultLeadTime: Number(r.default_lead_time ?? 3),
      isActive: r.is_active !== false,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
      contactPerson: r.contact_person ?? undefined,
      address: r.address ?? undefined,
    }));
  } catch (error: unknown) {
    handleSupabaseException('vendors', 'SELECT', error);
    return null;
  }
}

export async function saveVendorsToSupabase(
  vendors: Vendor[]
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase DB가 연결되지 않았습니다.');
    }

    if (vendors.length === 0) return { ok: true };

    const dbRows = vendors.map(mapVendorToDbRow);
    const { error } = await client
      .from('vendors')
      .upsert(dbRows, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('vendors', 'UPSERT', error);
  }
}

export async function deleteVendorFromSupabase(
  vendorId: string
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase DB가 연결되지 않았습니다.');

    const { error } = await client.from('vendors').delete().eq('id', vendorId);
    if (error) throw error;
    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('vendors', 'DELETE', error);
  }
}

// ============================================================================
// 5. 발주 및 입고 이력 (public.order_history) 1:1 Direct CRUD
//    실제 DB 컬럼 (19개):
//    id, item_id, order_date, expected_arrival_date, completed_date, vendor_name,
//    vendor_id, line, item_name, spec, ordered_pack_qty, pack_unit, unit_conversion,
//    base_unit, unit_price, total_amount, delivery_location, status, note
// ============================================================================

export interface OrderHistoryDbRow {
  id: string;
  item_id: string | null;
  order_date: string;
  expected_arrival_date: string;
  completed_date: string | null;
  vendor_name: string;
  vendor_id: string | null;
  line: string;
  item_name: string;
  spec: string;
  ordered_pack_qty: number;
  pack_unit: string;
  unit_conversion: number | null;
  base_unit: string | null;
  unit_price: number;
  total_amount: number;
  delivery_location: string;
  status: string;
  note: string | null;
}

function mapOrderHistoryToDbRow(r: OrderHistoryRecord): OrderHistoryDbRow {
  return {
    id: String(r.id),
    item_id: r.itemId ? String(r.itemId) : null,
    order_date: String(r.orderDate || TODAY_STR),
    expected_arrival_date: String(r.expectedArrivalDate || TODAY_STR),
    completed_date: r.completedDate ? String(r.completedDate) : null,
    vendor_name: String(r.vendorName || ''),
    vendor_id: r.vendorId ? String(r.vendorId) : null,
    line: String(r.line || 'SL1'),
    item_name: String(r.itemName || ''),
    spec: String(r.spec || ''),
    ordered_pack_qty: Number.isFinite(Number(r.orderedPackQty))
      ? Number(r.orderedPackQty)
      : 0,
    pack_unit: String(r.packUnit || 'EA'),
    unit_conversion: Number.isFinite(Number(r.unitConversion))
      ? Number(r.unitConversion)
      : 1,
    base_unit: r.baseUnit ? String(r.baseUnit) : 'EA',
    unit_price: Number.isFinite(Number(r.unitPrice)) ? Number(r.unitPrice) : 0,
    total_amount: Number.isFinite(Number(r.totalAmount)) ? Number(r.totalAmount) : 0,
    delivery_location: String(r.deliveryLocation || ''),
    status: String(r.status || '입고대기'),
    note: r.note ? String(r.note) : null,
  };
}

export async function fetchOrderHistoryFromSupabase(): Promise<OrderHistoryRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('order_history').select('*');
    if (error) {
      throw error;
    }
    if (!data) return null;
    const mapped = data.map((r: Record<string, any>) => ({
      id: String(r.id),
      itemId: r.item_id ?? undefined,
      orderDate: String(r.order_date ?? ''),
      expectedArrivalDate: String(r.expected_arrival_date ?? ''),
      completedDate: r.completed_date ?? null,
      vendorName: String(r.vendor_name ?? ''),
      vendorId: r.vendor_id ?? undefined,
      line: (r.line || 'SL1') as ProductionLine,
      itemName: String(r.item_name ?? ''),
      spec: String(r.spec ?? ''),
      orderedPackQty: Number(r.ordered_pack_qty ?? 0),
      packUnit: String(r.pack_unit ?? 'EA'),
      unitConversion: Number(r.unit_conversion ?? 1),
      baseUnit: String(r.base_unit ?? 'EA'),
      unitPrice: Number(r.unit_price ?? 0),
      totalAmount: Number(r.total_amount ?? 0),
      deliveryLocation: String(r.delivery_location ?? ''),
      status: (r.status || '입고대기') as OrderHistoryRecord['status'],
      note: r.note ?? undefined,
    }));
    return mapped.sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  } catch (error: unknown) {
    handleSupabaseException('order_history', 'SELECT', error);
    return null;
  }
}

export async function saveOrderHistoryToSupabase(
  orderHistory: OrderHistoryRecord[]
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase DB가 연결되지 않았습니다.');
    }

    if (orderHistory.length === 0) return { ok: true };

    const slice = orderHistory.slice(0, 500).map(mapOrderHistoryToDbRow);
    const { error } = await client
      .from('order_history')
      .upsert(slice, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('order_history', 'UPSERT', error);
  }
}

export async function deleteOrderHistoryFromSupabase(
  recordId: string
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase DB가 연결되지 않았습니다.');

    const { error } = await client.from('order_history').delete().eq('id', recordId);
    if (error) throw error;
    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('order_history', 'DELETE', error);
  }
}

// ============================================================================
// 6. 현장 실사 및 사용량 로그 (public.usage_logs) 1:1 Direct CRUD
//    실제 DB 컬럼 (16개):
//    id, item_id, item_name, spec, line, category_id, category_name, date, month,
//    pack_used_qty, base_used_qty, unit_price, total_cost, base_unit, pack_unit, recorded_via
// ============================================================================

export interface UsageLogDbRow {
  id: string;
  item_id: string;
  item_name: string;
  spec: string;
  line: string;
  category_id: string;
  category_name: string;
  date: string;
  month: string;
  pack_used_qty: number;
  base_used_qty: number;
  unit_price: number;
  total_cost: number;
  base_unit: string;
  pack_unit: string;
  recorded_via: string;
}

function mapUsageLogToDbRow(u: UsageLog): UsageLogDbRow {
  return {
    id: String(u.id),
    item_id: String(u.itemId || ''),
    item_name: String(u.itemName || ''),
    spec: String(u.spec || ''),
    line: String(u.line || 'SL1'),
    category_id: String(u.categoryId || ''),
    category_name: String(u.categoryName || '기타'),
    date: String(u.date || TODAY_STR),
    month: String(u.month || TODAY_STR.substring(0, 7)),
    pack_used_qty: Number.isFinite(Number(u.packUsedQty)) ? Number(u.packUsedQty) : 0,
    base_used_qty: Number.isFinite(Number(u.baseUsedQty)) ? Number(u.baseUsedQty) : 0,
    unit_price: Number.isFinite(Number(u.unitPrice)) ? Number(u.unitPrice) : 0,
    total_cost: Number.isFinite(Number(u.totalCost)) ? Number(u.totalCost) : 0,
    base_unit: String(u.baseUnit || 'EA'),
    pack_unit: String(u.packUnit || 'EA'),
    recorded_via: String(u.recordedVia || 'audit'),
  };
}

export async function fetchUsageLogsFromSupabase(): Promise<UsageLog[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('usage_logs').select('*');
    if (error) {
      throw error;
    }
    if (!data) return null;
    const mapped = data.map((r: Record<string, any>) => ({
      id: String(r.id),
      itemId: String(r.item_id ?? ''),
      itemName: String(r.item_name ?? ''),
      spec: String(r.spec ?? ''),
      line: (r.line || 'SL1') as ProductionLine,
      categoryId: String(r.category_id ?? ''),
      categoryName: String(r.category_name ?? '기타'),
      date: String(r.date ?? ''),
      month: String(r.month ?? ''),
      packUsedQty: Number(r.pack_used_qty ?? 0),
      baseUsedQty: Number(r.base_used_qty ?? 0),
      unitPrice: Number(r.unit_price ?? 0),
      totalCost: Number(r.total_cost ?? 0),
      baseUnit: String(r.base_unit ?? 'EA'),
      packUnit: String(r.pack_unit ?? 'EA'),
      recordedVia: (r.recorded_via || 'audit') as UsageLog['recordedVia'],
    }));
    return mapped.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error: unknown) {
    handleSupabaseException('usage_logs', 'SELECT', error);
    return null;
  }
}

export async function saveUsageLogsToSupabase(
  usageLogs: UsageLog[]
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase DB가 연결되지 않았습니다.');
    }

    if (usageLogs.length === 0) return { ok: true };

    const slice = usageLogs.slice(0, 500).map(mapUsageLogToDbRow);
    const { error } = await client
      .from('usage_logs')
      .upsert(slice, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('usage_logs', 'UPSERT', error);
  }
}

// ============================================================================
// 7. 회사 프로필, 단위, 메모, 변경 이력(Audit Log) (public.company_profile JSONB 연동)
// ============================================================================

export async function saveCompanyProfileToSupabase(
  companyProfile: CompanyProfile
): Promise<SupabaseMutationResult> {
  return upsertCompanyProfileDoc(COMPANY_PROFILE_DOC_IDS.COMPANY_PROFILE, companyProfile);
}

export async function saveUnitsToSupabase(units: Unit[]): Promise<SupabaseMutationResult> {
  cachedAppMetadata.units = units;
  return persistAppMetadata();
}

export async function saveMemoToSupabase(memo: string): Promise<SupabaseMutationResult> {
  cachedAppMetadata.memo = memo;
  return persistAppMetadata();
}

export async function saveLastAuditTimestampToSupabase(
  lastAuditTimestamp: string
): Promise<SupabaseMutationResult> {
  cachedAppMetadata.lastAuditTimestamp = lastAuditTimestamp;
  return persistAppMetadata();
}

export async function insertAuditLogToSupabase(
  _log: AuditLogRecord,
  allAuditLogs?: AuditLogRecord[]
): Promise<SupabaseMutationResult> {
  if (!allAuditLogs) return { ok: true };
  return upsertCompanyProfileDoc(COMPANY_PROFILE_DOC_IDS.AUDIT_LOGS, {
    logs: allAuditLogs.slice(0, 2000),
  });
}

export async function clearAuditLogsInSupabase(): Promise<SupabaseMutationResult> {
  return upsertCompanyProfileDoc(COMPANY_PROFILE_DOC_IDS.AUDIT_LOGS, {
    logs: [],
  });
}

// ============================================================================
// 8. 전체 클라우드 데이터 통합 조회 (Single Source of Truth)
// ============================================================================

export interface CloudSnapshot {
  items: InventoryItem[] | null;
  categories: Category[] | null;
  vendors: Vendor[] | null;
  units: Unit[] | null;
  orderHistory: OrderHistoryRecord[] | null;
  usageLogs: UsageLog[] | null;
  auditLogs: AuditLogRecord[] | null;
  userAccounts: UserAccount[] | null;
  userPasswords: Record<string, string> | null;
  companyProfile: CompanyProfile | null;
  memo: string | null;
  lastAuditTimestamp: string | null;
}

/**
 * 앱 최초 실행(Mount) 시 또는 수동 새로고침 시 오직 Supabase 클라우드 DB의 실제 6개 테이블에서만
 * 전체 데이터를 실시간으로 조회하여 반환합니다.
 */
export async function fetchAllCloudDataFromSupabase(): Promise<CloudSnapshot | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    // 1) company_profile 테이블의 모든 JSONB 문서를 단일 쿼리로 먼저 로드
    const { data: profileDocs, error: profileErr } = await client
      .from('company_profile')
      .select('id, data, updated_at');

    if (profileErr) {
      handleSupabaseException('company_profile', 'SELECT', profileErr);
    }

    let loadedCompanyProfile: CompanyProfile | null = null;
    let loadedAuditLogs: AuditLogRecord[] | null = null;
    let loadedUserAccounts: UserAccount[] | null = null;
    let loadedUserPasswords: Record<string, string> = { admin: '1234' };

    if (profileDocs && Array.isArray(profileDocs)) {
      for (const row of profileDocs) {
        if (!row || !row.id || row.data === undefined || row.data === null) continue;

        if (row.id === COMPANY_PROFILE_DOC_IDS.COMPANY_PROFILE) {
          loadedCompanyProfile = row.data as CompanyProfile;
        } else if (row.id === COMPANY_PROFILE_DOC_IDS.APP_METADATA) {
          const meta = row.data as Partial<AppMetadataPayload>;
          cachedAppMetadata = {
            units: Array.isArray(meta.units) && meta.units.length > 0 ? meta.units : INITIAL_UNITS,
            memo: typeof meta.memo === 'string' ? meta.memo : INITIAL_MEMO,
            lastAuditTimestamp:
              typeof meta.lastAuditTimestamp === 'string'
                ? meta.lastAuditTimestamp
                : `${TODAY_STR} 실사 대기`,
            itemExtensions: meta.itemExtensions || {},
            categoryExtensions: meta.categoryExtensions || {},
          };
        } else if (row.id === COMPANY_PROFILE_DOC_IDS.AUDIT_LOGS) {
          const auditPayload = row.data as { logs?: AuditLogRecord[] } | AuditLogRecord[];
          if (Array.isArray(auditPayload)) {
            loadedAuditLogs = auditPayload;
          } else if (auditPayload && Array.isArray(auditPayload.logs)) {
            loadedAuditLogs = auditPayload.logs;
          }
        } else if (row.id === COMPANY_PROFILE_DOC_IDS.USER_ACCOUNTS) {
          const accPayload = row.data as UserAccountsDocPayload | UserAccountDbRow[];
          const rawAccounts = Array.isArray(accPayload)
            ? accPayload
            : Array.isArray(accPayload.accounts)
            ? accPayload.accounts
            : [];
          const mapped = ensureDefaultAdminAccount(rawAccounts.map(mapDbRowToUserAccount));
          const pwMap: Record<string, string> = {
            admin: '1234',
            ...(!Array.isArray(accPayload) && accPayload.passwords ? accPayload.passwords : {}),
          };
          mapped.forEach((acc) => {
            if (acc.username && acc.password) {
              pwMap[acc.username] = acc.password;
            }
          });
          loadedUserAccounts = mapped;
          loadedUserPasswords = pwMap;
          cachedUserAccounts = mapped;
          cachedUserPasswords = pwMap;
        }
      }
    }

    // 2) 나머지 5개 정규화 테이블 병렬 조회
    const [
      tableItems,
      tableCategories,
      tableVendors,
      tableOrderHistory,
      tableUsageLogs,
    ] = await Promise.all([
      fetchInventoryItemsFromSupabase(),
      fetchCategoriesFromSupabase(),
      fetchVendorsFromSupabase(),
      fetchOrderHistoryFromSupabase(),
      fetchUsageLogsFromSupabase(),
    ]);

    return {
      items: tableItems,
      categories: tableCategories,
      vendors: tableVendors,
      units: cachedAppMetadata.units,
      orderHistory: tableOrderHistory,
      usageLogs: tableUsageLogs,
      auditLogs: loadedAuditLogs,
      userAccounts: loadedUserAccounts,
      userPasswords: loadedUserPasswords,
      companyProfile: loadedCompanyProfile,
      memo: cachedAppMetadata.memo,
      lastAuditTimestamp: cachedAppMetadata.lastAuditTimestamp,
    };
  } catch (e) {
    console.error('[Supabase Exception] fetchAllCloudDataFromSupabase:', e);
    return null;
  }
}

/**
 * 클라우드 DB 전체 초기화 (최고관리자 전용)
 */
export async function resetAllCloudDataInSupabase(
  defaultProfile = INITIAL_COMPANY_PROFILE,
  defaultAccounts = INITIAL_USER_ACCOUNTS,
  defaultUnits = INITIAL_UNITS,
  defaultMemo = INITIAL_MEMO
): Promise<SupabaseMutationResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase DB가 연결되지 않았습니다.');
    }

    const deleteResults = await Promise.all([
      client.from('inventory_items').delete().neq('id', ''),
      client.from('categories').delete().neq('id', ''),
      client.from('vendors').delete().neq('id', ''),
      client.from('order_history').delete().neq('id', ''),
      client.from('usage_logs').delete().neq('id', ''),
    ]);

    for (const res of deleteResults) {
      if (res.error) {
        throw res.error;
      }
    }

    cachedAppMetadata = {
      units: defaultUnits,
      memo: defaultMemo,
      lastAuditTimestamp: `${TODAY_STR} 실사 대기`,
      itemExtensions: {},
      categoryExtensions: {},
    };

    const ensuredAccounts = ensureDefaultAdminAccount(defaultAccounts);
    const defaultPwMap: Record<string, string> = { admin: '1234' };
    ensuredAccounts.forEach((a) => {
      defaultPwMap[a.username] = a.password || '1234';
    });

    const [profileRes, accRes, metaRes, auditRes] = await Promise.all([
      saveCompanyProfileToSupabase(defaultProfile),
      saveUserAccountsPayloadToSupabase(ensuredAccounts, defaultPwMap),
      persistAppMetadata(),
      clearAuditLogsInSupabase(),
    ]);

    const failed = [profileRes, accRes, metaRes, auditRes].find((r) => !r.ok);
    if (failed) {
      return {
        ok: false,
        errorMessage: failed.errorMessage,
      };
    }

    return { ok: true };
  } catch (error: unknown) {
    return handleSupabaseException('all_tables', 'RESET', error);
  }
}
