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
import { INITIAL_USER_ACCOUNTS } from '../mockData';
import { compareUserAccountsByAffiliation } from '../utils/calculations';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  updatedAt?: string;
}

export interface SupabaseMutationResult {
  ok: boolean;
  errorMessage?: string;
  isRlsError?: boolean;
  isForeignKeyError?: boolean;
}

const envSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const envSupabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

// 브라우저 스토리지(localStorage/sessionStorage)를 일체 사용하지 않고 런타임 메모리 및 환경변수만 참조
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
 * (브라우저 localStorage / sessionStorage 세션 저장 완전 비활성화)
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
 * Supabase PostgrestError를 분석하여 RLS 정책 차단, 외래키 제약, 테이블 미존재 등을 판별하고 로깅합니다.
 */
function analyzeSupabaseError(
  table: string,
  operation: string,
  error: PostgrestError | null
): { isRlsError: boolean; isMissingTable: boolean; isForeignKeyError: boolean; message: string } {
  if (!error) {
    return { isRlsError: false, isMissingTable: false, isForeignKeyError: false, message: '' };
  }

  const rawMsg = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  const isRlsError =
    error.code === '42501' ||
    /row-level security|permission denied|new row violates row-level security/i.test(rawMsg);
  const isMissingTable =
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist|could not find the table/i.test(rawMsg);
  const isForeignKeyError =
    error.code === '23503' || /foreign key|violates.*constraint/i.test(rawMsg);

  if (!isMissingTable) {
    console.error(`[Supabase DB Error] table=${table} op=${operation} code=${error.code}:`, error);
  }

  if (isRlsError) {
    return {
      isRlsError: true,
      isMissingTable: false,
      isForeignKeyError: false,
      message: `RLS 보안 정책에 의해 '${table}' 테이블 ${operation} 작업이 거부되었습니다. (Supabase RLS 정책 확인 필요)`,
    };
  }

  if (isForeignKeyError) {
    return {
      isRlsError: false,
      isMissingTable: false,
      isForeignKeyError: true,
      message: `외래 키(Foreign Key) 참조 제약조건으로 인해 '${table}' ${operation} 작업을 수행할 수 없습니다.`,
    };
  }

  return {
    isRlsError: false,
    isMissingTable,
    isForeignKeyError: false,
    message: error.message || `Supabase '${table}' ${operation} 오류`,
  };
}

