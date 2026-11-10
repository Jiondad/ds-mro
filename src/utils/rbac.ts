import { ActiveTab, CalculatedItem, InventoryItem, UserAccount, UserLevel } from '../types';

/**
 * 4단계 RBAC 권한 액션 정의
 */
export type PermissionAction =
  | 'access_tab'              // 탭 메뉴 접근 권한
  | 'edit_field_stock'        // 현장 재고/실사 수량 수정
  | 'confirm_receipt'         // 현장 입고확정 처리
  | 'batch_commit_audit'      // 현장 실사 수량 일괄 확정
  | 'confirm_delayed_audit'   // 지연 실사 일괄 확인
  | 'create_purchase_order'   // 거래처 발주서 발행
  | 'edit_purchase_order'     // 발주 일정 및 수량 수정 / 취소
  | 'delete_order_history'    // 발주 이력 레코드 삭제
  | 'view_usage_stats'        // 사용량 통계 조회
  | 'calibrate_safety_stock'  // 안전재고 자동 보정 실행
  | 'manage_master_data'      // 기준정보(품목/카테고리/거래처 등) 관리
  | 'manage_user_accounts'    // 사용자 계정 관리(생성/수정/삭제/비밀번호 초기화)
  | 'reset_system_data'       // 전체 초기 데이터 리셋
  | 'manage_db_config';       // Supabase DB 클라우드 환경설정

export interface RoleInfo {
  level: UserLevel;
  roleName: string;
  roleLabel: string;
  badgeClass: string;
  desc: string;
  allowedTabs: ActiveTab[];
}

export const ROLE_INFOS: Record<UserLevel, RoleInfo> = {
  0: {
    level: 0,
    roleName: '최고관리자',
    roleLabel: 'LV.0 최고관리자',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    desc: '시스템 전반의 모든 기능, 사용자 계정 관리, 전체 데이터 수정/삭제 전권 보유',
    allowedTabs: [
      'dashboard',
      'field-audit',
      'order-sheet',
      'stats',
      'master-data',
      'account-management',
    ],
  },
  1: {
    level: 1,
    roleName: '현장관리자',
    roleLabel: 'LV.1 현장관리자',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    desc: '현장 내 모든 라인의 재고/실사/사용량 데이터 수정 및 모니터링/통계 관리 (발주 및 기준정보 불가)',
    allowedTabs: ['dashboard', 'field-audit', 'stats'],
  },
  2: {
    level: 2,
    roleName: '현장사용자',
    roleLabel: 'LV.2 현장사용자',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    desc: '본인 소속 라인의 담당 수령 품목에 한정한 실사 및 입고 처리 전용 (발주/통계/기준정보 불가)',
    allowedTabs: ['field-audit', 'dashboard'],
  },
  3: {
    level: 3,
    roleName: '사무실사용자',
    roleLabel: 'LV.3 사무실사용자',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: '거래처 발주서 발행 및 발주 관리, 전사 사용량/재고 통계 분석 (현장 자재/실사 수정 불가)',
    allowedTabs: ['dashboard', 'order-sheet', 'stats'],
  },
};

/**
 * 사용자 역할 메타정보 반환
 */
export function getRoleInfo(level: UserLevel | number | undefined): RoleInfo {
  if (level === 0 || level === 1 || level === 2 || level === 3) {
    return ROLE_INFOS[level];
  }
  return ROLE_INFOS[0];
}

/**
 * 탭 접근 허용 여부 판별
 */
export function isTabAllowed(tab: ActiveTab, user: UserAccount | null): boolean {
  if (!user) return true;
  const role = getRoleInfo(user.level);
  return role.allowedTabs.includes(tab);
}

/**
 * 탭 접근 불가 시 사용자 친화적인 안내 메시지 반환
 */
