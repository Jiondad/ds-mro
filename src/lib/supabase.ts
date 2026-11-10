import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
import { compareUserAccountsByAffiliation } from '../utils/calculations';

export const STORAGE_KEY_SUPABASE_CONFIG = 'daeseong_steel_supabase_config_v1';

// 레거시 로컬 스토리지 데이터 키 목록 (자동 영구 삭제 대상)
const LEGACY_DATA_STORAGE_KEYS = [
  'daeseong_steel_inventory_v1',
  'daeseong_steel_categories_v1',
  'daeseong_steel_vendors_v1',
  'daeseong_steel_units_v1',
  'daeseong_steel_memo_v1',
  'daeseong_steel_last_audit_v1',
  'daeseong_steel_company_profile_v1',
  'daeseong_steel_order_history_v1',
  'daeseong_steel_usage_logs_v1',
  'daeseong_steel_worker_mode_v1',
  'daeseong_steel_current_user_v1',
  'daeseong_steel_user_passwords_v1',
  'daeseong_steel_user_accounts_v1',
  'daeseong_steel_audit_logs_v1',
  'daeseong_steel_active_tab_v1',
];

/**
 * 다른 PC/브라우저에서 접속 시 예전 목업(Mock) 데이터나 구버전 로컬 스토리지 캐시가
 * 부활하거나 클라우드 DB를 덮어쓰는 현상을 원천 차단하기 위해 로컬 스토리지 데이터 캐시를 전면 삭제합니다.
 */
export function purgeLegacyLocalStorageData(): void {
  if (typeof window === 'undefined') return;
  try {
    LEGACY_DATA_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    });

    // ds_mro_ 접두어 필터 캐시도 일괄 제거
    const localKeysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('ds_mro_') || (k.startsWith('daeseong_steel_') && k !== STORAGE_KEY_SUPABASE_CONFIG))) {
        localKeysToRemove.push(k);
      }
    }
    localKeysToRemove.forEach((k) => window.localStorage.removeItem(k));

    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && (k.startsWith('ds_mro_') || k.startsWith('daeseong_steel_'))) {
        sessionKeysToRemove.push(k);
      }
    }
    sessionKeysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
  } catch (e) {
    console.warn('Failed to purge legacy localStorage keys', e);
  }
}

// 모듈 로드 즉시 레거시 로컬 스토리지 캐시 영구 삭제 실행
purgeLegacyLocalStorageData();

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  updatedAt?: string;
}

const envSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const envSupabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

let runtimeSupabaseConfig: SupabaseConfig | null = null;

export function getSavedSupabaseConfig(): SupabaseConfig {
  if (runtimeSupabaseConfig && runtimeSupabaseConfig.url && runtimeSupabaseConfig.anonKey) {
    return runtimeSupabaseConfig;
  }
  if (envSupabaseUrl && envSupabaseAnonKey) {
    return {
      url: envSupabaseUrl,
      anonKey: envSupabaseAnonKey,
    };
  }
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(STORAGE_KEY_SUPABASE_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SupabaseConfig>;
        if (parsed.url && parsed.anonKey) {
          return {
            url: parsed.url.trim(),
            anonKey: parsed.anonKey.trim(),
            updatedAt: parsed.updatedAt,
          };
        }
      }
    }
  } catch (e) {
    console.error('Failed to read Supabase config', e);
  }
  return {
    url: envSupabaseUrl,
    anonKey: envSupabaseAnonKey,
  };
}

export function setRuntimeSupabaseConfig(config: SupabaseConfig | null): void {
  runtimeSupabaseConfig = config;
  try {
    if (typeof window !== 'undefined') {
      if (config && config.url && config.anonKey) {
        window.localStorage.setItem(STORAGE_KEY_SUPABASE_CONFIG, JSON.stringify(config));
      } else {
        window.localStorage.removeItem(STORAGE_KEY_SUPABASE_CONFIG);
      }
    }
  } catch {}
  getSupabaseClient();
}

