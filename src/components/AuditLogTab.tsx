import React, { useState, useMemo } from 'react';
import { AuditActionType, AuditLogRecord, ProductionLine, UserAccount } from '../types';
import { getAuditActionMeta, exportAuditLogsToCSV, AUDIT_ACTION_METAS } from '../utils/auditLogger';
import { formatNumber } from '../utils/calculations';
import {
  History,
  Search,
  Filter,
  Download,
  RotateCcw,
  Calendar,
  User,
  ShieldCheck,
  HardHat,
  Briefcase,
  Layers,
  ArrowRight,
  Clock,
  Trash2,
  FileSpreadsheet,
  X,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Package,
  Truck,
  FileText,
  Users as UsersIcon,
  Sparkles,
} from 'lucide-react';

interface AuditLogTabProps {
  logs: AuditLogRecord[];
  currentUser?: UserAccount | null;
  onClearLogs?: () => void;
  onRevertLog?: (log: AuditLogRecord) => void;
  onShowToast: (message: string) => void;
}

type DatePreset = 'all' | 'today' | '3days' | '7days' | '30days' | 'custom';
type ActionGroupFilter = 'all' | 'stock' | 'receive' | 'order' | 'calibration' | 'item' | 'master' | 'account';

export const AuditLogTab: React.FC<AuditLogTabProps> = ({
  logs,
  currentUser,
  onClearLogs,
  onRevertLog,
  onShowToast,
}) => {
  const isSuperAdmin = currentUser?.level === 0 || currentUser?.username === 'admin';

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<ActionGroupFilter>('all');
  const [selectedActionType, setSelectedActionType] = useState<string>('all');
  const [selectedOperator, setSelectedOperator] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedLine, setSelectedLine] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Selected log for detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  // 해당 로그가 되돌리기(Rollback) 가능한지 판별
  const canRevertLogEntry = (log: AuditLogRecord): boolean => {
    if (!isSuperAdmin || !onRevertLog) return false;
    if (log.isReverted) return false;
    if (log.details?.includes('[되돌리기 완료]') || log.targetName.startsWith('[되돌리기 복원]')) {
      return false;
    }
    if (log.prevItemsSnapshot && log.prevItemsSnapshot.length > 0) return true;

    // 스냅샷 도입 이전 기존 로그 호환: 일괄 실사확정(변동없음 확인) 또는 개별 재고수량 변경
    if (
      log.actionType === 'STOCK_BATCH_AUDIT' &&
      (log.afterValue.includes('실사확정') || log.beforeValue.includes('실사 대기'))
    ) {
      return true;
    }
    if (log.actionType === 'STOCK_UPDATE' && log.targetId) {
      return true;
    }
    return false;
  };

  // Distinct operators list for filter dropdown
  const distinctOperators = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string }>();
    logs.forEach((log) => {
      if (!map.has(log.operatorId)) {
        map.set(log.operatorId, {
          id: log.operatorId,
          name: log.operatorName,
          role: log.operatorRoleLabel,
        });
      }
    });
    return Array.from(map.values());
  }, [logs]);

  // Distinct lines list
  const distinctLines = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => {
      if (log.targetLine) set.add(log.targetLine);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Filter computation
  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;

    return logs.filter((log) => {
      // 1. Text search
      if (query) {
        const matchSearch =
          log.targetName.toLowerCase().includes(query) ||
          log.operatorName.toLowerCase().includes(query) ||
          log.operatorId.toLowerCase().includes(query) ||
          log.actionLabel.toLowerCase().includes(query) ||
          log.beforeValue.toLowerCase().includes(query) ||
          log.afterValue.toLowerCase().includes(query) ||
          (log.details && log.details.toLowerCase().includes(query)) ||
          (log.categoryName && log.categoryName.toLowerCase().includes(query)) ||
          (log.targetLine && log.targetLine.toLowerCase().includes(query));

        if (!matchSearch) return false;
      }

      // 2. Action group filter
      if (selectedGroup !== 'all') {
        const meta = getAuditActionMeta(log.actionType);
        if (meta.group !== selectedGroup) return false;
      }

      // 3. Action specific type
      if (selectedActionType !== 'all') {
        if (log.actionType !== selectedActionType) return false;
      }

      // 4. Operator filter
      if (selectedOperator !== 'all') {
        if (log.operatorId !== selectedOperator) return false;
      }

      // 5. Operator level filter
      if (selectedLevel !== 'all') {
        if (String(log.operatorLevel) !== selectedLevel) return false;
      }

      // 6. Line filter
      if (selectedLine !== 'all') {
        if (log.targetLine !== selectedLine) return false;
      }

      // 7. Date preset
      if (datePreset === 'today') {
        if (!log.timestamp.startsWith(todayStr)) return false;
      } else if (datePreset === '3days') {
        const threeDaysAgoMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
        if (log.timestampMs < threeDaysAgoMs) return false;
      } else if (datePreset === '7days') {
        const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (log.timestampMs < sevenDaysAgoMs) return false;
      } else if (datePreset === '30days') {
        const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
        if (log.timestampMs < thirtyDaysAgoMs) return false;
      } else if (datePreset === 'custom') {
        const logDate = log.timestamp.split(' ')[0];
        if (customStartDate && logDate < customStartDate) return false;
        if (customEndDate && logDate > customEndDate) return false;
      }

      return true;
    });
  }, [
    logs,
    searchQuery,
    selectedGroup,
    selectedActionType,
    selectedOperator,
    selectedLevel,
    selectedLine,
    datePreset,
    customStartDate,
    customEndDate,
  ]);

  // Summary statistics
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;

    let todayCount = 0;
    let stockAuditCount = 0;
    let orderReceiveCount = 0;
    let accountMasterCount = 0;

    logs.forEach((l) => {
      if (l.timestamp.startsWith(todayStr)) todayCount++;
      const meta = getAuditActionMeta(l.actionType);
      if (meta.group === 'stock' || meta.group === 'calibration') stockAuditCount++;
      if (meta.group === 'order' || meta.group === 'receive') orderReceiveCount++;
      if (meta.group === 'account' || meta.group === 'master' || meta.group === 'item')
        accountMasterCount++;
    });

    return {
      total: logs.length,
      todayCount,
      stockAuditCount,
      orderReceiveCount,
      accountMasterCount,
    };
  }, [logs]);

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedGroup('all');
    setSelectedActionType('all');
    setSelectedOperator('all');
    setSelectedLevel('all');
    setSelectedLine('all');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    onShowToast('필터 조건이 전체 조회로 초기화되었습니다.');
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    selectedGroup !== 'all' ||
    selectedActionType !== 'all' ||
    selectedOperator !== 'all' ||
    selectedLevel !== 'all' ||
    selectedLine !== 'all' ||
    datePreset !== 'all';

  // Export CSV handler
  const handleExportCSV = () => {
    const listToExport = filteredLogs.length > 0 ? filteredLogs : logs;
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}`;
    exportAuditLogsToCSV(listToExport, `대성스틸_데이터변경이력_${dateStr}.csv`);
    onShowToast(`${listToExport.length}건의 변경 이력이 CSV 파일로 다운로드되었습니다.`);
  };

  // Clear all logs handler (Level 0 only)
  const handleClearLogsClick = () => {
    if (!isSuperAdmin) {
      alert('데이터 변경 이력 전체 초기화는 최고관리자(Level 0)만 가능합니다.');
      return;
    }
    if (
      window.confirm(
        '⚠️ 주의: 시스템에 누적된 모든 데이터 변경 이력(Audit Log)을 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.'
      )
    ) {
      if (onClearLogs) {
        onClearLogs();
        onShowToast('모든 데이터 변경 이력이 초기화되었습니다.');
      }
    }
  };

  const getRoleBadge = (level: number) => {
    if (level === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
          <ShieldCheck className="w-3 h-3 text-indigo-600 shrink-0" />
          <span>LV.0 최고</span>
        </span>
      );
    }
    if (level === 1) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
          <HardHat className="w-3 h-3 text-blue-600 shrink-0" />
          <span>LV.1 현장관리</span>
        </span>
      );
    }
    if (level === 2) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
          <HardHat className="w-3 h-3 text-amber-600 shrink-0" />
          <span>LV.2 현장사용자</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Briefcase className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>LV.3 사무실</span>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Header Banner & Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-xs shrink-0">
              <History className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  데이터 변경 이력 (Audit Log)
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200 tabular-nums">
                  누적 {formatNumber(stats.total)}건
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 tabular-nums">
                  오늘 {formatNumber(stats.todayCount)}건 발생
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                자재 재고 실사, 입고 확정, 거래처 발주, 안전재고 보정 및 계정 관리 등 시스템 내 모든 수정·삭제 작업의
                작업자와 변경 전·후(Before & After) 상태를 투명하게 영구 기록합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer active:scale-98"
              title="현재 조회된 변경 이력을 엑셀/CSV 파일로 다운로드합니다"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>CSV 내보내기 ({filteredLogs.length}건)</span>
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleClearLogsClick}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 rounded-lg transition-colors cursor-pointer active:scale-98"
                title="누적된 변경 로그를 전체 삭제합니다 (최고관리자 전용)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>이력 비우기</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="font-semibold">📦 재고 실사·수량</span>
              <Package className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="font-mono font-black text-sm sm:text-base text-slate-900 tabular-nums">
              {formatNumber(stats.stockAuditCount)}건
            </div>
          </div>

          <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="font-semibold">📥 발주 & 입고확정</span>
              <Truck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="font-mono font-black text-sm sm:text-base text-slate-900 tabular-nums">
              {formatNumber(stats.orderReceiveCount)}건
            </div>
          </div>

          <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="font-semibold">⚙️ 품목·계정·기준정보</span>
              <UsersIcon className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="font-mono font-black text-sm sm:text-base text-slate-900 tabular-nums">
              {formatNumber(stats.accountMasterCount)}건
            </div>
          </div>

          <div className="p-3 bg-blue-50/70 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between text-blue-800 mb-1">
              <span className="font-bold">🔍 필터 조회 결과</span>
              <Clock className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="font-mono font-black text-sm sm:text-base text-blue-900 tabular-nums">
              {formatNumber(filteredLogs.length)}건 <span className="text-xs font-normal text-blue-700">/ {stats.total}건</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        {/* Row 1: Search Input & Date Presets */}
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="품목명, 규격, 작업자 성명, 작업유형, 변경 전/후 내용, 비고 검색..."
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-xs font-bold text-slate-500 mr-1 shrink-0 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>기간:</span>
            </span>
            {(
              [
                { id: 'all', label: '전체' },
                { id: 'today', label: '오늘' },
                { id: '3days', label: '3일' },
                { id: '7days', label: '7일' },
                { id: '30days', label: '30일' },
                { id: 'custom', label: '직접선택' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDatePreset(p.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Pickers (visible if custom selected) */}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-600 font-semibold">조회 기간 지정:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1 border border-slate-300 rounded-md text-xs bg-white"
            />
            <span className="text-slate-400">~</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1 border border-slate-300 rounded-md text-xs bg-white"
            />
          </div>
        )}

        {/* Row 2: Secondary Filters (작업 유형 그룹, 작업자, 권한, 라인) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* 작업 분류 */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">작업 분류</label>
            <select
              value={selectedGroup}
              onChange={(e) => {
                setSelectedGroup(e.target.value as ActionGroupFilter);
                setSelectedActionType('all');
              }}
              className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">전체 작업 분류</option>
              <option value="stock">📦 재고 실사·수량</option>
              <option value="receive">📥 입고 확정 처리</option>
              <option value="order">📝 거래처 발주 관리</option>
              <option value="calibration">⚙️ 안전재고 자동 보정</option>
              <option value="item">🏷️ 품목 마스터 관리</option>
              <option value="account">👥 사용자 계정 관리</option>
              <option value="master">🏢 기준정보 (카테고리/거래처)</option>
            </select>
          </div>

          {/* 작업자 필터 */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">작업자</label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">전체 작업자 ({distinctOperators.length}명)</option>
              {distinctOperators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.name} ({op.id})
                </option>
              ))}
            </select>
          </div>

          {/* 권한 레벨 필터 */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">권한 레벨</label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">전체 권한 레벨</option>
              <option value="0">LV.0 최고관리자</option>
              <option value="1">LV.1 현장관리자</option>
              <option value="2">LV.2 현장사용자</option>
              <option value="3">LV.3 사무실사용자</option>
            </select>
          </div>

          {/* 생산라인 필터 */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">생산 라인</label>
            <select
              value={selectedLine}
              onChange={(e) => setSelectedLine(e.target.value)}
              className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">전체 라인</option>
              {distinctLines.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filters Reset Bar */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <div className="text-slate-600 flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-blue-700">필터 적용 중:</span>
              {searchQuery && (
                <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded text-[11px] border border-blue-200">
                  검색: "{searchQuery}"
                </span>
              )}
              {selectedGroup !== 'all' && (
                <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                  분류: {selectedGroup}
                </span>
              )}
              {selectedOperator !== 'all' && (
                <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                  작업자: {selectedOperator}
                </span>
              )}
              {datePreset !== 'all' && (
                <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                  기간: {datePreset}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 font-bold hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>조건 초기화</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Audit Logs Table View */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-bold border-b border-slate-800 uppercase text-[11px] tracking-wider select-none">
                <th className="py-2.5 px-3 text-center w-12 shrink-0">No.</th>
                <th className="py-2.5 px-3 w-36 shrink-0">일시 (Timestamp)</th>
                <th className="py-2.5 px-3 w-44">작업자 (Operator)</th>
                <th className="py-2.5 px-3 w-40 text-center">작업 유형</th>
                <th className="py-2.5 px-3 min-w-[200px]">대상 항목 (Target Entity)</th>
                <th className="py-2.5 px-3 min-w-[260px]">변경 전 / 변경 후 (Before → After)</th>
                <th className="py-2.5 px-3 min-w-[160px]">상세 내역 / 비고</th>
                <th className="py-2.5 px-3 text-center w-28 shrink-0">상세 / 복구</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <History className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="text-sm font-bold text-slate-700">기록된 데이터 변경 이력이 없습니다.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {hasActiveFilters
                        ? '설정된 필터 조건에 부합하는 변경 이력이 없습니다. 필터를 초기화해 보세요.'
                        : '재고 실사, 입고확정, 발주 등록 등 시스템 작업이 발생하면 자동으로 이곳에 이력이 누적됩니다.'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-3 px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 rounded-lg cursor-pointer"
                      >
                        필터 조건 초기화
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, index) => {
                  const meta = getAuditActionMeta(log.actionType);
                  const revertible = canRevertLogEntry(log);
                  const isAlreadyReverted =
                    Boolean(log.isReverted) || Boolean(log.details?.includes('[되돌리기 완료]'));

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={`transition-colors cursor-pointer group ${
                        isAlreadyReverted ? 'bg-slate-50/70 opacity-75' : 'hover:bg-blue-50/40'
                      }`}
                    >
                      {/* No. */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px] tabular-nums">
                        {filteredLogs.length - index}
                      </td>

                      {/* Timestamp */}
                      <td className="py-2.5 px-3 text-slate-700 font-mono text-xs whitespace-nowrap tabular-nums">
                        <div className="font-semibold text-slate-900">{log.timestamp.split(' ')[0]}</div>
                        <div className="text-[11px] text-slate-400">{log.timestamp.split(' ')[1]}</div>
                      </td>

                      {/* Operator */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-slate-900 text-xs">{log.operatorName}</span>
                          {getRoleBadge(log.operatorLevel)}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <span>{log.operatorId}</span>
                          {log.operatorAffiliation && (
                            <>
                              <span>·</span>
                              <span>{log.operatorAffiliation}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Action Type */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${meta.badgeClass}`}
                        >
                          {log.actionLabel}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{meta.groupLabel}</div>
                      </td>

                      {/* Target Entity */}
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 text-xs leading-snug">
                          {log.targetName}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {log.targetLine && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                              {log.targetLine}
                            </span>
                          )}
                          {log.categoryName && (
                            <span className="text-slate-400">· {log.categoryName}</span>
                          )}
                        </div>
                      </td>

                      {/* Before → After */}
                      <td className="py-2.5 px-3 font-mono">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-400 line-through text-xs px-1.5 py-0.5 bg-slate-100 rounded">
                            {log.beforeValue || '(없음)'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-blue-900 font-black text-xs px-1.5 py-0.5 bg-blue-50 rounded border border-blue-200">
                            {log.afterValue}
                          </span>
                        </div>
                      </td>

                      {/* Details / Notes */}
                      <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-xs truncate leading-relaxed">
                        {log.details ? (
                          <span title={log.details}>{log.details}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Detail View & Revert Button */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-100 rounded transition-colors cursor-pointer group-hover:bg-blue-600 group-hover:text-white"
                          >
                            보기
                          </button>

                          {isAlreadyReverted ? (
                            <span className="px-1.5 py-1 text-[10px] font-bold text-slate-400 bg-slate-100 rounded border border-slate-200">
                              복구됨
                            </span>
                          ) : (
                            revertible && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRevertLog?.(log);
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-500 hover:text-slate-950 border border-amber-300 rounded transition-colors cursor-pointer flex items-center gap-0.5 shadow-2xs"
                                title="이 작업을 실행하기 이전 상태로 되돌립니다 (Rollback)"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>되돌리기</span>
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info strip */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              조회 건수: <strong className="text-slate-900">{filteredLogs.length}</strong>건 (전체 {logs.length}건)
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-[11px]">행을 클릭하면 변경 전/후 상세 비교 모달이 열립니다.</span>
          </div>

          <div className="text-[11px] text-slate-400">
            * 변경 이력은 클라우드 DB 및 브라우저 스토리지에 자동 암호화 보존됩니다.
          </div>
        </div>
      </div>

      {/* 4. Detail Diff Comparison Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <History className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">데이터 변경 상세 기록</h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {selectedLog.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    작업 일시: {selectedLog.timestamp} ({selectedLog.ipOrDevice || '웹'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs sm:text-sm">
              {/* Operator info card */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">작업자</span>
                  <span className="font-black text-slate-900">{selectedLog.operatorName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">권한 등급</span>
                  {getRoleBadge(selectedLog.operatorLevel)}
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">계정 ID</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedLog.operatorId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">소속 부서</span>
                  <span className="font-semibold text-slate-800">{selectedLog.operatorAffiliation || '-'}</span>
                </div>
              </div>

              {/* Action & Target Info */}
              <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">작업 유형:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded font-black border ${
                      getAuditActionMeta(selectedLog.actionType).badgeClass
                    }`}
                  >
                    {selectedLog.actionLabel} ({selectedLog.actionType})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">대상 항목:</span>
                  <span className="font-extrabold text-slate-900 text-sm">{selectedLog.targetName}</span>
                </div>
                {(selectedLog.targetLine || selectedLog.categoryName) && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>소속 라인 / 카테고리:</span>
                    <span>
                      {selectedLog.targetLine || '공통'} / {selectedLog.categoryName || '기타'}
                    </span>
                  </div>
                )}
              </div>

              {/* Before vs After Side-by-Side Comparison */}
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                  데이터 변경 비교 (Before & After Diff)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Before */}
                  <div className="p-3.5 bg-rose-50/50 rounded-xl border border-rose-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-black text-rose-800 uppercase tracking-wider">
                        변경 전 (Before)
                      </span>
                      <span className="text-[10px] text-rose-600 font-semibold">이전 상태</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-rose-200 font-mono text-slate-700 text-xs sm:text-sm font-semibold break-all leading-relaxed">
                      {selectedLog.beforeValue || '(값 없음)'}
                    </div>
                  </div>

                  {/* After */}
                  <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wider">
                        변경 후 (After)
                      </span>
                      <span className="text-[10px] text-emerald-600 font-semibold">현재 반영값</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200 font-mono text-blue-900 text-xs sm:text-sm font-extrabold break-all leading-relaxed">
                      {selectedLog.afterValue}
                    </div>
                  </div>
                </div>
              </div>

              {/* Remarks / Details */}
              {selectedLog.details && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <span className="font-bold text-slate-700 block mb-1">상세 사유 및 변경 비고:</span>
                  <p className="text-slate-800 leading-relaxed font-mono whitespace-pre-wrap">
                    {selectedLog.details}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 font-mono">
                Log ID: {selectedLog.id}
              </span>
              <div className="flex items-center gap-2">
                {canRevertLogEntry(selectedLog) && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedLog;
                      setSelectedLog(null);
                      onRevertLog?.(target);
                    }}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>이 작업 되돌리기 (복원)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
