import React, { useState, useMemo } from 'react';
import { CalculatedItem, Category, ProductionLine, Vendor } from '../types';
import {
  formatNumber,
  TODAY_STR,
  compareItemsByDefaultOrder,
  isPoseungLine,
  isAsanLine,
  matchLineFilter,
} from '../utils/calculations';
import { useUrlPersistedState } from '../utils/urlState';
import {
  Search,
  AlertTriangle,
  Layers,
  FileText,
  CheckCircle2,
  Edit2,
  Trash2,
  HelpCircle,
  Truck,
  ArrowUpDown,
  Calendar,
  RotateCcw,
} from 'lucide-react';

interface DashboardTabProps {
  items: CalculatedItem[];
  categories: Category[];
  vendors: Vendor[];
  onUpdateStock: (itemId: string, newPackStock: number) => void;
  onUpdateDailyUsage: (itemId: string, newDailyUsage: number) => void;
  onToggleStatus: (
    itemId: string,
    newStatus: '발주대기' | '발주완료(입고대기)'
  ) => void;
  onReceiveStock: (itemId: string) => void;
  onOpenOrderModal: (vendorId: string, itemIds: string[]) => void;
  onEditItem: (item: CalculatedItem) => void;
  onDeleteItem: (itemId: string) => void;
  memo: string;
  onMemoChange: (newMemo: string) => void;
  memoLastSaved: string;
  lastAuditTimestamp?: string;
  onEditOrder?: (item: CalculatedItem) => void;
  onCancelOrder?: (itemId: string) => void;
  isWorkerMode?: boolean;
  onNavigateToFieldAudit?: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  items,
  categories,
  vendors,
  onUpdateStock,
  onUpdateDailyUsage,
  onToggleStatus,
  onReceiveStock,
  onOpenOrderModal,
  onEditItem,
  onDeleteItem,
  memo,
  onMemoChange,
  memoLastSaved,
  lastAuditTimestamp,
  onEditOrder,
  onCancelOrder,
  isWorkerMode = false,
  onNavigateToFieldAudit,
}) => {
  // Filter states (persisted across F5 refresh & URL query params)
  const [selectedLine, setSelectedLine] = useUrlPersistedState<string>(
    'dashLine',
    'ds_mro_dash_line',
    '전체'
  );
  const [selectedCategory, setSelectedCategory] = useUrlPersistedState<string>(
    'dashCat',
    'ds_mro_dash_cat',
    '전체'
  );
  const [selectedStatus, setSelectedStatus] = useUrlPersistedState<
    '전체' | '발주필요' | '임박포함' | '입고대기' | '실사지연'
  >('dashStatus', 'ds_mro_dash_status', '전체');
  const [auditCardStep, setAuditCardStep] = useUrlPersistedState<
    'recent' | 'delayed' | 'default'
  >('dashAuditStep', 'ds_mro_dash_audit_step', 'recent');
  const [searchQuery, setSearchQuery] = useUrlPersistedState<string>(
    'dashQ',
    'ds_mro_dash_q',
    ''
  );

  // Default sort is fixed: '라인 > 카테고리 > 품목명' (실사재고/일사용량 수정 시 행 점프 없음)
  const [sortField, setSortField] = useUrlPersistedState<
    'default' | 'remainingDays' | 'line' | 'itemName'
  >('dashSort', 'ds_mro_dash_sort', 'default');
  const [sortAsc, setSortAsc] = useUrlPersistedState<boolean>(
    'dashAsc',
    'ds_mro_dash_asc',
    true
  );

  // Category order mapping for master data sort
  const categoryOrderMap = useMemo(() => {
    return new Map(categories.map((c, idx) => [c.id, idx]));
  }, [categories]);

  // Quick stats
  const totalItemsCount = items.length;
  const orderNeededCount = items.filter((it) => it.needsOrder).length;
  const orderImminentCount = items.filter((it) => it.isOrderImminent).length;
  const awaitingArrivalCount = items.filter(
    (it) => it.orderStatus === '발주완료(입고대기)'
  ).length;
  const auditDelayedCount = items.filter((it) => it.isAuditDelayed).length;
  const auditedNormalCount = totalItemsCount - auditDelayedCount;

  // 최근 실사(갱신) 완료 내역 상위 4건 (최신순 내림차순 정렬)
  const recentAuditItems = useMemo(() => {
    const extractDateKey = (raw?: string | null) => {
      if (!raw) return '';
      const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/);
      return m ? m[1] : raw.trim();
    };

    return items
      .filter((it) => Boolean(it.lastAuditDate && it.lastAuditDate.trim()))
      .slice()
      .sort((a, b) => {
        const tsA = a.lastAuditUpdatedAt || 0;
        const tsB = b.lastAuditUpdatedAt || 0;
        if (tsA !== tsB) {
          return tsB - tsA;
        }
        const keyA = extractDateKey(a.lastAuditDate);
        const keyB = extractDateKey(b.lastAuditDate);
        if (keyA !== keyB) {
          return keyB.localeCompare(keyA);
        }
        return compareItemsByDefaultOrder(a, b, categoryOrderMap);
      })
      .slice(0, 4);
  }, [items, categoryOrderMap]);

  // 실사 지연 및 누락 내역 상위 4건 (미실사/누락 우선 -> 경과일수 내림차순 정렬)
  const delayedAuditItems = useMemo(() => {
    return items
      .filter((it) => it.isAuditDelayed)
      .slice()
      .sort((a, b) => {
        const aMissing = a.daysSinceLastAudit === null ? 1 : 0;
        const bMissing = b.daysSinceLastAudit === null ? 1 : 0;
        if (aMissing !== bMissing) {
          return bMissing - aMissing;
        }
        const daysA = a.daysSinceLastAudit ?? 9999;
        const daysB = b.daysSinceLastAudit ?? 9999;
        if (daysA !== daysB) {
          return daysB - daysA;
        }
        return compareItemsByDefaultOrder(a, b, categoryOrderMap);
      })
      .slice(0, 4);
  }, [items, categoryOrderMap]);

  // 4번째 카드 3단계 클릭 순환 핸들러:
  // [1단계: 'recent' (최근 실사 완료 내역)] -> [2단계: 'delayed' (실사 지연 및 누락 내역 + 테이블 필터링)] -> [3단계: 'default' (전체 기본 상태 복귀 + 모든 필터 해제)]
  const handleCycleAuditCard = () => {
    if (auditCardStep === 'default') {
      // [1단계 진입]: 최근 실사 완료 내역 모드 표시 (하단 테이블 실사지연 필터 해제)
      setAuditCardStep('recent');
      setSelectedStatus('전체');
    } else if (auditCardStep === 'recent') {
      // [2단계 진입]: 실사 지연 및 누락 내역 모드 표시 (하단 테이블 누락/지연 품목만 필터링)
      setAuditCardStep('delayed');
      setSelectedStatus('실사지연');
    } else {
      // [3단계 진입]: 전체 기본 상태 모드 복귀 (모든 필터를 해제하고 전체 목록 표시)
      setAuditCardStep('default');
      setSelectedStatus('전체');
      setSelectedLine('전체');
      setSelectedCategory('전체');
      setSearchQuery('');
    }
  };

  // Filter items
  const filteredItems = items
    .filter((it) => {
      if (selectedLine !== '전체' && !matchLineFilter(it.line, selectedLine)) return false;
      if (selectedCategory !== '전체' && it.categoryId !== selectedCategory)
        return false;
      if (selectedStatus === '발주필요' && !it.needsOrder) return false;
      if (
        selectedStatus === '임박포함' &&
        !it.needsOrder &&
        !it.isOrderImminent
      )
        return false;
      if (selectedStatus === '입고대기' && it.orderStatus !== '발주완료(입고대기)')
        return false;
      if (selectedStatus === '실사지연' && !it.isAuditDelayed)
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = it.itemName.toLowerCase().includes(q);
        const matchSpec = it.spec.toLowerCase().includes(q);
        const matchVendor = it.vendorName.toLowerCase().includes(q);
        const matchPurpose = (it.purpose || '').toLowerCase().includes(q);
        if (!matchName && !matchSpec && !matchVendor && !matchPurpose)
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'default') {
        return compareItemsByDefaultOrder(a, b, categoryOrderMap);
      }

      let comparison = 0;
      if (sortField === 'remainingDays') {
        comparison = a.remainingDays - b.remainingDays;
      } else if (sortField === 'line') {
        comparison = compareItemsByDefaultOrder(a, b, categoryOrderMap);
      } else if (sortField === 'itemName') {
        comparison = a.itemName.localeCompare(b.itemName, 'ko');
      }

      if (comparison === 0) {
        return compareItemsByDefaultOrder(a, b, categoryOrderMap);
      }
      return sortAsc ? comparison : -comparison;
    });

  // Short line label helper ('공용(포장장)' -> '공용', '아산SL' -> '아산공장')
  const getLineShortLabel = (line: ProductionLine) => {
    if (line === '공용(포장장)' || line === '공용') return '공용';
    if (line === '아산SL' || line === '아산공장') return '아산공장';
    return line;
  };

  // Line text color (No box badge)
  const getLineTextColor = (line: ProductionLine) => {
    switch (line) {
      case 'SL1':
        return 'text-emerald-700 font-bold';
      case 'SL2':
        return 'text-sky-700 font-bold';
      case '아산공장':
      case '아산SL':
        return 'text-purple-700 font-bold';
      case '공용':
      case '공용(포장장)':
      default:
        return 'text-slate-700 font-bold';
    }
  };

  // Short date helper (YYYY-MM-DD -> YY.MM.DD)
  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    // If YYYY-MM-DD format
    if (dateStr.length === 10) {
      return `${dateStr.slice(2, 4)}.${dateStr.slice(5, 7)}.${dateStr.slice(8, 10)}`;
    }
    return dateStr;
  };

  // Month-Day helper (YYYY-MM-DD -> MM.DD)
  const formatMonthDay = (dateStr: string | null) => {
    if (!dateStr) return '-';
    if (dateStr.length >= 10) {
      return `${dateStr.slice(5, 7)}.${dateStr.slice(8, 10)}`;
    }
    return dateStr;
  };

  const handleSortToggle = (field: 'default' | 'remainingDays' | 'line' | 'itemName') => {
    if (sortField === field) {
      if (sortAsc) {
        setSortAsc(false);
      } else {
        setSortField('default');
        setSortAsc(true);
      }
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* 1. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-stretch">
        {/* Card 1: Total items */}
        <div
          onClick={() => setSelectedStatus('전체')}
          className={`p-3.5 h-[138px] min-h-[138px] bg-white rounded-lg border transition-all cursor-pointer shadow-xs hover:shadow-sm flex flex-col justify-between ${
            selectedStatus === '전체'
              ? 'border-blue-500 ring-2 ring-blue-100'
              : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">전체 관리 소모품</span>
            <Layers className="w-4 h-4 text-blue-600 shrink-0" />
          </div>
          <div className="flex items-baseline gap-2 my-auto">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {totalItemsCount}
            </span>
            <span className="text-xs text-slate-500">개 품목</span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            SL1, SL2, 공용, 아산공장 전체
          </p>
        </div>

        {/* Card 2: Order Needed & Imminent (Clickable filter) */}
        <div
          onClick={() =>
            setSelectedStatus(
              selectedStatus === '발주필요'
                ? '임박포함'
                : selectedStatus === '임박포함'
                ? '전체'
                : '발주필요'
            )
          }
          className={`p-3.5 h-[138px] min-h-[138px] bg-white rounded-lg border transition-all cursor-pointer shadow-xs hover:shadow-sm flex flex-col justify-between ${
            selectedStatus === '발주필요' || selectedStatus === '임박포함'
              ? 'border-rose-500 ring-2 ring-rose-100 bg-rose-50/30'
              : 'border-rose-200 bg-rose-50/20'
          }`}
        >
          <div className="flex items-center justify-between text-rose-600">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
              발주 알림 (필요 / 임박)
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          </div>
          <div className="flex items-baseline gap-2 my-auto">
            <span className="text-2xl font-black text-rose-600 font-mono">
              {orderNeededCount}
            </span>
            <span className="text-xs text-rose-600 font-bold">건 필요</span>
            <span className="text-slate-300 font-normal">/</span>
            <span className="text-xl font-black text-amber-600 font-mono">
              {orderImminentCount}
            </span>
            <span className="text-xs text-amber-700 font-bold">건 임박</span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium truncate">
            클릭 시 '필요만' ↔ '임박포함' 즉시 필터 전환
          </p>
        </div>

        {/* Card 3: Awaiting Arrival (Clickable filter) */}
        <div
          onClick={() =>
            setSelectedStatus(selectedStatus === '입고대기' ? '전체' : '입고대기')
          }
          className={`p-3.5 h-[138px] min-h-[138px] bg-white rounded-lg border transition-all cursor-pointer shadow-xs hover:shadow-sm flex flex-col justify-between ${
            selectedStatus === '입고대기'
              ? 'border-sky-500 ring-2 ring-sky-100 bg-sky-50/30'
              : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-sky-700">
            <span className="text-xs font-bold">발주완료 (입고대기)</span>
            <Truck className="w-4 h-4 text-sky-600 shrink-0" />
          </div>
          <div className="flex items-baseline gap-2 my-auto">
            <span className="text-2xl font-black text-sky-700 font-mono">
              {awaitingArrivalCount}
            </span>
            <span className="text-xs text-slate-500">개 품목 납품 중</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            도착 시 현장에서 [입고] 처리
          </p>
        </div>

        {/* Card 4: 3-Step Cycle Toggle Card (Fixed height based on 4-row display: 1. 최근 실사 🔄 -> 2. 누락 품목 ⚠️ -> 3. 전체 보기 📋) */}
        <div
          onClick={handleCycleAuditCard}
          title="클릭할 때마다 [1단계: 최근 실사 🔄] → [2단계: 누락 품목 ⚠️] → [3단계: 전체 보기 📋] 모드로 순환합니다."
          className={`p-3 h-[138px] min-h-[138px] rounded-lg border transition-all duration-200 cursor-pointer shadow-xs hover:shadow-sm flex flex-col justify-between select-none overflow-hidden ${
            auditCardStep === 'delayed'
              ? 'border-amber-500 ring-2 ring-amber-100 bg-amber-50/40'
              : auditCardStep === 'recent'
              ? 'border-emerald-500 ring-2 ring-emerald-100 bg-white'
              : 'border-slate-200 bg-white hover:border-blue-300'
          }`}
        >
          {/* Card 4 Header: Mode Title + Real-Time 3-Step Cycle Badge */}
          <div className="flex items-center justify-between gap-1 shrink-0">
            <span className="text-xs font-bold flex items-center gap-1 truncate">
              {auditCardStep === 'recent' ? (
                <>
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-emerald-900 truncate">최근 실사 완료 내역</span>
                </>
              ) : auditCardStep === 'delayed' ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-amber-950 truncate">실사 지연 및 누락 내역</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="text-slate-700 truncate">재고 실사 현황 (전체)</span>
                </>
              )}
            </span>

            {/* Current Step Badge ('최근 실사 🔄' -> '누락 품목 ⚠️' -> '전체 보기 📋') */}
            <div className="flex items-center gap-1 shrink-0">
              {auditCardStep === 'recent' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-[10px] whitespace-nowrap shadow-2xs">
                  최근 실사 🔄
                </span>
              ) : auditCardStep === 'delayed' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] whitespace-nowrap shadow-2xs">
                  누락 품목 ⚠️ ({auditDelayedCount}건)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-300 font-extrabold text-[10px] whitespace-nowrap shadow-2xs">
                  전체 보기 📋
                </span>
              )}
            </div>
          </div>

          {/* Card 4 Body: Fixed-height flex-col justify-between container for 1. Recent Logs / 2. Delayed Items / 3. Overall Default Summary */}
          {auditCardStep === 'recent' ? (
            <div className="flex-1 flex flex-col justify-between pt-1.5 min-h-0">
              {recentAuditItems.length === 0 ? (
                <>
                  <div className="text-[11px] text-slate-400 my-auto text-center">
                    최근 기록된 실사 내역이 없습니다.
                  </div>
                  <p className="text-[10px] text-slate-400 truncate text-right">
                    다음 클릭: 누락 품목 ⚠️
                  </p>
                </>
              ) : (
                <>
                  <div
                    className={`flex flex-col ${
                      recentAuditItems.length >= 4
                        ? 'flex-1 justify-between'
                        : 'space-y-1'
                    }`}
                  >
                    {recentAuditItems.map((it) => {
                      const rawAudit = (it.lastAuditDate || '').trim();
                      const dateTimeMatch = rawAudit.match(
                        /^(\d{4})-(\d{2}-\d{2})\s+(\d{2}:\d{2})/
                      );
                      const shortTime = dateTimeMatch
                        ? `${dateTimeMatch[2].replace('-', '.')} ${dateTimeMatch[3]}`
                        : rawAudit.slice(5, 16) || '-';
                      const isReceive = rawAudit.includes('입고');
                      const statusLabel = isReceive ? '입고확정' : '실사확정';
                      const auditorShort = (
                        it.lastAuditedBy ||
                        it.receiverName ||
                        '현장담당'
                      ).split(' ')[0];

                      return (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-1 text-[11px] leading-tight py-0.5 border-b border-slate-100 last:border-b-0"
                        >
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <span className="font-mono text-slate-500 shrink-0">
                              {shortTime}
                            </span>
                            <span className="text-slate-300 shrink-0">|</span>
                            <span
                              className={`${getLineTextColor(it.line)} shrink-0 text-[11px]`}
                            >
                              {getLineShortLabel(it.line)}
                            </span>
                            <span className="text-slate-300 shrink-0">|</span>
                            <span
                              className="text-slate-800 font-normal truncate"
                              title={`${it.itemName} ${it.spec}`}
                            >
                              {it.itemName} {it.spec}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 pl-1">
                            <span className="text-slate-300">|</span>
                            <span
                              className={`font-medium whitespace-nowrap ${
                                isReceive ? 'text-sky-700' : 'text-emerald-700'
                              }`}
                            >
                              {auditorShort}·{statusLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {recentAuditItems.length < 4 && (
                    <p className="text-[10px] text-slate-400 truncate text-right">
                      총 {recentAuditItems.length}건 표시 · 클릭 시 누락 품목 ⚠️
                    </p>
                  )}
                </>
              )}
            </div>
          ) : auditCardStep === 'delayed' ? (
            <div className="flex-1 flex flex-col justify-between pt-1.5 min-h-0">
              {delayedAuditItems.length === 0 ? (
                <>
                  <div className="text-[11px] text-emerald-700 font-semibold my-auto text-center">
                    전 품목 주간실사(7일) 이내 정상 점검 완료
                  </div>
                  <p className="text-[10px] text-amber-800/70 truncate text-right">
                    다음 클릭: 전체 보기 📋
                  </p>
                </>
              ) : (
                <>
                  <div
                    className={`flex flex-col ${
                      delayedAuditItems.length >= 4
                        ? 'flex-1 justify-between'
                        : 'space-y-1'
                    }`}
                  >
                    {delayedAuditItems.map((it) => {
                      const rawAudit = (it.lastAuditDate || '').trim();
                      const dateMatch = rawAudit.match(/^(\d{4})-(\d{2}-\d{2})/);
                      const shortDate = dateMatch
                        ? dateMatch[2].replace('-', '.')
                        : '미실사';
                      const auditorShort = (
                        it.receiverName ||
                        it.lastAuditedBy ||
                        '현장담당'
                      ).split(' ')[0];
                      const delayText =
                        it.daysSinceLastAudit !== null
                          ? `지연(${it.daysSinceLastAudit}일)`
                          : '실사누락';

                      return (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-1 text-[11px] leading-tight py-0.5 border-b border-amber-200/60 last:border-b-0"
                        >
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <span
                              className={`font-mono shrink-0 ${
                                it.daysSinceLastAudit === null
                                  ? 'text-rose-600 font-bold'
                                  : 'text-amber-900 font-semibold'
                              }`}
                            >
                              {shortDate}
                            </span>
                            <span className="text-amber-300 shrink-0">|</span>
                            <span
                              className={`${getLineTextColor(it.line)} shrink-0 text-[11px]`}
                            >
                              {getLineShortLabel(it.line)}
                            </span>
                            <span className="text-amber-300 shrink-0">|</span>
                            <span
                              className="text-slate-900 font-normal truncate"
                              title={`${it.itemName} ${it.spec}`}
                            >
                              {it.itemName} {it.spec}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 pl-1">
                            <span className="text-amber-300">|</span>
                            <span className="font-bold text-rose-700 whitespace-nowrap">
                              {auditorShort}·{delayText}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {delayedAuditItems.length < 4 && (
                    <p className="text-[10px] text-amber-800/80 truncate text-right">
                      지연·누락 {auditDelayedCount}건 필터 중 · 클릭 시 전체 보기 📋
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between pt-1.5 min-h-0">
              <div className="flex items-baseline gap-2 flex-wrap my-auto">
                <span className="text-2xl font-black text-emerald-700 font-mono leading-none">
                  {auditedNormalCount}
                </span>
                <span className="text-xs text-slate-600 font-semibold">건 정상</span>
                <span className="text-slate-300">/</span>
                <span className="text-xl font-black text-amber-600 font-mono leading-none">
                  {auditDelayedCount}
                </span>
                <span className="text-xs text-amber-700 font-bold">건 지연·누락</span>
              </div>
              <div className="space-y-0.5">
                <div className="text-[11px] text-slate-500 font-mono truncate">
                  최근 동기화: {lastAuditTimestamp || `${TODAY_STR} 주간실사`}
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  클릭 순환: 최근 실사 🔄 → 누락 품목 ⚠️ → 전체 보기 📋
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Filter & Search Control Bar */}
      <div className="bg-white rounded-lg border border-slate-200 p-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Line Segmented Buttons + Category Dropdown right next to it */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Line buttons */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md text-xs font-semibold overflow-x-auto no-scrollbar max-w-full">
              {[
                { id: '전체', label: '전체', count: items.length },
                {
                  id: '포승공장',
                  label: '🏭 포승공장 전체',
                  count: items.filter((i) => isPoseungLine(i.line)).length,
                },
                {
                  id: 'SL1',
                  label: 'SL1',
                  count: items.filter((i) => i.line === 'SL1').length,
                },
                {
                  id: 'SL2',
                  label: 'SL2',
                  count: items.filter((i) => i.line === 'SL2').length,
                },
                {
                  id: '공용',
                  label: '공용',
                  count: items.filter((i) => i.line === '공용' || i.line === '공용(포장장)').length,
                },
                {
                  id: '아산공장',
                  label: '🏭 아산공장',
                  count: items.filter((i) => isAsanLine(i.line)).length,
                },
              ].map(({ id, label, count }) => {
                const isActive = selectedLine === id;

                return (
                  <button
                    key={id}
                    onClick={() => setSelectedLine(id)}
                    className={`px-3 py-1.5 rounded transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                      isActive
                        ? id === '포승공장'
                          ? 'bg-blue-600 text-white shadow-xs font-bold'
                          : id === '아산공장'
                          ? 'bg-purple-600 text-white shadow-xs font-bold'
                          : 'bg-white text-blue-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                    <span
                      className={`ml-1 text-[10px] ${
                        isActive && (id === '포승공장' || id === '아산공장')
                          ? 'text-white/80 font-bold'
                          : 'text-slate-400'
                      }`}
                    >
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Category Dropdown right next to Line buttons */}
            <div className="w-full sm:w-56">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full text-xs font-semibold border border-slate-300 rounded-md py-1.5 px-2 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 whitespace-nowrap shadow-2xs"
              >
                <option value="전체">모든 카테고리 (전체 {categories.length}종)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: Search box + Status tabs */}
          <div className="flex flex-wrap items-center gap-2 flex-1 justify-start lg:justify-end w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="품목·규격·공급업체 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-md pl-8 pr-12 py-1.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  지우기
                </button>
              )}
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md text-xs font-medium overflow-x-auto no-scrollbar max-w-full">
              <button
                onClick={() => setSelectedStatus('전체')}
                className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer ${
                  selectedStatus === '전체'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체 보기
              </button>
              <button
                onClick={() => setSelectedStatus('발주필요')}
                className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer ${
                  selectedStatus === '발주필요'
                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                발주 필요만 ({orderNeededCount})
              </button>
              <button
                onClick={() => setSelectedStatus('임박포함')}
                className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer ${
                  selectedStatus === '임박포함'
                    ? 'bg-amber-500 text-slate-950 shadow-xs font-extrabold'
                    : 'text-amber-800 hover:bg-amber-50 font-semibold'
                }`}
              >
                발주 임박 포함 ({orderNeededCount + orderImminentCount})
              </button>
              <button
                onClick={() => setSelectedStatus('입고대기')}
                className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer ${
                  selectedStatus === '입고대기'
                    ? 'bg-sky-600 text-white shadow-xs font-bold'
                    : 'text-sky-800 hover:bg-sky-50'
                }`}
              >
                입고 대기만 ({awaitingArrivalCount})
              </button>
              <button
                onClick={() =>
                  setSelectedStatus(selectedStatus === '실사지연' ? '전체' : '실사지연')
                }
                className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer font-bold ${
                  selectedStatus === '실사지연'
                    ? 'bg-amber-500 text-slate-950 shadow-xs font-black ring-2 ring-amber-300'
                    : auditDelayedCount > 0
                    ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                ⚠️ 실사 지연 품목 {auditDelayedCount}건
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Spreadsheet Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Top Header Bar */}
        <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="font-bold">소모품 재고 실사 &amp; 발주 모니터링 시트</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300 font-mono">
              <strong>{filteredItems.length}</strong> / {items.length} 건
            </span>
            {sortField !== 'default' && (
              <button
                onClick={() => {
                  setSortField('default');
                  setSortAsc(true);
                }}
                className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded text-[11px] transition-colors border border-slate-700 ml-2"
                title="기본 순서(라인>카테고리>품목명)로 복원"
              >
                <RotateCcw className="w-3 h-3" />
                <span>기본 순서 복원</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-slate-300 text-[11px] whitespace-nowrap">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 bg-amber-100 border border-amber-300 rounded-xs" />
              연노랑: 현장 확정 실사재고 (읽기 전용)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
              빨강: 안전재고 미달(필요)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
              주황: 3일내 도달(임박/조기발주)
            </span>
          </div>
        </div>

        {/* High-Density Spreadsheet Table (Desktop: lg+) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left border-collapse table-fixed">
            <colgroup>
              <col className="w-[4.5%]" />
              <col className="w-[7.5%]" />
              <col className="w-[17.5%]" />
              <col className="w-[7%]" />
              <col className="w-[6.5%]" />
              <col className="w-[6%]" />
              <col className="w-[5.5%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[6.5%]" />
              <col className="w-[5.5%]" />
              <col className="w-[10.5%]" />
              <col className="w-[5%]" />
              <col className="w-[4%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 select-none text-xs tracking-tight">
                {/* 1. 라인 */}
                <th
                  onClick={() => handleSortToggle('line')}
                  className="px-2 py-2.5 border-r border-slate-200 text-center cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                >
                  <div className="flex items-center justify-center gap-0.5">
                    <span>라인</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </div>
                </th>

                {/* 2. 카테고리 */}
                <th className="px-2.5 py-2.5 border-r border-slate-200 text-left whitespace-nowrap">
                  카테고리
                </th>

                {/* 3. 품목명 (규격 / 거래처·수령장소) */}
                <th
                  onClick={() => handleSortToggle('itemName')}
                  className="px-2.5 py-2.5 border-r border-slate-200 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1 truncate">
                    <span className="truncate">품목명 (규격 / 거래처·수령장소)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </div>
                </th>

                {/* 4. 실사재고(포장) */}
                <th className="px-2.5 py-2.5 border-r border-slate-200 text-right bg-yellow-50 text-yellow-900 whitespace-nowrap">
                  실사재고
                </th>

                {/* 5. 환산재고 */}
                <th className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                  환산재고
                </th>

                {/* 6. 일사용량 */}
                <th className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                  일사용량
                </th>

                {/* 7. 잔여일 */}
                <th
                  onClick={() => handleSortToggle('remainingDays')}
                  className="px-2 py-2.5 border-r border-slate-200 text-right cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-0.5">
                    <span>잔여일</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </div>
                </th>

                {/* 8. 안전/기준재고 */}
                <th className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                  안전/기준
                </th>

                {/* 9. 발주(포장·단위) */}
                <th className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                  발주(포장·단위)
                </th>

                {/* 10. 발주(환산) */}
                <th className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                  발주(환산)
                </th>

                {/* 11. 발주·상태 */}
                <th className="px-2 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                  발주·상태
                </th>

                {/* 12. 발주/입고예정 */}
                <th className="px-2.5 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                  발주/입고예정
                </th>

                {/* 13. 최근발주 */}
                <th className="px-2 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                  최근발주
                </th>

                {/* 14. 관리 */}
                <th className="px-1.5 py-2.5 text-center whitespace-nowrap">
                  관리
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-400 whitespace-nowrap">
                    <p className="text-base font-semibold">해당 조건의 소모품이 없습니다.</p>
                    <p className="text-sm mt-1">필터를 해제하거나 검색어를 변경해주세요.</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isAwaiting = item.orderStatus === '발주완료(입고대기)';
                  const category = categories.find((c) => c.id === item.categoryId);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-blue-50/50 ${
                        item.needsOrder
                          ? 'bg-rose-50/25'
                          : item.isOrderImminent
                          ? 'bg-amber-50/20'
                          : isAwaiting
                          ? 'bg-sky-50/20'
                          : ''
                      }`}
                    >
                      {/* 1. 라인 */}
                      <td className="px-2 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                        <span className={`${getLineTextColor(item.line)} text-xs sm:text-sm`}>
                          {getLineShortLabel(item.line)}
                        </span>
                      </td>

                      {/* 2. 카테고리 */}
                      <td className="px-2.5 py-2.5 border-r border-slate-200">
                        <span
                          className="font-medium text-slate-800 text-xs sm:text-sm block truncate"
                          title={item.categoryName}
                        >
                          {item.categoryName}
                        </span>
                      </td>

                      {/* 3. 품목명(규격 / 거래처·수령장소): 카테고리와 동일한 폰트 두께(font-medium) 및 스타일 적용 */}
                      <td className="px-2.5 py-2 border-r border-slate-200 whitespace-normal break-words">
                        <div
                          className="text-sm sm:text-base font-medium text-slate-800 leading-snug break-keep"
                          title={`${item.itemName} ${item.spec}`}
                        >
                          {`${item.itemName} ${item.spec}`}
                        </div>
                        <div
                          className="text-xs font-medium text-slate-600 mt-0.5 leading-tight flex flex-wrap items-center gap-x-1 gap-y-0.5"
                          title={`${item.vendorName} · 주기 ${category?.orderCycleDays || 30}일${
                            item.deliveryLocation ? ` · ${item.deliveryDetailLocation || item.deliveryLocation}` : ''
                          }`}
                        >
                          <span className="text-slate-700 font-medium">{item.vendorName}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-600 font-medium">
                            {category?.orderCycleDays || 30}일
                          </span>
                          {(item.deliveryDetailLocation || item.deliveryLocation) && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-slate-700 font-medium truncate max-w-full">
                                {item.deliveryDetailLocation || item.deliveryLocation}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 4. 실사재고(포장) */}
                      <td className="px-2.5 py-2.5 border-r border-slate-200 bg-amber-50/60 text-right whitespace-nowrap">
                        <div className="inline-flex items-baseline justify-end gap-0.5 leading-tight">
                          <span className="font-extrabold font-mono text-sm text-slate-900">
                            {formatNumber(item.currentPackStock)}
                          </span>
                          <span className="text-[11px] text-slate-600 font-bold">
                            {item.packUnit}
                          </span>
                        </div>
                        {item.isAuditDelayed ? (
                          <div className="mt-0.5 leading-none">
                            <span
                              onClick={() => onNavigateToFieldAudit && onNavigateToFieldAudit()}
                              className="inline-flex items-center px-1 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[10px] cursor-pointer hover:bg-amber-400"
                              title="실사가 지연되었거나 누락된 품목입니다. 클릭하여 실사 화면으로 이동"
                            >
                              ⚠️
                              {item.daysSinceLastAudit !== null
                                ? `지연(${item.daysSinceLastAudit}일)`
                                : '실사누락'}
                            </span>
                          </div>
                        ) : item.lastAuditDate ? (
                          <div className="text-[10px] text-slate-500 font-mono leading-tight mt-0.5 truncate">
                            {item.lastAuditDate
                              .replace(TODAY_STR + ' ', '')
                              .replace(' 실사확정', '')
                              .replace(' 입고확정', '')}
                          </div>
                        ) : null}
                      </td>

                      {/* 5. 환산재고 */}
                      <td className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                        <span className="font-extrabold text-blue-700 font-mono text-sm">
                          {formatNumber(item.currentBaseStock)}
                        </span>
                        <span className="text-[11px] text-slate-500 ml-0.5">
                          {item.baseUnit}
                        </span>
                      </td>

                      {/* 6. 일사용량 */}
                      <td className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                        {item.isQtyBased && item.dailyUsage === 0 ? (
                          <span className="text-slate-400 font-mono text-[11px]">- (수량)</span>
                        ) : (
                          <>
                            <span className="font-bold font-mono text-slate-800 text-xs sm:text-sm">
                              {formatNumber(item.dailyUsage)}
                            </span>
                            <span className="text-[11px] text-slate-500">/일</span>
                          </>
                        )}
                      </td>

                      {/* 7. 잔여일 */}
                      <td className="px-2 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                        {item.isQtyBased && item.dailyUsage === 0 ? (
                          <span className="text-slate-400 font-mono text-[11px]">-</span>
                        ) : (
                          <span
                            className={`font-black font-mono text-sm ${
                              item.needsOrder
                                ? 'text-rose-600'
                                : item.isOrderImminent
                                ? 'text-amber-700 font-extrabold'
                                : 'text-slate-800'
                            }`}
                          >
                            {item.remainingDays === 999
                              ? '999일+'
                              : `${item.remainingDays.toFixed(1)}일`}
                          </span>
                        )}
                      </td>

                      {/* 8. 안전/기준재고 */}
                      <td className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                        {item.isQtyBased ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="font-mono font-bold text-emerald-800 text-xs sm:text-sm">
                              {item.triggerPackQty}
                              {item.packUnit} 이하
                            </span>
                            <span className="text-[10px] text-emerald-700 font-mono mt-0.5">
                              수량({formatNumber(item.triggerBaseQty)}
                              {item.baseUnit})
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="font-mono font-bold text-slate-800 text-xs sm:text-sm">
                              {formatNumber(item.safetyStockBase)} {item.baseUnit}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                              안전 {category?.safetyDays || 10}일
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 9. 발주(포장·단위) */}
                      <td className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                        <div className="leading-tight">
                          <span className="font-extrabold text-slate-900 font-mono text-sm">
                            {formatNumber(item.recommendedPackOrderQty)}
                          </span>
                          <span className="text-[11px] text-slate-600 font-semibold ml-0.5">
                            {item.packUnit}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono leading-tight mt-0.5">
                          1{item.packUnit}={formatNumber(item.unitConversion)}
                          {item.baseUnit}
                        </div>
                      </td>

                      {/* 10. 발주(환산) */}
                      <td className="px-2.5 py-2.5 border-r border-slate-200 text-right whitespace-nowrap">
                        <span
                          className={`font-mono text-xs sm:text-sm ${
                            item.needsOrder
                              ? 'text-rose-600 font-extrabold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200'
                              : item.isOrderImminent
                              ? 'text-amber-900 font-extrabold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200'
                              : 'text-slate-700 font-semibold'
                          }`}
                        >
                          {formatNumber(item.recommendedBaseOrderQty)} {item.baseUnit}
                        </span>
                      </td>

                      {/* 11. 발주·상태 */}
                      <td className="px-2 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                        {isAwaiting ? (
                          <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300 font-bold text-xs">
                            입고대기
                          </span>
                        ) : item.orderUrgency === 'urgent' ? (
                          <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded bg-rose-600 text-white font-extrabold text-xs shadow-2xs">
                            발주필요
                          </span>
                        ) : item.orderUrgency === 'warning' ? (
                          <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-extrabold text-xs shadow-2xs">
                            발주임박
                          </span>
                        ) : (
                          <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium text-xs">
                            발주대기
                          </span>
                        )}
                      </td>

                      {/* 12. 발주/입고예정 */}
                      <td className="px-2 py-2.5 border-r border-slate-200 text-center">
                        {isAwaiting ? (
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <div
                              className="inline-flex items-center justify-center gap-1 whitespace-nowrap px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200"
                              title={`발주일: ${item.orderDate || item.lastOrderDate || '-'} / 입고예정: ${item.expectedArrivalDate || '-'} (${item.dDayText})`}
                            >
                              <span className="text-[11px] font-mono text-slate-800 font-bold">
                                {formatMonthDay(item.orderDate || item.lastOrderDate)}
                              </span>
                              <span className="text-slate-400 text-[10px]">→</span>
                              <span className="text-[11px] font-mono text-blue-700 font-bold">
                                {formatMonthDay(item.expectedArrivalDate)}
                              </span>
                              <span
                                className={`px-1 py-0.2 rounded font-extrabold text-[10px] leading-tight ${
                                  item.dDayStatus === 'today'
                                    ? 'bg-red-600 text-white animate-pulse'
                                    : item.dDayStatus === 'overdue'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-blue-600 text-white'
                                }`}
                              >
                                {item.dDayStatus === 'today' ? 'D-Day' : item.dDayText}
                              </span>
                            </div>
                            <div className="inline-flex items-center gap-1">
                              {!isWorkerMode && onEditOrder && (
                                <button
                                  type="button"
                                  onClick={() => onEditOrder(item)}
                                  className="px-1.5 py-0.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
                                  title="발주일자/입고예정일/발주수량 수정"
                                >
                                  수정
                                </button>
                              )}
                              {!isWorkerMode && onCancelOrder && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `[${item.itemName} ${item.spec}] 발주를 취소하시겠습니까?\n현장 입고대기 목록에서 제거되고 발주대기 상태로 복귀합니다.`
                                      )
                                    ) {
                                      onCancelOrder(item.id);
                                    }
                                  }}
                                  className="px-1.5 py-0.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition-colors cursor-pointer whitespace-nowrap"
                                  title="발주 취소"
                                >
                                  취소
                                </button>
                              )}
                            </div>
                          </div>
                        ) : isWorkerMode ? (
                          <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                            읽기전용
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              onOpenOrderModal(item.vendorId, [item.id])
                            }
                            className={`text-xs underline font-bold whitespace-nowrap transition-colors cursor-pointer ${
                              item.needsOrder
                                ? 'text-rose-600 hover:text-rose-800'
                                : item.isOrderImminent
                                ? 'text-amber-700 hover:text-amber-900'
                                : 'text-blue-600 hover:text-blue-800 font-semibold'
                            }`}
                            title={
                              item.needsOrder
                                ? '안전재고 미달 품목 발주서 작성'
                                : '같은 거래처 묶음배송(합발주)을 위해 조기 발주서에 담기'
                            }
                          >
                            {item.needsOrder ? '발주서 작성' : '조기발주 담기'}
                          </button>
                        )}
                      </td>

                      {/* 13. 최근발주 */}
                      <td className="px-2 py-2.5 border-r border-slate-200 text-center font-mono text-slate-600 text-xs whitespace-nowrap">
                        {formatShortDate(item.lastOrderDate)}
                      </td>

                      {/* 14. 관리 */}
                      <td className="px-1.5 py-2.5 text-center whitespace-nowrap">
                        {isWorkerMode ? (
                          <span className="text-[11px] text-slate-400 font-bold">잠금</span>
                        ) : (
                          <div className="inline-flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => onEditItem(item)}
                              title="품목 정보 수정"
                              className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteItem(item.id)}
                              title="품목 삭제"
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Monitoring Card View (block lg:hidden) */}
        <div className="block lg:hidden divide-y divide-slate-200">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              조건에 일치하는 품목이 없습니다.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isAwaiting = item.orderStatus === '발주완료(입고대기)';
              return (
                <div
                  key={item.id}
                  className={`p-4 transition-colors ${
                    isAwaiting
                      ? 'bg-sky-50/30'
                      : item.needsOrder
                      ? 'bg-rose-50/20'
                      : item.isOrderImminent
                      ? 'bg-amber-50/20'
                      : 'bg-white'
                  }`}
                >
                  {/* Top: Line, Category, Vendor & Status */}
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs ${getLineTextColor(item.line)}`}>
                        [{getLineShortLabel(item.line)}]
                      </span>
                      <span className="text-xs text-slate-800 font-medium">
                        {item.categoryName}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-600 font-medium">
                        {item.vendorName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {item.isAuditDelayed && (
                        <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[11px] shadow-2xs">
                          ⚠️ {item.daysSinceLastAudit !== null ? `실사지연(${item.daysSinceLastAudit}일)` : '실사누락'}
                        </span>
                      )}
                      {isAwaiting ? (
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300 font-bold text-xs shadow-2xs">
                          입고대기
                        </span>
                      ) : item.needsOrder ? (
                        <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-extrabold text-xs shadow-2xs">
                          발주필요
                        </span>
                      ) : item.isOrderImminent ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-extrabold text-xs shadow-2xs">
                          발주임박
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-xs">
                          정상
                        </span>
                      )}

                      {!isWorkerMode && (
                        <>
                          <button
                            onClick={() => onEditItem(item)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded ml-1 cursor-pointer"
                            title="수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteItem(item.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Title & Spec */}
                  <div className="py-1">
                    <div className="text-base font-medium text-slate-800 leading-snug">
                      {item.itemName} {item.spec}
                    </div>
                  </div>

                  {/* Stock Metrics Grid */}
                  <div className="mt-2 grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block">실사재고 (포장)</span>
                      <span className="font-bold font-mono text-slate-900 text-sm">
                        {formatNumber(item.currentPackStock)}{' '}
                        <span className="text-[11px] font-normal text-slate-600">
                          {item.packUnit}
                        </span>
                      </span>
                      <span className="text-slate-400 text-[10px] block">
                        ({formatNumber(item.currentBaseStock)}{item.baseUnit})
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[10px] block">
                        {item.isQtyBased ? '발주점 수량' : '일사용량'}
                      </span>
                      {item.isQtyBased ? (
                        <span className="font-bold font-mono text-slate-800 text-sm">
                          {item.triggerPackQty}{' '}
                          <span className="text-[11px] font-normal text-slate-600">
                            {item.packUnit}
                          </span>
                        </span>
                      ) : (
                        <span className="font-bold font-mono text-slate-800 text-sm">
                          {formatNumber(item.dailyUsage)}{' '}
                          <span className="text-[11px] font-normal text-slate-600">
                            {item.baseUnit}
                          </span>
                        </span>
                      )}
                      <span className="text-slate-400 text-[10px] block">
                        {item.isQtyBased ? '이하 시 발주' : '안전일수 기반'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-slate-500 text-[10px] block">잔여일수</span>
                      {item.isQtyBased && item.dailyUsage === 0 ? (
                        <span className="text-xs text-slate-500 font-medium">수량기준</span>
                      ) : (
                        <span
                          className={`font-mono text-sm font-bold ${
                            item.remainingDays <=
                            item.safetyStockBase / (item.dailyUsage || 1)
                              ? 'text-rose-600'
                              : item.isOrderImminent
                              ? 'text-amber-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {item.remainingDays === 999
                            ? '999일+'
                            : `${item.remainingDays.toFixed(1)}일`}
                        </span>
                      )}
                      <span className="text-slate-400 text-[10px] block">
                        권장: {item.recommendedPackOrderQty}{item.packUnit}
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Order / Arrival status & Action Button */}
                  <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                    <div>
                      {isAwaiting ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-sky-50 border border-sky-200 text-xs">
                          <span className="text-slate-600 text-[11px]">
                            발주{' '}
                            <strong className="font-mono text-slate-900 font-bold">
                              {formatMonthDay(item.orderDate || item.lastOrderDate)}
                            </strong>
                          </span>
                          <span className="text-slate-400 text-xs font-bold">→</span>
                          <span className="text-blue-900 text-[11px]">
                            입고{' '}
                            <strong className="font-mono text-blue-700 font-bold">
                              {formatMonthDay(item.expectedArrivalDate)}
                            </strong>
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded font-extrabold text-[10px] text-white ${
                              item.dDayStatus === 'today'
                                ? 'bg-red-600 animate-pulse'
                                : item.dDayStatus === 'overdue'
                                ? 'bg-rose-600'
                                : 'bg-blue-600'
                            }`}
                          >
                            {item.dDayStatus === 'today' ? 'D-Day' : item.dDayText}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 font-mono">
                          최근발주: {formatShortDate(item.lastOrderDate)}
                        </div>
                      )}
                    </div>

                    <div>
                      {isWorkerMode ? (
                        onNavigateToFieldAudit && (
                          <button
                            type="button"
                            onClick={onNavigateToFieldAudit}
                            className="px-3.5 py-2 rounded-lg text-xs font-black bg-amber-400 hover:bg-amber-500 text-slate-950 shadow-xs cursor-pointer"
                          >
                            {isAwaiting ? '📦 현장 입고확정 하러가기' : '📋 현장 실사입력 하러가기'}
                          </button>
                        )
                      ) : isAwaiting ? (
                        <div className="flex items-center gap-1.5">
                          {onEditOrder && (
                            <button
                              type="button"
                              onClick={() => onEditOrder(item)}
                              className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 shadow-2xs"
                            >
                              발주수정
                            </button>
                          )}
                          {onCancelOrder && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `[${item.itemName} ${item.spec}] 발주를 취소하시겠습니까?\n현장 입고대기 목록에서 제거되고 발주대기 상태로 복귀합니다.`
                                  )
                                ) {
                                  onCancelOrder(item.id);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 shadow-2xs"
                            >
                              발주취소
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            onOpenOrderModal(item.vendorId, [item.id])
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer ${
                            item.needsOrder
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : item.isOrderImminent
                              ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                              : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {item.needsOrder ? '발주서 작성' : '조기발주 담기'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. Bottom Area: Calculation Legend + Memo Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Calculation Formula Legend Box */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <HelpCircle className="w-4 h-4 text-blue-600" />
            <h4 className="font-bold text-xs text-slate-800">
              대성스틸 소모품 자동 재고·발주 계산 수식 범례
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <span className="font-bold text-slate-800 block">1. 환산재고:</span>
              <p className="font-mono text-blue-700">
                실사포장수량 × 환산계수
              </p>
              <p className="text-[10px] text-slate-400">
                예) 5다발 × 20 = 100 EA
              </p>
            </div>

            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <span className="font-bold text-slate-800 block">2. 잔여일수:</span>
              <p className="font-mono text-rose-600">
                환산재고 ÷ 일평균 사용량
              </p>
              <p className="text-[10px] text-slate-400">
                예) 100 ÷ 15 = 6.67일
              </p>
            </div>

            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <span className="font-bold text-slate-800 block">3. 발주 신호등 3단계:</span>
              <p className="font-mono text-rose-600 font-bold text-[10px]">
                필요(긴급): 잔여일 ≤ 안전일수
              </p>
              <p className="font-mono text-amber-700 font-bold text-[10px]">
                임박(조기): 잔여일 ≤ (안전일+납기)
              </p>
              <p className="text-[10px] text-slate-400">
                임박 시 주황뱃지 &amp; 묶음 합발주 지원
              </p>
            </div>

            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <span className="font-bold text-slate-800 block">4. 권장 발주량:</span>
              <p className="font-mono text-blue-800">
                일사용량 × 발주주기
              </p>
              <p className="text-[10px] text-slate-400">
                포장량 = 올림(기본량 ÷ 계수)
              </p>
            </div>
          </div>
        </div>

        {/* Right: Notes / Remarks Notepad */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <h4 className="font-bold text-xs text-slate-800">
                  - 특기사항 및 주간 자재 현장 메모 (LocalStorage 자동 연동)
                </h4>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 자동저장
                </span>
                <span>·</span>
                <span className="font-mono text-[11px]">{memoLastSaved}</span>
              </div>
            </div>

            <textarea
              value={memo}
              onChange={(e) => onMemoChange(e.target.value)}
              rows={4}
              placeholder="현장 특이사항, 차주 가동계획 변경, 특정 규격 불량이나 납기 지연 이슈 등을 자유롭게 기록하세요..."
              className="w-full text-xs font-mono border border-slate-300 rounded-md p-2.5 text-slate-800 leading-relaxed focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50"
            />
          </div>

          <div className="flex items-center justify-between pt-2 text-[11px] text-slate-400">
            <span>* 수정 즉시 브라우저에 안전하게 보관됩니다.</span>
            <span>{memo.length} 글자</span>
          </div>
        </div>
      </div>
    </div>
  );
};