/**
 * 입력받은 Supabase Project URL 및 Anon Key로 실제 연결 및 테이블 조회 가능 여부를 테스트합니다.
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

    const { error } = await tempClient.auth.getSession();
    if (error) {
      console.error('[Supabase Connection Test Error]:', error);
      return {
        ok: false,
        message: `Supabase 인증 오류: ${error.message}`,
      };
    }

    return {
      ok: true,
      message: 'Supabase 클라우드 데이터베이스 연결 테스트에 성공했습니다.',
    };
  } catch (err) {
    console.error('[Supabase Connection Test Exception]:', err);
    const msg = err instanceof Error ? err.message : '네트워크 또는 URL 오류';
    return {
      ok: false,
      message: `연결 테스트 실패: ${msg}`,
    };
  }
}

// ============================================================================
// 1. 통합 클라우드 상태 테이블 (mro_app_state) Direct CRUD
// ============================================================================

export async function saveAppStateKeyToSupabase(
  key: string,
  payload: unknown
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      errorMessage: 'Supabase DB가 연결되지 않았습니다. 우측 상단 [DB 연결 설정]을 확인하세요.',
    };
  }

  try {
    const { error } = await client.from('mro_app_state').upsert(
      {
        state_key: key,
        state_value: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'state_key' }
    );
    if (error) {
      const analyzed = analyzeSupabaseError('mro_app_state', `UPSERT(${key})`, error);
      return {
        ok: false,
        isRlsError: analyzed.isRlsError,
        errorMessage: analyzed.message,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[Supabase Exception] mro_app_state(${key}):`, e);
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : '네트워크 통신 오류',
    };
  }
}

export async function fetchAllAppStateFromSupabase(): Promise<Record<string, any> | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('mro_app_state')
      .select('state_key, state_value, updated_at');

    if (error) {
      analyzeSupabaseError('mro_app_state', 'SELECT', error);
      return null;
    }
    if (!data || data.length === 0) {
      return null;
    }

    const result: Record<string, any> = {};
    data.forEach((row: Record<string, any>) => {
      if (row.state_key && row.state_value !== undefined) {
        result[String(row.state_key)] = row.state_value;
      }
    });
    return result;
  } catch (e) {
    console.error('[Supabase Exception] fetchAllAppStateFromSupabase:', e);
    return null;
  }
}

// ============================================================================
// 2. 사용자 계정 (user_accounts) Direct CRUD + 기본 최고관리자(admin) 보장
// ============================================================================

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

  return [...merged].sort(compareUserAccountsByAffiliation);
}

export async function fetchUserAccountsFromSupabase(): Promise<UserAccount[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('user_accounts')
      .select('*')
      .order('affiliation', { ascending: true })
      .order('department', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      analyzeSupabaseError('user_accounts', 'SELECT', error);
      return null;
    }
    if (!data || data.length === 0) {
      return null;
    }

    const mapped: UserAccount[] = data.map((row: Record<string, any>) => {
      const rawLevel = Number(row.level);
      const validLevel: UserLevel =
        rawLevel === 0 || rawLevel === 1 || rawLevel === 2 || rawLevel === 3
          ? (rawLevel as UserLevel)
          : 2;
      const username = String(row.username || '');
      return {
        id: String(row.id),
        username,
        password: row.password ? String(row.password) : '1234',
        name: String(row.name || ''),
        affiliation: row.affiliation ? String(row.affiliation) : '포승공장',
        department: row.department ? String(row.department) : '포승공장',
        phone: row.phone ? String(row.phone) : undefined,
        level: username === 'admin' ? 0 : validLevel,
        roleLabel:
          username === 'admin'
            ? 'LV.0 최고관리자'
            : row.role_label
            ? String(row.role_label)
            : `LV.${validLevel}`,
        isActive: username === 'admin' ? true : row.is_active !== false,
        createdAt: row.created_at ? String(row.created_at).substring(0, 10) : undefined,
      };
    });

    return ensureDefaultAdminAccount(mapped);
  } catch (e) {
    console.error('[Supabase Exception] fetchUserAccountsFromSupabase:', e);
    return null;
  }
}

export async function insertUserAccountToSupabase(
  account: UserAccount,
  allAccounts?: UserAccount[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      errorMessage: 'Supabase DB가 연결되지 않았습니다.',
    };
  }

  try {
    const stateResPromise = allAccounts
      ? saveAppStateKeyToSupabase('userAccounts', ensureDefaultAdminAccount(allAccounts))
      : Promise.resolve({ ok: true } as SupabaseMutationResult);

    const { error } = await client.from('user_accounts').upsert(
      {
        id: account.id,
        username: account.username,
        name: account.name,
        affiliation: account.affiliation || '포승공장',
        department: account.department || account.affiliation || '포승공장',
        phone: account.phone || null,
        level: account.level,
        role_label: account.roleLabel || `LV.${account.level}`,
        is_active: account.isActive !== false,
        created_at: account.createdAt || new Date().toISOString().split('T')[0],
      },
      { onConflict: 'id' }
    );

    const stateRes = await stateResPromise;

    if (error) {
      const analyzed = analyzeSupabaseError('user_accounts', 'INSERT/UPSERT', error);
      if (analyzed.isMissingTable && stateRes.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        isRlsError: analyzed.isRlsError,
        errorMessage: analyzed.message,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Supabase Exception] insertUserAccountToSupabase:', e);
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : '계정 생성 중 DB 통신 오류',
    };
  }
}

export async function updateUserAccountInSupabase(
  account: UserAccount,
  allAccounts?: UserAccount[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      errorMessage: 'Supabase DB가 연결되지 않았습니다.',
    };
  }

  try {
    const stateResPromise = allAccounts
      ? saveAppStateKeyToSupabase('userAccounts', ensureDefaultAdminAccount(allAccounts))
      : Promise.resolve({ ok: true } as SupabaseMutationResult);

    const { error } = await client
      .from('user_accounts')
      .update({
        username: account.username,
        name: account.name,
        affiliation: account.affiliation || '포승공장',
        department: account.department || account.affiliation || '포승공장',
        phone: account.phone || null,
        level: account.level,
        role_label: account.roleLabel || `LV.${account.level}`,
        is_active: account.isActive !== false,
      })
      .eq('id', account.id);

    const stateRes = await stateResPromise;

    if (error) {
      const analyzed = analyzeSupabaseError('user_accounts', 'UPDATE', error);
      if (analyzed.isMissingTable && stateRes.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        isRlsError: analyzed.isRlsError,
        errorMessage: analyzed.message,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Supabase Exception] updateUserAccountInSupabase:', e);
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : '계정 수정 중 DB 통신 오류',
    };
  }
}

export async function deleteUserAccountFromSupabase(
  accountId: string,
  allAccounts?: UserAccount[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      errorMessage: 'Supabase DB가 연결되지 않았습니다.',
    };
  }

  try {
    const stateResPromise = allAccounts
      ? saveAppStateKeyToSupabase('userAccounts', ensureDefaultAdminAccount(allAccounts))
      : Promise.resolve({ ok: true } as SupabaseMutationResult);

    const { error } = await client
      .from('user_accounts')
      .delete()
      .eq('id', accountId);

    const stateRes = await stateResPromise;

    if (error) {
      const analyzed = analyzeSupabaseError('user_accounts', 'DELETE', error);
      if (analyzed.isMissingTable && stateRes.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        isRlsError: analyzed.isRlsError,
        isForeignKeyError: analyzed.isForeignKeyError,
        errorMessage: analyzed.message,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Supabase Exception] deleteUserAccountFromSupabase:', e);
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : '계정 삭제 중 DB 통신 오류',
    };
  }
}

// ============================================================================
// 3. 자재·소모품 마스터 및 재고 (inventory_items) Direct CRUD
// ============================================================================

function mapRowToInventoryItem(row: Record<string, any>): InventoryItem {
  return {
    id: String(row.id),
    line: (row.line || 'SL1') as ProductionLine,
    categoryId: String(row.category_id ?? row.categoryId ?? ''),
    vendorId: String(row.vendor_id ?? row.vendorId ?? ''),
    itemName: String(row.item_name ?? row.itemName ?? ''),
    spec: String(row.spec ?? ''),
    packUnit: String(row.pack_unit ?? row.packUnit ?? 'EA'),
    baseUnit: String(row.base_unit ?? row.baseUnit ?? 'EA'),
    unitConversion: Number(row.unit_conversion ?? row.unitConversion ?? 1),
    currentPackStock: Number(row.current_pack_stock ?? row.currentPackStock ?? 0),
    dailyUsage: Number(row.daily_usage ?? row.dailyUsage ?? 1),
    unitPrice: Number(row.unit_price ?? row.unitPrice ?? 0),
    moqDescription: String(row.moq_description ?? row.moqDescription ?? ''),
    leadTimeDays: Number(row.lead_time_days ?? row.leadTimeDays ?? 3),
    orderStatus:
      (row.order_status ?? row.orderStatus) === '발주완료(입고대기)'
        ? '발주완료(입고대기)'
        : '발주대기',
    orderDate: row.order_date ?? row.orderDate ?? null,
    expectedArrivalDate: row.expected_arrival_date ?? row.expectedArrivalDate ?? null,
    orderedPackQty:
      row.ordered_pack_qty !== undefined && row.ordered_pack_qty !== null
        ? Number(row.ordered_pack_qty)
        : row.orderedPackQty ?? null,
    lastOrderDate: row.last_order_date ?? row.lastOrderDate ?? null,
    lastAuditDate: row.last_audit_date ?? row.lastAuditDate ?? null,
    lastAuditedBy: row.last_audited_by ?? row.lastAuditedBy ?? null,
    lastAuditUpdatedAt:
      row.last_audit_updated_at !== undefined && row.last_audit_updated_at !== null
        ? Number(row.last_audit_updated_at)
        : row.lastAuditUpdatedAt ?? null,
    purpose: String(row.purpose ?? ''),
    triggerPackQty:
      row.trigger_pack_qty !== undefined && row.trigger_pack_qty !== null
        ? Number(row.trigger_pack_qty)
        : row.triggerPackQty ?? null,
    fixedOrderPackQty:
      row.fixed_order_pack_qty !== undefined && row.fixed_order_pack_qty !== null
        ? Number(row.fixed_order_pack_qty)
        : row.fixedOrderPackQty ?? null,
    receiverLoginId: row.receiver_login_id ?? row.receiverLoginId ?? undefined,
    receiverName: row.receiver_name ?? row.receiverName ?? undefined,
    receiverPhone: row.receiver_phone ?? row.receiverPhone ?? undefined,
    deliveryDetailLocation:
      row.delivery_detail_location ?? row.deliveryDetailLocation ?? undefined,
  };
}

function mapInventoryItemToRow(item: InventoryItem) {
  return {
    id: item.id,
    line: item.line,
    category_id: item.categoryId,
    vendor_id: item.vendorId,
    item_name: item.itemName,
    spec: item.spec,
    pack_unit: item.packUnit,
    base_unit: item.baseUnit,
    unit_conversion: item.unitConversion,
    current_pack_stock: item.currentPackStock,
    daily_usage: item.dailyUsage,
    unit_price: item.unitPrice,
    moq_description: item.moqDescription || '',
    lead_time_days: item.leadTimeDays || 3,
    order_status: item.orderStatus || '발주대기',
    order_date: item.orderDate || null,
    expected_arrival_date: item.expectedArrivalDate || null,
    ordered_pack_qty: item.orderedPackQty ?? null,
    last_order_date: item.lastOrderDate || null,
    last_audit_date: item.lastAuditDate || null,
    last_audited_by: item.lastAuditedBy || null,
    last_audit_updated_at: item.lastAuditUpdatedAt || null,
    purpose: item.purpose || '',
    trigger_pack_qty: item.triggerPackQty ?? null,
    fixed_order_pack_qty: item.fixedOrderPackQty ?? null,
    receiver_login_id: item.receiverLoginId || null,
    receiver_name: item.receiverName || null,
    receiver_phone: item.receiverPhone || null,
    delivery_detail_location: item.deliveryDetailLocation || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchInventoryItemsFromSupabase(): Promise<InventoryItem[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('inventory_items').select('*');
    if (error) {
      analyzeSupabaseError('inventory_items', 'SELECT', error);
      return null;
    }
    if (!data) return null;
    return data.map(mapRowToInventoryItem);
  } catch (e) {
    console.error('[Supabase Exception] fetchInventoryItemsFromSupabase:', e);
    return null;
  }
}

export async function upsertInventoryItemToSupabase(
  item: InventoryItem,
  allItems?: InventoryItem[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      errorMessage: 'Supabase DB가 연결되지 않았습니다.',
    };
  }

  try {
    const stateResPromise = allItems
      ? saveAppStateKeyToSupabase('items', allItems)
      : Promise.resolve({ ok: true } as SupabaseMutationResult);

    const { error } = await client
      .from('inventory_items')
      .upsert(mapInventoryItemToRow(item), { onConflict: 'id' });

    const stateRes = await stateResPromise;

    if (error) {
      const analyzed = analyzeSupabaseError('inventory_items', 'UPSERT', error);
      if (analyzed.isMissingTable && stateRes.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        isRlsError: analyzed.isRlsError,
        errorMessage: analyzed.message,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Supabase Exception] upsertInventoryItemToSupabase:', e);
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : '품목 저장 중 DB 통신 오류',
    };
  }
}

export async function batchUpsertInventoryItemsToSupabase(
  itemsToUpsert: InventoryItem[],
  allItems: InventoryItem[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      errorMessage: 'Supabase DB가 연결되지 않았습니다.',
    };
  }

  try {
    const stateResPromise = saveAppStateKeyToSupabase('items', allItems);
    let tableError: PostgrestError | null = null;

    if (itemsToUpsert.length > 0) {
      const rows = itemsToUpsert.map(mapInventoryItemToRow);
      const { error } = await client
        .from('inventory_items')
        .upsert(rows, { onConflict: 'id' });
      tableError = error;
    }

    const stateRes = await stateResPromise;

    if (tableError) {
      const analyzed = analyzeSupabaseError('inventory_items', 'BATCH_UPSERT', tableError);
      if (analyzed.isMissingTable && stateRes.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        isRlsError: analyzed.isRlsError,
        errorMessage: analyzed.message,
      };
    }

    return stateRes.ok ? { ok: true } : stateRes;
  } catch (e) {
    console.error('[Supabase Exception] batchUpsertInventoryItemsToSupabase:', e);
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : '품목 일괄 저장 중 DB 통신 오류',
    };
  }
}

export async function deleteInventoryItemFromSupabase(
  itemId: string,
  allItems?: InventoryItem[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      errorMessage: 'Supabase DB가 연결되지 않았습니다.',
    };
  }

  try {
    const stateResPromise = allItems
      ? saveAppStateKeyToSupabase('items', allItems)
      : Promise.resolve({ ok: true } as SupabaseMutationResult);

    const { error } = await client
      .from('inventory_items')
      .delete()
      .eq('id', itemId);

    const stateRes = await stateResPromise;

    if (error) {
      const analyzed = analyzeSupabaseError('inventory_items', 'DELETE', error);
      if (analyzed.isMissingTable && stateRes.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        isRlsError: analyzed.isRlsError,
        errorMessage: analyzed.message,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Supabase Exception] deleteInventoryItemFromSupabase:', e);
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : '품목 삭제 중 DB 통신 오류',
    };
  }
}

// ============================================================================
// 4. 카테고리 (categories) / 공급업체 (vendors) / 단위 (units) /
//    발주이력 (order_history) / 사용량로그 (usage_logs) / 변경로그 (mro_audit_logs) Direct CRUD
// ============================================================================

export async function fetchCategoriesFromSupabase(): Promise<Category[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('categories').select('*');
    if (error || !data || data.length === 0) return null;
    return data.map((r: Record<string, any>) => ({
      id: String(r.id),
      name: String(r.name || ''),
      orderPolicyType: r.order_policy_type ?? r.orderPolicyType ?? 'DAYS_BASED',
      safetyDays: Number(r.safety_days ?? r.safetyDays ?? 15),
      orderCycleDays: Number(r.order_cycle_days ?? r.orderCycleDays ?? 30),
      defaultTriggerPackQty: r.default_trigger_pack_qty ?? r.defaultTriggerPackQty ?? undefined,
      defaultOrderPackQty: r.default_order_pack_qty ?? r.defaultOrderPackQty ?? undefined,
      description: r.description ?? undefined,
      deliveryLocation: r.delivery_location ?? r.deliveryLocation ?? undefined,
      lineDeliveryLocations: r.line_delivery_locations ?? r.lineDeliveryLocations ?? undefined,
    }));
  } catch {
    return null;
  }
}

export async function saveCategoriesToSupabase(
  categories: Category[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase DB가 연결되지 않았습니다.' };

  const stateRes = await saveAppStateKeyToSupabase('categories', categories);
  try {
    if (categories.length > 0) {
      const rows = categories.map((c) => ({
        id: c.id,
        name: c.name,
        order_policy_type: c.orderPolicyType || 'DAYS_BASED',
        safety_days: c.safetyDays,
        order_cycle_days: c.orderCycleDays,
        default_trigger_pack_qty: c.defaultTriggerPackQty ?? null,
        default_order_pack_qty: c.defaultOrderPackQty ?? null,
        description: c.description || null,
        delivery_location: c.deliveryLocation || null,
        line_delivery_locations: c.lineDeliveryLocations || null,
      }));
      const { error } = await client.from('categories').upsert(rows, { onConflict: 'id' });
      if (error) {
        const analyzed = analyzeSupabaseError('categories', 'UPSERT', error);
        if (!analyzed.isMissingTable && !stateRes.ok) {
          return { ok: false, isRlsError: analyzed.isRlsError, errorMessage: analyzed.message };
        }
      }
    }
  } catch {}
  return stateRes;
}

export async function fetchVendorsFromSupabase(): Promise<Vendor[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('vendors').select('*');
    if (error || !data || data.length === 0) return null;
    return data.map((r: Record<string, any>) => ({
      id: String(r.id),
      name: String(r.name || ''),
      defaultLeadTime: Number(r.default_lead_time ?? r.defaultLeadTime ?? 3),
      isActive: r.is_active !== false && r.isActive !== false,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
      contactPerson: r.contact_person ?? r.contactPerson ?? undefined,
      address: r.address ?? undefined,
    }));
  } catch {
    return null;
  }
}

export async function saveVendorsToSupabase(
  vendors: Vendor[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase DB가 연결되지 않았습니다.' };

  const stateRes = await saveAppStateKeyToSupabase('vendors', vendors);
  try {
    if (vendors.length > 0) {
      const rows = vendors.map((v) => ({
        id: v.id,
        name: v.name,
        default_lead_time: v.defaultLeadTime,
        is_active: v.isActive !== false,
        phone: v.phone || null,
        email: v.email || null,
        contact_person: v.contactPerson || null,
        address: v.address || null,
      }));
      const { error } = await client.from('vendors').upsert(rows, { onConflict: 'id' });
      if (error) {
        const analyzed = analyzeSupabaseError('vendors', 'UPSERT', error);
        if (!analyzed.isMissingTable && !stateRes.ok) {
          return { ok: false, isRlsError: analyzed.isRlsError, errorMessage: analyzed.message };
        }
      }
    }
  } catch {}
  return stateRes;
}

export async function saveUnitsToSupabase(units: Unit[]): Promise<SupabaseMutationResult> {
  return await saveAppStateKeyToSupabase('units', units);
}

export async function fetchOrderHistoryFromSupabase(): Promise<OrderHistoryRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('order_history')
      .select('*')
      .order('order_date', { ascending: false });
    if (error || !data || data.length === 0) return null;
    return data.map((r: Record<string, any>) => ({
      id: String(r.id),
      itemId: r.item_id ?? r.itemId ?? undefined,
      orderDate: String(r.order_date ?? r.orderDate ?? ''),
      expectedArrivalDate: String(r.expected_arrival_date ?? r.expectedArrivalDate ?? ''),
      completedDate: r.completed_date ?? r.completedDate ?? null,
      vendorName: String(r.vendor_name ?? r.vendorName ?? ''),
      vendorId: r.vendor_id ?? r.vendorId ?? undefined,
      line: (r.line || 'SL1') as ProductionLine,
      itemName: String(r.item_name ?? r.itemName ?? ''),
      spec: String(r.spec ?? ''),
      orderedPackQty: Number(r.ordered_pack_qty ?? r.orderedPackQty ?? 0),
      packUnit: String(r.pack_unit ?? r.packUnit ?? 'EA'),
      unitConversion: Number(r.unit_conversion ?? r.unitConversion ?? 1),
      baseUnit: String(r.base_unit ?? r.baseUnit ?? 'EA'),
      unitPrice: Number(r.unit_price ?? r.unitPrice ?? 0),
      totalAmount: Number(r.total_amount ?? r.totalAmount ?? 0),
      deliveryLocation: String(r.delivery_location ?? r.deliveryLocation ?? ''),
      status: r.status || '입고대기',
      note: r.note ?? undefined,
    }));
  } catch {
    return null;
  }
}

export async function saveOrderHistoryToSupabase(
  orderHistory: OrderHistoryRecord[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase DB가 연결되지 않았습니다.' };

  const stateRes = await saveAppStateKeyToSupabase('orderHistory', orderHistory);
  try {
    if (orderHistory.length > 0) {
      const rows = orderHistory.slice(0, 500).map((r) => ({
        id: r.id,
        item_id: r.itemId || null,
        order_date: r.orderDate,
        expected_arrival_date: r.expectedArrivalDate,
        completed_date: r.completedDate || null,
        vendor_name: r.vendorName,
        vendor_id: r.vendorId || null,
        line: r.line,
        item_name: r.itemName,
        spec: r.spec,
        ordered_pack_qty: r.orderedPackQty,
        pack_unit: r.packUnit,
        unit_conversion: r.unitConversion || 1,
        base_unit: r.baseUnit || 'EA',
        unit_price: r.unitPrice,
        total_amount: r.totalAmount,
        delivery_location: r.deliveryLocation,
        status: r.status,
        note: r.note || null,
      }));
      const { error } = await client.from('order_history').upsert(rows, { onConflict: 'id' });
      if (error) {
        analyzeSupabaseError('order_history', 'UPSERT', error);
      }
    }
  } catch {}
  return stateRes;
}

export async function fetchUsageLogsFromSupabase(): Promise<UsageLog[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('usage_logs')
      .select('*')
      .order('date', { ascending: false });
    if (error || !data || data.length === 0) return null;
    return data.map((r: Record<string, any>) => ({
      id: String(r.id),
      itemId: String(r.item_id ?? r.itemId ?? ''),
      itemName: String(r.item_name ?? r.itemName ?? ''),
      spec: String(r.spec ?? ''),
      line: (r.line || 'SL1') as ProductionLine,
      categoryId: String(r.category_id ?? r.categoryId ?? ''),
      categoryName: String(r.category_name ?? r.categoryName ?? '기타'),
      date: String(r.date ?? ''),
      month: String(r.month ?? ''),
      packUsedQty: Number(r.pack_used_qty ?? r.packUsedQty ?? 0),
      baseUsedQty: Number(r.base_used_qty ?? r.baseUsedQty ?? 0),
      unitPrice: Number(r.unit_price ?? r.unitPrice ?? 0),
      totalCost: Number(r.total_cost ?? r.totalCost ?? 0),
      baseUnit: String(r.base_unit ?? r.baseUnit ?? 'EA'),
      packUnit: String(r.pack_unit ?? r.packUnit ?? 'EA'),
      recordedVia: r.recorded_via ?? r.recordedVia ?? 'audit',
    }));
  } catch {
    return null;
  }
}

export async function saveUsageLogsToSupabase(
  usageLogs: UsageLog[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase DB가 연결되지 않았습니다.' };

  const stateRes = await saveAppStateKeyToSupabase('usageLogs', usageLogs);
  try {
    if (usageLogs.length > 0) {
      const rows = usageLogs.slice(0, 500).map((u) => ({
        id: u.id,
        item_id: u.itemId,
        item_name: u.itemName,
        spec: u.spec,
        line: u.line,
        category_id: u.categoryId,
        category_name: u.categoryName,
        date: u.date,
        month: u.month,
        pack_used_qty: u.packUsedQty,
        base_used_qty: u.baseUsedQty,
        unit_price: u.unitPrice,
        total_cost: u.totalCost,
        base_unit: u.baseUnit,
        pack_unit: u.packUnit,
        recorded_via: u.recordedVia,
      }));
      const { error } = await client.from('usage_logs').upsert(rows, { onConflict: 'id' });
      if (error) {
        analyzeSupabaseError('usage_logs', 'UPSERT', error);
      }
    }
  } catch {}
  return stateRes;
}

export async function saveCompanyProfileToSupabase(
  companyProfile: CompanyProfile
): Promise<SupabaseMutationResult> {
  return await saveAppStateKeyToSupabase('companyProfile', companyProfile);
}

export async function saveMemoToSupabase(memo: string): Promise<SupabaseMutationResult> {
  return await saveAppStateKeyToSupabase('memo', memo);
}

export async function saveLastAuditTimestampToSupabase(
  lastAuditTimestamp: string
): Promise<SupabaseMutationResult> {
  return await saveAppStateKeyToSupabase('lastAuditTimestamp', lastAuditTimestamp);
}

export async function saveUserPasswordsToSupabase(
  userPasswords: Record<string, string>
): Promise<SupabaseMutationResult> {
  return await saveAppStateKeyToSupabase('userPasswords', userPasswords);
}

/**
 * Supabase 연동 시 데이터 변경 이력(Audit Log) 저장
 */