let supabaseInstance: SupabaseClient | null = null;
let currentConfiguredUrl = '';
let currentConfiguredKey = '';

/**
 * 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) 또는
 * 최고관리자 DB 연결 설정으로 싱글톤 Supabase 클라이언트를 반환합니다.
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
        },
      });
      currentConfiguredUrl = url;
      currentConfiguredKey = anonKey;
    } catch (e) {
      console.error('Failed to initialize Supabase client', e);
      return null;
    }
  }

  return supabaseInstance;
}

export const supabase: SupabaseClient | null = getSupabaseClient();

/**
 * 입력받은 Supabase Project URL 및 Anon Key로 실제 연결 가능 여부를 테스트합니다.
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
      auth: { persistSession: false },
    });

    const { error } = await tempClient.auth.getSession();
    if (error) {
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
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase client not configured' };

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
      return { ok: false, errorMessage: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errorMessage: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function fetchAllAppStateFromSupabase(): Promise<Record<string, any> | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('mro_app_state')
      .select('state_key, state_value, updated_at');

    if (error || !data || data.length === 0) {
      return null;
    }

    const result: Record<string, any> = {};
    data.forEach((row: Record<string, any>) => {
      if (row.state_key && row.state_value !== undefined) {
        result[String(row.state_key)] = row.state_value;
      }
    });
    return result;
  } catch {
    return null;
  }
}

// ============================================================================
// 2. 사용자 계정 (user_accounts) Direct CRUD
// ============================================================================

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

    if (error || !data || data.length === 0) {
      return null;
    }

    const mapped: UserAccount[] = data.map((row: Record<string, any>) => {
      const rawLevel = Number(row.level);
      const validLevel: UserLevel =
        rawLevel === 0 || rawLevel === 1 || rawLevel === 2 || rawLevel === 3
          ? (rawLevel as UserLevel)
          : 2;
      return {
        id: String(row.id),
        username: String(row.username || ''),
        name: String(row.name || ''),
        affiliation: row.affiliation ? String(row.affiliation) : '포승공장',
        department: row.department ? String(row.department) : '포승공장',
        phone: row.phone ? String(row.phone) : undefined,
        level: validLevel,
        roleLabel: row.role_label ? String(row.role_label) : `LV.${validLevel}`,
        isActive: row.is_active !== false,
        createdAt: row.created_at ? String(row.created_at).substring(0, 10) : undefined,
      };
    });

    return mapped.sort(compareUserAccountsByAffiliation);
  } catch (e) {
    console.warn('Supabase user_accounts fetch warning:', e);
    return null;
  }
}

export async function insertUserAccountToSupabase(
  account: UserAccount,
  allAccounts?: UserAccount[]
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase 미연결' };

  try {
    if (allAccounts) {
      void saveAppStateKeyToSupabase('userAccounts', allAccounts);
    }

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

    if (error) {
      return { ok: false, errorMessage: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, errorMessage: msg };
  }
}

export async function updateUserAccountInSupabase(
  account: UserAccount,
  allAccounts?: UserAccount[]
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase 미연결' };

  try {
    if (allAccounts) {
      void saveAppStateKeyToSupabase('userAccounts', allAccounts);
    }

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

    if (error) {
      return { ok: false, errorMessage: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, errorMessage: msg };
  }
}

export async function deleteUserAccountFromSupabase(
  accountId: string,
  allAccounts?: UserAccount[]
): Promise<{ ok: boolean; isForeignKeyError?: boolean; errorMessage?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase 미연결' };

  try {
    if (allAccounts) {
      void saveAppStateKeyToSupabase('userAccounts', allAccounts);
    }

    const { error } = await client
      .from('user_accounts')
      .delete()
      .eq('id', accountId);

    if (error) {
      const isFk =
        error.code === '23503' ||
        /foreign key|violates|constraint/i.test(error.message || '') ||
        /foreign key|violates|constraint/i.test(error.details || '');
      return {
        ok: false,
        isForeignKeyError: isFk,
        errorMessage: error.message,
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, errorMessage: msg };
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
    if (error || !data) return null;
    return data.map(mapRowToInventoryItem);
  } catch {
    return null;
  }
}

export async function upsertInventoryItemToSupabase(
  item: InventoryItem,
  allItems?: InventoryItem[]
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase 미연결' };

  try {
    if (allItems) {
      void saveAppStateKeyToSupabase('items', allItems);
    }

    const { error } = await client
      .from('inventory_items')
      .upsert(mapInventoryItemToRow(item), { onConflict: 'id' });

    if (error) {
      return { ok: false, errorMessage: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, errorMessage: msg };
  }
}

export async function batchUpsertInventoryItemsToSupabase(
  itemsToUpsert: InventoryItem[],
  allItems: InventoryItem[]
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase 미연결' };

  try {
    const statePromise = saveAppStateKeyToSupabase('items', allItems);
    if (itemsToUpsert.length > 0) {
      const rows = itemsToUpsert.map(mapInventoryItemToRow);
      await client.from('inventory_items').upsert(rows, { onConflict: 'id' });
    }
    await statePromise;
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, errorMessage: msg };
  }
}

export async function deleteInventoryItemFromSupabase(
  itemId: string,
  allItems?: InventoryItem[]
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, errorMessage: 'Supabase 미연결' };

  try {
    if (allItems) {
      void saveAppStateKeyToSupabase('items', allItems);
    }

    const { error } = await client
      .from('inventory_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      return { ok: false, errorMessage: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, errorMessage: msg };
  }
}

// ============================================================================
// 4. 카테고리 / 공급업체 / 단위 / 발주이력 / 사용량로그 / 변경로그 Direct CRUD
// ============================================================================

export async function saveCategoriesToSupabase(categories: Category[]): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('categories', categories);
}

export async function saveVendorsToSupabase(vendors: Vendor[]): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('vendors', vendors);
}

export async function saveUnitsToSupabase(units: Unit[]): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('units', units);
}

export async function saveOrderHistoryToSupabase(
  orderHistory: OrderHistoryRecord[]
): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('orderHistory', orderHistory);
}

export async function saveUsageLogsToSupabase(usageLogs: UsageLog[]): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('usageLogs', usageLogs);
}

export async function saveCompanyProfileToSupabase(
  companyProfile: CompanyProfile
): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('companyProfile', companyProfile);
}

export async function saveMemoToSupabase(memo: string): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('memo', memo);
}

export async function saveLastAuditTimestampToSupabase(
  lastAuditTimestamp: string
): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('lastAuditTimestamp', lastAuditTimestamp);
}

export async function saveUserPasswordsToSupabase(
  userPasswords: Record<string, string>
): Promise<{ ok: boolean }> {
  return await saveAppStateKeyToSupabase('userPasswords', userPasswords);
}

/**
 * Supabase 연동 시 데이터 변경 이력(Audit Log) 저장
 */
