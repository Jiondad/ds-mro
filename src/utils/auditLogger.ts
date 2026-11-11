import { AuditActionType, AuditLogRecord, ProductionLine, UserAccount, UserLevel } from '../types';

export const MAX_AUDIT_LOGS = 1000;

export interface CreateAuditLogParams {
  actionType: AuditActionType;
  targetName: string;
  beforeValue: string | number;
  afterValue: string | number;
  targetLine?: ProductionLine | string;
  targetId?: string;
  categoryName?: string;
  details?: string;
  currentUser?: UserAccount | null;
  ipOrDevice?: string;
}

export interface ActionMeta {
  label: string;
  badgeClass: string;
  group: 'stock' | 'receive' | 'order' | 'calibration' | 'item' | 'master' | 'account' | 'system';
  groupLabel: string;
}

export const AUDIT_ACTION_METAS: Record<AuditActionType, ActionMeta> = {
  STOCK_UPDATE: {
    label: '재고 실사 수량 변경',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    group: 'stock',
    groupLabel: '재고·실사',
  },
  STOCK_BATCH_AUDIT: {
    label: '실사 수량 일괄 확정',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    group: 'stock',
    groupLabel: '재고·실사',
  },
  RECEIVE_CONFIRM: {
    label: '입고 확정 처리',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    group: 'receive',
    groupLabel: '입고확정',
  },
  ORDER_CREATE: {
    label: '거래처 발주서 발행',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    group: 'order',
    groupLabel: '발주관리',
  },
  ORDER_UPDATE: {
    label: '발주 정보 수정',
    badgeClass: 'bg-amber-50/80 text-amber-700 border-amber-200',
    group: 'order',
    groupLabel: '발주관리',
  },
  ORDER_CANCEL: {
    label: '발주 취소 (대기복귀)',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    group: 'order',
    groupLabel: '발주관리',
  },
  ORDER_HISTORY_DELETE: {
    label: '발주 이력 레코드 삭제',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    group: 'order',
    groupLabel: '발주관리',
  },
  SAFETY_STOCK_CALIBRATE: {
    label: '안전재고·일소모량 보정',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    group: 'calibration',
    groupLabel: '안전재고',
  },
  ITEM_CREATE: {
    label: '신규 품목 마스터 등록',
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    group: 'item',
    groupLabel: '품목관리',
  },
  ITEM_UPDATE: {
    label: '품목 마스터 정보 수정',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    group: 'item',
    groupLabel: '품목관리',
  },
  ITEM_DELETE: {
    label: '품목 마스터 삭제',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    group: 'item',
    groupLabel: '품목관리',
  },
  ITEM_RECEIVER_ASSIGN: {
    label: '담당 수령인 배정/변경',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    group: 'item',
    groupLabel: '품목관리',
  },
  ITEM_LOCATION_UPDATE: {
    label: '하역·납품 장소 변경',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    group: 'item',
    groupLabel: '품목관리',
  },
  ITEM_LINE_UPDATE: {
    label: '소속 생산라인 변경',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    group: 'item',
    groupLabel: '품목관리',
  },
  CATEGORY_MUTATE: {
    label: '카테고리 기준정보 변경',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    group: 'master',
    groupLabel: '기준정보',
  },
  VENDOR_MUTATE: {
    label: '거래처 정보 변경',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    group: 'master',
    groupLabel: '기준정보',
  },
  ACCOUNT_MUTATE: {
    label: '사용자 계정 생성·수정',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
    group: 'account',
    groupLabel: '계정관리',
  },
  SYSTEM_RESET: {
    label: '초기 데이터 리셋',
    badgeClass: 'bg-red-100 text-red-900 border-red-400 font-bold',
    group: 'system',
    groupLabel: '시스템',
  },
};

export function getAuditActionMeta(actionType: AuditActionType): ActionMeta {
  return (
    AUDIT_ACTION_METAS[actionType] || {
      label: actionType,
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      group: 'system',
      groupLabel: '기타',
    }
  );
}

/**
 * 신규 Audit Log 엔트리 객체 생성
 */
export function createAuditLogEntry(params: CreateAuditLogParams): AuditLogRecord {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  const timestampMs = now.getTime();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const id = `audit_${timestampMs}_${randomSuffix}`;

  const user = params.currentUser;
  const operatorId = user?.username || 'system';
  const operatorName = user?.name || '시스템 관리자';
  const operatorLevel = (user?.level ?? 0) as UserLevel;
  const operatorRoleLabel = user?.roleLabel || `LV.${operatorLevel}`;
  const operatorAffiliation = user?.department || user?.affiliation || '본사';

  const meta = getAuditActionMeta(params.actionType);

  return {
    id,
    timestamp,
    timestampMs,
    operatorId,
    operatorName,
    operatorLevel,
    operatorRoleLabel,
    operatorAffiliation,
    actionType: params.actionType,
    actionLabel: meta.label,
    targetName: params.targetName,
    targetLine: params.targetLine,
    targetId: params.targetId,
    categoryName: params.categoryName,
    beforeValue: String(params.beforeValue),
    afterValue: String(params.afterValue),
    details: params.details,
    ipOrDevice: params.ipOrDevice || (typeof window !== 'undefined' && window.innerWidth < 768 ? '모바일 현장' : '웹 브라우저'),
  };
}

/**
 * 변경 이력 전체를 Excel/한글 호환 UTF-8 BOM CSV로 내보내기
 */
export function exportAuditLogsToCSV(logs: AuditLogRecord[], filename = 'daeseong_steel_audit_logs.csv'): void {
  if (logs.length === 0) {
    return;
  }

  const headers = [
    '로그 ID',
    '일시',
    '작업자 ID',
    '작업자 성명',
    '권한 레벨',
    '소속/부서',
    '작업 유형',
    '작업 명칭',
    '대상 항목',
    '대상 라인',
    '카테고리',
    '변경 전 값',
    '변경 후 값',
    '상세 비고',
    '접속 환경',
  ];

  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = logs.map((log) => [
    escapeCSV(log.id),
    escapeCSV(log.timestamp),
    escapeCSV(log.operatorId),
    escapeCSV(log.operatorName),
    escapeCSV(log.operatorRoleLabel),
    escapeCSV(log.operatorAffiliation || '-'),
    escapeCSV(log.actionType),
    escapeCSV(log.actionLabel),
    escapeCSV(log.targetName),
    escapeCSV(log.targetLine || '공통'),
    escapeCSV(log.categoryName || '-'),
    escapeCSV(log.beforeValue),
    escapeCSV(log.afterValue),
    escapeCSV(log.details || '-'),
    escapeCSV(log.ipOrDevice || '웹'),
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