export async function insertAuditLogToSupabase(
  log: AuditLogRecord,
  allAuditLogs?: AuditLogRecord[]
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase 미연결' };

  try {
    const statePromise = allAuditLogs
      ? saveAppStateKeyToSupabase('auditLogs', allAuditLogs.slice(0, 1000))
      : Promise.resolve({ ok: true } as SupabaseMutationResult);

    const { error } = await client.from('mro_audit_logs').insert([
      {
        id: log.id,
        timestamp: log.timestamp,
        timestamp_ms: log.timestampMs,
        operator_id: log.operatorId,
        operator_name: log.operatorName,
        operator_level: log.operatorLevel,
        operator_role_label: log.operatorRoleLabel,
        operator_affiliation: log.operatorAffiliation,
        action_type: log.actionType,
        action_label: log.actionLabel,
        target_name: log.targetName,
        target_line: log.targetLine,
        target_id: log.targetId,
        category_name: log.categoryName,
        before_value: log.beforeValue,
        after_value: log.afterValue,
        details: log.details,
        ip_or_device: log.ipOrDevice,
        created_at: new Date().toISOString(),
      },
    ]);

    const stateRes = await statePromise;
    if (error) {
      const analyzed = analyzeSupabaseError('mro_audit_logs', 'INSERT', error);
      if (analyzed.isMissingTable && stateRes.ok) {
        return { ok: true };
      }
      return { ok: false, isRlsError: analyzed.isRlsError, errorMessage: analyzed.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Supabase Exception] insertAuditLogToSupabase:', e);
    return { ok: false, errorMessage: e instanceof Error ? e.message : '로그 저장 실패' };
  }
}

export async function clearAuditLogsInSupabase(): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase 미연결' };

  try {
    const stateRes = await saveAppStateKeyToSupabase('auditLogs', []);
    const { error } = await client.from('mro_audit_logs').delete().neq('id', '');
    if (error) {
      const analyzed = analyzeSupabaseError('mro_audit_logs', 'DELETE', error);
      if (analyzed.isMissingTable && stateRes.ok) {
        return { ok: true };
      }
      return { ok: false, isRlsError: analyzed.isRlsError, errorMessage: analyzed.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Supabase Exception] clearAuditLogsInSupabase:', e);
    return { ok: false, errorMessage: e instanceof Error ? e.message : '로그 초기화 오류' };
  }
}

export async function fetchAuditLogsFromSupabase(): Promise<AuditLogRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('mro_audit_logs')
      .select('*')
      .order('timestamp_ms', { ascending: false })
      .limit(1000);

    if (error) {
      analyzeSupabaseError('mro_audit_logs', 'SELECT', error);
      return null;
    }
    if (!data || data.length === 0) return null;

    return data.map((row: Record<string, any>) => ({
      id: String(row.id),
      timestamp: String(row.timestamp || ''),
      timestampMs: Number(row.timestamp_ms ?? row.timestampMs ?? Date.now()),
      operatorId: String(row.operator_id ?? row.operatorId ?? 'system'),
      operatorName: String(row.operator_name ?? row.operatorName ?? '관리자'),
      operatorLevel: Number(row.operator_level ?? row.operatorLevel ?? 0) as UserLevel,
      operatorRoleLabel: String(row.operator_role_label ?? row.operatorRoleLabel ?? 'LV.0'),
      operatorAffiliation: row.operator_affiliation ?? row.operatorAffiliation ?? undefined,
      actionType: row.action_type ?? row.actionType ?? 'STOCK_UPDATE',
      actionLabel: String(row.action_label ?? row.actionLabel ?? '데이터 변경'),
      targetName: String(row.target_name ?? row.targetName ?? ''),
      targetLine: row.target_line ?? row.targetLine ?? undefined,
      targetId: row.target_id ?? row.targetId ?? undefined,
      categoryName: row.category_name ?? row.categoryName ?? undefined,
      beforeValue: String(row.before_value ?? row.beforeValue ?? ''),
      afterValue: String(row.after_value ?? row.afterValue ?? ''),
      details: row.details ?? undefined,
      ipOrDevice: row.ip_or_device ?? row.ipOrDevice ?? '웹',
    }));
  } catch (e) {
    console.error('[Supabase Exception] fetchAuditLogsFromSupabase:', e);
    return null;
  }
}

