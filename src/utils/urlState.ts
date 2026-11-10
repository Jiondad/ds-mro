import { useState, useEffect, useCallback } from 'react';
import { ActiveTab, UserAccount } from '../types';

export const STORAGE_KEY_ACTIVE_TAB = 'daeseong_steel_active_tab_v1';

export const VALID_ACTIVE_TABS: readonly ActiveTab[] = [
  'dashboard',
  'field-audit',
  'order-sheet',
  'master-data',
  'stats',
  'account-management',
] as const;

export function isValidActiveTab(val: string | null | undefined): val is ActiveTab {
  if (!val) return false;
  return (VALID_ACTIVE_TABS as readonly string[]).includes(val);
}

/**
 * URL(쿼리 파라미터 ?tab=..., 해시 #/..., 하위 경로 /ds-mro/...)에서 요청된 탭을 추출합니다.
 */
export function extractTabFromLocation(): ActiveTab | null {
  if (typeof window === 'undefined') return null;

  try {
    // 1. URL 쿼리 파라미터 (?tab=...)
    const params = new URLSearchParams(window.location.search);
    const queryTab = params.get('tab')?.trim();
    if (isValidActiveTab(queryTab)) {
      return queryTab;
    }

    // 2. URL 해시 (#account-management 또는 #/account-management?sub=...)
    const rawHash = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim();
    if (isValidActiveTab(rawHash)) {
      return rawHash;
    }

    // 3. URL 하위 경로 (/ds-mro/account-management 또는 /master-data 등)
    const cleanPath = window.location.pathname
      .replace(/^\/ds-mro\/?/, '/')
      .replace(/^\/+|\/+$/g, '');
    const firstSegment = cleanPath.split('/')[0]?.trim();
    if (isValidActiveTab(firstSegment)) {
      return firstSegment;
    }
  } catch (e) {
    console.warn('Failed to parse tab from location', e);
  }

  return null;
}

/**
 * 사용자 권한(RBAC) 및 작업자 모드 여부를 고려하여 허용 가능한 탭으로 보정합니다.
 */
export function enforceTabRBAC(
  candidateTab: ActiveTab,
  user: UserAccount | null,
  isWorkerMode: boolean
): ActiveTab {
  if (!user) {
    // 로그인 전에도 사용자가 진입한 URL 탭을 유지해 두면 로그인 직후 권한에 맞게 연결됩니다.
    return candidateTab;
  }

  const effectiveWorker = isWorkerMode || user.level === 1;
  if (effectiveWorker) {
    if (candidateTab !== 'field-audit' && candidateTab !== 'dashboard') {
      return 'field-audit';
    }
    return candidateTab;
  }

  if (user.level === 2) {
    if (candidateTab === 'master-data' || candidateTab === 'account-management') {
      return 'dashboard';
    }
    return candidateTab;
  }

  // LV.0 최고관리자: 모든 탭 접근 허용
  return candidateTab;
}

/**
 * 새로고침(F5) 또는 직접 URL 진입 시 초기 활성 탭을 결정합니다.
 * 우선순위: 1) URL(?tab=, #hash, /path) -> 2) localStorage 저장 탭 -> 3) 권한별 기본 탭
 */
export function resolveInitialActiveTab(
  user: UserAccount | null,
  isWorkerMode: boolean
): ActiveTab {
  const urlTab = extractTabFromLocation();
  if (urlTab) {
    return enforceTabRBAC(urlTab, user, isWorkerMode);
  }

  try {
    const savedTab = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB)?.trim();
    if (isValidActiveTab(savedTab)) {
      return enforceTabRBAC(savedTab, user, isWorkerMode);
    }
  } catch {}

  if (user?.level === 1 || isWorkerMode) {
    return 'field-audit';
  }
  return 'dashboard';
}

/**
 * 현재 활성 탭을 URL 쿼리 파라미터(?tab=...) 및 localStorage에 동기화합니다.
 */
export function syncActiveTabToUrl(tab: ActiveTab, pushHistory = false): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, tab);
  } catch {}

  try {
    const url = new URL(window.location.href);
    // 하위 경로(/ds-mro/account-management 등)로 들어온 경우 베이스 경로(/ds-mro/ 또는 /)로 정규화하여 새로고침 시 404 방지
    const isDsMroBase =
      url.pathname === '/ds-mro' || url.pathname.startsWith('/ds-mro/');
    url.pathname = isDsMroBase ? '/ds-mro/' : '/';

    const currentParamTab = url.searchParams.get('tab');
    url.searchParams.set('tab', tab);

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (pushHistory && currentParamTab !== tab) {
      window.history.pushState({ tab }, '', nextUrl);
    } else {
      window.history.replaceState({ tab }, '', nextUrl);
    }
  } catch (e) {
    console.warn('Failed to sync active tab to URL', e);
  }
}

/**
 * 각 탭 내부의 서브 탭, 공장/라인 필터, 상태 필터 등을 URLSearchParams 및 Storage에 양방향 동기화하는 훅입니다.
 * 새로고침(F5)이나 뒤로가기/앞으로가기 시에도 필터 및 하위 화면 상태가 그대로 유지됩니다.
 */
export function useUrlPersistedState<T extends string | boolean>(
  paramKey: string,
  storageKey: string,
  defaultValue: T,
  validValues?: readonly T[]
): [T, (next: T | ((prev: T) => T)) => void] {
  const isBoolean = typeof defaultValue === 'boolean';

  const parseValue = useCallback(
    (raw: string | null): T | null => {
      if (raw === null || raw === undefined) return null;
      if (isBoolean) {
        if (raw === 'true' || raw === '1') return true as T;
        if (raw === 'false' || raw === '0') return false as T;
        return null;
      }
      const strVal = raw as T;
      if (validValues && !validValues.includes(strVal)) {
        return null;
      }
      return strVal;
    },
    [isBoolean, validValues]
  );

  const readInitialValue = useCallback((): T => {
    if (typeof window === 'undefined') return defaultValue;

    try {
      // 1. URL 쿼리 파라미터 우선 확인
      const params = new URLSearchParams(window.location.search);
      const fromUrl = parseValue(params.get(paramKey));
      if (fromUrl !== null) return fromUrl;

      // 2. sessionStorage / localStorage 백업 확인
      const fromSession = parseValue(sessionStorage.getItem(storageKey));
      if (fromSession !== null) return fromSession;

      const fromLocal = parseValue(localStorage.getItem(storageKey));
      if (fromLocal !== null) return fromLocal;
    } catch {}

    return defaultValue;
  }, [defaultValue, paramKey, parseValue, storageKey]);

  const [state, setState] = useState<T>(readInitialValue);

  // 상태 변경 시 URLSearchParams 및 Storage 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const serialized = String(state);
    try {
      sessionStorage.setItem(storageKey, serialized);
      localStorage.setItem(storageKey, serialized);
    } catch {}

    try {
      const url = new URL(window.location.href);
      if (state === defaultValue || serialized === '') {
        url.searchParams.delete(paramKey);
      } else {
        url.searchParams.set(paramKey, serialized);
      }
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl !== currentUrl) {
        window.history.replaceState(window.history.state, '', nextUrl);
      }
    } catch {}
  }, [state, paramKey, storageKey, defaultValue]);

  // 브라우저 뒤로가기/앞으로가기(popstate) 시 상태 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = parseValue(params.get(paramKey));
        if (fromUrl !== null) {
          setState(fromUrl);
        } else {
          setState(defaultValue);
        }
      } catch {}
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [defaultValue, paramKey, parseValue]);

  return [state, setState];
}