export async function insertAuditLogToSupabase(
  log: AuditLogRecord,
  allAuditLogs?: AuditLogRecord[]
): Promise<{ ok: boolean }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false };

  try {
    if (allAuditLogs) {
      void saveAppStateKeyToSupabase('auditLogs', allAuditLogs.slice(0, 1000));
    }

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

    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export async function clearAuditLogsInSupabase(): Promise<{ ok: boolean }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false };

  try {
    await saveAppStateKeyToSupabase('auditLogs', []);
    await client.from('mro_audit_logs').delete().neq('id', '');
    return { ok: true };
  } catch {
    return { ok: false };
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

    if (error || !data || data.length === 0) return null;

    return data.map((row: Record<string, any>) => ({
      id: String(row.id),
      timestamp: String(row.timestamp || ''),
      timestampMs: Number(row.timestamp_ms ?? row.timestampMs ?? Date.now()),
      operatorId: String(row.operator_id ?? row.operatorId ?? 'system'),
      operatorName: String(row.operator_name ?? row.operatorName ?? '관리자'),
      operatorLevel: (Number(row.operator_level ?? row.operatorLevel ?? 0) as UserLevel),
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
  } catch {
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
 * 앱 최초 실행 시 또는 수동 새로고침 시 오직 Supabase 클라우드 DB에서만
 * 전체 데이터를 실시간으로 조회하여 반환합니다. (로컬 스토리지 미사용)
 */
export async function fetchAllCloudDataFromSupabase(): Promise<CloudSnapshot | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const [remoteAppState, tableAccounts, tableItems, tableAuditLogs] = await Promise.all([
      fetchAllAppStateFromSupabase(),
      fetchUserAccountsFromSupabase(),
      fetchInventoryItemsFromSupabase(),
      fetchAuditLogsFromSupabase(),
    ]);

    const state = remoteAppState || {};

    // 품목: inventory_items 테이블 데이터가 존재하면 우선 사용하고, 없으면 mro_app_state.items 사용
    let resolvedItems: InventoryItem[] | null = null;
    if (Array.isArray(state.items) && state.items.length > 0) {
      resolvedItems = state.items;
    } else if (tableItems && tableItems.length > 0) {
      resolvedItems = tableItems;
    } else if (Array.isArray(state.items)) {
      resolvedItems = state.items;
    } else if (tableItems) {
      resolvedItems = tableItems;
    }

    // 사용자 계정: user_accounts 테이블 우선, 없으면 mro_app_state.userAccounts 사용
    let resolvedAccounts: UserAccount[] | null = null;
    if (tableAccounts && tableAccounts.length > 0) {
      resolvedAccounts = tableAccounts;
    } else if (Array.isArray(state.userAccounts) && state.userAccounts.length > 0) {
      resolvedAccounts = [...state.userAccounts].sort(compareUserAccountsByAffiliation);
    }

    // 변경 이력(Audit Log): mro_audit_logs 테이블 우선, 없으면 mro_app_state.auditLogs 사용
    let resolvedAuditLogs: AuditLogRecord[] | null = null;
    if (tableAuditLogs && tableAuditLogs.length > 0) {
      resolvedAuditLogs = tableAuditLogs;
    } else if (Array.isArray(state.auditLogs)) {
      resolvedAuditLogs = state.auditLogs;
    }

    return {
      items: resolvedItems,
      categories: Array.isArray(state.categories) ? state.categories : null,
      vendors: Array.isArray(state.vendors) ? state.vendors : null,
      units: Array.isArray(state.units) ? state.units : null,
      orderHistory: Array.isArray(state.orderHistory) ? state.orderHistory : null,
      usageLogs: Array.isArray(state.usageLogs) ? state.usageLogs : null,
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
    console.error('Failed to fetch all cloud data from Supabase:', e);
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
): Promise<{ ok: boolean }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false };

  try {
    // 1. inventory_items 테이블 전체 비우기
    await client.from('inventory_items').delete().neq('id', '');

    // 2. mro_app_state 키 초기화
    await Promise.all([
      saveAppStateKeyToSupabase('items', []),
      saveAppStateKeyToSupabase('categories', []),
      saveAppStateKeyToSupabase('vendors', []),
      saveAppStateKeyToSupabase('units', defaultUnits),
      saveAppStateKeyToSupabase('orderHistory', []),
      saveAppStateKeyToSupabase('usageLogs', []),
      saveAppStateKeyToSupabase('companyProfile', defaultProfile),
      saveAppStateKeyToSupabase('userAccounts', defaultAccounts),
      saveAppStateKeyToSupabase('memo', defaultMemo),
    ]);

    return { ok: true };
  } catch (e) {
    console.error('Failed to reset cloud data in Supabase', e);
    return { ok: false };
  }
}