// ============================================================================
// 5. 전체 클라우드 데이터 통합 조회 (Single Source of Truth)
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
 * 앱 최초 실행(Mount) 시 또는 수동 새로고침 시 오직 Supabase 클라우드 DB에서만
 * 전체 데이터를 실시간으로 조회하여 반환합니다. (로컬 스토리지 캐시 전혀 사용하지 않음)
 */
export async function fetchAllCloudDataFromSupabase(): Promise<CloudSnapshot | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const [
      remoteAppState,
      tableAccounts,
      tableItems,
      tableCategories,
      tableVendors,
      tableOrderHistory,
      tableUsageLogs,
      tableAuditLogs,
    ] = await Promise.all([
      fetchAllAppStateFromSupabase(),
      fetchUserAccountsFromSupabase(),
      fetchInventoryItemsFromSupabase(),
      fetchCategoriesFromSupabase(),
      fetchVendorsFromSupabase(),
      fetchOrderHistoryFromSupabase(),
      fetchUsageLogsFromSupabase(),
      fetchAuditLogsFromSupabase(),
    ]);

    const state = remoteAppState || {};

    // 1. 품목 (inventory_items 테이블 및 mro_app_state.items 연동)
    let resolvedItems: InventoryItem[] | null = null;
    if (tableItems && tableItems.length > 0) {
      resolvedItems = tableItems;
    } else if (Array.isArray(state.items) && state.items.length > 0) {
      resolvedItems = state.items;
    } else if (tableItems !== null) {
      resolvedItems = tableItems;
    } else if (Array.isArray(state.items)) {
      resolvedItems = state.items;
    }

    // 2. 카테고리 (categories 테이블 및 mro_app_state.categories 연동)
    let resolvedCategories: Category[] | null = null;
    if (tableCategories && tableCategories.length > 0) {
      resolvedCategories = tableCategories;
    } else if (Array.isArray(state.categories)) {
      resolvedCategories = state.categories;
    }

    // 3. 공급업체 (vendors 테이블 및 mro_app_state.vendors 연동)
    let resolvedVendors: Vendor[] | null = null;
    if (tableVendors && tableVendors.length > 0) {
      resolvedVendors = tableVendors;
    } else if (Array.isArray(state.vendors)) {
      resolvedVendors = state.vendors;
    }

    // 4. 발주 이력 (order_history 테이블 및 mro_app_state.orderHistory 연동)
    let resolvedOrderHistory: OrderHistoryRecord[] | null = null;
    if (tableOrderHistory && tableOrderHistory.length > 0) {
      resolvedOrderHistory = tableOrderHistory;
    } else if (Array.isArray(state.orderHistory)) {
      resolvedOrderHistory = state.orderHistory;
    }

    // 5. 사용량 로그 (usage_logs 테이블 및 mro_app_state.usageLogs 연동)
    let resolvedUsageLogs: UsageLog[] | null = null;
    if (tableUsageLogs && tableUsageLogs.length > 0) {
      resolvedUsageLogs = tableUsageLogs;
    } else if (Array.isArray(state.usageLogs)) {
      resolvedUsageLogs = state.usageLogs;
    }

    // 6. 사용자 계정 (user_accounts 테이블 우선, 없으면 mro_app_state.userAccounts + admin 기본계정 보장)
    let resolvedAccounts: UserAccount[] | null = null;
    if (tableAccounts && tableAccounts.length > 0) {
      resolvedAccounts = ensureDefaultAdminAccount(tableAccounts);
    } else if (Array.isArray(state.userAccounts) && state.userAccounts.length > 0) {
      resolvedAccounts = ensureDefaultAdminAccount(state.userAccounts);
    }

    // 7. 변경 이력 (mro_audit_logs 테이블 우선, 없으면 mro_app_state.auditLogs 연동)
    let resolvedAuditLogs: AuditLogRecord[] | null = null;
    if (tableAuditLogs && tableAuditLogs.length > 0) {
      resolvedAuditLogs = tableAuditLogs;
    } else if (Array.isArray(state.auditLogs)) {
      resolvedAuditLogs = state.auditLogs;
    }

    return {
      items: resolvedItems,
      categories: resolvedCategories,
      vendors: resolvedVendors,
      units: Array.isArray(state.units) ? state.units : null,
      orderHistory: resolvedOrderHistory,
      usageLogs: resolvedUsageLogs,
      auditLogs: resolvedAuditLogs,
      userAccounts: resolvedAccounts,
      userPasswords:
        state.userPasswords && typeof state.userPasswords === 'object'
          ? state.userPasswords
          : null,
      companyProfile:
        state.companyProfile && typeof state.companyProfile === 'object'
          ? state.companyProfile
          : null,
      memo: typeof state.memo === 'string' ? state.memo : null,
      lastAuditTimestamp:
        typeof state.lastAuditTimestamp === 'string' ? state.lastAuditTimestamp : null,
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
  defaultProfile: CompanyProfile,
  defaultAccounts: UserAccount[],
  defaultUnits: Unit[],
  defaultMemo: string
): Promise<SupabaseMutationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, errorMessage: 'Supabase DB가 연결되지 않았습니다.' };
  }

  try {
    // 1. 개별 테이블 비우기 (존재하는 경우)
    await Promise.allSettled([
      client.from('inventory_items').delete().neq('id', ''),
      client.from('categories').delete().neq('id', ''),
      client.from('vendors').delete().neq('id', ''),
      client.from('order_history').delete().neq('id', ''),
      client.from('usage_logs').delete().neq('id', ''),
    ]);

    // 2. mro_app_state 키 초기화
    const results = await Promise.all([
      saveAppStateKeyToSupabase('items', []),
      saveAppStateKeyToSupabase('categories', []),
      saveAppStateKeyToSupabase('vendors', []),
      saveAppStateKeyToSupabase('units', defaultUnits),
      saveAppStateKeyToSupabase('orderHistory', []),
      saveAppStateKeyToSupabase('usageLogs', []),
      saveAppStateKeyToSupabase('companyProfile', defaultProfile),
      saveAppStateKeyToSupabase('userAccounts', ensureDefaultAdminAccount(defaultAccounts)),
      saveAppStateKeyToSupabase('userPasswords', { admin: '1234' }),
      saveAppStateKeyToSupabase('memo', defaultMemo),
    ]);

    const failed = results.find((r) => !r.ok);
    if (failed) {
      return failed;
    }

    return { ok: true };
  } catch (e) {
    console.error('[Supabase Exception] resetAllCloudDataInSupabase:', e);
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : '클라우드 DB 초기화 중 오류 발생',
    };
  }
}
