import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ActiveTab,
  AuditLogRecord,
  CalculatedItem,
  Category,
  CompanyProfile,
  InventoryItem,
  OrderHistoryRecord,
  ProductionLine,
  Unit,
  UsageLog,
  UserAccount,
  Vendor,
} from './types';
import {
  INITIAL_COMPANY_PROFILE,
  INITIAL_MEMO,
  INITIAL_UNITS,
  INITIAL_USER_ACCOUNTS,
} from './mockData';
import {
  calculateItemMetrics,
  TODAY_STR,
  compareUserAccountsByAffiliation,
  resolveEffectiveDeliveryLocation,
  getDefaultDeliveryLocationForLine,
} from './utils/calculations';
import {
  resolveInitialActiveTab,
  syncActiveTabToUrl,
  extractTabFromLocation,
  enforceTabRBAC,
} from './utils/urlState';
import {
  checkPermission,
  isTabAllowed,
  getTabAccessDeniedReason,
} from './utils/rbac';
import {
  createAuditLogEntry,
  CreateAuditLogParams,
} from './utils/auditLogger';
import { Header } from './components/Header';
import { DashboardTab } from './components/DashboardTab';
import { FieldAuditTab } from './components/FieldAuditTab';
import { OrderManagementTab } from './components/OrderManagementTab';
import { MasterDataTab } from './components/MasterDataTab';
import { UsageStatsTab } from './components/UsageStatsTab';
import { AccountManagementTab, DeleteAccountOptions } from './components/AccountManagementTab';
import { AuditLogTab } from './components/AuditLogTab';
import { PurchaseOrderModal } from './components/PurchaseOrderModal';
import { NewItemModal } from './components/NewItemModal';
import { EditOrderModal } from './components/EditOrderModal';
import { LoginModal } from './components/LoginModal';
import { PasswordChangeModal } from './components/PasswordChangeModal';
import { DbConfigModal } from './components/DbConfigModal';
import {
  getSavedSupabaseConfig,
  getSupabaseClient,
  ensureDefaultAdminAccount,
  fetchAllCloudDataFromSupabase,
  insertUserAccountToSupabase,
  updateUserAccountInSupabase,
  deleteUserAccountFromSupabase,
  batchUpsertUserAccountsToSupabase,
  updateUserPasswordInSupabase,
  upsertInventoryItemToSupabase,
  batchUpsertInventoryItemsToSupabase,
  deleteInventoryItemFromSupabase,
  saveCategoriesToSupabase,
  deleteCategoryFromSupabase,
  saveVendorsToSupabase,
  deleteVendorFromSupabase,
  saveUnitsToSupabase,
  saveOrderHistoryToSupabase,
  deleteOrderHistoryFromSupabase,
  saveUsageLogsToSupabase,
  saveCompanyProfileToSupabase,
  saveMemoToSupabase,
  saveLastAuditTimestampToSupabase,
  insertAuditLogToSupabase,
  clearAuditLogsInSupabase,
  resetAllCloudDataInSupabase,
  SupabaseMutationResult,
} from './lib/supabase';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  // User authentication & 4-tier RBAC state (sessionStorage 복원 및 유지)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = sessionStorage.getItem('ds_mro_current_user');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return null;
  });

  // [계정 관리] 등록 사용자 계정 목록 상태 (Supabase DB 단일 진실 공급원 + admin 기본계정 보장)
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() =>
    ensureDefaultAdminAccount(INITIAL_USER_ACCOUNTS)
  );

  // 최고관리자(admin) 초기 비밀번호 1234 기본 보장
  const [userPasswords, setUserPasswords] = useState<Record<string, string>>({
    admin: '1234',
  });
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [isDbConfigModalOpen, setIsDbConfigModalOpen] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(() => {
    const cfg = getSavedSupabaseConfig();
    return Boolean(cfg.url && cfg.anonKey);
  });
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);

  // [기능 4] 현장 작업자용 간소화 모드(Worker View) 상태
  const [isWorkerMode, setIsWorkerMode] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem('ds_mro_current_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed?.level === 2;
      }
    } catch (e) {}
    return false;
  });

  // Navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    resolveInitialActiveTab(null, false)
  );

  // Company Profile state (Supabase Cloud DB Direct)
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(INITIAL_COMPANY_PROFILE);

  // ----------------------------------------------------
  // Supabase Cloud DB 단일 연동 상태 (브라우저 스토리지 캐시 완전 배제)
  // ----------------------------------------------------
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [units, setUnits] = useState<Unit[]>(INITIAL_UNITS);
  const [memo, setMemo] = useState<string>(INITIAL_MEMO);
  const [lastAuditTimestamp, setLastAuditTimestamp] = useState<string>(
    `${TODAY_STR} 실사 대기`
  );
  const [orderHistory, setOrderHistory] = useState<OrderHistoryRecord[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);

  const [memoLastSaved, setMemoLastSaved] = useState<string>('방금 전');
  const [globalToast, setGlobalToast] = useState<string | null>(null);
  const memoSaveTimeoutRef = useRef<number | null>(null);

  // Modal states
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingOrderTarget, setEditingOrderTarget] = useState<CalculatedItem | null>(null);

  const [poModalData, setPoModalData] = useState<{
    isOpen: boolean;
    vendor?: Vendor;
    items: CalculatedItem[];
    orderDate: string;
    expectedArrivalDate: string;
    isAlreadyOrdered: boolean;
  }>({
    isOpen: false,
    items: [],
    orderDate: TODAY_STR,
    expectedArrivalDate: TODAY_STR,
    isAlreadyOrdered: false,
  });

  const showToast = useCallback((message: string) => {
    setGlobalToast(message);
    setTimeout(() => {
      setGlobalToast(null);
    }, 3500);
  }, []);

  // 데이터 변경 이력(Audit Log) 생성 및 Supabase 즉시 저장 헬퍼
  const recordAuditLog = useCallback(
    (params: Omit<CreateAuditLogParams, 'currentUser'>) => {
      const entry = createAuditLogEntry({
        ...params,
        currentUser,
      });
      setAuditLogs((prev) => {
        const next = [entry, ...prev].slice(0, 2000);
        void insertAuditLogToSupabase(entry, next);
        return next;
      });
    },
    [currentUser]
  );

  // URL Search Params 동기화
  useEffect(() => {
    syncActiveTabToUrl(activeTab, false);
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const urlTab = extractTabFromLocation();
      if (urlTab) {
        const allowed = enforceTabRBAC(urlTab, currentUser, isWorkerMode);
        setActiveTab(allowed);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentUser, isWorkerMode]);

  // ---------------------------------------------------------------------------
  // Supabase Cloud DB 실시간 데이터 조회 및 동기화 (Single Source of Truth)
  // ---------------------------------------------------------------------------
  const syncFromSupabaseCloud = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!isDbConnected) return;
      setIsCloudSyncing(true);
      try {
        const snapshot = await fetchAllCloudDataFromSupabase();
        if (!snapshot) return;

        if (snapshot.items !== null) setItems(snapshot.items);
        if (snapshot.categories !== null) setCategories(snapshot.categories);
        if (snapshot.vendors !== null) setVendors(snapshot.vendors);
        if (snapshot.units !== null && snapshot.units.length > 0) {
          setUnits(snapshot.units);
        }
        if (snapshot.orderHistory !== null) setOrderHistory(snapshot.orderHistory);
        if (snapshot.usageLogs !== null) setUsageLogs(snapshot.usageLogs);
        if (snapshot.auditLogs !== null) setAuditLogs(snapshot.auditLogs);
        if (snapshot.companyProfile !== null) setCompanyProfile(snapshot.companyProfile);
        if (snapshot.memo !== null) setMemo(snapshot.memo);
        if (snapshot.lastAuditTimestamp !== null) {
          setLastAuditTimestamp(snapshot.lastAuditTimestamp);
        }

        if (snapshot.userAccounts && snapshot.userAccounts.length > 0) {
          const sortedAccounts = ensureDefaultAdminAccount(snapshot.userAccounts);
          setUserAccounts(sortedAccounts);
          setCurrentUser((prevUser) => {
            if (!prevUser) return null;
            const refreshed = sortedAccounts.find(
              (a) => a.id === prevUser.id || a.username === prevUser.username
            );
            if (refreshed) {
              try {
                sessionStorage.setItem('ds_mro_current_user', JSON.stringify(refreshed));
              } catch (e) {}
            }
            return refreshed || prevUser;
          });
        }

        if (snapshot.userPasswords && typeof snapshot.userPasswords === 'object') {
          setUserPasswords((prev) => ({
            ...prev,
            ...snapshot.userPasswords,
            admin: snapshot.userPasswords?.admin || prev.admin || '1234',
          }));
        }

        if (!options?.silent) {
          showToast('☁️ Supabase 클라우드 DB에서 최신 전사 데이터를 동기화했습니다.');
        }
      } catch (err) {
        console.error('[Supabase Cloud Sync Error]:', err);
        if (!options?.silent) {
          showToast('⚠️ 클라우드 DB 동기화 중 일시적인 네트워크 지연이 발생했습니다.');
        }
      } finally {
        setIsCloudSyncing(false);
      }
    },
    [isDbConnected, showToast]
  );

  // 최초 마운트, 창 포커스 복귀, 그리고 Supabase Realtime 변경 감지 시 자동 동기화
  useEffect(() => {
    if (!isDbConnected) return;

    void syncFromSupabaseCloud({ silent: true });

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void syncFromSupabaseCloud({ silent: true });
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    const supabase = getSupabaseClient();
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      channel = supabase
        .channel('daeseong_mro_cloud_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'company_profile' },
          () => {
            void syncFromSupabaseCloud({ silent: true });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory_items' },
          () => {
            void syncFromSupabaseCloud({ silent: true });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_history' },
          () => {
            void syncFromSupabaseCloud({ silent: true });
          }
        )
        .subscribe();
    }

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [isDbConnected, syncFromSupabaseCloud]);

  // 메모 변경 시 디바운스 후 Supabase Cloud DB 직접 저장
  const handleMemoChange = (nextMemo: string) => {
    setMemo(nextMemo);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setMemoLastSaved(timeStr);

    if (memoSaveTimeoutRef.current) {
      window.clearTimeout(memoSaveTimeoutRef.current);
    }
    memoSaveTimeoutRef.current = window.setTimeout(async () => {
      const res = await saveMemoToSupabase(nextMemo);
      if (!res.ok && isDbConnected) {
        console.error('[Memo Save Failed]:', res.errorMessage);
      }
    }, 600);
  };

  // Compute metrics for all items dynamically
  const calculatedItems: CalculatedItem[] = useMemo(() => {
    return items.map((item) => {
      const category = categories.find((c) => c.id === item.categoryId);
      const vendor = vendors.find((v) => v.id === item.vendorId);
      return calculateItemMetrics(item, category, vendor);
    });
  }, [items, categories, vendors]);

  // 최고관리자(admin, LV.0)는 초기비번 1234로 즉시 접속 가능하도록 강제 변경 대상에서 제외
  const mustChangePassword = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.username === 'admin' || currentUser.level === 0) return false;
    const storedPw = userPasswords[currentUser.username];
    const isPassword1234 = !storedPw || storedPw === '1234';
    return isPassword1234;
  }, [currentUser, userPasswords]);

  const orderNeededCount = calculatedItems.filter((i) => i.needsOrder).length;
  const awaitingArrivalCount = calculatedItems.filter(
    (i) => i.orderStatus === '발주완료(입고대기)'
  ).length;
  const auditDelayedCount = calculatedItems.filter((i) => i.isAuditDelayed).length;

  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);
    try {
      sessionStorage.setItem('ds_mro_current_user', JSON.stringify(user));
    } catch (e) {}

    if (user.level === 2) {
      // LV.2 현장사용자: 현장 작업자 모드 활성화 및 현장 실사 화면으로 이동
      setIsWorkerMode(true);
      const nextTab = enforceTabRBAC('field-audit', user, true);
      setActiveTab(nextTab);
      syncActiveTabToUrl(nextTab, false);
    } else {
      // LV.0 최고관리자, LV.1 현장관리자, LV.3 사무실사용자
      setIsWorkerMode(false);
      const nextTab = enforceTabRBAC(activeTab, user, false);
      setActiveTab(nextTab);
      syncActiveTabToUrl(nextTab, false);
    }

    // 로그인 시 클라우드 최신 데이터 즉시 동기화
    void syncFromSupabaseCloud({ silent: true });

    const storedPw = userPasswords[user.username];
    const isInitialOrReset =
      user.username !== 'admin' &&
      user.level !== 0 &&
      (!storedPw || storedPw === '1234');

    const roleText = user.roleLabel || `LV.${user.level}`;
    const displayName = user.title ? `${user.name} ${user.title}` : user.name;
    if (isInitialOrReset) {
      showToast(
        `⚠️ [${displayName}] 초기 비밀번호(1234) 상태입니다. 새 비밀번호로 변경해 주세요.`
      );
    } else {
      showToast(`[${roleText}] ${displayName} 계정으로 로그인되었습니다.`);
    }
  };

  const handleLogout = () => {
    const prevName = currentUser
      ? currentUser.title
        ? `${currentUser.name} ${currentUser.title}`
        : currentUser.name
      : '';
    setCurrentUser(null);
    try {
      sessionStorage.removeItem('ds_mro_current_user');
    } catch (e) {}

    setIsPasswordChangeOpen(false);
    showToast(
      prevName
        ? `${prevName} 계정이 안전하게 로그아웃되었습니다.`
        : '안전하게 로그아웃되었습니다.'
    );
  };

  const handleChangePassword = async (username: string, newPassword: string) => {
    const res = await updateUserPasswordInSupabase(username, newPassword);
    if (!res.ok) {
      console.error('[Supabase Password Change Failed]:', res.errorMessage);
      showToast(`❌ [Supabase 오류] 비밀번호 변경 저장 실패: ${res.errorMessage}`);
      return;
    }

    const updated = { ...userPasswords, [username]: newPassword };
    setUserPasswords(updated);
    setUserAccounts((prev) =>
      prev.map((acc) =>
        acc.username === username ? { ...acc, password: newPassword } : acc
      )
    );

    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetName: `계정 ID: ${username}`,
      beforeValue: '기존 비밀번호 (보안처리)',
      afterValue: '신규 비밀번호 변경 완료',
      details: `'${username}' 계정 비밀번호 변경`,
    });

    showToast(`✅ '${username}' 계정의 비밀번호가 Supabase 클라우드 DB에 변경·저장되었습니다.`);
  };

  const handleResetUserPassword = async (username: string, displayName?: string) => {
    if ((currentUser?.level ?? 0) !== 0) {
      showToast('⚠️ 비밀번호 초기화 권한은 LV.0 최고관리자에게만 있습니다.');
      return;
    }

    const res = await updateUserPasswordInSupabase(username, '1234');
    if (!res.ok) {
      console.error('[Supabase Password Reset Failed]:', res.errorMessage);
      showToast(`❌ [Supabase 오류] 비밀번호 초기화 반영 실패: ${res.errorMessage}`);
      return;
    }

    const updated = { ...userPasswords, [username]: '1234' };
    setUserPasswords(updated);
    setUserAccounts((prev) =>
      prev.map((acc) =>
        acc.username === username ? { ...acc, password: '1234' } : acc
      )
    );

    const label = displayName ? `${displayName} (${username})` : username;
    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetName: label,
      beforeValue: '사용자 설정 비밀번호',
      afterValue: '초기 비밀번호 (1234)',
      details: `'${label}' 계정 비밀번호 초기화 (1234)`,
    });

    showToast(
      `🔑 [비밀번호 초기화 완료] '${label}' 계정의 비밀번호가 '1234'로 초기화되었습니다.`
    );
  };

  const handleAddAccount = async (
    newAccount: UserAccount
  ): Promise<{ ok: boolean; errorMessage?: string }> => {
    const accountPayload: UserAccount = {
      ...newAccount,
      password: newAccount.password || '1234',
      department: newAccount.department || newAccount.affiliation || '포승공장',
      isActive: newAccount.isActive !== false,
      createdAt: newAccount.createdAt || TODAY_STR,
    };

    const nextAccounts = ensureDefaultAdminAccount([...userAccounts, accountPayload]);
    const accRes = await insertUserAccountToSupabase(accountPayload, nextAccounts);
    if (!accRes.ok) {
      console.error('[Supabase Add Account Error]:', accRes.errorMessage);
      showToast(`❌ [Supabase 계정 생성 실패] ${accRes.errorMessage}`);
      return { ok: false, errorMessage: accRes.errorMessage };
    }

    const nextPasswords = {
      ...userPasswords,
      [accountPayload.username]: accountPayload.password || '1234',
    };
    setUserAccounts(nextAccounts);
    setUserPasswords(nextPasswords);

    const displayName = accountPayload.title
      ? `${accountPayload.name} ${accountPayload.title}`
      : accountPayload.name;

    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetId: accountPayload.id,
      targetName: `${displayName} (${accountPayload.username})`,
      targetLine: accountPayload.affiliation,
      beforeValue: '미등록',
      afterValue: `LV.${accountPayload.level} (${accountPayload.affiliation || '소속미정'})`,
      details: `신규 사용자 계정 '${displayName} (${accountPayload.username})' 생성`,
    });

    showToast(
      `✅ [${accountPayload.affiliation || '소속'}] '${displayName} (${accountPayload.username})' 계정이 Supabase DB에 생성되었습니다. (초기 PW: 1234)`
    );
    return { ok: true };
  };

  const handleUpdateAccount = async (
    updatedAccount: UserAccount,
    previousUsername?: string
  ): Promise<{ ok: boolean; errorMessage?: string }> => {
    const oldUsername = previousUsername || updatedAccount.username;
    const oldAcc = userAccounts.find(
      (a) => a.id === updatedAccount.id || (previousUsername && a.username === previousUsername)
    );

    const preservedPassword =
      updatedAccount.password ||
      oldAcc?.password ||
      userPasswords[oldUsername] ||
      userPasswords[updatedAccount.username] ||
      '1234';

    const payloadAccount: UserAccount = {
      ...oldAcc,
      ...updatedAccount,
      id: updatedAccount.id,
      password: preservedPassword,
      department:
        updatedAccount.department ||
        updatedAccount.affiliation ||
        oldAcc?.department ||
        '포승공장',
      isActive: updatedAccount.isActive !== false,
      createdAt: updatedAccount.createdAt || oldAcc?.createdAt || TODAY_STR,
    };

    const updatedList = userAccounts.map((acc) =>
      acc.id === payloadAccount.id ? payloadAccount : acc
    );
    const deduped = new Map<string, UserAccount>();
    updatedList.forEach((acc) => deduped.set(acc.id, acc));
    const sortedAccounts = ensureDefaultAdminAccount(Array.from(deduped.values()));

    const res = await updateUserAccountInSupabase(payloadAccount, sortedAccounts);
    if (!res.ok) {
      console.error('[Supabase Update Account Error]:', res.errorMessage);
      showToast(`❌ [Supabase 계정 수정 실패] ${res.errorMessage}`);
      return { ok: false, errorMessage: res.errorMessage };
    }

    setUserAccounts(sortedAccounts);

    if (previousUsername && previousUsername !== payloadAccount.username) {
      const updatedPw = { ...userPasswords };
      updatedPw[payloadAccount.username] = preservedPassword;
      delete updatedPw[previousUsername];
      setUserPasswords(updatedPw);
    }

    const fullDisplayName = payloadAccount.title
      ? `${payloadAccount.name} ${payloadAccount.title}`
      : payloadAccount.name;
    const oldFullDisplayName = oldAcc
      ? oldAcc.title
        ? `${oldAcc.name} ${oldAcc.title}`
        : oldAcc.name
      : '';

    const changedItems: InventoryItem[] = [];
    const nextItems = items.map((it) => {
      const matchesId = it.receiverLoginId === oldUsername;
      const matchesOldName =
        oldFullDisplayName && !it.receiverLoginId && it.receiverName === oldFullDisplayName;
      if (matchesId || matchesOldName) {
        const updatedIt: InventoryItem = {
          ...it,
          receiverLoginId: payloadAccount.username,
          receiverName: fullDisplayName,
          receiverPhone: payloadAccount.phone || it.receiverPhone,
        };
        changedItems.push(updatedIt);
        return updatedIt;
      }
      return it;
    });

    if (changedItems.length > 0) {
      const itemRes = await batchUpsertInventoryItemsToSupabase(changedItems, nextItems);
      if (itemRes.ok) {
        setItems(nextItems);
      } else {
        console.error('[Supabase Linked Items Update Error]:', itemRes.errorMessage);
      }
    }

    if (currentUser && currentUser.id === payloadAccount.id) {
      setCurrentUser(payloadAccount);
      try {
        sessionStorage.setItem('ds_mro_current_user', JSON.stringify(payloadAccount));
      } catch (e) {}
    }

    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetId: payloadAccount.id,
      targetName: `${fullDisplayName} (${payloadAccount.username})`,
      targetLine: payloadAccount.affiliation,
      beforeValue: oldAcc
        ? `${oldAcc.name} / LV.${oldAcc.level} / ${oldAcc.affiliation}`
        : oldUsername,
      afterValue: `${fullDisplayName} / LV.${payloadAccount.level} / ${payloadAccount.affiliation}`,
      details: `'${fullDisplayName} (${payloadAccount.username})' 계정 정보 수정`,
    });

    showToast(
      `✅ '${fullDisplayName} (${payloadAccount.username})' 계정 정보가 Supabase DB에 업데이트되었습니다.`
    );
    return { ok: true };
  };

  const handleToggleAccountActive = async (accountId: string) => {
    const target = userAccounts.find((a) => a.id === accountId);
    if (!target) return;
    if (target.username === 'admin') {
      showToast('⚠️ 시스템 기본 최고관리자(admin) 계정은 비활성화할 수 없습니다.');
      return;
    }
    const nextActive = target.isActive === false;
    const updatedTarget: UserAccount = {
      ...target,
      password: target.password || userPasswords[target.username] || '1234',
      isActive: nextActive,
    };

    const nextAccounts = userAccounts.map((acc) =>
      acc.id === accountId ? updatedTarget : acc
    );

    const res = await updateUserAccountInSupabase(updatedTarget, nextAccounts);
    if (!res.ok) {
      console.error('[Supabase Toggle Account Active Error]:', res.errorMessage);
      showToast(`❌ [Supabase 계정 상태 변경 실패] ${res.errorMessage}`);
      return;
    }

    setUserAccounts(nextAccounts);

    const displayName = target.title ? `${target.name} ${target.title}` : target.name;
    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetId: target.id,
      targetName: `${displayName} (${target.username})`,
      targetLine: target.affiliation,
      beforeValue: target.isActive === false ? '비활성' : '활성',
      afterValue: nextActive ? '활성' : '비활성',
      details: `'${displayName} (${target.username})' 계정 상태 [${nextActive ? '활성' : '비활성'}] 전환`,
    });

    showToast(
      nextActive
        ? `✅ '${displayName} (${target.username})' 계정이 [활성] 상태로 전환되었습니다.`
        : `⛔ '${displayName} (${target.username})' 계정이 [비활성] 처리되어 로그인이 제한됩니다.`
    );
  };

  const handleDeleteAccount = async (accountId: string, options?: DeleteAccountOptions) => {
    const target = userAccounts.find((a) => a.id === accountId);
    if (!target) return;
    if (target.username === 'admin') {
      showToast('⚠️ 시스템 기본 최고관리자(admin) 계정은 삭제할 수 없습니다.');
      return;
    }

    const displayName = target.title ? `${target.name} ${target.title}` : target.name;

    if (options?.mode === 'deactivate') {
      const deactivated: UserAccount = {
        ...target,
        password: target.password || userPasswords[target.username] || '1234',
        isActive: false,
      };
      const nextAccounts = userAccounts.map((acc) =>
        acc.id === accountId ? deactivated : acc
      );
      const res = await updateUserAccountInSupabase(deactivated, nextAccounts);
      if (!res.ok) {
        console.error('[Supabase Deactivate Account Error]:', res.errorMessage);
        showToast(`❌ [Supabase 비활성 전환 실패] ${res.errorMessage}`);
        return;
      }
      setUserAccounts(nextAccounts);
      recordAuditLog({
        actionType: 'ACCOUNT_MUTATE',
        targetId: target.id,
        targetName: `${displayName} (${target.username})`,
        targetLine: target.affiliation,
        beforeValue: '활성',
        afterValue: '비활성 (이력 보존)',
        details: `'${displayName} (${target.username})' 계정 비활성 전환`,
      });
      showToast(
        `⛔ '${displayName} (${target.username})' 계정이 연결된 품목 이력 보존을 위해 [비활성] 상태로 전환되었습니다.`
      );
      return;
    }

    const remainingAccounts = ensureDefaultAdminAccount(
      userAccounts.filter((acc) => acc.id !== accountId)
    );
    const dbDeleteResult = await deleteUserAccountFromSupabase(accountId, remainingAccounts);
    if (!dbDeleteResult.ok && dbDeleteResult.isForeignKeyError) {
      const deactivated: UserAccount = {
        ...target,
        password: target.password || userPasswords[target.username] || '1234',
        isActive: false,
      };
      const nextAccounts = userAccounts.map((acc) =>
        acc.id === accountId ? deactivated : acc
      );
      const updateRes = await updateUserAccountInSupabase(deactivated, nextAccounts);
      if (updateRes.ok) {
        setUserAccounts(nextAccounts);
      }
      showToast(
        `⚠️ '${displayName}' 계정이 DB 외래 키(품목/발주 이력)와 연결되어 있어 안전하게 [비활성] 상태로 전환되었습니다.`
      );
      return;
    }

    if (!dbDeleteResult.ok) {
      console.error('[Supabase Delete Account Error]:', dbDeleteResult.errorMessage);
      showToast(`❌ [Supabase 삭제 실패] ${dbDeleteResult.errorMessage}`);
      return;
    }

    if (options?.unlinkItems !== false) {
      const changed: InventoryItem[] = [];
      const nextItems = items.map((it) => {
        const isLinkedById = it.receiverLoginId && it.receiverLoginId.trim() === target.username;
        const isLinkedByName =
          !it.receiverLoginId && it.receiverName && it.receiverName.trim() === target.name.trim();
        if (isLinkedById || isLinkedByName) {
          const unlinked: InventoryItem = {
            ...it,
            receiverLoginId: undefined,
            receiverName: undefined,
            receiverPhone: undefined,
          };
          changed.push(unlinked);
          return unlinked;
        }
        return it;
      });
      if (changed.length > 0) {
        const unlinkRes = await batchUpsertInventoryItemsToSupabase(changed, nextItems);
        if (unlinkRes.ok) {
          setItems(nextItems);
        }
      }
    }

    setUserAccounts(remainingAccounts);

    if (target.username in userPasswords) {
      const updatedPw = { ...userPasswords };
      delete updatedPw[target.username];
      setUserPasswords(updatedPw);
    }

    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetId: target.id,
      targetName: `${displayName} (${target.username})`,
      targetLine: target.affiliation,
      beforeValue: `LV.${target.level} (${target.affiliation})`,
      afterValue: '영구 삭제됨',
      details: `'${displayName} (${target.username})' 계정 영구 삭제`,
    });

    showToast(`🗑️ '${displayName} (${target.username})' 계정이 Supabase DB에서 영구 삭제되었습니다.`);
  };

  const handleAssignItemReceiver = async (itemId: string, account: UserAccount | null) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const prevReceiver = targetItem.receiverName || '미지정';

    if (!account) {
      const updatedItem: InventoryItem = {
        ...targetItem,
        receiverLoginId: undefined,
        receiverName: undefined,
        receiverPhone: undefined,
      };
      const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));

      const res = await upsertInventoryItemToSupabase(updatedItem, nextItems);
      if (!res.ok) {
        console.error('[Supabase Assign Receiver Error]:', res.errorMessage);
        showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
        return;
      }

      setItems(nextItems);
      recordAuditLog({
        actionType: 'ITEM_RECEIVER_ASSIGN',
        targetId: targetItem.id,
        targetName: `${targetItem.itemName} (${targetItem.spec})`,
        targetLine: targetItem.line,
        beforeValue: prevReceiver,
        afterValue: '수령자 지정 해제',
        details: `[${targetItem.itemName}] 수령자 지정 해제`,
      });

      showToast(`💾 [${targetItem.itemName}] 수령자(담당자) 지정 해제 내용이 클라우드 DB에 저장되었습니다.`);
      return;
    }

    const fullDisplayName = account.title ? `${account.name} ${account.title}` : account.name;
    const updatedItem: InventoryItem = {
      ...targetItem,
      receiverLoginId: account.username,
      receiverName: fullDisplayName,
      receiverPhone: account.phone || targetItem.receiverPhone,
    };

    const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));
    const res = await upsertInventoryItemToSupabase(updatedItem, nextItems);
    if (!res.ok) {
      console.error('[Supabase Assign Receiver Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    recordAuditLog({
      actionType: 'ITEM_RECEIVER_ASSIGN',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: prevReceiver,
      afterValue: `${fullDisplayName} (${account.username})`,
      details: `[${targetItem.itemName}] 수령자 '${fullDisplayName}' 지정`,
    });

    showToast(
      `💾 [${targetItem.itemName}] 수령자(담당자) '${fullDisplayName} (${account.affiliation || '소속'})' 변경사항이 클라우드 DB에 저장되었습니다.`
    );
  };

  const handleUpdateItemDeliveryLocation = async (
    itemId: string,
    deliveryDetailLocation: string | undefined
  ) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;
    const category = categories.find((c) => c.id === targetItem.categoryId);
    const trimmed = deliveryDetailLocation?.trim() || undefined;
    const updatedItem: InventoryItem = {
      ...targetItem,
      deliveryDetailLocation: trimmed,
    };

    const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));
    const res = await upsertInventoryItemToSupabase(updatedItem, nextItems);
    if (!res.ok) {
      console.error('[Supabase Update Delivery Location Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    const defaultLoc = getDefaultDeliveryLocationForLine(targetItem.line, category);
    recordAuditLog({
      actionType: 'ITEM_LOCATION_UPDATE',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: targetItem.deliveryDetailLocation || `기본값 (${defaultLoc})`,
      afterValue: trimmed || `기본값 (${defaultLoc})`,
      details: `[${targetItem.itemName}] 수령장소 변경`,
    });

    if (trimmed) {
      showToast(
        `💾 [${targetItem.line} · ${targetItem.itemName}] 수령장소('${trimmed}')가 클라우드 DB에 즉시 저장되었습니다.`
      );
    } else {
      showToast(
        `💾 [${targetItem.line} · ${targetItem.itemName}] 수령장소가 라인 기본값('${defaultLoc}')으로 복원·저장되었습니다.`
      );
    }
  };

  const handleUpdateItemLine = async (itemId: string, newLine: ProductionLine) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem || targetItem.line === newLine) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      line: newLine,
    };

    const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));
    const res = await upsertInventoryItemToSupabase(updatedItem, nextItems);
    if (!res.ok) {
      console.error('[Supabase Update Item Line Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    recordAuditLog({
      actionType: 'ITEM_LINE_UPDATE',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: newLine,
      beforeValue: targetItem.line,
      afterValue: newLine,
      details: `[${targetItem.itemName}] 담당 라인 '${targetItem.line}' → '${newLine}' 변경`,
    });

    showToast(
      `💾 [${targetItem.itemName}] 담당 라인이 '${targetItem.line}' → '${newLine}'(으)로 변경되어 클라우드 DB에 저장되었습니다.`
    );
  };

  const handleTabChangeWithRBAC = (nextTab: ActiveTab) => {
    if (!isTabAllowed(nextTab, currentUser)) {
      const reason = getTabAccessDeniedReason(nextTab, currentUser);
      showToast(reason);
      return;
    }

    if (isWorkerMode && nextTab !== 'field-audit' && nextTab !== 'dashboard') {
      showToast('⚠️ [현장 작업자 모드] 작업자 모드에서는 실사 및 대시보드만 조회할 수 있습니다.');
      return;
    }

    setActiveTab(nextTab);
    syncActiveTabToUrl(nextTab, true);
  };

  const handleToggleWorkerMode = () => {
    if (currentUser?.level === 2) {
      showToast('LV.2 현장사용자 계정은 현장 실사 및 모니터링 전용으로 고정되어 있습니다.');
      return;
    }
    setIsWorkerMode((prev) => {
      const next = !prev;
      if (next) {
        if (activeTab !== 'field-audit' && activeTab !== 'dashboard') {
          setActiveTab('field-audit');
        }
        showToast(
          '👷 [현장 작업자 간소화 모드]로 전환되었습니다. (실사 입력 & 입고확정 및 읽기전용 모니터링만 활성화)'
        );
      } else {
        showToast('🏢 [전체 관리자 모드]로 복귀되었습니다. 허용된 사무·발주·통계 메뉴를 사용할 수 있습니다.');
      }
      return next;
    });
  };

  const handleUpdateStock = async (itemId: string, newPackStock: number) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const perm = checkPermission('edit_field_stock', currentUser, { targetItem });
    if (!perm.allowed) {
      showToast(perm.reason || '⚠️ 재고 실사 수정 권한이 없습니다.');
      return;
    }

    const now = new Date();
    const timeStr = `${TODAY_STR} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const auditLabel = `${timeStr} 실사확정`;
    const auditorName = currentUser
      ? currentUser.title
        ? `${currentUser.name} ${currentUser.title}`
        : currentUser.name
      : undefined;
    const nowMs = Date.now();

    const updatedItem: InventoryItem = {
      ...targetItem,
      currentPackStock: newPackStock,
      lastAuditDate: auditLabel,
      lastAuditedBy: auditorName || targetItem.receiverName || '현장담당',
      lastAuditUpdatedAt: nowMs,
    };

    const nextItems = items.map((item) => (item.id === itemId ? updatedItem : item));

    const [itemRes, tsRes] = await Promise.all([
      upsertInventoryItemToSupabase(updatedItem, nextItems),
      saveLastAuditTimestampToSupabase(auditLabel),
    ]);

    if (!itemRes.ok || !tsRes.ok) {
      const errMsg = itemRes.errorMessage || tsRes.errorMessage;
      console.error('[Supabase Update Stock Error]:', errMsg);
      showToast(`❌ [Supabase 재고 저장 실패] ${errMsg}`);
      void syncFromSupabaseCloud({ silent: true });
      return;
    }

    setLastAuditTimestamp(auditLabel);
    setItems(nextItems);

    recordAuditLog({
      actionType: 'STOCK_UPDATE',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: `${targetItem.currentPackStock} ${targetItem.packUnit}`,
      afterValue: `${newPackStock} ${targetItem.packUnit}`,
      details: `[${targetItem.itemName}] 현재고 ${targetItem.currentPackStock} → ${newPackStock} ${targetItem.packUnit} 변경`,
    });
  };

  const handleUpdateDailyUsage = async (itemId: string, newDailyUsage: number) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      dailyUsage: newDailyUsage,
    };

    const nextItems = items.map((item) => (item.id === itemId ? updatedItem : item));
    const res = await upsertInventoryItemToSupabase(updatedItem, nextItems);
    if (!res.ok) {
      console.error('[Supabase Update Daily Usage Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    recordAuditLog({
      actionType: 'SAFETY_STOCK_CALIBRATE',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: `일소모 ${targetItem.dailyUsage} ${targetItem.baseUnit}`,
      afterValue: `일소모 ${newDailyUsage} ${targetItem.baseUnit}`,
      details: `[${targetItem.itemName}] 기준 일소모량 ${targetItem.dailyUsage} → ${newDailyUsage} ${targetItem.baseUnit} 수정`,
    });
  };

  const handleToggleStatus = async (
    itemId: string,
    newStatus: '발주대기' | '발주완료(입고대기)'
  ) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const v = vendors.find((vend) => vend.id === targetItem.vendorId);
    const leadTime = v ? v.defaultLeadTime : targetItem.leadTimeDays || 3;
    const target = new Date(TODAY_STR);
    target.setDate(target.getDate() + leadTime);
    const expectedArrivalDate = target.toISOString().split('T')[0];

    const updatedItem: InventoryItem =
      newStatus === '발주완료(입고대기)'
        ? {
            ...targetItem,
            orderStatus: newStatus,
            orderDate: TODAY_STR,
            expectedArrivalDate,
            lastOrderDate: TODAY_STR,
            orderedPackQty:
              targetItem.orderedPackQty ||
              calculateItemMetrics(
                targetItem,
                categories.find((c) => c.id === targetItem.categoryId),
                v
              ).recommendedPackOrderQty,
          }
        : {
            ...targetItem,
            orderStatus: newStatus,
            orderDate: null,
            expectedArrivalDate: null,
            orderedPackQty: null,
          };

    const nextItems = items.map((item) => (item.id === itemId ? updatedItem : item));
    const res = await upsertInventoryItemToSupabase(updatedItem, nextItems);
    if (!res.ok) {
      console.error('[Supabase Toggle Status Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    recordAuditLog({
      actionType: 'ORDER_UPDATE',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: targetItem.orderStatus,
      afterValue: newStatus,
      details: `[${targetItem.itemName}] 발주 상태 '${targetItem.orderStatus}' → '${newStatus}' 전환`,
    });

    showToast(`발주 진행상태가 '${newStatus}' 상태로 변경되어 클라우드 DB에 저장되었습니다.`);
  };

  const handleBatchCommitStock = async (changes: Record<string, number>) => {
    const perm = checkPermission('batch_commit_audit', currentUser);
    if (!perm.allowed) {
      showToast(perm.reason || '⚠️ 실사 데이터 일괄 확정 권한이 없습니다.');
      return;
    }

    const changeCount = Object.keys(changes).length;
    if (changeCount === 0) return;

    const now = new Date();
    const timeStr = `${TODAY_STR} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const auditLabel = `${timeStr} 실사확정`;
    const auditorName = currentUser
      ? currentUser.title
        ? `${currentUser.name} ${currentUser.title}`
        : currentUser.name
      : undefined;
    const baseMs = Date.now();

    const newLogs: UsageLog[] = [];
    const beforeSummaryParts: string[] = [];
    const afterSummaryParts: string[] = [];

    items.forEach((item) => {
      const newStock = changes[item.id];
      if (newStock !== undefined) {
        beforeSummaryParts.push(`${item.itemName}: ${item.currentPackStock}${item.packUnit}`);
        afterSummaryParts.push(`${item.itemName}: ${newStock}${item.packUnit}`);
      }
      if (newStock !== undefined && newStock < item.currentPackStock) {
        const diff = Number((item.currentPackStock - newStock).toFixed(2));
        const baseQty = Number((diff * item.unitConversion).toFixed(2));
        const cat = categories.find((c) => c.id === item.categoryId);
        newLogs.push({
          id: `log_${Date.now()}_${item.id}`,
          itemId: item.id,
          itemName: item.itemName,
          spec: item.spec,
          line: item.line,
          categoryId: item.categoryId,
          categoryName: cat?.name || '기타',
          date: TODAY_STR,
          month: TODAY_STR.substring(0, 7),
          packUsedQty: Math.ceil(diff),
          baseUsedQty: baseQty,
          unitPrice: item.unitPrice,
          totalCost: Math.round(baseQty * item.unitPrice),
          baseUnit: item.baseUnit,
          packUnit: item.packUnit,
          recordedVia: 'audit',
        });
      }
    });

    const nextLogs = newLogs.length > 0 ? [...newLogs, ...usageLogs] : usageLogs;

    let offset = 0;
    const updatedBatch: InventoryItem[] = [];
    const nextItems = items.map((item) => {
      if (changes[item.id] !== undefined) {
        offset += 1;
        const updated: InventoryItem = {
          ...item,
          currentPackStock: changes[item.id],
          lastAuditDate: auditLabel,
          lastAuditedBy: auditorName || item.receiverName || '현장담당',
          lastAuditUpdatedAt: baseMs + offset,
        };
        updatedBatch.push(updated);
        return updated;
      }
      return item;
    });

    const results = await Promise.all([
      batchUpsertInventoryItemsToSupabase(updatedBatch, nextItems),
      saveLastAuditTimestampToSupabase(auditLabel),
      newLogs.length > 0
        ? saveUsageLogsToSupabase(nextLogs)
        : Promise.resolve<SupabaseMutationResult>({ ok: true }),
    ]);

    const failed = results.find((r) => !r.ok);
    if (failed) {
      console.error('[Supabase Batch Commit Stock Error]:', failed.errorMessage);
      showToast(`❌ [실사 확정 DB 저장 실패] ${failed.errorMessage}`);
      void syncFromSupabaseCloud({ silent: true });
      return;
    }

    setLastAuditTimestamp(auditLabel);
    if (newLogs.length > 0) {
      setUsageLogs(nextLogs);
    }
    setItems(nextItems);

    recordAuditLog({
      actionType: 'STOCK_BATCH_AUDIT',
      targetName: `현장 실사 일괄 확정 (${changeCount}개 품목)`,
      beforeValue:
        beforeSummaryParts.slice(0, 5).join(', ') +
        (changeCount > 5 ? ` 외 ${changeCount - 5}건` : ''),
      afterValue:
        afterSummaryParts.slice(0, 5).join(', ') +
        (changeCount > 5 ? ` 외 ${changeCount - 5}건` : ''),
      details: `총 ${changeCount}개 소모품 현장 실사재고 일괄 확정 반영`,
    });

    showToast(
      `✅ [실사 확정 완료] 총 ${changeCount}개 소모품의 현장 실사재고가 클라우드 DB에 안전하게 확정 반영되었습니다.`
    );
  };

  const handleConfirmAuditWithoutChange = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;
    const now = new Date();
    const timeStr = `${TODAY_STR} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const auditLabel = `${timeStr} 실사확정`;
    const auditorName = currentUser
      ? currentUser.title
        ? `${currentUser.name} ${currentUser.title}`
        : currentUser.name
      : undefined;
    const baseMs = Date.now();

    let offset = 0;
    const updatedBatch: InventoryItem[] = [];
    const nextItems = items.map((it) => {
      if (itemIds.includes(it.id)) {
        offset += 1;
        const updated: InventoryItem = {
          ...it,
          lastAuditDate: auditLabel,
          lastAuditedBy: auditorName || it.receiverName || '현장담당',
          lastAuditUpdatedAt: baseMs + offset,
        };
        updatedBatch.push(updated);
        return updated;
      }
      return it;
    });

    const results = await Promise.all([
      batchUpsertInventoryItemsToSupabase(updatedBatch, nextItems),
      saveLastAuditTimestampToSupabase(auditLabel),
    ]);

    const failed = results.find((r) => !r.ok);
    if (failed) {
      console.error('[Supabase Confirm Audit Error]:', failed.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${failed.errorMessage}`);
      void syncFromSupabaseCloud({ silent: true });
      return;
    }

    setLastAuditTimestamp(auditLabel);
    setItems(nextItems);

    recordAuditLog({
      actionType: 'STOCK_BATCH_AUDIT',
      targetName: `실사 변동없음 확인 (${itemIds.length}개 품목)`,
      beforeValue: '실사 대기/지연',
      afterValue: `${auditLabel} (수량 변동 없음)`,
      details: `총 ${itemIds.length}개 품목 실사 완료(수량 변동 없음) 확정`,
    });

    showToast(
      `✅ [실사 완료 처리] 총 ${itemIds.length}개 품목의 실사 일시가 금일(${TODAY_STR}) 기준으로 클라우드 DB에 갱신되었습니다.`
    );
  };

  const handleApplyActualDailyUsage = async (itemId: string, actualDailyUsage: number) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      dailyUsage: actualDailyUsage,
    };

    const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));
    const res = await upsertInventoryItemToSupabase(updatedItem, nextItems);
    if (!res.ok) {
      console.error('[Supabase Apply Actual Daily Usage Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    recordAuditLog({
      actionType: 'SAFETY_STOCK_CALIBRATE',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: `기준 일소모 ${targetItem.dailyUsage} ${targetItem.baseUnit}`,
      afterValue: `실측 보정 ${actualDailyUsage} ${targetItem.baseUnit}`,
      details: `[${targetItem.itemName}] 안전재고 실측 일소모량(${actualDailyUsage}) 반영`,
    });
  };

  const handleBatchApplyActualDailyUsage = async (updates: Record<string, number>) => {
    const count = Object.keys(updates).length;
    if (count === 0) return;

    const updatedBatch: InventoryItem[] = [];
    const nextItems = items.map((it) => {
      if (updates[it.id] !== undefined) {
        const updated: InventoryItem = { ...it, dailyUsage: updates[it.id] };
        updatedBatch.push(updated);
        return updated;
      }
      return it;
    });

    const res = await batchUpsertInventoryItemsToSupabase(updatedBatch, nextItems);
    if (!res.ok) {
      console.error('[Supabase Batch Apply Daily Usage Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    recordAuditLog({
      actionType: 'SAFETY_STOCK_CALIBRATE',
      targetName: `안전재고 자동 학습 일괄 보정 (${count}개 품목)`,
      beforeValue: `기존 기준 일소모량 (${count}건)`,
      afterValue: `실측 기반 추천 일소모량 일괄 적용 (${count}건)`,
      details: `편차 ±20% 이상 품목 ${count}건 기준 일소모량 일괄 보정`,
    });

    showToast(
      `✅ [안전재고 자동 학습 일괄 반영] 편차 ±20% 이상 품목 ${count}건의 기준 일소모량이 클라우드 DB에 일괄 보정되었습니다.`
    );
  };

  const handleReceiveStock = async (
    itemId: string,
    remainingStockBeforeArrival?: number,
    actualIncomingQty?: number
  ) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const perm = checkPermission('confirm_receipt', currentUser, { targetItem });
    if (!perm.allowed) {
      showToast(perm.reason || '⚠️ 입고확정 처리 권한이 없습니다.');
      return;
    }

    const calc = calculateItemMetrics(
      targetItem,
      categories.find((c) => c.id === targetItem.categoryId),
      vendors.find((v) => v.id === targetItem.vendorId)
    );

    const baseRemaining =
      remainingStockBeforeArrival !== undefined
        ? remainingStockBeforeArrival
        : targetItem.currentPackStock;

    const incoming =
      actualIncomingQty !== undefined
        ? actualIncomingQty
        : targetItem.orderedPackQty || calc.recommendedPackOrderQty;

    const finalStock = Number((baseRemaining + incoming).toFixed(2));

    const now = new Date();
    const timeStr = `${TODAY_STR} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const receiveAuditLabel = `${timeStr} 입고확정`;
    const auditorName = currentUser
      ? currentUser.title
        ? `${currentUser.name} ${currentUser.title}`
        : currentUser.name
      : undefined;
    const nowMs = Date.now();

    const updatedItem: InventoryItem = {
      ...targetItem,
      currentPackStock: finalStock,
      orderStatus: '발주대기',
      lastOrderDate: targetItem.orderDate || TODAY_STR,
      lastAuditDate: receiveAuditLabel,
      lastAuditedBy: auditorName || targetItem.receiverName || '현장담당',
      lastAuditUpdatedAt: nowMs,
      orderDate: null,
      expectedArrivalDate: null,
      orderedPackQty: null,
    };

    const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));

    const idx = orderHistory.findIndex((r) => r.itemId === itemId && r.status === '입고대기');
    let nextHistory: OrderHistoryRecord[];
    if (idx !== -1) {
      const updated = [...orderHistory];
      const packQty = incoming || updated[idx].orderedPackQty;
      const conv = targetItem.unitConversion || updated[idx].unitConversion || 1;
      updated[idx] = {
        ...updated[idx],
        orderedPackQty: packQty,
        unitPrice: targetItem.unitPrice,
        totalAmount: Math.round(packQty * conv * targetItem.unitPrice),
        status: '입고완료',
        completedDate: TODAY_STR,
      };
      nextHistory = updated;
    } else {
      const newRecord: OrderHistoryRecord = {
        id: `hist_rcv_${Date.now()}_${itemId}`,
        itemId: targetItem.id,
        orderDate: targetItem.orderDate || TODAY_STR,
        expectedArrivalDate: targetItem.expectedArrivalDate || TODAY_STR,
        completedDate: TODAY_STR,
        vendorName: calc.vendorName,
        vendorId: targetItem.vendorId,
        line: targetItem.line,
        itemName: targetItem.itemName,
        spec: targetItem.spec,
        orderedPackQty: incoming,
        packUnit: targetItem.packUnit,
        unitConversion: targetItem.unitConversion,
        baseUnit: targetItem.baseUnit,
        unitPrice: targetItem.unitPrice,
        totalAmount: Math.round(incoming * targetItem.unitConversion * targetItem.unitPrice),
        deliveryLocation: calc.deliveryLocation || '',
        status: '입고완료',
        note: '현장 입고확정 자동 기록',
      };
      nextHistory = [newRecord, ...orderHistory];
    }

    const results = await Promise.all([
      upsertInventoryItemToSupabase(updatedItem, nextItems),
      saveOrderHistoryToSupabase(nextHistory),
      saveLastAuditTimestampToSupabase(receiveAuditLabel),
    ]);

    const failed = results.find((r) => !r.ok);
    if (failed) {
      console.error('[Supabase Receive Stock Error]:', failed.errorMessage);
      showToast(`❌ [입고확정 DB 저장 실패] ${failed.errorMessage}`);
      void syncFromSupabaseCloud({ silent: true });
      return;
    }

    setLastAuditTimestamp(receiveAuditLabel);
    setItems(nextItems);
    setOrderHistory(nextHistory);

    recordAuditLog({
      actionType: 'RECEIVE_CONFIRM',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: `입고전 잔여 ${baseRemaining} ${targetItem.packUnit}`,
      afterValue: `입고 +${incoming} → 최종 ${finalStock} ${targetItem.packUnit}`,
      details: `[${targetItem.itemName}] 입고확정 (+${incoming} ${targetItem.packUnit}, 최종 ${finalStock} ${targetItem.packUnit})`,
    });

    showToast(
      `✅ [입고 확정 완료] ${targetItem.itemName} (현장잔여 ${baseRemaining} + 입고 ${incoming} = 최종 ${finalStock} ${targetItem.packUnit}) 클라우드 DB 반영 완료`
    );
  };

  const handleConfirmOrder = async (
    itemIds: string[],
    orderDate: string,
    expectedArrivalDate: string,
    quantities: Record<string, number>
  ) => {
    const perm = checkPermission('create_purchase_order', currentUser);
    if (!perm.allowed) {
      showToast(perm.reason || '⚠️ 발주서 발행 권한이 없습니다.');
      return;
    }

    const finalOrderDate = orderDate || TODAY_STR;
    const updatedBatch: InventoryItem[] = [];

    const nextItems = items.map((it) => {
      if (itemIds.includes(it.id)) {
        const updated: InventoryItem = {
          ...it,
          orderStatus: '발주완료(입고대기)',
          orderDate: finalOrderDate,
          expectedArrivalDate,
          lastOrderDate: finalOrderDate,
          orderedPackQty: quantities[it.id] || it.orderedPackQty || 1,
        };
        updatedBatch.push(updated);
        return updated;
      }
      return it;
    });

    const newRecords: OrderHistoryRecord[] = [];
    const orderedNames: string[] = [];
    items.forEach((it) => {
      if (itemIds.includes(it.id)) {
        const category = categories.find((c) => c.id === it.categoryId);
        const vendor = vendors.find((v) => v.id === it.vendorId);
        const packQty = quantities[it.id] || it.orderedPackQty || 1;
        const conversion = it.unitConversion || 1;
        const totalBase = packQty * conversion;
        const totalAmount = totalBase * it.unitPrice;

        orderedNames.push(`${it.itemName}(${packQty}${it.packUnit})`);

        newRecords.push({
          id: `ord_${Date.now()}_${it.id}`,
          itemId: it.id,
          orderDate: finalOrderDate,
          expectedArrivalDate,
          completedDate: null,
          vendorName: vendor?.name || '공급업체',
          vendorId: it.vendorId,
          line: it.line,
          itemName: it.itemName,
          spec: it.spec,
          orderedPackQty: packQty,
          packUnit: it.packUnit,
          unitConversion: conversion,
          baseUnit: it.baseUnit,
          unitPrice: it.unitPrice,
          totalAmount,
          deliveryLocation: resolveEffectiveDeliveryLocation(it, category),
          status: '입고대기',
          note: '신규 발주서 발행건',
        });
      }
    });

    const nextHistory = newRecords.length > 0 ? [...newRecords, ...orderHistory] : orderHistory;

    const results = await Promise.all([
      batchUpsertInventoryItemsToSupabase(updatedBatch, nextItems),
      newRecords.length > 0
        ? saveOrderHistoryToSupabase(nextHistory)
        : Promise.resolve<SupabaseMutationResult>({ ok: true }),
    ]);

    const failed = results.find((r) => !r.ok);
    if (failed) {
      console.error('[Supabase Confirm Order Error]:', failed.errorMessage);
      showToast(`❌ [발주 확정 DB 저장 실패] ${failed.errorMessage}`);
      void syncFromSupabaseCloud({ silent: true });
      return;
    }

    setItems(nextItems);
    if (newRecords.length > 0) {
      setOrderHistory(nextHistory);
    }

    recordAuditLog({
      actionType: 'ORDER_CREATE',
      targetName: `발주서 발행 (${itemIds.length}개 품목)`,
      beforeValue: '발주대기',
      afterValue: `발주완료(입고예정: ${expectedArrivalDate}) · ${orderedNames.slice(0, 4).join(', ')}`,
      details: `총 ${itemIds.length}개 품목 신규 발주 확정 (입고예정일: ${expectedArrivalDate})`,
    });

    showToast(
      `✅ 총 ${itemIds.length}개 품목의 발주가 클라우드 DB에 확정되었습니다. (입고예정: ${expectedArrivalDate})`
    );
  };

  const handleUpdateOrder = async (
    itemId: string,
    orderDate: string,
    expectedArrivalDate: string,
    orderedPackQty: number
  ) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      orderDate,
      expectedArrivalDate,
      orderedPackQty,
      lastOrderDate: orderDate,
    };

    const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));

    const idx = orderHistory.findIndex((r) => r.itemId === itemId && r.status === '입고대기');
    let nextHistory = orderHistory;
    if (idx !== -1) {
      const updated = [...orderHistory];
      const rec = updated[idx];
      const conversion = rec.unitConversion || targetItem.unitConversion || 1;
      const unitPrice = rec.unitPrice || targetItem.unitPrice || 0;
      const totalAmount = orderedPackQty * conversion * unitPrice;

      updated[idx] = {
        ...rec,
        orderDate,
        expectedArrivalDate,
        orderedPackQty,
        totalAmount: totalAmount > 0 ? totalAmount : rec.totalAmount,
      };
      nextHistory = updated;
    }

    const results = await Promise.all([
      upsertInventoryItemToSupabase(updatedItem, nextItems),
      idx !== -1
        ? saveOrderHistoryToSupabase(nextHistory)
        : Promise.resolve<SupabaseMutationResult>({ ok: true }),
    ]);

    const failed = results.find((r) => !r.ok);
    if (failed) {
      console.error('[Supabase Update Order Error]:', failed.errorMessage);
      showToast(`❌ [발주 수정 DB 저장 실패] ${failed.errorMessage}`);
      void syncFromSupabaseCloud({ silent: true });
      return;
    }

    setItems(nextItems);
    if (idx !== -1) {
      setOrderHistory(nextHistory);
    }

    recordAuditLog({
      actionType: 'ORDER_UPDATE',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: `수량 ${targetItem.orderedPackQty || 0}${targetItem.packUnit} / 예정 ${targetItem.expectedArrivalDate || '-'}`,
      afterValue: `수량 ${orderedPackQty}${targetItem.packUnit} / 예정 ${expectedArrivalDate}`,
      details: `[${targetItem.itemName}] 발주 수량 및 입고예정일 변경`,
    });

    showToast(`✅ [${targetItem.itemName}] 발주 정보(일정 및 수량)가 클라우드 DB에 변경·저장되었습니다.`);
  };

  const handleCancelOrder = async (itemId: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      orderStatus: '발주대기',
      orderDate: null,
      expectedArrivalDate: null,
      orderedPackQty: null,
    };

    const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));

    const idx = orderHistory.findIndex((r) => r.itemId === itemId && r.status === '입고대기');
    let nextHistory = orderHistory;
    if (idx !== -1) {
      const updated = [...orderHistory];
      updated[idx] = {
        ...updated[idx],
        status: '발주취소',
        completedDate: TODAY_STR,
        note: updated[idx].note
          ? `${updated[idx].note} (발주취소됨)`
          : '관리자에 의해 발주 취소됨',
      };
      nextHistory = updated;
    }

    const results = await Promise.all([
      upsertInventoryItemToSupabase(updatedItem, nextItems),
      idx !== -1
        ? saveOrderHistoryToSupabase(nextHistory)
        : Promise.resolve<SupabaseMutationResult>({ ok: true }),
    ]);

    const failed = results.find((r) => !r.ok);
    if (failed) {
      console.error('[Supabase Cancel Order Error]:', failed.errorMessage);
      showToast(`❌ [발주 취소 DB 저장 실패] ${failed.errorMessage}`);
      void syncFromSupabaseCloud({ silent: true });
      return;
    }

    setItems(nextItems);
    if (idx !== -1) {
      setOrderHistory(nextHistory);
    }

    recordAuditLog({
      actionType: 'ORDER_CANCEL',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: `발주완료(입고대기) · ${targetItem.orderedPackQty || 0}${targetItem.packUnit}`,
      afterValue: '발주취소 (발주대기 복구)',
      details: `[${targetItem.itemName}] 진행 중인 발주 취소`,
    });

    showToast(`✅ [${targetItem.itemName}] 발주가 취소되었으며, 클라우드 DB에 발주대기 상태로 복구되었습니다.`);
  };

  const handleUpdateOrderHistoryRecord = async (updatedRecord: OrderHistoryRecord) => {
    const nextHistory = orderHistory.map((r) =>
      r.id === updatedRecord.id ? updatedRecord : r
    );

    const res = await saveOrderHistoryToSupabase(nextHistory);
    if (!res.ok) {
      console.error('[Supabase Update OrderHistory Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setOrderHistory(nextHistory);
    recordAuditLog({
      actionType: 'ORDER_UPDATE',
      targetId: updatedRecord.id,
      targetName: `${updatedRecord.itemName} (${updatedRecord.spec})`,
      targetLine: updatedRecord.line,
      beforeValue: '기존 발주이력 레코드',
      afterValue: `${updatedRecord.status} · ${updatedRecord.orderedPackQty}${updatedRecord.packUnit}`,
      details: `[${updatedRecord.itemName}] 발주 이력 상세 정보 수정`,
    });

    showToast('발주 이력 상세 정보가 클라우드 DB에 수정되었습니다.');
  };

  const handleDeleteOrderHistoryRecord = async (recordId: string) => {
    const targetRec = orderHistory.find((r) => r.id === recordId);
    const res = await deleteOrderHistoryFromSupabase(recordId);
    if (!res.ok) {
      console.error('[Supabase OrderHistory Delete Error]:', res.errorMessage);
      showToast(`❌ [Supabase 삭제 실패] ${res.errorMessage}`);
      return;
    }

    const nextHistory = orderHistory.filter((r) => r.id !== recordId);
    setOrderHistory(nextHistory);

    if (targetRec) {
      recordAuditLog({
        actionType: 'ORDER_HISTORY_DELETE',
        targetId: recordId,
        targetName: `${targetRec.itemName} (${targetRec.spec})`,
        targetLine: targetRec.line,
        beforeValue: `${targetRec.orderDate} / ${targetRec.orderedPackQty}${targetRec.packUnit}`,
        afterValue: '이력 삭제됨',
        details: `[${targetRec.itemName}] 발주 이력 레코드 삭제`,
      });
    }

    showToast('발주 이력 레코드가 클라우드 DB에서 삭제되었습니다.');
  };

  const handleOpenPOMetaModal = (
    vendor: Vendor,
    orderItems: CalculatedItem[],
    orderDate: string,
    expectedArrivalDate: string
  ) => {
    setPoModalData({
      isOpen: true,
      vendor,
      items: orderItems,
      orderDate,
      expectedArrivalDate,
      isAlreadyOrdered: orderItems.every(
        (i) => i.orderStatus === '발주완료(입고대기)'
      ),
    });
  };

  const handleOpenOrderModalForVendorAndItems = (
    vendorId: string,
    itemIds: string[]
  ) => {
    const v = vendors.find((vend) => vend.id === vendorId);
    if (!v) return;
    const targetItems = calculatedItems.filter((i) => itemIds.includes(i.id));
    const target = new Date(TODAY_STR);
    target.setDate(target.getDate() + v.defaultLeadTime);
    const expectedArrivalDate = target.toISOString().split('T')[0];

    handleOpenPOMetaModal(v, targetItems, TODAY_STR, expectedArrivalDate);
  };

  const handleOpenEditItem = (targetItem: InventoryItem) => {
    const original = items.find((i) => i.id === targetItem.id) || targetItem;
    setEditingItem(original);
    setIsNewItemModalOpen(true);
  };

  const handleSaveItem = async (item: InventoryItem) => {
    const prevItem = items.find((i) => i.id === item.id);
    const exists = items.some((i) => i.id === item.id);
    const nextItems = exists ? items.map((i) => (i.id === item.id ? item : i)) : [item, ...items];

    const res = await upsertInventoryItemToSupabase(item, nextItems);
    if (!res.ok) {
      console.error('[Supabase Save Item Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    recordAuditLog({
      actionType: prevItem ? 'ITEM_UPDATE' : 'ITEM_CREATE',
      targetId: item.id,
      targetName: `${item.itemName} (${item.spec})`,
      targetLine: item.line,
      beforeValue: prevItem
        ? `현재고 ${prevItem.currentPackStock}${prevItem.packUnit} / 단가 ₩${prevItem.unitPrice.toLocaleString()}`
        : '미등록 신규 품목',
      afterValue: `현재고 ${item.currentPackStock}${item.packUnit} / 단가 ₩${item.unitPrice.toLocaleString()}`,
      details: prevItem
        ? `소모품 '${item.itemName}' 마스터 정보 수정`
        : `신규 소모품 '${item.itemName}' 등록`,
    });

    showToast(`💾 소모품 '${item.itemName}' 정보가 클라우드 DB에 안전하게 저장되었습니다.`);
  };

  const handleDeleteItem = async (itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    const nextItems = items.filter((i) => i.id !== itemId);

    const res = await deleteInventoryItemFromSupabase(itemId, nextItems);
    if (!res.ok) {
      console.error('[Supabase Delete Item Error]:', res.errorMessage);
      showToast(`❌ [Supabase 삭제 실패] ${res.errorMessage}`);
      return;
    }

    setItems(nextItems);
    recordAuditLog({
      actionType: 'ITEM_DELETE',
      targetId: it.id,
      targetName: `${it.itemName} (${it.spec})`,
      targetLine: it.line,
      beforeValue: `${it.line} · 현재고 ${it.currentPackStock}${it.packUnit}`,
      afterValue: '품목 영구 삭제됨',
      details: `소모품 '${it.itemName} (${it.spec})' 마스터 삭제`,
    });

    showToast(`🗑️ '${it.itemName} (${it.spec})' 품목이 클라우드 DB에서 삭제되었습니다.`);
  };

  const handleUpdateCompanyProfile = async (profile: CompanyProfile) => {
    const prevBudget = companyProfile.monthlyBudget;
    const res = await saveCompanyProfileToSupabase(profile);
    if (!res.ok) {
      console.error('[Supabase Save CompanyProfile Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setCompanyProfile(profile);
    recordAuditLog({
      actionType: 'CATEGORY_MUTATE',
      targetName: `자사 프로필 및 월 예산 설정 (${profile.companyName})`,
      beforeValue: `월 예산 ₩${(prevBudget || 0).toLocaleString()}`,
      afterValue: `월 예산 ₩${(profile.monthlyBudget || 0).toLocaleString()}`,
      details: '자사 기준정보 및 월별 소모품 예산 한도 수정',
    });

    showToast('💾 자사 기준정보 및 월별 소모품 예산 한도가 클라우드 DB에 저장되었습니다.');
  };

  const handleAddCategory = async (cat: Category) => {
    const next = [...categories, cat];
    const res = await saveCategoriesToSupabase(next);
    if (!res.ok) {
      console.error('[Supabase Add Category Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setCategories(next);
    recordAuditLog({
      actionType: 'CATEGORY_MUTATE',
      targetId: cat.id,
      targetName: `카테고리: ${cat.name}`,
      beforeValue: '미등록',
      afterValue: `${cat.name} (안전재고 ${cat.safetyDays}일)`,
      details: `신규 카테고리 '${cat.name}' 추가`,
    });

    showToast(`💾 카테고리 '${cat.name}'이(가) 클라우드 DB에 추가 및 저장되었습니다.`);
  };

  const handleUpdateCategory = async (cat: Category) => {
    const next = categories.map((c) => (c.id === cat.id ? cat : c));
    const res = await saveCategoriesToSupabase(next);
    if (!res.ok) {
      console.error('[Supabase Update Category Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }

    setCategories(next);
    recordAuditLog({
      actionType: 'CATEGORY_MUTATE',
      targetId: cat.id,
      targetName: `카테고리: ${cat.name}`,
      beforeValue: '기존 카테고리 설정',
      afterValue: `${cat.name} (안전재고 ${cat.safetyDays}일)`,
      details: `카테고리 '${cat.name}' 설정 및 라인별 수령장소 수정`,
    });

    showToast(`💾 카테고리 '${cat.name}' 설정 및 라인별 수령장소가 클라우드 DB에 저장되었습니다.`);
  };

  const handleDeleteCategory = async (catId: string) => {
    const targetCat = categories.find((c) => c.id === catId);
    const res = await deleteCategoryFromSupabase(catId);
    if (!res.ok) {
      console.error('[Supabase Delete Category Error]:', res.errorMessage);
      showToast(`❌ [Supabase 삭제 실패] ${res.errorMessage}`);
      return;
    }

    const next = categories.filter((c) => c.id !== catId);
    setCategories(next);

    if (targetCat) {
      recordAuditLog({
        actionType: 'CATEGORY_MUTATE',
        targetId: catId,
        targetName: `카테고리: ${targetCat.name}`,
        beforeValue: targetCat.name,
        afterValue: '삭제됨',
        details: `카테고리 '${targetCat.name}' 삭제`,
      });
    }

    showToast('🗑️ 카테고리가 클라우드 DB에서 삭제되었습니다.');
  };

  const handleAddVendor = async (vend: Vendor) => {
    const next = [...vendors, vend];
    const res = await saveVendorsToSupabase(next);
    if (!res.ok) {
      console.error('[Supabase Add Vendor Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }
    setVendors(next);

    recordAuditLog({
      actionType: 'VENDOR_MUTATE',
      targetId: vend.id,
      targetName: `공급업체: ${vend.name}`,
      beforeValue: '미등록',
      afterValue: `${vend.name} (리드타임 ${vend.defaultLeadTime}일)`,
      details: `신규 공급업체 '${vend.name}' 등록`,
    });

    showToast(`💾 공급업체 '${vend.name}'이(가) 클라우드 DB에 등록되었습니다.`);
  };

  const handleUpdateVendor = async (vend: Vendor) => {
    const next = vendors.map((v) => (v.id === vend.id ? vend : v));
    const res = await saveVendorsToSupabase(next);
    if (!res.ok) {
      console.error('[Supabase Update Vendor Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }
    setVendors(next);

    recordAuditLog({
      actionType: 'VENDOR_MUTATE',
      targetId: vend.id,
      targetName: `공급업체: ${vend.name}`,
      beforeValue: '기존 거래처 정보',
      afterValue: `${vend.name} (${vend.contactPerson || '담당자'} / 리드타임 ${vend.defaultLeadTime}일)`,
      details: `공급업체 '${vend.name}' 정보 수정`,
    });

    showToast(`💾 공급업체 '${vend.name}' 정보가 클라우드 DB에 수정·저장되었습니다.`);
  };

  const handleDeleteVendor = async (vendId: string) => {
    const targetVendor = vendors.find((v) => v.id === vendId);
    const res = await deleteVendorFromSupabase(vendId);
    if (!res.ok) {
      console.error('[Supabase Delete Vendor Error]:', res.errorMessage);
      showToast(`❌ [Supabase 삭제 실패] ${res.errorMessage}`);
      return;
    }

    const next = vendors.filter((v) => v.id !== vendId);
    setVendors(next);

    if (targetVendor) {
      recordAuditLog({
        actionType: 'VENDOR_MUTATE',
        targetId: vendId,
        targetName: `공급업체: ${targetVendor.name}`,
        beforeValue: targetVendor.name,
        afterValue: '삭제됨',
        details: `공급업체 '${targetVendor.name}' 삭제`,
      });
    }

    showToast('🗑️ 공급업체가 클라우드 DB에서 삭제되었습니다.');
  };

  const handleAddUnit = async (u: Unit) => {
    const next = [...units, u];
    const res = await saveUnitsToSupabase(next);
    if (!res.ok) {
      console.error('[Supabase Add Unit Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }
    setUnits(next);
    showToast(`💾 단위 '${u.name}'이(가) 클라우드 DB에 등록되었습니다.`);
  };

  const handleDeleteUnit = async (unitId: string) => {
    const next = units.filter((u) => u.id !== unitId);
    const res = await saveUnitsToSupabase(next);
    if (!res.ok) {
      console.error('[Supabase Delete Unit Error]:', res.errorMessage);
      showToast(`❌ [Supabase 저장 실패] ${res.errorMessage}`);
      return;
    }
    setUnits(next);
    showToast('🗑️ 단위가 클라우드 DB에서 삭제되었습니다.');
  };

  const handleManualSaveMasterChanges = async (label = '기준정보 및 품목 마스터') => {
    setIsCloudSyncing(true);
    try {
      const results = await Promise.all([
        batchUpsertUserAccountsToSupabase(
          userAccounts.map((acc) => ({
            ...acc,
            password: acc.password || userPasswords[acc.username] || '1234',
          }))
        ),
        batchUpsertInventoryItemsToSupabase(items, items),
        saveCategoriesToSupabase(categories),
        saveVendorsToSupabase(vendors),
        saveUnitsToSupabase(units),
        saveCompanyProfileToSupabase(companyProfile),
      ]);

      const failed = results.find((r) => !r.ok);
      if (failed) {
        console.error('[Supabase Master Save Error]:', failed.errorMessage);
        showToast(`❌ [Supabase 저장 실패] ${failed.errorMessage}`);
        return;
      }

      showToast(
        `☁️ [클라우드 DB 저장 완료] ${label}의 모든 데이터가 Supabase 클라우드 DB에 안전하게 반영되었습니다.`
      );
    } catch (e) {
      console.error('Failed to manually save master changes to Supabase', e);
      showToast(
        `❌ [저장 오류] ${label} 클라우드 DB 동기화 중 예외가 발생했습니다: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleClearAuditLogs = async () => {
    if ((currentUser?.level ?? 99) !== 0) {
      showToast('⚠️ 변경 이력 초기화 권한은 LV.0 최고관리자에게만 있습니다.');
      return;
    }
    const res = await clearAuditLogsInSupabase();
    if (!res.ok) {
      console.error('[Supabase Clear Audit Logs Error]:', res.errorMessage);
      showToast(`❌ [Supabase 삭제 실패] ${res.errorMessage}`);
      return;
    }
    setAuditLogs([]);
    showToast('🗑️ 모든 데이터 변경 이력(Audit Log)이 클라우드 DB에서 초기화되었습니다.');
  };

  const handleResetAllData = async () => {
    if ((currentUser?.level ?? 99) !== 0) {
      showToast('⚠️ 데이터 초기화 권한은 LV.0 최고관리자에게만 있습니다.');
      return;
    }

    const resetEntry = createAuditLogEntry({
      currentUser,
      actionType: 'SYSTEM_RESET',
      targetName: '시스템 전체 현장/재고/발주 데이터',
      beforeValue: `품목 ${items.length}건, 발주이력 ${orderHistory.length}건`,
      afterValue: '초기화 완료 (클라우드 DB 리셋)',
      details: '최고관리자에 의한 초기 데이터 리셋 실행',
    });

    const res = await resetAllCloudDataInSupabase(
      INITIAL_COMPANY_PROFILE,
      INITIAL_USER_ACCOUNTS,
      INITIAL_UNITS,
      INITIAL_MEMO
    );
    if (!res.ok) {
      console.error('[Supabase Reset All Data Error]:', res.errorMessage);
      showToast(`❌ [클라우드 DB 초기화 실패] ${res.errorMessage}`);
      return;
    }

    await insertAuditLogToSupabase(resetEntry, [resetEntry]);

    setItems([]);
    setCategories([]);
    setVendors([]);
    setUnits(INITIAL_UNITS);
    setMemo(INITIAL_MEMO);
    setOrderHistory([]);
    setUsageLogs([]);
    setCompanyProfile(INITIAL_COMPANY_PROFILE);
    setUserAccounts(ensureDefaultAdminAccount(INITIAL_USER_ACCOUNTS));
    setUserPasswords({ admin: '1234' });
    setAuditLogs([resetEntry]);

    showToast('초기화가 완료되었습니다. (Supabase 클라우드 DB의 모든 현장/재고 데이터가 초기화되었습니다)');
  };

  const isEffectiveWorkerMode = isWorkerMode || currentUser?.level === 2;
  const canAccessFieldAudit = isTabAllowed('field-audit', currentUser);
  const canAccessOrderSheet = isTabAllowed('order-sheet', currentUser);
  const canAccessStats = isTabAllowed('stats', currentUser);
  const canAccessMasterData = isTabAllowed('master-data', currentUser);
  const canAccessAccountManagement = isTabAllowed('account-management', currentUser);
  const canAccessAuditLog = isTabAllowed('audit-log', currentUser);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChangeWithRBAC}
        onOpenNewItemModal={() => {
          setEditingItem(null);
          setIsNewItemModalOpen(true);
        }}
        onResetData={handleResetAllData}
        orderNeededCount={orderNeededCount}
        awaitingArrivalCount={awaitingArrivalCount}
        auditDelayedCount={auditDelayedCount}
        isWorkerMode={isEffectiveWorkerMode}
        onToggleWorkerMode={handleToggleWorkerMode}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenDbConfig={() => setIsDbConfigModalOpen(true)}
        isDbConnected={isDbConnected}
        isCloudSyncing={isCloudSyncing}
        onRefreshCloudData={() => void syncFromSupabaseCloud({ silent: false })}
      />

      {globalToast && (
        <div
          className={`fixed top-24 sm:top-20 right-3 sm:right-6 left-3 sm:left-auto max-w-lg z-50 px-4 sm:px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 sm:gap-3 border animate-in fade-in slide-in-from-top-4 duration-200 ${
            globalToast.startsWith('❌') || globalToast.startsWith('⚠️')
              ? 'bg-rose-950 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {globalToast.startsWith('❌') || globalToast.startsWith('⚠️') ? (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <span className="text-xs sm:text-sm font-semibold break-words">{globalToast}</span>
        </div>
      )}

      <main className="flex-1 w-full max-w-[1920px] mx-auto px-2 sm:px-4 py-3 sm:py-4">
        {activeTab === 'dashboard' && (
          <DashboardTab
            items={calculatedItems}
            categories={categories}
            vendors={vendors}
            isWorkerMode={isEffectiveWorkerMode}
            onNavigateToFieldAudit={() => handleTabChangeWithRBAC('field-audit')}
            onUpdateStock={(id, stock) => void handleUpdateStock(id, stock)}
            onUpdateDailyUsage={(id, usage) => void handleUpdateDailyUsage(id, usage)}
            onToggleStatus={(id, status) => void handleToggleStatus(id, status)}
            onReceiveStock={(id) => void handleReceiveStock(id)}
            onOpenOrderModal={handleOpenOrderModalForVendorAndItems}
            onEditItem={handleOpenEditItem}
            onDeleteItem={(id) => void handleDeleteItem(id)}
            memo={memo}
            onMemoChange={handleMemoChange}
            memoLastSaved={memoLastSaved}
            lastAuditTimestamp={lastAuditTimestamp}
            onEditOrder={(item) => setEditingOrderTarget(item)}
            onCancelOrder={(id) => void handleCancelOrder(id)}
          />
        )}

        {activeTab === 'field-audit' && canAccessFieldAudit && (
          <FieldAuditTab
            items={calculatedItems}
            categories={categories}
            userAccounts={userAccounts}
            currentUser={currentUser}
            isWorkerMode={isEffectiveWorkerMode}
            onUpdateStock={(id, stock) => void handleUpdateStock(id, stock)}
            onReceiveStock={(id, rem, inc) => void handleReceiveStock(id, rem, inc)}
            onBatchCommitStock={(changes) => void handleBatchCommitStock(changes)}
            onConfirmAuditWithoutChange={(ids) => void handleConfirmAuditWithoutChange(ids)}
          />
        )}

        {activeTab === 'order-sheet' && canAccessOrderSheet && (
          <OrderManagementTab
            items={calculatedItems}
            vendors={vendors}
            orderHistory={orderHistory}
            usageLogs={usageLogs}
            companyProfile={companyProfile}
            currentUser={currentUser}
            onConfirmOrder={(ids, od, ea, q) => void handleConfirmOrder(ids, od, ea, q)}
            onOpenPOMetaModal={handleOpenPOMetaModal}
            onUpdateOrder={(id, od, ea, q) => void handleUpdateOrder(id, od, ea, q)}
            onCancelOrder={(id) => void handleCancelOrder(id)}
            onUpdateOrderHistoryRecord={(rec) => void handleUpdateOrderHistoryRecord(rec)}
            onDeleteOrderHistoryRecord={(id) => void handleDeleteOrderHistoryRecord(id)}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'master-data' && canAccessMasterData && (
          <MasterDataTab
            items={calculatedItems}
            categories={categories}
            vendors={vendors}
            units={units}
            companyProfile={companyProfile}
            onUpdateCompanyProfile={(p) => void handleUpdateCompanyProfile(p)}
            onUpdateCategory={(c) => void handleUpdateCategory(c)}
            onAddCategory={(c) => void handleAddCategory(c)}
            onDeleteCategory={(id) => void handleDeleteCategory(id)}
            onUpdateVendor={(v) => void handleUpdateVendor(v)}
            onAddVendor={(v) => void handleAddVendor(v)}
            onDeleteVendor={(id) => void handleDeleteVendor(id)}
            onAddUnit={(u) => void handleAddUnit(u)}
            onDeleteUnit={(id) => void handleDeleteUnit(id)}
            onEditItem={handleOpenEditItem}
            onDeleteItem={(id) => void handleDeleteItem(id)}
            onOpenNewItemModal={() => {
              setEditingItem(null);
              setIsNewItemModalOpen(true);
            }}
            onResetAllData={() => void handleResetAllData()}
            userAccounts={userAccounts}
            onAssignItemReceiver={(id, acc) => void handleAssignItemReceiver(id, acc)}
            onUpdateItemDeliveryLocation={(id, loc) => void handleUpdateItemDeliveryLocation(id, loc)}
            onUpdateItemLine={(id, line) => void handleUpdateItemLine(id, line)}
            onShowToast={showToast}
            onSaveAllChanges={() => void handleManualSaveMasterChanges('기준정보 관리')}
          />
        )}

        {activeTab === 'stats' && canAccessStats && (
          <UsageStatsTab
            items={calculatedItems}
            categories={categories}
            usageLogs={usageLogs}
            companyProfile={companyProfile}
            orderHistory={orderHistory}
            currentUser={currentUser}
            onApplyActualDailyUsage={(id, usage) => void handleApplyActualDailyUsage(id, usage)}
            onBatchApplyActualDailyUsage={(updates) => void handleBatchApplyActualDailyUsage(updates)}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'audit-log' && canAccessAuditLog && (
          <AuditLogTab
            logs={auditLogs}
            currentUser={currentUser}
            onClearLogs={() => void handleClearAuditLogs()}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'account-management' && canAccessAccountManagement && (
          <AccountManagementTab
            accounts={userAccounts}
            items={calculatedItems}
            userPasswords={userPasswords}
            currentUser={currentUser}
            onAddAccount={handleAddAccount}
            onUpdateAccount={handleUpdateAccount}
            onDeleteAccount={(id, opts) => void handleDeleteAccount(id, opts)}
            onToggleAccountActive={(id) => void handleToggleAccountActive(id)}
            onResetUserPassword={(u, d) => void handleResetUserPassword(u, d)}
            onSaveAllChanges={() => void handleManualSaveMasterChanges('계정 관리')}
          />
        )}
      </main>

      <NewItemModal
        isOpen={isNewItemModalOpen}
        onClose={() => {
          setIsNewItemModalOpen(false);
          setEditingItem(null);
        }}
        onSave={(item) => void handleSaveItem(item)}
        categories={categories}
        vendors={vendors}
        units={units}
        editingItem={editingItem}
        userAccounts={userAccounts}
      />

      <PurchaseOrderModal
        isOpen={poModalData.isOpen}
        onClose={() => setPoModalData((prev) => ({ ...prev, isOpen: false }))}
        vendor={poModalData.vendor}
        items={poModalData.items}
        orderDate={poModalData.orderDate}
        expectedArrivalDate={poModalData.expectedArrivalDate}
        companyProfile={companyProfile}
        isAlreadyOrdered={poModalData.isAlreadyOrdered}
        onConfirmOrder={() => {
          if (!poModalData.vendor) return;
          const quantities: Record<string, number> = {};
          poModalData.items.forEach((it) => {
            quantities[it.id] =
              it.orderedPackQty || it.recommendedPackOrderQty;
          });
          void handleConfirmOrder(
            poModalData.items.map((i) => i.id),
            poModalData.orderDate,
            poModalData.expectedArrivalDate,
            quantities
          );
          setPoModalData((prev) => ({ ...prev, isOpen: false }));
        }}
      />

      <EditOrderModal
        item={editingOrderTarget}
        isOpen={!!editingOrderTarget}
        onClose={() => setEditingOrderTarget(null)}
        onSaveOrder={(id, od, ea, q) => void handleUpdateOrder(id, od, ea, q)}
        onCancelOrder={(id) => void handleCancelOrder(id)}
      />

      <LoginModal
        isOpen={!currentUser}
        onLogin={handleLogin}
        onOpenPasswordChange={() => setIsPasswordChangeOpen(true)}
        userPasswords={userPasswords}
        registeredUsers={userAccounts}
      />

      <PasswordChangeModal
        isOpen={isPasswordChangeOpen || mustChangePassword}
        onClose={() => {
          if (!mustChangePassword) setIsPasswordChangeOpen(false);
        }}
        userPasswords={userPasswords}
        onChangePassword={(u, pw) => void handleChangePassword(u, pw)}
        registeredUsers={userAccounts}
        isForced={mustChangePassword}
        forcedUsername={currentUser?.username}
        onLogoutInstead={handleLogout}
      />

      {currentUser?.level === 0 && (
        <DbConfigModal
          isOpen={isDbConfigModalOpen}
          onClose={() => setIsDbConfigModalOpen(false)}
          onConfigSaved={(connected) => {
            setIsDbConnected(connected);
            if (connected) {
              void syncFromSupabaseCloud({ silent: false });
            }
          }}
          onShowToast={showToast}
        />
      )}
    </div>
  );
}
