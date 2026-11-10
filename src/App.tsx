import React, { useState, useEffect, useMemo } from 'react';
import {
  ActiveTab,
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
import { Header } from './components/Header';
import { DashboardTab } from './components/DashboardTab';
import { FieldAuditTab } from './components/FieldAuditTab';
import { OrderManagementTab } from './components/OrderManagementTab';
import { MasterDataTab } from './components/MasterDataTab';
import { UsageStatsTab } from './components/UsageStatsTab';
import { AccountManagementTab, DeleteAccountOptions } from './components/AccountManagementTab';
import { PurchaseOrderModal } from './components/PurchaseOrderModal';
import { NewItemModal } from './components/NewItemModal';
import { EditOrderModal } from './components/EditOrderModal';
import { LoginModal } from './components/LoginModal';
import { PasswordChangeModal } from './components/PasswordChangeModal';
import { DbConfigModal } from './components/DbConfigModal';
import {
  getSavedSupabaseConfig,
  insertUserAccountToSupabase,
  updateUserAccountInSupabase,
  deleteUserAccountFromSupabase,
  fetchUserAccountsFromSupabase,
  upsertInventoryItemToSupabase,
  deleteInventoryItemFromSupabase,
  saveAppStateKeyToSupabase,
  fetchAllAppStateFromSupabase,
} from './lib/supabase';
import { CheckCircle2 } from 'lucide-react';

const STORAGE_KEY_ITEMS = 'daeseong_steel_inventory_v1';
const STORAGE_KEY_CATEGORIES = 'daeseong_steel_categories_v1';
const STORAGE_KEY_VENDORS = 'daeseong_steel_vendors_v1';
const STORAGE_KEY_UNITS = 'daeseong_steel_units_v1';
const STORAGE_KEY_MEMO = 'daeseong_steel_memo_v1';
const STORAGE_KEY_LAST_AUDIT = 'daeseong_steel_last_audit_v1';
const STORAGE_KEY_COMPANY_PROFILE = 'daeseong_steel_company_profile_v1';
const STORAGE_KEY_ORDER_HISTORY = 'daeseong_steel_order_history_v1';
const STORAGE_KEY_USAGE_LOGS = 'daeseong_steel_usage_logs_v1';
const STORAGE_KEY_WORKER_MODE = 'daeseong_steel_worker_mode_v1';
const STORAGE_KEY_CURRENT_USER = 'daeseong_steel_current_user_v1';
const STORAGE_KEY_USER_PASSWORDS = 'daeseong_steel_user_passwords_v1';
const STORAGE_KEY_USER_ACCOUNTS = 'daeseong_steel_user_accounts_v1';

export default function App() {
  // User authentication & 3-tier RBAC state
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  // [계정 관리] 등록 사용자 계정 목록 상태 (고유 ID 기준 관리 및 중복 ID 자동 정제)
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER_ACCOUNTS);
      if (saved) {
        const parsed: UserAccount[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const byId = new Map<string, UserAccount>();
          parsed.forEach((acc, idx) => {
            const safeId = acc.id || `usr_${acc.username || idx}`;
            const prev = byId.get(safeId);
            byId.set(safeId, {
              ...prev,
              ...acc,
              id: safeId,
              isActive: acc.isActive !== false,
            });
          });
          return Array.from(byId.values()).sort(compareUserAccountsByAffiliation);
        }
      }
    } catch {}
    return [...INITIAL_USER_ACCOUNTS].sort(compareUserAccountsByAffiliation);
  });

  const [userPasswords, setUserPasswords] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER_PASSWORDS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [isDbConfigModalOpen, setIsDbConfigModalOpen] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(() => {
    const cfg = getSavedSupabaseConfig();
    return Boolean(cfg.url && cfg.anonKey);
  });

  // [기능 4] 현장 작업자용 간소화 모드(Worker View) 상태
  const [isWorkerMode, setIsWorkerMode] = useState<boolean>(() => {
    try {
      const savedUser = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
      if (savedUser) {
        const parsedUser: UserAccount = JSON.parse(savedUser);
        if (parsedUser.level === 1) return true;
      }
      const saved = localStorage.getItem(STORAGE_KEY_WORKER_MODE);
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return false;
  });

  // Navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    resolveInitialActiveTab(currentUser, isWorkerMode)
  );

  // Company Profile state
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COMPANY_PROFILE);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return parsed as CompanyProfile;
        }
      }
    } catch {}
    return INITIAL_COMPANY_PROFILE;
  });

  // ----------------------------------------------------
  // 실무 운영을 위한 목업 제거 (모두 빈 배열 []로 초기화)
  // ----------------------------------------------------
  const [items, setItems] = useState<InventoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ITEMS);
      if (saved !== null) {
        const parsed: InventoryItem[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (saved !== null) {
        const parsed: Category[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [vendors, setVendors] = useState<Vendor[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VENDORS);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [units, setUnits] = useState<Unit[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_UNITS);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [memo, setMemo] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MEMO);
      if (saved !== null) return saved;
    } catch {}
    return INITIAL_MEMO;
  });

  const [lastAuditTimestamp, setLastAuditTimestamp] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LAST_AUDIT);
      if (saved) return saved;
    } catch {}
    return `${TODAY_STR} 실사 대기`;
  });

  const [orderHistory, setOrderHistory] = useState<OrderHistoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORDER_HISTORY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [usageLogs, setUsageLogs] = useState<UsageLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USAGE_LOGS);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [memoLastSaved, setMemoLastSaved] = useState<string>('방금 전');
  const [globalToast, setGlobalToast] = useState<string | null>(null);

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

  // Persist to LocalStorage & URL Search Params
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

  // 최초 로드 시 Supabase DB 연동 데이터 조회 및 동기화
  useEffect(() => {
    if (!isDbConnected) return;
    let isCancelled = false;

    const loadPersistedDataFromSupabase = async () => {
      try {
        const [remoteAccounts, remoteAppState] = await Promise.all([
          fetchUserAccountsFromSupabase(),
          fetchAllAppStateFromSupabase(),
        ]);

        if (isCancelled) return;

        if (remoteAccounts && remoteAccounts.length > 0) {
          setUserAccounts(remoteAccounts);
          localStorage.setItem(STORAGE_KEY_USER_ACCOUNTS, JSON.stringify(remoteAccounts));
        }

        if (remoteAppState) {
          if (Array.isArray(remoteAppState.items)) {
            setItems(remoteAppState.items);
            localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(remoteAppState.items));
          }
          if (Array.isArray(remoteAppState.categories)) {
            setCategories(remoteAppState.categories);
            localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(remoteAppState.categories));
          }
          if (Array.isArray(remoteAppState.vendors)) {
            setVendors(remoteAppState.vendors);
            localStorage.setItem(STORAGE_KEY_VENDORS, JSON.stringify(remoteAppState.vendors));
          }
          if (Array.isArray(remoteAppState.units)) {
            setUnits(remoteAppState.units);
            localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(remoteAppState.units));
          }
          if (remoteAppState.companyProfile && typeof remoteAppState.companyProfile === 'object') {
            setCompanyProfile(remoteAppState.companyProfile);
            localStorage.setItem(
              STORAGE_KEY_COMPANY_PROFILE,
              JSON.stringify(remoteAppState.companyProfile)
            );
          }
          if (Array.isArray(remoteAppState.userAccounts) && remoteAppState.userAccounts.length > 0 && (!remoteAccounts || remoteAccounts.length === 0)) {
            const sortedAcc = [...remoteAppState.userAccounts].sort(compareUserAccountsByAffiliation);
            setUserAccounts(sortedAcc);
            localStorage.setItem(STORAGE_KEY_USER_ACCOUNTS, JSON.stringify(sortedAcc));
          }
          if (remoteAppState.userPasswords && typeof remoteAppState.userPasswords === 'object') {
            setUserPasswords((prev) => {
              const mergedPw = { ...remoteAppState.userPasswords, ...prev };
              localStorage.setItem(STORAGE_KEY_USER_PASSWORDS, JSON.stringify(mergedPw));
              return mergedPw;
            });
          }
        }
      } catch (err) {
        console.warn('Supabase initial sync warning:', err);
      }
    };

    void loadPersistedDataFromSupabase();
    return () => {
      isCancelled = true;
    };
  }, [isDbConnected]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_USER_ACCOUNTS, JSON.stringify(userAccounts));
      void saveAppStateKeyToSupabase('userAccounts', userAccounts);
    } catch (e) {
      console.error('Failed to save user accounts to localStorage', e);
    }
  }, [userAccounts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
      void saveAppStateKeyToSupabase('items', items);
    } catch (e) {
      console.error('Failed to save items to localStorage', e);
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COMPANY_PROFILE, JSON.stringify(companyProfile));
      void saveAppStateKeyToSupabase('companyProfile', companyProfile);
    } catch (e) {
      console.error('Failed to save company profile to localStorage', e);
    }
  }, [companyProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_WORKER_MODE, JSON.stringify(isWorkerMode));
    } catch (e) {
      console.error('Failed to save worker mode to localStorage', e);
    }
  }, [isWorkerMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
      void saveAppStateKeyToSupabase('categories', categories);
    } catch (e) {
      console.error('Failed to save categories to localStorage', e);
    }
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VENDORS, JSON.stringify(vendors));
      void saveAppStateKeyToSupabase('vendors', vendors);
    } catch (e) {
      console.error('Failed to save vendors to localStorage', e);
    }
  }, [vendors]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(units));
      void saveAppStateKeyToSupabase('units', units);
    } catch (e) {
      console.error('Failed to save units to localStorage', e);
    }
  }, [units]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_AUDIT, lastAuditTimestamp);
    } catch (e) {
      console.error('Failed to save last audit timestamp to localStorage', e);
    }
  }, [lastAuditTimestamp]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MEMO, memo);
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setMemoLastSaved(timeStr);
    } catch (e) {
      console.error('Failed to save memo to localStorage', e);
    }
  }, [memo]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ORDER_HISTORY, JSON.stringify(orderHistory));
    } catch (e) {
      console.error('Failed to save order history to localStorage', e);
    }
  }, [orderHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_USAGE_LOGS, JSON.stringify(usageLogs));
    } catch (e) {
      console.error('Failed to save usage logs to localStorage', e);
    }
  }, [usageLogs]);

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
    return currentUser.level === 1 || storedPw === '1234';
  }, [currentUser, userPasswords]);

  const orderNeededCount = calculatedItems.filter((i) => i.needsOrder).length;
  const awaitingArrivalCount = calculatedItems.filter(
    (i) => i.orderStatus === '발주완료(입고대기)'
  ).length;
  const auditDelayedCount = calculatedItems.filter((i) => i.isAuditDelayed).length;

  const showToast = (message: string) => {
    setGlobalToast(message);
    setTimeout(() => {
      setGlobalToast(null);
    }, 3500);
  };

  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to save current user to localStorage', e);
    }

    if (user.level === 1) {
      setIsWorkerMode(true);
      const nextTab = enforceTabRBAC(activeTab, user, true);
      setActiveTab(nextTab);
      syncActiveTabToUrl(nextTab, false);
    } else if (user.level === 2) {
      setIsWorkerMode(false);
      const nextTab = enforceTabRBAC(activeTab, user, false);
      setActiveTab(nextTab);
      syncActiveTabToUrl(nextTab, false);
    } else {
      setIsWorkerMode(false);
      syncActiveTabToUrl(activeTab, false);
    }

    const storedPw = userPasswords[user.username];
    const isInitialOrReset =
      (!storedPw || storedPw === '1234') && (user.level === 1 || storedPw === '1234');

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
    try {
      localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
    } catch (e) {
      console.error('Failed to remove current user from localStorage', e);
    }
    showToast(
      prevName
        ? `${prevName} 계정이 안전하게 로그아웃되었습니다.`
        : '안전하게 로그아웃되었습니다.'
    );
  };

  const handleChangePassword = (username: string, newPassword: string) => {
    setUserPasswords((prev) => {
      const updated = { ...prev, [username]: newPassword };
      try {
        localStorage.setItem(STORAGE_KEY_USER_PASSWORDS, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save user passwords to localStorage', e);
      }
      return updated;
    });
    showToast(`'${username}' 계정의 비밀번호가 사내 보안 정책에 따라 변경되었습니다.`);
  };

  const handleResetUserPassword = (username: string, displayName?: string) => {
    if ((currentUser?.level ?? 0) !== 0) {
      showToast('⚠️ 비밀번호 초기화 권한은 LV.0 최고관리자에게만 있습니다.');
      return;
    }
    setUserPasswords((prev) => {
      const updated = { ...prev, [username]: '1234' };
      try {
        localStorage.setItem(STORAGE_KEY_USER_PASSWORDS, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save reset password to localStorage', e);
      }
      return updated;
    });
    const label = displayName ? `${displayName} (${username})` : username;
    showToast(
      `🔑 [비밀번호 초기화 완료] '${label}' 계정의 비밀번호가 '1234'로 초기화되었습니다. (다음 로그인 시 변경 강제)`
    );
  };

  const handleAddAccount = (newAccount: UserAccount) => {
    setUserAccounts((prev) => [...prev, newAccount].sort(compareUserAccountsByAffiliation));
    setUserPasswords((prev) => {
      const updated = { ...prev, [newAccount.username]: '1234' };
      try {
        localStorage.setItem(STORAGE_KEY_USER_PASSWORDS, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save initial password for new account', e);
      }
      return updated;
    });

    void insertUserAccountToSupabase(newAccount);

    const displayName = newAccount.title
      ? `${newAccount.name} ${newAccount.title}`
      : newAccount.name;
    showToast(
      `✅ [${newAccount.affiliation || '소속'}] '${displayName} (${newAccount.username})' 계정이 생성되었습니다. (초기 PW: 1234)`
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
      return Array.from(deduped.values()).sort(compareUserAccountsByAffiliation);
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
        try {
          localStorage.setItem(STORAGE_KEY_USER_PASSWORDS, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }

    void updateUserAccountInSupabase(updatedAccount);

    const fullDisplayName = updatedAccount.title
      ? `${updatedAccount.name} ${updatedAccount.title}`
      : updatedAccount.name;
    const oldFullDisplayName = oldAcc
      ? oldAcc.title
        ? `${oldAcc.name} ${oldAcc.title}`
        : oldAcc.name
      : '';

    setItems((prev) =>
      prev.map((it) => {
        const matchesId = it.receiverLoginId === oldUsername;
        const matchesOldName =
          oldFullDisplayName && !it.receiverLoginId && it.receiverName === oldFullDisplayName;
        if (matchesId || matchesOldName) {
          return {
            ...it,
            receiverLoginId: updatedAccount.username,
            receiverName: fullDisplayName,
            receiverPhone: updatedAccount.phone || it.receiverPhone,
          };
        }
        return it;
      })
    );

    if (currentUser && currentUser.id === updatedAccount.id) {
      setCurrentUser(updatedAccount);
      try {
        localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(updatedAccount));
      } catch {}
    }

    showToast(
      `✅ '${fullDisplayName} (${updatedAccount.username})' 계정 정보가 고유 ID(${updatedAccount.id}) 기준으로 업데이트되었습니다.`
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

    setUserAccounts((prev) =>
      prev.map((acc) => (acc.id === accountId ? updatedTarget : acc))
    );
    void updateUserAccountInSupabase(updatedTarget);

    const displayName = target.title ? `${target.name} ${target.title}` : target.name;
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
      setUserAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? deactivated : acc))
      );
      await updateUserAccountInSupabase(deactivated);
      showToast(
        `⛔ '${displayName} (${target.username})' 계정이 연결된 품목 이력 보존을 위해 [비활성] 상태로 전환되었습니다.`
      );
      return;
    }

    const dbDeleteResult = await deleteUserAccountFromSupabase(accountId);
    if (!dbDeleteResult.ok && dbDeleteResult.isForeignKeyError) {
      const deactivated: UserAccount = { ...target, isActive: false };
      setUserAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? deactivated : acc))
      );
      await updateUserAccountInSupabase(deactivated);
      showToast(
        `⚠️ '${displayName}' 계정이 DB 외래 키(품목/발주 이력)와 연결되어 있어 안전하게 [비활성] 상태로 전환되었습니다.`
      );
      return;
    }

    if (options?.unlinkItems !== false) {
      setItems((prev) =>
        prev.map((it) => {
          const isLinkedById = it.receiverLoginId && it.receiverLoginId.trim() === target.username;
          const isLinkedByName =
            !it.receiverLoginId && it.receiverName && it.receiverName.trim() === target.name.trim();
          if (isLinkedById || isLinkedByName) {
            return {
              ...it,
              receiverLoginId: undefined,
              receiverName: undefined,
              receiverPhone: undefined,
            };
          }
          return it;
        })
      );
    }

    setUserAccounts((prev) => prev.filter((acc) => acc.id !== accountId));

    setUserPasswords((prev) => {
      if (!(target.username in prev)) return prev;
      const updated = { ...prev };
      delete updated[target.username];
      try {
        localStorage.setItem(STORAGE_KEY_USER_PASSWORDS, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    showToast(`🗑️ '${displayName} (${target.username})' 계정이 정상적으로 영구 삭제되었습니다.`);
  };

  const handleAssignItemReceiver = (itemId: string, account: UserAccount | null) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    if (!account) {
      const updatedItem: InventoryItem = {
        ...targetItem,
        receiverLoginId: undefined,
        receiverName: undefined,
        receiverPhone: undefined,
      };
      setItems((prev) => {
        const next = prev.map((it) => (it.id === itemId ? updatedItem : it));
        try {
          localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(next));
        } catch {}
        void saveAppStateKeyToSupabase('items', next);
        return next;
      });
      void upsertInventoryItemToSupabase(updatedItem);
      showToast(`💾 [${targetItem.itemName}] 수령자(담당자) 지정 해제 내용이 DB에 저장되었습니다.`);
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
      try {
        localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('items', next);
      return next;
    });
    void upsertInventoryItemToSupabase(updatedItem);
    showToast(
      `💾 [${targetItem.itemName}] 수령자(담당자) '${fullDisplayName} (${account.affiliation || '소속'})' 변경사항이 DB에 저장되었습니다.`
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
      try {
        localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('items', next);
      return next;
    });
    void upsertInventoryItemToSupabase(updatedItem);

    if (trimmed) {
      showToast(
        `💾 [${targetItem.line} · ${targetItem.itemName}] 수령장소('${trimmed}')가 DB에 즉시 저장되었습니다.`
      );
    } else {
      const defaultLoc = getDefaultDeliveryLocationForLine(targetItem.line, category);
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
      try {
        localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('items', next);
      return next;
    });
    void upsertInventoryItemToSupabase(updatedItem);

    showToast(
      `💾 [${targetItem.itemName}] 담당 라인이 '${targetItem.line}' → '${newLine}'(으)로 변경되어 DB에 저장되었습니다.`
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

    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            currentPackStock: newPackStock,
            lastAuditDate: auditLabel,
            lastAuditedBy: auditorName || item.receiverName || '현장담당',
            lastAuditUpdatedAt: nowMs,
          };
        }
        return item;
      })
    );
  };

  const handleUpdateDailyUsage = (itemId: string, newDailyUsage: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            dailyUsage: newDailyUsage,
          };
        }
        return item;
      })
    );
  };

  const handleToggleStatus = (
    itemId: string,
    newStatus: '발주대기' | '발주완료(입고대기)'
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          if (newStatus === '발주완료(입고대기)') {
            const v = vendors.find((vend) => vend.id === item.vendorId);
            const leadTime = v ? v.defaultLeadTime : item.leadTimeDays || 3;
            const target = new Date(TODAY_STR);
            target.setDate(target.getDate() + leadTime);
            const expectedArrivalDate = target.toISOString().split('T')[0];

            return {
              ...item,
              orderStatus: newStatus,
              orderDate: TODAY_STR,
              expectedArrivalDate,
              lastOrderDate: TODAY_STR,
              orderedPackQty:
                item.orderedPackQty ||
                calculateItemMetrics(
                  item,
                  categories.find((c) => c.id === item.categoryId),
                  v
                ).recommendedPackOrderQty,
            };
          } else {
            return {
              ...item,
              orderStatus: newStatus,
              orderDate: null,
              expectedArrivalDate: null,
              orderedPackQty: null,
            };
          }
        }
        return item;
      })
    );
    showToast(`발주 진행상태가 '${newStatus}' 상태로 변경되었습니다.`);
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

    const newLogs: UsageLog[] = [];
    items.forEach((item) => {
      const newStock = changes[item.id];
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
      setUsageLogs((prev) => [...newLogs, ...prev]);
    }

    let offset = 0;
    setItems((prev) =>
      prev.map((item) => {
        if (changes[item.id] !== undefined) {
          offset += 1;
          return {
            ...item,
            currentPackStock: changes[item.id],
            lastAuditDate: auditLabel,
            lastAuditedBy: auditorName || item.receiverName || '현장담당',
            lastAuditUpdatedAt: baseMs + offset,
          };
        }
        return item;
      })
    );

    showToast(
      `[실사 확정 완료] 총 ${changeCount}개 소모품의 현장 실사재고가 전산에 안전하게 확정 반영되었습니다.`
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

    let offset = 0;
    setItems((prev) =>
      prev.map((it) => {
        if (itemIds.includes(it.id)) {
          offset += 1;
          return {
            ...it,
            lastAuditDate: auditLabel,
            lastAuditedBy: auditorName || it.receiverName || '현장담당',
            lastAuditUpdatedAt: baseMs + offset,
          };
        }
        return it;
      })
    );

    showToast(
      `[실사 완료 처리] 총 ${itemIds.length}개 품목의 실사 일시가 금일(${TODAY_STR}) 기준으로 정상 갱신되었습니다.`
    );
  };

  const handleApplyActualDailyUsage = (itemId: string, actualDailyUsage: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, dailyUsage: actualDailyUsage } : it))
    );
  };

  const handleBatchApplyActualDailyUsage = (updates: Record<string, number>) => {
    const count = Object.keys(updates).length;
    if (count === 0) return;

    setItems((prev) =>
      prev.map((it) =>
        updates[it.id] !== undefined ? { ...it, dailyUsage: updates[it.id] } : it
      )
    );

    showToast(
      `[안전재고 자동 학습 일괄 반영] 편차 ±20% 이상 품목 ${count}건의 기준 일소모량이 추천값으로 일괄 보정되었습니다.`
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

    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          return {
            ...it,
            currentPackStock: finalStock,
            orderStatus: '발주대기',
            lastOrderDate: it.orderDate || TODAY_STR,
            lastAuditDate: receiveAuditLabel,
            lastAuditedBy: auditorName || it.receiverName || '현장담당',
            lastAuditUpdatedAt: nowMs,
            orderDate: null,
            expectedArrivalDate: null,
            orderedPackQty: null,
          };
        }
        return it;
      })
    );

    setOrderHistory((prev) => {
      const idx = prev.findIndex((r) => r.itemId === itemId && r.status === '입고대기');
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
        return updated;
      }
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
      return [newRecord, ...prev];
    });

    showToast(
      `[입고 확정 완료] ${targetItem.itemName} (현장잔여 ${baseRemaining} + 입고 ${incoming} = 최종 ${finalStock} ${targetItem.packUnit}) 전산 반영 완료`
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
    setItems((prev) =>
      prev.map((it) => {
        if (itemIds.includes(it.id)) {
          return {
            ...it,
            orderStatus: '발주완료(입고대기)',
            orderDate: finalOrderDate,
            expectedArrivalDate,
            lastOrderDate: finalOrderDate,
            orderedPackQty: quantities[it.id] || it.orderedPackQty || 1,
          };
        }
        return it;
      })
    );

    const newRecords: OrderHistoryRecord[] = [];
    items.forEach((it) => {
      if (itemIds.includes(it.id)) {
        const category = categories.find((c) => c.id === it.categoryId);
        const vendor = vendors.find((v) => v.id === it.vendorId);
        const packQty = quantities[it.id] || it.orderedPackQty || 1;
        const conversion = it.unitConversion || 1;
        const totalBase = packQty * conversion;
        const totalAmount = totalBase * it.unitPrice;

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
      setOrderHistory((prev) => [...newRecords, ...prev]);
    }

    showToast(
      `총 ${itemIds.length}개 품목의 발주가 전산 확정되었습니다. (입고예정: ${expectedArrivalDate})`
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

    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          return {
            ...it,
            orderDate,
            expectedArrivalDate,
            orderedPackQty,
            lastOrderDate: orderDate,
          };
        }
        return it;
      })
    );

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
        return updated;
      }
      return prev;
    });

    showToast(`[${targetItem.itemName}] 발주 정보(일정 및 수량)가 성공적으로 변경되었습니다.`);
  };

  const handleCancelOrder = (itemId: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          return {
            ...it,
            orderStatus: '발주대기',
            orderDate: null,
            expectedArrivalDate: null,
            orderedPackQty: null,
          };
        }
        return it;
      })
    );

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
        return updated;
      }
      return prev;
    });

    showToast(`[${targetItem.itemName}] 발주가 취소되었으며, 발주대기 상태로 복구되었습니다.`);
  };

  const handleUpdateOrderHistoryRecord = (updatedRecord: OrderHistoryRecord) => {
    setOrderHistory((prev) =>
      prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
    );
    showToast('발주 이력 상세 정보가 수정되었습니다.');
  };

  const handleDeleteOrderHistoryRecord = (recordId: string) => {
    setOrderHistory((prev) => prev.filter((r) => r.id !== recordId));
    showToast('발주 이력 레코드가 삭제되었습니다.');
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
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      const next = exists ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('items', next);
      return next;
    });
    void upsertInventoryItemToSupabase(item);
    showToast(`💾 소모품 '${item.itemName}' 정보가 DB에 안전하게 저장되었습니다.`);
  };

  const handleDeleteItem = (itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== itemId);
      try {
        localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('items', next);
      return next;
    });
    void deleteInventoryItemFromSupabase(itemId);
    showToast(`🗑️ '${it.itemName} (${it.spec})' 품목이 DB에서 삭제되었습니다.`);
  };

  const handleUpdateCompanyProfile = (profile: CompanyProfile) => {
    setCompanyProfile(profile);
    try {
      localStorage.setItem(STORAGE_KEY_COMPANY_PROFILE, JSON.stringify(profile));
    } catch {}
    void saveAppStateKeyToSupabase('companyProfile', profile);
    showToast('💾 자사 기준정보 및 월별 소모품 예산 한도가 DB에 저장되었습니다.');
  };

  const handleAddCategory = (cat: Category) => {
    setCategories((prev) => {
      const next = [...prev, cat];
      try {
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('categories', next);
      return next;
    });
    showToast(`💾 카테고리 '${cat.name}'이(가) 추가 및 저장되었습니다.`);
  };

  const handleUpdateCategory = (cat: Category) => {
    setCategories((prev) => {
      const next = prev.map((c) => (c.id === cat.id ? cat : c));
      try {
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('categories', next);
      return next;
    });
    showToast(`💾 카테고리 '${cat.name}' 설정 및 라인별 수령장소가 저장되었습니다.`);
  };

  const handleDeleteCategory = (catId: string) => {
    setCategories((prev) => {
      const next = prev.filter((c) => c.id !== catId);
      try {
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('categories', next);
      return next;
    });
    showToast('🗑️ 카테고리가 삭제되었습니다.');
  };

  const handleAddVendor = (vend: Vendor) => {
    setVendors((prev) => {
      const next = [...prev, vend];
      try {
        localStorage.setItem(STORAGE_KEY_VENDORS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('vendors', next);
      return next;
    });
    showToast(`💾 공급업체 '${vend.name}'이(가) 등록되었습니다.`);
  };

  const handleUpdateVendor = (vend: Vendor) => {
    setVendors((prev) => {
      const next = prev.map((v) => (v.id === vend.id ? vend : v));
      try {
        localStorage.setItem(STORAGE_KEY_VENDORS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('vendors', next);
      return next;
    });
    showToast(`💾 공급업체 '${vend.name}' 정보가 성공적으로 수정·저장되었습니다.`);
  };

  const handleDeleteVendor = (vendId: string) => {
    setVendors((prev) => {
      const next = prev.filter((v) => v.id !== vendId);
      try {
        localStorage.setItem(STORAGE_KEY_VENDORS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('vendors', next);
      return next;
    });
    showToast('🗑️ 공급업체가 삭제되었습니다.');
  };

  const handleAddUnit = (u: Unit) => {
    setUnits((prev) => {
      const next = [...prev, u];
      try {
        localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('units', next);
      return next;
    });
    showToast(`💾 단위 '${u.name}'이(가) 등록되었습니다.`);
  };

  const handleDeleteUnit = (unitId: string) => {
    setUnits((prev) => {
      const next = prev.filter((u) => u.id !== unitId);
      try {
        localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(next));
      } catch {}
      void saveAppStateKeyToSupabase('units', next);
      return next;
    });
    showToast('🗑️ 단위가 삭제되었습니다.');
  };

  const handleManualSaveMasterChanges = async (label = '기준정보 및 품목 마스터') => {
    try {
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
      localStorage.setItem(STORAGE_KEY_VENDORS, JSON.stringify(vendors));
      localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(units));
      localStorage.setItem(STORAGE_KEY_COMPANY_PROFILE, JSON.stringify(companyProfile));
      localStorage.setItem(STORAGE_KEY_USER_ACCOUNTS, JSON.stringify(userAccounts));
      localStorage.setItem(STORAGE_KEY_USER_PASSWORDS, JSON.stringify(userPasswords));

      await Promise.all([
        saveAppStateKeyToSupabase('items', items),
        saveAppStateKeyToSupabase('categories', categories),
        saveAppStateKeyToSupabase('vendors', vendors),
        saveAppStateKeyToSupabase('units', units),
        saveAppStateKeyToSupabase('companyProfile', companyProfile),
        saveAppStateKeyToSupabase('userAccounts', userAccounts),
        saveAppStateKeyToSupabase('userPasswords', userPasswords),
      ]);

      showToast(
        `💾 [변경사항 저장 완료] ${label}의 모든 데이터가 DB 및 영구 저장소에 안전하게 반영되었습니다.`
      );
    } catch (e) {
      console.error('Failed to manually save master changes', e);
      showToast(`💾 [저장 완료] ${label} 변경사항이 로컬 저장소에 안전하게 저장되었습니다.`);
    }
  };

  const handleResetAllData = () => {
    setItems([]);
    setCategories([]);
    setVendors([]);
    setUnits([]);
    setMemo(INITIAL_MEMO);
    setOrderHistory([]);
    setUsageLogs([]);
    setCompanyProfile(INITIAL_COMPANY_PROFILE);
    setUserAccounts(INITIAL_USER_ACCOUNTS);
    localStorage.removeItem(STORAGE_KEY_ITEMS);
    localStorage.removeItem(STORAGE_KEY_CATEGORIES);
    localStorage.removeItem(STORAGE_KEY_VENDORS);
    localStorage.removeItem(STORAGE_KEY_UNITS);
    localStorage.removeItem(STORAGE_KEY_MEMO);
    localStorage.removeItem(STORAGE_KEY_ORDER_HISTORY);
    localStorage.removeItem(STORAGE_KEY_USAGE_LOGS);
    localStorage.removeItem(STORAGE_KEY_COMPANY_PROFILE);
    localStorage.removeItem(STORAGE_KEY_USER_ACCOUNTS);
    showToast('초기화가 완료되었습니다. (모든 데이터가 비워졌습니다)');
  };

  const isEffectiveWorkerMode = isWorkerMode || currentUser?.level === 2;
  const canAccessFieldAudit = isTabAllowed('field-audit', currentUser);
  const canAccessOrderSheet = isTabAllowed('order-sheet', currentUser);
  const canAccessStats = isTabAllowed('stats', currentUser);
  const canAccessMasterData = isTabAllowed('master-data', currentUser);
  const canAccessAccountManagement = isTabAllowed('account-management', currentUser);

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
            onMemoChange={setMemo}
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
          onConfigSaved={(connected) => setIsDbConnected(connected)}
          onShowToast={showToast}
        />
      )}
    </div>
  );
}