export function getTabAccessDeniedReason(tab: ActiveTab, user: UserAccount | null): string {
  if (!user) return '로그인이 필요한 서비스입니다.';

  if (user.level === 1) {
    if (tab === 'order-sheet') {
      return '⚠️ [권한 제한] 현장관리자(Level 1)는 발주서 발행 및 발주 데이터 수정 권한이 없습니다. 사무실 담당자에게 문의하세요.';
    }
    if (tab === 'master-data' || tab === 'account-management') {
      return '⚠️ [권한 제한] 기준정보 및 계정 관리는 최고관리자(Level 0) 전용 메뉴입니다.';
    }
  }

  if (user.level === 2) {
    if (tab === 'order-sheet') {
      return '⚠️ [권한 제한] 현장사용자(Level 2)는 거래처 발주서 발행 권한이 없습니다.';
    }
    if (tab === 'stats') {
      return '⚠️ [권한 제한] 현장사용자(Level 2)는 사용량 통계 분석 메뉴에 접근할 수 없습니다.';
    }
    if (tab === 'master-data' || tab === 'account-management') {
      return '⚠️ [권한 제한] 기준정보 및 계정 관리는 최고관리자(Level 0) 전용 메뉴입니다.';
    }
  }

  if (user.level === 3) {
    if (tab === 'master-data' || tab === 'account-management') {
      return '⚠️ [권한 제한] 기준정보 및 계정 관리는 최고관리자(Level 0) 전용 메뉴입니다.';
    }
  }

  return `⚠️ 현재 권한(${user.roleLabel || `LV.${user.level}`})으로는 접근할 수 없는 메뉴입니다.`;
}

/**
 * 현장사용자(Level 2)의 품목 할당(본인 소속 라인 또는 담당 수령인) 일치 여부 확인
 */
export function checkItemAssignedToUser(
  item: InventoryItem | CalculatedItem,
  user: UserAccount | null
): boolean {
  if (!user) return false;
  // 최고관리자(Level 0) 및 현장관리자(Level 1)는 모든 라인/품목 전권 보유
  if (user.level === 0 || user.level === 1 || user.username === 'admin') {
    return true;
  }
  // 사무실사용자(Level 3)는 현장 품목 조작 불가
  if (user.level === 3) {
    return false;
  }

  // Level 2 (현장사용자):
  // 1. 수령자 로그인 ID 일치
  if (item.receiverLoginId && item.receiverLoginId.trim() === user.username.trim()) {
    return true;
  }

  // 2. 수령자 이름 또는 직급 일치
  const itemRecName = (item.receiverName || '').trim();
  if (itemRecName) {
    const accName = user.name.trim();
    const accFullName =
      user.title && !accName.includes(user.title)
        ? `${accName} ${user.title}`.trim()
        : accName;
    if (
      itemRecName === accName ||
      itemRecName === accFullName ||
      itemRecName.startsWith(accName + ' ')
    ) {
      return true;
    }
  }

  // 3. 소속 라인(소속 공장/라인: SL1, SL2, 공용, 아산공장 등) 일치
  if (user.affiliation) {
    const aff = user.affiliation.trim();
    if (aff === item.line || aff.includes(item.line) || item.line.includes(aff)) {
      return true;
    }
  }
  if (user.department) {
    const dept = user.department.trim();
    if (dept === item.line || dept.includes(item.line) || item.line.includes(dept)) {
      return true;
    }
  }

  return false;
}

/**
 * 4단계 전역 권한 검증 함수
 */
