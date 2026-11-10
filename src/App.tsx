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
  fetchAllCloudDataFromSupabase,
  insertUserAccountToSupabase,
  updateUserAccountInSupabase,
  deleteUserAccountFromSupabase,
  upsertInventoryItemToSupabase,
  batchUpsertInventoryItemsToSupabase,
  deleteInventoryItemFromSupabase,
  saveCategoriesToSupabase,
  saveVendorsToSupabase,
  saveUnitsToSupabase,
  saveOrderHistoryToSupabase,
  saveUsageLogsToSupabase,
  saveCompanyProfileToSupabase,
  saveMemoToSupabase,
  saveLastAuditTimestampToSupabase,
  saveUserPasswordsToSupabase,
  insertAuditLogToSupabase,
  clearAuditLogsInSupabase,
  resetAllCloudDataInSupabase,
} from './lib/supabase';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  // User authentication & 4-tier RBAC state (Pure in-memory session; no localStorage data caching)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  // [계정 관리] 등록 사용자 계정 목록 상태 (Supabase DB 단일 진실 공급원)
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() =>
    [...INITIAL_USER_ACCOUNTS].sort(compareUserAccountsByAffiliation)
  );

  const [userPasswords, setUserPasswords] = useState<Record<string, string>>({});
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [isDbConfigModalOpen, setIsDbConfigModalOpen] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(() => {
    const cfg = getSavedSupabaseConfig();
    return Boolean(cfg.url && cfg.anonKey);
  });
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);

  // [기능 4] 현장 작업자용 간소화 모드(Worker View) 상태
  const [isWorkerMode, setIsWorkerMode] = useState<boolean>(false);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    resolveInitialActiveTab(null, false)
  );

  // Company Profile state (Supabase Cloud DB Direct)
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(INITIAL_COMPANY_PROFILE);

  // ----------------------------------------------------
  // Supabase Cloud DB 단일 연동 상태 (로컬 스토리지 캐시 완전 배제)
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
          const sortedAccounts = [...snapshot.userAccounts].sort(
            compareUserAccountsByAffiliation
          );
          setUserAccounts(sortedAccounts);
          setCurrentUser((prevUser) => {
            if (!prevUser) return null;
            const refreshed = sortedAccounts.find(
              (a) => a.id === prevUser.id || a.username === prevUser.username
            );
            return refreshed || prevUser;
          });
        }

        if (snapshot.userPasswords && typeof snapshot.userPasswords === 'object') {
          setUserPasswords((prev) => ({
            ...prev,
            ...snapshot.userPasswords,
          }));
        }

        if (!options?.silent) {
          showToast('☁️ Supabase 클라우드 DB에서 최신 전사 데이터를 동기화했습니다.');
        }
      } catch (err) {
        console.warn('Supabase cloud sync error:', err);
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
          { event: '*', schema: 'public', table: 'mro_app_state' },
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
    memoSaveTimeoutRef.current = window.setTimeout(() => {
      void saveMemoToSupabase(nextMemo);
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

  const mustChangePassword = useMemo(() => {
    if (!currentUser) return false;
    const storedPw = userPasswords[currentUser.username];
    const isPassword1234 = !storedPw || storedPw === '1234';
    if (!isPassword1234) return false;
    return currentUser.level !== 0 || storedPw === '1234';
  }, [currentUser, userPasswords]);

  const orderNeededCount = calculatedItems.filter((i) => i.needsOrder).length;
  const awaitingArrivalCount = calculatedItems.filter(
    (i) => i.orderStatus === '발주완료(입고대기)'
  ).length;
  const auditDelayedCount = calculatedItems.filter((i) => i.isAuditDelayed).length;

  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);

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
      (!storedPw || storedPw === '1234') && (user.level !== 0 || storedPw === '1234');

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
    setIsPasswordChangeOpen(false);
    showToast(
      prevName
        ? `${prevName} 계정이 안전하게 로그아웃되었습니다.`
        : '안전하게 로그아웃되었습니다.'
    );
  };

  const handleChangePassword = (username: string, newPassword: string) => {
    setUserPasswords((prev) => {
      const updated = { ...prev, [username]: newPassword };
      void saveUserPasswordsToSupabase(updated);
      return updated;
    });
    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetName: `계정 ID: ${username}`,
      beforeValue: '기존 비밀번호 (보안처리)',
      afterValue: '신규 비밀번호 변경 완료',
      details: `'${username}' 계정 비밀번호 변경`,
    });
    showToast(`'${username}' 계정의 비밀번호가 사내 보안 정책에 따라 클라우드 DB에 변경·저장되었습니다.`);
  };

  const handleResetUserPassword = (username: string, displayName?: string) => {
    if ((currentUser?.level ?? 0) !== 0) {
      showToast('⚠️ 비밀번호 초기화 권한은 LV.0 최고관리자에게만 있습니다.');
      return;
    }
    setUserPasswords((prev) => {
      const updated = { ...prev, [username]: '1234' };
      void saveUserPasswordsToSupabase(updated);
      return updated;
    });
    const label = displayName ? `${displayName} (${username})` : username;
    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetName: label,
      beforeValue: '사용자 설정 비밀번호',
      afterValue: '초기 비밀번호 (1234)',
      details: `'${label}' 계정 비밀번호 초기화 (1234)`,
    });
    showToast(
      `🔑 [비밀번호 초기화 완료] '${label}' 계정의 비밀번호가 '1234'로 초기화되었습니다. (다음 로그인 시 변경 강제)`
    );
  };

  const handleAddAccount = (newAccount: UserAccount) => {
    setUserAccounts((prev) => {
      const next = [...prev, newAccount].sort(compareUserAccountsByAffiliation);
      void insertUserAccountToSupabase(newAccount, next);
      return next;
    });
    setUserPasswords((prev) => {
      const updated = { ...prev, [newAccount.username]: '1234' };
      void saveUserPasswordsToSupabase(updated);
      return updated;
    });

    const displayName = newAccount.title
      ? `${newAccount.name} ${newAccount.title}`
      : newAccount.name;

    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetId: newAccount.id,
      targetName: `${displayName} (${newAccount.username})`,
      targetLine: newAccount.affiliation,
      beforeValue: '미등록',
      afterValue: `LV.${newAccount.level} (${newAccount.affiliation || '소속미정'})`,
      details: `신규 사용자 계정 '${displayName} (${newAccount.username})' 생성`,
    });

    showToast(
      `✅ [${newAccount.affiliation || '소속'}] '${displayName} (${newAccount.username})' 계정이 클라우드 DB에 생성되었습니다. (초기 PW: 1234)`
    );
  };

  const handleUpdateAccount = (updatedAccount: UserAccount, previousUsername?: string) => {
    const oldUsername = previousUsername || updatedAccount.username;
    const oldAcc = userAccounts.find(
      (a) => a.id === updatedAccount.id || (previousUsername && a.username === previousUsername)
    );

    setUserAccounts((prev) => {
      const updatedList = prev.map((acc) => {
        if (acc.id === updatedAccount.id) {
          return {
            ...acc,
            ...updatedAccount,
            id: acc.id,
          };
        }
        return acc;
      });

      const deduped = new Map<string, UserAccount>();
      updatedList.forEach((acc) => {
        deduped.set(acc.id, acc);
      });
      const sorted = Array.from(deduped.values()).sort(compareUserAccountsByAffiliation);
      void updateUserAccountInSupabase(updatedAccount, sorted);
      return sorted;
    });

    if (previousUsername && previousUsername !== updatedAccount.username) {
      setUserPasswords((prev) => {
        const updated = { ...prev };
        if (updated[previousUsername]) {
          updated[updatedAccount.username] = updated[previousUsername];
          delete updated[previousUsername];
        } else {
          updated[updatedAccount.username] = '1234';
        }
        void saveUserPasswordsToSupabase(updated);
        return updated;
      });
    }

    const fullDisplayName = updatedAccount.title
      ? `${updatedAccount.name} ${updatedAccount.title}`
      : updatedAccount.name;
    const oldFullDisplayName = oldAcc
      ? oldAcc.title
        ? `${oldAcc.name} ${oldAcc.title}`
        : oldAcc.name
      : '';

    setItems((prev) => {
      const changedItems: InventoryItem[] = [];
      const next = prev.map((it) => {
        const matchesId = it.receiverLoginId === oldUsername;
        const matchesOldName =
          oldFullDisplayName && !it.receiverLoginId && it.receiverName === oldFullDisplayName;
        if (matchesId || matchesOldName) {
          const updatedIt: InventoryItem = {
            ...it,
            receiverLoginId: updatedAccount.username,
            receiverName: fullDisplayName,
            receiverPhone: updatedAccount.phone || it.receiverPhone,
          };
          changedItems.push(updatedIt);
          return updatedIt;
        }
        return it;
      });
      if (changedItems.length > 0) {
        void batchUpsertInventoryItemsToSupabase(changedItems, next);
      }
      return next;
    });

    if (currentUser && currentUser.id === updatedAccount.id) {
      setCurrentUser(updatedAccount);
    }

    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetId: updatedAccount.id,
      targetName: `${fullDisplayName} (${updatedAccount.username})`,
      targetLine: updatedAccount.affiliation,
      beforeValue: oldAcc
        ? `${oldAcc.name} / LV.${oldAcc.level} / ${oldAcc.affiliation}`
        : oldUsername,
      afterValue: `${fullDisplayName} / LV.${updatedAccount.level} / ${updatedAccount.affiliation}`,
      details: `'${fullDisplayName} (${updatedAccount.username})' 계정 정보 수정`,
    });

    showToast(
      `✅ '${fullDisplayName} (${updatedAccount.username})' 계정 정보가 클라우드 DB에 업데이트되었습니다.`
    );
  };

  const handleToggleAccountActive = (accountId: string) => {
    const target = userAccounts.find((a) => a.id === accountId);
    if (!target) return;
    if (target.username === 'admin') {
      showToast('⚠️ 시스템 기본 최고관리자(admin) 계정은 비활성화할 수 없습니다.');
      return;
    }
    const nextActive = target.isActive === false;
    const updatedTarget: UserAccount = { ...target, isActive: nextActive };

    setUserAccounts((prev) => {
      const next = prev.map((acc) => (acc.id === accountId ? updatedTarget : acc));
      void updateUserAccountInSupabase(updatedTarget, next);
      return next;
    });

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
      const deactivated: UserAccount = { ...target, isActive: false };
      const nextAccounts = userAccounts.map((acc) =>
        acc.id === accountId ? deactivated : acc
      );
      setUserAccounts(nextAccounts);
      await updateUserAccountInSupabase(deactivated, nextAccounts);
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

    const remainingAccounts = userAccounts.filter((acc) => acc.id !== accountId);
    const dbDeleteResult = await deleteUserAccountFromSupabase(accountId, remainingAccounts);
    if (!dbDeleteResult.ok && dbDeleteResult.isForeignKeyError) {
      const deactivated: UserAccount = { ...target, isActive: false };
      const nextAccounts = userAccounts.map((acc) =>
        acc.id === accountId ? deactivated : acc
      );
      setUserAccounts(nextAccounts);
      await updateUserAccountInSupabase(deactivated, nextAccounts);
      showToast(
        `⚠️ '${displayName}' 계정이 DB 외래 키(품목/발주 이력)와 연결되어 있어 안전하게 [비활성] 상태로 전환되었습니다.`
      );
      return;
    }

    if (options?.unlinkItems !== false) {
      setItems((prev) => {
        const changed: InventoryItem[] = [];
        const next = prev.map((it) => {
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
          void batchUpsertInventoryItemsToSupabase(changed, next);
        }
        return next;
      });
    }

    setUserAccounts(remainingAccounts);

    setUserPasswords((prev) => {
      if (!(target.username in prev)) return prev;
      const updated = { ...prev };
      delete updated[target.username];
      void saveUserPasswordsToSupabase(updated);
      return updated;
    });

    recordAuditLog({
      actionType: 'ACCOUNT_MUTATE',
      targetId: target.id,
      targetName: `${displayName} (${target.username})`,
      targetLine: target.affiliation,
      beforeValue: `LV.${target.level} (${target.affiliation})`,
      afterValue: '영구 삭제됨',
      details: `'${displayName} (${target.username})' 계정 영구 삭제`,
    });

    showToast(`🗑️ '${displayName} (${target.username})' 계정이 클라우드 DB에서 영구 삭제되었습니다.`);
  };

  const handleAssignItemReceiver = (itemId: string, account: UserAccount | null) => {
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
      setItems((prev) => {
        const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
        void upsertInventoryItemToSupabase(updatedItem, next);
        return next;
      });
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

    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });
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

  const handleUpdateItemDeliveryLocation = (
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

    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

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

  const handleUpdateItemLine = (itemId: string, newLine: ProductionLine) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem || targetItem.line === newLine) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      line: newLine,
    };

    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

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

  const handleUpdateStock = (itemId: string, newPackStock: number) => {
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
    setLastAuditTimestamp(auditLabel);
    void saveLastAuditTimestampToSupabase(auditLabel);

    const updatedItem: InventoryItem = {
      ...targetItem,
      currentPackStock: newPackStock,
      lastAuditDate: auditLabel,
      lastAuditedBy: auditorName || targetItem.receiverName || '현장담당',
      lastAuditUpdatedAt: nowMs,
    };

    setItems((prev) => {
      const next = prev.map((item) => (item.id === itemId ? updatedItem : item));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

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

  const handleUpdateDailyUsage = (itemId: string, newDailyUsage: number) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      dailyUsage: newDailyUsage,
    };

    setItems((prev) => {
      const next = prev.map((item) => (item.id === itemId ? updatedItem : item));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

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

  const handleToggleStatus = (
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

    setItems((prev) => {
      const next = prev.map((item) => (item.id === itemId ? updatedItem : item));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

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

  const handleBatchCommitStock = (changes: Record<string, number>) => {
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
    setLastAuditTimestamp(auditLabel);
    void saveLastAuditTimestampToSupabase(auditLabel);

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

    if (newLogs.length > 0) {
      setUsageLogs((prev) => {
        const nextLogs = [...newLogs, ...prev];
        void saveUsageLogsToSupabase(nextLogs);
        return nextLogs;
      });
    }

    let offset = 0;
    const updatedBatch: InventoryItem[] = [];
    setItems((prev) => {
      const next = prev.map((item) => {
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
      void batchUpsertInventoryItemsToSupabase(updatedBatch, next);
      return next;
    });

    recordAuditLog({
      actionType: 'STOCK_BATCH_AUDIT',
      targetName: `현장 실사 일괄 확정 (${changeCount}개 품목)`,
      beforeValue: beforeSummaryParts.slice(0, 5).join(', ') + (changeCount > 5 ? ` 외 ${changeCount - 5}건` : ''),
      afterValue: afterSummaryParts.slice(0, 5).join(', ') + (changeCount > 5 ? ` 외 ${changeCount - 5}건` : ''),
      details: `총 ${changeCount}개 소모품 현장 실사재고 일괄 확정 반영`,
    });

    showToast(
      `[실사 확정 완료] 총 ${changeCount}개 소모품의 현장 실사재고가 클라우드 DB에 안전하게 확정 반영되었습니다.`
    );
  };

  const handleConfirmAuditWithoutChange = (itemIds: string[]) => {
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
    setLastAuditTimestamp(auditLabel);
    void saveLastAuditTimestampToSupabase(auditLabel);

    let offset = 0;
    const updatedBatch: InventoryItem[] = [];
    setItems((prev) => {
      const next = prev.map((it) => {
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
      void batchUpsertInventoryItemsToSupabase(updatedBatch, next);
      return next;
    });

    recordAuditLog({
      actionType: 'STOCK_BATCH_AUDIT',
      targetName: `실사 변동없음 확인 (${itemIds.length}개 품목)`,
      beforeValue: '실사 대기/지연',
      afterValue: `${auditLabel} (수량 변동 없음)`,
      details: `총 ${itemIds.length}개 품목 실사 완료(수량 변동 없음) 확정`,
    });

    showToast(
      `[실사 완료 처리] 총 ${itemIds.length}개 품목의 실사 일시가 금일(${TODAY_STR}) 기준으로 클라우드 DB에 갱신되었습니다.`
    );
  };

  const handleApplyActualDailyUsage = (itemId: string, actualDailyUsage: number) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      dailyUsage: actualDailyUsage,
    };

    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

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

  const handleBatchApplyActualDailyUsage = (updates: Record<string, number>) => {
    const count = Object.keys(updates).length;
    if (count === 0) return;

    const updatedBatch: InventoryItem[] = [];
    setItems((prev) => {
      const next = prev.map((it) => {
        if (updates[it.id] !== undefined) {
          const updated: InventoryItem = { ...it, dailyUsage: updates[it.id] };
          updatedBatch.push(updated);
          return updated;
        }
        return it;
      });
      void batchUpsertInventoryItemsToSupabase(updatedBatch, next);
      return next;
    });

    recordAuditLog({
      actionType: 'SAFETY_STOCK_CALIBRATE',
      targetName: `안전재고 자동 학습 일괄 보정 (${count}개 품목)`,
      beforeValue: `기존 기준 일소모량 (${count}건)`,
      afterValue: `실측 기반 추천 일소모량 일괄 적용 (${count}건)`,
      details: `편차 ±20% 이상 품목 ${count}건 기준 일소모량 일괄 보정`,
    });

    showToast(
      `[안전재고 자동 학습 일괄 반영] 편차 ±20% 이상 품목 ${count}건의 기준 일소모량이 클라우드 DB에 일괄 보정되었습니다.`
    );
  };

  const handleReceiveStock = (
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
    setLastAuditTimestamp(receiveAuditLabel);
    void saveLastAuditTimestampToSupabase(receiveAuditLabel);

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

    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

    setOrderHistory((prev) => {
      const idx = prev.findIndex((r) => r.itemId === itemId && r.status === '입고대기');
      let nextHistory: OrderHistoryRecord[];
      if (idx !== -1) {
        const updated = [...prev];
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
        nextHistory = [newRecord, ...prev];
      }
      void saveOrderHistoryToSupabase(nextHistory);
      return nextHistory;
    });

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
      `[입고 확정 완료] ${targetItem.itemName} (현장잔여 ${baseRemaining} + 입고 ${incoming} = 최종 ${finalStock} ${targetItem.packUnit}) 클라우드 DB 반영 완료`
    );
  };

  const handleConfirmOrder = (
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

    setItems((prev) => {
      const next = prev.map((it) => {
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
      void batchUpsertInventoryItemsToSupabase(updatedBatch, next);
      return next;
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

    if (newRecords.length > 0) {
      setOrderHistory((prev) => {
        const nextHistory = [...newRecords, ...prev];
        void saveOrderHistoryToSupabase(nextHistory);
        return nextHistory;
      });
    }

    recordAuditLog({
      actionType: 'ORDER_CREATE',
      targetName: `발주서 발행 (${itemIds.length}개 품목)`,
      beforeValue: '발주대기',
      afterValue: `발주완료(입고예정: ${expectedArrivalDate}) · ${orderedNames.slice(0, 4).join(', ')}`,
      details: `총 ${itemIds.length}개 품목 신규 발주 확정 (입고예정일: ${expectedArrivalDate})`,
    });

    showToast(
      `총 ${itemIds.length}개 품목의 발주가 클라우드 DB에 확정되었습니다. (입고예정: ${expectedArrivalDate})`
    );
  };

  const handleUpdateOrder = (
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

    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

    setOrderHistory((prev) => {
      const idx = prev.findIndex((r) => r.itemId === itemId && r.status === '입고대기');
      if (idx !== -1) {
        const updated = [...prev];
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
        void saveOrderHistoryToSupabase(updated);
        return updated;
      }
      return prev;
    });

    recordAuditLog({
      actionType: 'ORDER_UPDATE',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: `수량 ${targetItem.orderedPackQty || 0}${targetItem.packUnit} / 예정 ${targetItem.expectedArrivalDate || '-'}`,
      afterValue: `수량 ${orderedPackQty}${targetItem.packUnit} / 예정 ${expectedArrivalDate}`,
      details: `[${targetItem.itemName}] 발주 수량 및 입고예정일 변경`,
    });

    showToast(`[${targetItem.itemName}] 발주 정보(일정 및 수량)가 클라우드 DB에 변경·저장되었습니다.`);
  };

  const handleCancelOrder = (itemId: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const updatedItem: InventoryItem = {
      ...targetItem,
      orderStatus: '발주대기',
      orderDate: null,
      expectedArrivalDate: null,
      orderedPackQty: null,
    };

    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
      void upsertInventoryItemToSupabase(updatedItem, next);
      return next;
    });

    setOrderHistory((prev) => {
      const idx = prev.findIndex((r) => r.itemId === itemId && r.status === '입고대기');
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          status: '발주취소',
          completedDate: TODAY_STR,
          note: updated[idx].note
            ? `${updated[idx].note} (발주취소됨)`
            : '관리자에 의해 발주 취소됨',
        };
        void saveOrderHistoryToSupabase(updated);
        return updated;
      }
      return prev;
    });

    recordAuditLog({
      actionType: 'ORDER_CANCEL',
      targetId: targetItem.id,
      targetName: `${targetItem.itemName} (${targetItem.spec})`,
      targetLine: targetItem.line,
      beforeValue: `발주완료(입고대기) · ${targetItem.orderedPackQty || 0}${targetItem.packUnit}`,
      afterValue: '발주취소 (발주대기 복구)',
      details: `[${targetItem.itemName}] 진행 중인 발주 취소`,
    });

    showToast(`[${targetItem.itemName}] 발주가 취소되었으며, 클라우드 DB에 발주대기 상태로 복구되었습니다.`);
  };

  const handleUpdateOrderHistoryRecord = (updatedRecord: OrderHistoryRecord) => {
    setOrderHistory((prev) => {
      const next = prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r));
      void saveOrderHistoryToSupabase(next);
      return next;
    });
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

  const handleDeleteOrderHistoryRecord = (recordId: string) => {
    const targetRec = orderHistory.find((r) => r.id === recordId);
    setOrderHistory((prev) => {
      const next = prev.filter((r) => r.id !== recordId);
      void saveOrderHistoryToSupabase(next);
      return next;
    });
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

  const handleSaveItem = (item: InventoryItem) => {
    const prevItem = items.find((i) => i.id === item.id);
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      const next = exists ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...prev];
      void upsertInventoryItemToSupabase(item, next);
      return next;
    });

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

  const handleDeleteItem = (itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== itemId);
      void deleteInventoryItemFromSupabase(itemId, next);
      return next;
    });

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

  const handleUpdateCompanyProfile = (profile: CompanyProfile) => {
    const prevBudget = companyProfile.monthlyBudget;
    setCompanyProfile(profile);
    void saveCompanyProfileToSupabase(profile);

    recordAuditLog({
      actionType: 'CATEGORY_MUTATE',
      targetName: `자사 프로필 및 월 예산 설정 (${profile.companyName})`,
      beforeValue: `월 예산 ₩${(prevBudget || 0).toLocaleString()}`,
      afterValue: `월 예산 ₩${(profile.monthlyBudget || 0).toLocaleString()}`,
      details: '자사 기준정보 및 월별 소모품 예산 한도 수정',
    });

    showToast('💾 자사 기준정보 및 월별 소모품 예산 한도가 클라우드 DB에 저장되었습니다.');
  };

  const handleAddCategory = (cat: Category) => {
    setCategories((prev) => {
      const next = [...prev, cat];
      void saveCategoriesToSupabase(next);
      return next;
    });
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

  const handleUpdateCategory = (cat: Category) => {
    setCategories((prev) => {
      const next = prev.map((c) => (c.id === cat.id ? cat : c));
      void saveCategoriesToSupabase(next);
      return next;
    });
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

  const handleDeleteCategory = (catId: string) => {
    const targetCat = categories.find((c) => c.id === catId);
    setCategories((prev) => {
      const next = prev.filter((c) => c.id !== catId);
      void saveCategoriesToSupabase(next);
      return next;
    });
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

  const handleAddVendor = (vend: Vendor) => {
    setVendors((prev) => {
      const next = [...prev, vend];
      void saveVendorsToSupabase(next);
      return next;
    });
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

  const handleUpdateVendor = (vend: Vendor) => {
    setVendors((prev) => {
      const next = prev.map((v) => (v.id === vend.id ? vend : v));
      void saveVendorsToSupabase(next);
      return next;
    });
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

  const handleDeleteVendor = (vendId: string) => {
    const targetVendor = vendors.find((v) => v.id === vendId);
    setVendors((prev) => {
      const next = prev.filter((v) => v.id !== vendId);
      void saveVendorsToSupabase(next);
      return next;
    });
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

  const handleAddUnit = (u: Unit) => {
    setUnits((prev) => {
      const next = [...prev, u];
      void saveUnitsToSupabase(next);
      return next;
    });
    showToast(`💾 단위 '${u.name}'이(가) 클라우드 DB에 등록되었습니다.`);
  };

  const handleDeleteUnit = (unitId: string) => {
    setUnits((prev) => {
      const next = prev.filter((u) => u.id !== unitId);
      void saveUnitsToSupabase(next);
      return next;
    });
    showToast('🗑️ 단위가 클라우드 DB에서 삭제되었습니다.');
  };

  const handleManualSaveMasterChanges = async (label = '기준정보 및 품목 마스터') => {
    setIsCloudSyncing(true);
    try {
      await Promise.all([
        batchUpsertInventoryItemsToSupabase(items, items),
        saveCategoriesToSupabase(categories),
        saveVendorsToSupabase(vendors),
        saveUnitsToSupabase(units),
        saveCompanyProfileToSupabase(companyProfile),
        saveUserPasswordsToSupabase(userPasswords),
      ]);

      showToast(
        `☁️ [클라우드 DB 저장 완료] ${label}의 모든 데이터가 Supabase 클라우드 DB에 안전하게 반영되었습니다.`
      );
    } catch (e) {
      console.error('Failed to manually save master changes to Supabase', e);
      showToast(`⚠️ [저장 지연] ${label} 클라우드 DB 동기화 중 오류가 발생했습니다.`);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleClearAuditLogs = () => {
    if ((currentUser?.level ?? 99) !== 0) {
      showToast('⚠️ 변경 이력 초기화 권한은 LV.0 최고관리자에게만 있습니다.');
      return;
    }
    setAuditLogs([]);
    void clearAuditLogsInSupabase();
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

    setItems([]);
    setCategories([]);
    setVendors([]);
    setUnits(INITIAL_UNITS);
    setMemo(INITIAL_MEMO);
    setOrderHistory([]);
    setUsageLogs([]);
    setCompanyProfile(INITIAL_COMPANY_PROFILE);
    setUserAccounts([...INITIAL_USER_ACCOUNTS].sort(compareUserAccountsByAffiliation));
    setAuditLogs([resetEntry]);

    await resetAllCloudDataInSupabase(
      INITIAL_COMPANY_PROFILE,
      INITIAL_USER_ACCOUNTS,
      INITIAL_UNITS,
      INITIAL_MEMO
    );
    void insertAuditLogToSupabase(resetEntry, [resetEntry]);

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
        <div className="fixed top-24 sm:top-20 right-3 sm:right-6 left-3 sm:left-auto max-w-md z-50 bg-slate-900 text-white px-4 sm:px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 sm:gap-3 border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold">{globalToast}</span>
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
            onUpdateStock={handleUpdateStock}
            onUpdateDailyUsage={handleUpdateDailyUsage}
            onToggleStatus={handleToggleStatus}
            onReceiveStock={handleReceiveStock}
            onOpenOrderModal={handleOpenOrderModalForVendorAndItems}
            onEditItem={handleOpenEditItem}
            onDeleteItem={handleDeleteItem}
            memo={memo}
            onMemoChange={handleMemoChange}
            memoLastSaved={memoLastSaved}
            lastAuditTimestamp={lastAuditTimestamp}
            onEditOrder={(item) => setEditingOrderTarget(item)}
            onCancelOrder={handleCancelOrder}
          />
        )}

        {activeTab === 'field-audit' && canAccessFieldAudit && (
          <FieldAuditTab
            items={calculatedItems}
            categories={categories}
            userAccounts={userAccounts}
            currentUser={currentUser}
            isWorkerMode={isEffectiveWorkerMode}
            onUpdateStock={handleUpdateStock}
            onReceiveStock={handleReceiveStock}
            onBatchCommitStock={handleBatchCommitStock}
            onConfirmAuditWithoutChange={handleConfirmAuditWithoutChange}
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
            onConfirmOrder={handleConfirmOrder}
            onOpenPOMetaModal={handleOpenPOMetaModal}
            onUpdateOrder={handleUpdateOrder}
            onCancelOrder={handleCancelOrder}
            onUpdateOrderHistoryRecord={handleUpdateOrderHistoryRecord}
            onDeleteOrderHistoryRecord={handleDeleteOrderHistoryRecord}
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
            onUpdateCompanyProfile={handleUpdateCompanyProfile}
            onUpdateCategory={handleUpdateCategory}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            onUpdateVendor={handleUpdateVendor}
            onAddVendor={handleAddVendor}
            onDeleteVendor={handleDeleteVendor}
            onAddUnit={handleAddUnit}
            onDeleteUnit={handleDeleteUnit}
            onEditItem={handleOpenEditItem}
            onDeleteItem={handleDeleteItem}
            onOpenNewItemModal={() => {
              setEditingItem(null);
              setIsNewItemModalOpen(true);
            }}
            onResetAllData={handleResetAllData}
            userAccounts={userAccounts}
            onAssignItemReceiver={handleAssignItemReceiver}
            onUpdateItemDeliveryLocation={handleUpdateItemDeliveryLocation}
            onUpdateItemLine={handleUpdateItemLine}
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
            onApplyActualDailyUsage={handleApplyActualDailyUsage}
            onBatchApplyActualDailyUsage={handleBatchApplyActualDailyUsage}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'audit-log' && canAccessAuditLog && (
          <AuditLogTab
            logs={auditLogs}
            currentUser={currentUser}
            onClearLogs={handleClearAuditLogs}
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
            onDeleteAccount={handleDeleteAccount}
            onToggleAccountActive={handleToggleAccountActive}
            onResetUserPassword={handleResetUserPassword}
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
        onSave={handleSaveItem}
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
          handleConfirmOrder(
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
        onSaveOrder={handleUpdateOrder}
        onCancelOrder={handleCancelOrder}
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
        onChangePassword={handleChangePassword}
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