export function checkPermission(
  action: PermissionAction,
  user: UserAccount | null,
  context?: {
    targetItem?: CalculatedItem | InventoryItem;
    targetTab?: ActiveTab;
  }
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: '로그인이 필요합니다.' };
  }

  // Level 0: 최고관리자는 시스템 전반 전권 보유
  if (user.level === 0 || user.username === 'admin') {
    return { allowed: true };
  }

  switch (action) {
    case 'access_tab': {
      const tab = context?.targetTab;
      if (!tab) return { allowed: true };
      const allowed = isTabAllowed(tab, user);
      if (!allowed) {
        return { allowed: false, reason: getTabAccessDeniedReason(tab, user) };
      }
      return { allowed: true };
    }

    case 'edit_field_stock':
    case 'confirm_receipt': {
      // Level 1 (현장관리자): 모든 라인의 재고/실사/사용량 데이터 수정 가능
      if (user.level === 1) {
        return { allowed: true };
      }
      // Level 3 (사무실사용자): 현장 자재/재고 수정 및 현장 실사 처리 불가
      if (user.level === 3) {
        return {
          allowed: false,
          reason: '⚠️ [직무 영역 분리] 사무실사용자(Level 3)는 현장 자재/재고 수정 및 입고확정 처리가 불가합니다. 현장 담당자에게 문의하세요.',
        };
      }
      // Level 2 (현장사용자): 본인 소속 라인의 담당 수령 품목에 한정
      if (user.level === 2) {
        const item = context?.targetItem;
        if (!item) return { allowed: true };
        const isAssigned = checkItemAssignedToUser(item, user);
        if (!isAssigned) {
          const assignedLabel = item.receiverName || item.receiverLoginId || '담당자';
          return {
            allowed: false,
            reason: `⚠️ 본인 소속 라인의 담당 수령 품목만 조작할 수 있습니다. (배정 담당자: ${assignedLabel})`,
          };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: '해당 작업을 수행할 권한이 없습니다.' };
    }

    case 'batch_commit_audit':
    case 'confirm_delayed_audit': {
      if (user.level === 1) return { allowed: true };
      if (user.level === 3) {
        return {
          allowed: false,
          reason: '⚠️ [직무 영역 분리] 사무실사용자(Level 3)는 현장 실사 데이터 일괄 확정 권한이 없습니다.',
        };
      }
      // Level 2 can only commit items they have rights to
      if (user.level === 2) {
        return { allowed: true };
      }
      return { allowed: false, reason: '권한이 없습니다.' };
    }

    case 'create_purchase_order':
    case 'edit_purchase_order':
    case 'delete_order_history': {
      // Level 3 (사무실사용자): 거래처 발주서 발행 및 발주 관리 권한 보유
      if (user.level === 3) {
        return { allowed: true };
      }
      // Level 1 (현장관리자): 발주서 발행/발주 데이터 수정 절대 불가
      if (user.level === 1) {
        return {
          allowed: false,
          reason: '⚠️ [직무 영역 분리] 현장관리자(Level 1)는 발주서 발행 및 발주 데이터 수정이 절대 불가합니다. 사무실 구매자재 담당자에게 요청하세요.',
        };
      }
      // Level 2 (현장사용자): 발주 접근 불가
      return {
        allowed: false,
        reason: '⚠️ 발주서 발행 및 발주 관리는 사무실사용자(Level 3) 및 최고관리자만 가능합니다.',
      };
    }

    case 'view_usage_stats': {
      // Level 1, Level 3 allowed
      if (user.level === 1 || user.level === 3) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: '⚠️ 사용량 통계 조회 권한이 없습니다.',
      };
    }

    case 'calibrate_safety_stock': {
      // Level 1 (현장관리자): 현장 재고/실사 관리 권한자로서 안전일수/일사용량 보정 가능
      if (user.level === 1) {
        return { allowed: true };
      }
      if (user.level === 3) {
        return {
          allowed: false,
          reason: '⚠️ [직무 영역 분리] 사무실사용자(Level 3)는 현장 안전재고 일사용량 보정 권한이 없습니다. 현장관리자에게 요청하세요.',
        };
      }
      return {
        allowed: false,
        reason: '⚠️ 안전재고 자동 보정은 현장관리자(Level 1) 및 최고관리자만 가능합니다.',
      };
    }

    case 'manage_master_data':
      return {
        allowed: false,
        reason: '⚠️ 기준정보 관리는 최고관리자(Level 0) 전용 메뉴입니다.',
      };

    case 'manage_user_accounts':
    case 'reset_system_data':
    case 'manage_db_config':
      return {
        allowed: false,
        reason: '⚠️ 최고관리자(Level 0) 전용 기능입니다.',
      };

    default:
      return { allowed: false, reason: '권한이 없습니다.' };
  }
}

/**
 * 개별 품목 단위의 수정 권한 판별 함수
 */
export function checkEditPermission(
  action: 'field_stock' | 'confirm_receipt' | 'order',
  user: UserAccount | null,
  item?: CalculatedItem | InventoryItem
): { allowed: boolean; reason?: string } {
  if (action === 'order') {
    return checkPermission('create_purchase_order', user, { targetItem: item });
  }
  return checkPermission(action === 'field_stock' ? 'edit_field_stock' : 'confirm_receipt', user, {
    targetItem: item,
  });
}
