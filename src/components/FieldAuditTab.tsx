import React, { useState, useMemo } from 'react';
import { CalculatedItem, Category, ProductionLine } from '../types';
import {
  formatNumber,
  compareItemsByDefaultOrder,
  TODAY_STR,
  isPoseungLine,
  isAsanLine,
  matchLineFilter,
} from '../utils/calculations';
import {
  ClipboardCheck,
  Truck,
  Plus,
  Minus,
  CheckCircle2,
  Search,
  Check,
  ArrowUpDown,
  RotateCcw,
  X,
  AlertTriangle,
  HardHat,
} from 'lucide-react';

interface FieldAuditTabProps {
  items: CalculatedItem[];
  categories: Category[];
  isWorkerMode?: boolean;
  onUpdateStock: (itemId: string, newPackStock: number) => void;
  onReceiveStock: (
    itemId: string,
    remainingStockBeforeArrival?: number,
    actualIncomingQty?: number
  ) => void;
  onBatchCommitStock?: (changes: Record<string, number>) => void;
  onConfirmAuditWithoutChange?: (itemIds: string[]) => void;
}

export const FieldAuditTab: React.FC<FieldAuditTabProps> = ({
  items,
  categories,
  isWorkerMode = false,
  onUpdateStock,
  onReceiveStock,
  onBatchCommitStock,
  onConfirmAuditWithoutChange,
}) => {
  // Line & Factory filter ('전체', '포승공장', 'SL1', 'SL2', '공용', '아산공장')
  const [selectedLine, setSelectedLine] = useState<string>('전체');

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');

  // Filter toggle: only items awaiting delivery
  const [filterOnlyAwaiting, setFilterOnlyAwaiting] = useState<boolean>(false);

  // Filter toggle: only items with delayed or missing weekly audit
  const [filterOnlyAuditDelayed, setFilterOnlyAuditDelayed] = useState<boolean>(false);

  // Search query
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sorting state: default is fixed '라인 > 카테고리 > 품목명' (절대 실사 입력 중 행 점프 없음)
  const [sortField, setSortField] = useState<'default' | 'remainingDays' | 'itemName'>('default');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Local draft state for stock inputs: Record<itemId, draftStock>
  const [draftStocks, setDraftStocks] = useState<Record<string, number>>({});

  // Confirmation modal state for receiving items
  const [confirmModalData, setConfirmModalData] = useState<{
    item: CalculatedItem;
    beforeStock: number;
    incomingQty: number;
    finalStock: number;
  } | null>(null);

  // State for incoming delivery quantity adjustments (defaults to item.orderedPackQty)
  const [incomingQuantities, setIncomingQuantities] = useState<Record<string, number>>({});

  const [receivedToast, setReceivedToast] = useState<string | null>(null);

  // Calculate changed items for Draft & Commit
  const changedItemIds = useMemo(() => {
    return Object.keys(draftStocks).filter((id) => {
      const item = items.find((i) => i.id === id);
      return item !== undefined && draftStocks[id] !== item.currentPackStock;
    });
  }, [draftStocks, items]);

  const changedCount = changedItemIds.length;

  // Stock draft helpers
  const getCurrentDraft = (item: CalculatedItem) => {
    return draftStocks[item.id] !== undefined
      ? draftStocks[item.id]
      : item.currentPackStock;
  };

  const handleSetDraftStock = (itemId: string, val: number) => {
    const clamped = Math.max(0, Number(val.toFixed(2)));
    setDraftStocks((prev) => ({
      ...prev,
      [itemId]: clamped,
    }));
  };

  const handleStepDraftStock = (item: CalculatedItem, delta: number) => {
    const current = getCurrentDraft(item);
    handleSetDraftStock(item.id, current + delta);
  };

  const handleResetDrafts = () => {
    setDraftStocks({});
  };

  const handleCommitBatch = () => {
    if (changedCount === 0) return;
    const commitPayload: Record<string, number> = {};
    changedItemIds.forEach((id) => {
      commitPayload[id] = draftStocks[id];
    });

    if (onBatchCommitStock) {
      onBatchCommitStock(commitPayload);
    } else {
      Object.entries(commitPayload).forEach(([id, val]) => {
        onUpdateStock(id, val);
      });
    }
    setDraftStocks({});
  };

  // Line short name helper
  const getLineShortLabel = (line: ProductionLine | string) => {
    if (line === '공용(포장장)') return '공용';
    if (line === '아산SL') return '아산공장';
    return line;
  };

  const getLineTextColor = (line: ProductionLine | string) => {
    switch (line) {
      case 'SL1':
        return 'text-emerald-700 font-bold';
      case 'SL2':
        return 'text-sky-700 font-bold';
      case '아산공장':
      case '아산SL':
        return 'text-teal-700 font-bold';
      case '공용':
      case '공용(포장장)':
      default:
        return 'text-slate-700 font-bold';
    }
  };

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    if (dateStr.length === 10) {
      return `${dateStr.slice(5, 7)}.${dateStr.slice(8, 10)}`;
    }
    return dateStr;
  };

  // Get current incoming delivery quantity
  const getIncomingQty = (item: CalculatedItem) => {
    if (incomingQuantities[item.id] !== undefined) {
      return incomingQuantities[item.id];
    }
    return item.orderedPackQty || item.recommendedPackOrderQty;
  };

  const setIncomingQty = (itemId: string, qty: number) => {
    setIncomingQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, qty),
    }));
  };

  // Open confirmation modal for receiving
  const handleOpenReceiveModal = (item: CalculatedItem) => {
    const incoming = getIncomingQty(item);
    const beforeStock = getCurrentDraft(item);
    const finalStock = Number((beforeStock + incoming).toFixed(2));
    setConfirmModalData({
      item,
      beforeStock,
      incomingQty: incoming,
      finalStock,
    });
  };

  // Confirm receipt execution after modal agreement
  const handleExecuteReceive = () => {
    if (!confirmModalData) return;
    const { item, beforeStock, incomingQty, finalStock } = confirmModalData;

    onReceiveStock(item.id, beforeStock, incomingQty);

    // Clear draft for this item so it reflects the freshly received stock
    setDraftStocks((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    setReceivedToast(
      `[입고 확정 완료] ${item.itemName} (현장실사 ${beforeStock} + 입고 ${incomingQty} = 최종 ${finalStock} ${item.packUnit}) 전산 반영 완료`
    );
    setTimeout(() => {
      setReceivedToast(null);
    }, 4000);
    setConfirmModalData(null);
  };

  // Keyboard navigation for spreadsheet-style rapid data entry
  const handleInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentIndex: number
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = document.querySelector<HTMLInputElement>(
        `input[data-audit-idx="${currentIndex + 1}"]`
      );
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = document.querySelector<HTMLInputElement>(
        `input[data-audit-idx="${currentIndex - 1}"]`
      );
      if (prevInput) {
        prevInput.focus();
        prevInput.select();
      }
    }
  };

  const handleHeaderSort = (field: 'default' | 'remainingDays' | 'itemName') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Total counts
  const totalAwaitingCount = items.filter(
    (i) => i.orderStatus === '발주완료(입고대기)'
  ).length;
  const totalAuditDelayedCount = items.filter((i) => i.isAuditDelayed).length;
  const totalNeededCount = items.filter((i) => i.needsOrder).length;
  const totalImminentCount = items.filter((i) => i.isOrderImminent).length;

  // Filter items
  const filteredItems = items.filter((item) => {
    if (!matchLineFilter(item.line, selectedLine)) return false;
    if (selectedCategory !== '전체' && item.categoryId !== selectedCategory)
      return false;
    if (filterOnlyAwaiting && item.orderStatus !== '발주완료(입고대기)')
      return false;
    if (filterOnlyAuditDelayed && !item.isAuditDelayed)
      return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.itemName.toLowerCase().includes(q);
      const matchSpec = item.spec.toLowerCase().includes(q);
      const matchVendor = item.vendorName.toLowerCase().includes(q);
      const matchCategory = item.categoryName.toLowerCase().includes(q);
      if (!matchName && !matchSpec && !matchVendor && !matchCategory)
        return false;
    }
    return true;
  });

  // Sort items: 기본 정렬은 무조건 고정 순서 (라인 > 카테고리 > 품목명)
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortField === 'default') {
      return compareItemsByDefaultOrder(a, b);
    }

    let cmp = 0;
    if (sortField === 'remainingDays') {
      cmp = a.remainingDays - b.remainingDays;
    } else if (sortField === 'itemName') {
      cmp = a.itemName.localeCompare(b.itemName, 'ko');
    }

    if (cmp === 0) {
      return compareItemsByDefaultOrder(a, b);
    }
    return sortAsc ? cmp : -cmp;
  });

  // Line Filter definitions (동일한 6개 필터 옵션 구성)
  const LINE_FILTERS = [
    { key: '전체', label: '전체', count: items.length },
    {
      key: '포승공장',
      label: '🏭 포승공장 전체',
      count: items.filter((i) => isPoseungLine(i.line)).length,
      highlight: true,
    },
    { key: 'SL1', label: 'SL1', count: items.filter((i) => i.line === 'SL1').length },
    { key: 'SL2', label: 'SL2', count: items.filter((i) => i.line === 'SL2').length },
    {
      key: '공용',
      label: '공용',
      count: items.filter((i) => i.line === '공용' || i.line === '공용(포장장)').length,
    },
    {
      key: '아산공장',
      label: '🏭 아산공장',
      count: items.filter((i) => isAsanLine(i.line)).length,
      highlight: true,
    },
  ];

  return (
    <div className={`space-y-3 w-full ${changedCount > 0 ? 'pb-24 md:pb-0' : ''}`}>
      {/* Toast Alert */}
      {receivedToast && (
        <div className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-200" />
            <span className="font-bold text-xs sm:text-sm">{receivedToast}</span>
          </div>
          <button
            onClick={() => setReceivedToast(null)}
            className="text-xs bg-emerald-700 hover:bg-emerald-800 px-2.5 py-1 rounded font-semibold"
          >
            확인
          </button>
        </div>
      )}

      {/* Top Unified Control Header Bar */}
      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Line Segmented Filter Tabs + Category Dropdown right next to it */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Line Segmented Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md text-xs font-semibold overflow-x-auto no-scrollbar max-w-full">
            {LINE_FILTERS.map((f) => {
              const isSelected = selectedLine === f.key;

              return (
                <button
                  key={f.key}
                  onClick={() => setSelectedLine(f.key)}
                  className={`px-2.5 py-1.5 rounded transition-all whitespace-nowrap cursor-pointer shrink-0 flex items-center gap-1 ${
                    isSelected
                      ? f.highlight
                        ? 'bg-blue-600 text-white shadow-xs font-bold'
                        : 'bg-white text-blue-700 shadow-xs font-bold'
                      : f.highlight
                      ? 'text-blue-700 font-semibold hover:bg-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`text-[10px] ${
                      isSelected && f.highlight
                        ? 'text-blue-100'
                        : isSelected
                        ? 'text-blue-500'
                        : 'text-slate-400'
                    }`}
                  >
                    ({f.count})
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

        {/* Right: Search box + Awaiting Filter Toggle + Sorting indicator */}
        <div className="flex flex-wrap items-center gap-2 flex-1 justify-start lg:justify-end w-full lg:w-auto">
          {/* Search box */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="품목·규격·업체 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-md pl-8 pr-12 py-1.5 bg-white text-slate-900 focus:ring-1 focus:ring-blue-500"
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

          {/* Audit Delay Warning Filter Toggle ([기능 1] 실사 지연 및 누락 품목 경고 알림) */}
          <button
            onClick={() => {
              setFilterOnlyAuditDelayed(!filterOnlyAuditDelayed);
              if (!filterOnlyAuditDelayed) {
                setFilterOnlyAwaiting(false);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-extrabold transition-all whitespace-nowrap shadow-xs cursor-pointer ${
              filterOnlyAuditDelayed
                ? 'bg-orange-600 text-white ring-2 ring-orange-300'
                : totalAuditDelayedCount > 0
                ? 'bg-orange-50 text-orange-900 border border-orange-300 hover:bg-orange-100'
                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
            title="최근 실사일시가 7일 이상 경과했거나 누락된 품목만 필터링합니다"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>⚠️ 실사 지연 품목 {totalAuditDelayedCount}건</span>
          </button>

          {/* Awaiting toggle */}
          <button
            onClick={() => {
              setFilterOnlyAwaiting(!filterOnlyAwaiting);
              if (!filterOnlyAwaiting) {
                setFilterOnlyAuditDelayed(false);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap shadow-xs cursor-pointer ${
              filterOnlyAwaiting
                ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300'
                : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>입고대기만 보기</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterOnlyAwaiting
                  ? 'bg-slate-900 text-white'
                  : 'bg-amber-200 text-amber-950'
              }`}
            >
              {totalAwaitingCount}건
            </span>
          </button>

          {/* Default Sorting Reset indicator */}
          {sortField !== 'default' && (
            <button
              onClick={() => {
                setSortField('default');
                setSortAsc(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded text-xs transition-colors"
              title="기본 고정 정렬로 복원"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>기본 순서 복원</span>
            </button>
          )}
        </div>
      </div>

      {/* Audit Delay Alert & Bulk Confirm Banner ([기능 1]) */}
      {(totalAuditDelayedCount > 0 || filterOnlyAuditDelayed) && (
        <div
          className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all shadow-xs ${
            filterOnlyAuditDelayed
              ? 'bg-orange-100/90 border-orange-400 text-orange-950'
              : 'bg-orange-50/80 border-orange-200 text-orange-900'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-extrabold">
                [⚠️ 실사 지연 품목 {totalAuditDelayedCount}건 감지]
              </span>{' '}
              <span className="text-orange-800 font-medium">
                주간실사 주기(7일) 경과 또는 실사 이력이 누락된 품목이 있습니다.{' '}
                {filterOnlyAuditDelayed
                  ? '현재 지연 품목만 필터링하여 표시 중입니다.'
                  : '우측 버튼으로 지연 품목만 모아 빠르게 실사를 완료하세요.'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFilterOnlyAuditDelayed(!filterOnlyAuditDelayed)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                filterOnlyAuditDelayed
                  ? 'bg-white text-orange-900 border border-orange-300 hover:bg-orange-50'
                  : 'bg-orange-600 text-white hover:bg-orange-700 shadow-2xs'
              }`}
            >
              {filterOnlyAuditDelayed ? '전체 품목 다시 보기' : `지연 품목 ${totalAuditDelayedCount}건만 필터링`}
            </button>

            {totalAuditDelayedCount > 0 && onConfirmAuditWithoutChange && (
              <button
                type="button"
                onClick={() => {
                  const delayedIds = items.filter((i) => i.isAuditDelayed).map((i) => i.id);
                  if (delayedIds.length > 0) {
                    onConfirmAuditWithoutChange(delayedIds);
                    setFilterOnlyAuditDelayed(false);
                  }
                }}
                className="px-3 py-1.5 rounded-md text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
                title="현재 전산 수량과 현장 실물이 동일한 지연 품목들의 실사일시를 금일자로 일괄 갱신합니다"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>현재 수량 이상없음 · 지연품목 일괄 실사완료</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Draft & Commit Control Bar (Explicit Save / Cancel Mechanism) */}
      <div
        className={`p-2.5 rounded-lg border flex flex-wrap items-center justify-between gap-2.5 transition-all shadow-xs ${
          changedCount > 0
            ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2">
          {changedCount > 0 ? (
            <>
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <span className="text-xs font-bold text-amber-950">
                현장 실사 재고 <strong className="text-amber-900 font-black underline text-sm">{changedCount}건</strong> 수정 중 (전산 미반영)
              </span>
              <span className="text-[11px] text-amber-700 hidden md:inline font-medium">
                · 우측 [실사 변경사항 저장] 버튼을 눌러야 전산에 확정 반영됩니다.
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-700">
                모든 현장 실사 재고가 전산에 안전하게 저장되어 있습니다.
              </span>
              <span className="text-[11px] text-slate-400 hidden md:inline">
                · 숫자를 수정한 후 [실사 변경사항 저장]을 누르면 일괄 전산 등록됩니다.
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {changedCount > 0 && (
            <button
              type="button"
              onClick={handleResetDrafts}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-300 rounded-md transition-colors flex items-center gap-1 shadow-2xs active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>변경 취소(초기화)</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCommitBatch}
            disabled={changedCount === 0}
            className={`px-4 py-1.5 text-xs font-black rounded-md flex items-center gap-1.5 transition-all shadow-xs ${
              changedCount > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300 active:scale-95 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>실사 변경사항 저장 ({changedCount}건)</span>
          </button>
        </div>
      </div>

      {/* Main High-Density Compact Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Top Header Strip */}
        <div className="px-3.5 py-2 bg-slate-900 text-white flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="font-bold">현장 소모품 실사 &amp; 입고확정 시트</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300 font-mono text-[11px]">
              총 <strong>{sortedItems.length}</strong>개 품목 (행 이동 없는 안정된 실사 모드)
            </span>
            {isWorkerMode && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[10px]">
                <HardHat className="w-3 h-3" />
                현장 작업자 간소화 모드
              </span>
            )}
          </div>

          <div className="hidden md:flex items-center gap-3 text-slate-300 text-[11px] whitespace-nowrap">
            <span>* 키보드 <strong>Enter</strong> 또는 <strong>↓ / ↑</strong> 방향키로 다음 행 빠른 연속 입력 가능</span>
          </div>
        </div>

        {/* Scrollable Compact Table (Desktop: md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse table-auto">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 select-none whitespace-nowrap text-sm">
                {/* 1. No. (행번) */}
                <th className="px-3.5 py-3 border-r border-slate-200 text-center w-14 text-slate-500 font-mono">
                  No.
                </th>

                {/* 2. 라인 */}
                <th
                  onClick={() => handleHeaderSort('default')}
                  className="px-3.5 py-3 border-r border-slate-200 w-20 text-center cursor-pointer hover:bg-slate-200"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>라인</span>
                    {sortField === 'default' && (
                      <span className="text-xs text-blue-600 font-bold">(고정)</span>
                    )}
                  </div>
                </th>

                {/* 3. 카테고리 (신규 독립 컬럼) */}
                <th className="px-3.5 py-3 border-r border-slate-200 w-32 text-left whitespace-nowrap min-w-[120px]">
                  카테고리
                </th>

                {/* 4. 품목명 / 규격 (거래처·환산기준) */}
                <th
                  onClick={() => handleHeaderSort('itemName')}
                  className="px-3.5 py-3 border-r border-slate-200 min-w-[220px] cursor-pointer hover:bg-slate-200"
                >
                  <div className="flex items-center gap-1">
                    <span>품목명 / 규격 (거래처·환산기준)</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>

                {/* 5. 현재 실사재고 입력 (핵심 컬럼) */}
                <th className="px-3.5 py-3 border-r border-slate-200 text-center bg-yellow-50 text-yellow-950 w-52">
                  현재 실사재고 입력
                </th>

                {/* 6. 환산재고 (독립 컬럼) */}
                <th className="px-3.5 py-3 border-r border-slate-200 text-right w-28 whitespace-nowrap">
                  환산재고
                </th>

                {/* 7. 잔여일 (독립 컬럼) */}
                <th
                  onClick={() => handleHeaderSort('remainingDays')}
                  className="px-3.5 py-3 border-r border-slate-200 text-right w-24 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>잔여일</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>

                {/* 8. 발주·입고 상태 (독립 컬럼) */}
                <th className="px-3.5 py-3 border-r border-slate-200 text-center min-w-[170px] whitespace-nowrap">
                  발주·입고 상태
                </th>

                {/* 9. 입고확정 처리 (독립 액션 컬럼) */}
                <th className="px-3.5 py-3 min-w-[300px] text-left whitespace-nowrap">
                  입고확정 처리
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-sm">
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 whitespace-nowrap">
                    <p className="text-base font-semibold">조건에 맞는 품목이 없습니다.</p>
                    <p className="text-sm mt-1">필터를 초기화하거나 검색어를 변경해주세요.</p>
                  </td>
                </tr>
              ) : (
                sortedItems.map((item, idx) => {
                  const isAwaiting = item.orderStatus === '발주완료(입고대기)';
                  const incomingQty = getIncomingQty(item);
                  const currentStockVal = getCurrentDraft(item);
                  const isDraftChanged =
                    draftStocks[item.id] !== undefined &&
                    draftStocks[item.id] !== item.currentPackStock;
                  const calculatedFinalStock = Number(
                    (currentStockVal + incomingQty).toFixed(2)
                  );
                  const draftBaseStock = Number(
                    (currentStockVal * item.unitConversion).toFixed(2)
                  );
                  const draftRemainingDays =
                    item.dailyUsage > 0
                      ? Number((draftBaseStock / item.dailyUsage).toFixed(1))
                      : 999;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors whitespace-nowrap ${
                        isDraftChanged
                          ? 'bg-amber-50/50 hover:bg-amber-100/40 border-l-3 border-l-amber-500'
                          : isAwaiting
                          ? 'bg-sky-50/50 hover:bg-sky-100/40 border-l-2 border-l-sky-500'
                          : item.isAuditDelayed
                          ? 'bg-orange-50/35 hover:bg-orange-50/60 border-l-2 border-l-orange-500'
                          : item.needsOrder
                          ? 'bg-rose-50/25 hover:bg-rose-50/40'
                          : item.isOrderImminent
                          ? 'bg-amber-50/25 hover:bg-amber-50/40'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* 1. No. (행번) */}
                      <td className="px-3.5 py-3 border-r border-slate-200 text-center font-mono text-slate-400 text-sm">
                        {idx + 1}
                      </td>

                      {/* 2. 라인 */}
                      <td className="px-3.5 py-3 border-r border-slate-200 text-center whitespace-nowrap">
                        <span className={`${getLineTextColor(item.line)} text-sm font-bold`}>
                          {getLineShortLabel(item.line)}
                        </span>
                      </td>

                      {/* 3. 카테고리 */}
                      <td className="px-3.5 py-3 border-r border-slate-200 whitespace-nowrap">
                        <span className="font-bold text-slate-800 text-sm">
                          {item.categoryName}
                        </span>
                      </td>

                      {/* 4. 품목명 / 규격 (거래처·환산기준) */}
                      <td className="px-3.5 py-3 border-r border-slate-200 whitespace-nowrap font-normal">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-normal text-slate-900 leading-snug">
                            {`${item.itemName} ${item.spec}`}
                          </span>
                          {item.isAuditDelayed && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-extrabold bg-orange-100 text-orange-800 border border-orange-300">
                              <AlertTriangle className="w-3 h-3 text-orange-600" />
                              {item.daysSinceLastAudit !== null
                                ? `실사지연 (${item.daysSinceLastAudit}일경과)`
                                : '실사누락'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 font-normal leading-snug flex items-center gap-1.5">
                          <span className="font-normal text-slate-600">{item.vendorName}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono font-normal text-slate-500">1{item.packUnit} = {item.unitConversion}{item.baseUnit}</span>
                        </div>
                      </td>

                      {/* 5. 현재 실사재고 입력 (핵심 컬럼: 세로 일직선 정렬 & 방향키 이동 & Draft) */}
                      <td
                        className={`px-3.5 py-2.5 border-r border-slate-200 text-center transition-colors ${
                          isDraftChanged ? 'bg-amber-100/60' : 'bg-yellow-50/30'
                        }`}
                      >
                        <div className="inline-flex items-center justify-center gap-1.5">
                          {/* Decrement Button */}
                          <button
                            type="button"
                            onClick={() => handleStepDraftStock(item, -1)}
                            className="w-8 h-8 bg-white hover:bg-yellow-100 border border-yellow-300 rounded flex items-center justify-center font-bold text-slate-700 text-sm shadow-2xs active:scale-95 transition-transform cursor-pointer"
                            title="1 차감"
                          >
                            <Minus className="w-4 h-4" />
                          </button>

                          {/* Yellow Input Box */}
                          <input
                            type="number"
                            min="0"
                            step="any"
                            data-audit-idx={idx}
                            value={currentStockVal}
                            onChange={(e) =>
                              handleSetDraftStock(
                                item.id,
                                Number(e.target.value) || 0
                              )
                            }
                            onKeyDown={(e) => handleInputKeyDown(e, idx)}
                            className={`w-22 px-1.5 py-1.5 text-center font-black font-mono rounded text-base shadow-inner transition-colors ${
                              isDraftChanged
                                ? 'bg-amber-200 text-amber-950 border-2 border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500'
                                : 'bg-yellow-100 hover:bg-yellow-200 text-slate-950 border border-yellow-400 focus:bg-white focus:ring-2 focus:ring-yellow-500'
                            }`}
                          />

                          {/* Increment Button */}
                          <button
                            type="button"
                            onClick={() => handleStepDraftStock(item, +1)}
                            className="w-8 h-8 bg-white hover:bg-yellow-100 border border-yellow-300 rounded flex items-center justify-center font-bold text-slate-700 text-sm shadow-2xs active:scale-95 transition-transform cursor-pointer"
                            title="1 증가"
                          >
                            <Plus className="w-4 h-4" />
                          </button>

                          {/* Dynamic Pack Unit */}
                          <span className="text-xs text-slate-700 font-bold w-9 text-left pl-1 shrink-0">
                            {item.packUnit}
                          </span>
                        </div>

                        {/* Status feedback indicator underneath the input */}
                        {isDraftChanged ? (
                          <div className="mt-1 flex items-center justify-center gap-1 text-xs">
                            <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-extrabold shadow-2xs">
                              변경됨
                            </span>
                            <span className="text-slate-600 font-mono font-medium">
                              기존 {item.currentPackStock} → <strong className="text-amber-950 font-bold">{currentStockVal}</strong>
                            </span>
                          </div>
                        ) : item.isAuditDelayed ? (
                          <div className="mt-1 flex items-center justify-center gap-1 text-xs">
                            <span className="text-orange-700 font-bold font-mono">
                              {item.lastAuditDate
                                ? `지연 (${item.lastAuditDate.slice(5, 10)})`
                                : '실사 이력 없음'}
                            </span>
                            {onConfirmAuditWithoutChange && (
                              <button
                                type="button"
                                onClick={() => onConfirmAuditWithoutChange([item.id])}
                                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                                title="수량 변동 없이 금일 실사 완료 처리"
                              >
                                실사확인
                              </button>
                            )}
                          </div>
                        ) : item.lastAuditDate ? (
                          <div className="text-xs text-slate-500 font-mono mt-0.5 text-center">
                            최근실사: {item.lastAuditDate.replace(TODAY_STR + ' ', '')}
                          </div>
                        ) : null}
                      </td>

                      {/* 6. 환산재고 (독립 컬럼) */}
                      <td className="px-3.5 py-3 border-r border-slate-200 text-right whitespace-nowrap">
                        <span className="font-extrabold text-blue-700 font-mono text-base">
                          {formatNumber(draftBaseStock)} {item.baseUnit}
                        </span>
                      </td>

                      {/* 7. 잔여일 (독립 컬럼) */}
                      <td className="px-3.5 py-3 border-r border-slate-200 text-right whitespace-nowrap font-mono text-base">
                        {item.isQtyBased && item.dailyUsage === 0 ? (
                          <span className="text-slate-400 font-sans text-xs">- (수량기준)</span>
                        ) : (
                          <span
                            className={
                              draftRemainingDays <= (item.safetyStockBase / (item.dailyUsage || 1))
                                ? 'text-rose-600 font-black'
                                : item.isOrderImminent
                                ? 'text-amber-700 font-extrabold'
                                : 'text-slate-800 font-bold'
                            }
                          >
                            {draftRemainingDays === 999 ? '999일+' : `${draftRemainingDays.toFixed(1)}일`}
                          </span>
                        )}
                      </td>

                      {/* 8. 발주·입고 상태 (독립 컬럼) */}
                      <td className="px-3.5 py-3 border-r border-slate-200 text-center whitespace-nowrap">
                        {isAwaiting ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-100 text-sky-900 border border-sky-300 font-bold text-xs shadow-2xs">
                            <span>입고대기</span>
                            <span className="font-mono text-xs text-sky-700">
                              ({formatShortDate(item.expectedArrivalDate)} · {item.dDayText})
                            </span>
                          </div>
                        ) : item.needsOrder ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="px-2.5 py-1 rounded bg-rose-600 text-white font-extrabold text-xs shadow-2xs">
                              발주요망
                            </span>
                            <span className="text-xs text-slate-500 font-mono font-semibold">
                              (권장: {item.recommendedPackOrderQty} {item.packUnit})
                            </span>
                          </div>
                        ) : item.isOrderImminent ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-extrabold text-xs shadow-2xs">
                              발주임박
                            </span>
                            <span className="text-xs text-slate-500 font-mono font-semibold">
                              (권장: {item.recommendedPackOrderQty} {item.packUnit})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-sm font-medium">여유(정상)</span>
                        )}
                      </td>

                      {/* 9. 입고확정 처리 (독립 액션 컬럼) */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-left">
                        {isAwaiting ? (
                          /* 입고대기 중일 때: 이번 입고량 입력 및 합산 입고확정 버튼 */
                          <div className="flex items-center gap-2">
                            {/* 이번 입고량 입력칸 */}
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs text-slate-600 font-semibold">
                                이번입고:
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={incomingQty}
                                onChange={(e) =>
                                  setIncomingQty(
                                    item.id,
                                    Number(e.target.value) || 0
                                  )
                                }
                                className="w-16 px-1.5 py-1 text-center text-sm font-bold font-mono text-amber-900 bg-white border border-amber-400 rounded focus:ring-1 focus:ring-amber-500 shadow-2xs"
                              />
                              <span className="text-xs text-slate-600 font-semibold">
                                {item.packUnit}
                              </span>
                            </div>

                            {/* 합산 입고확정 버튼 (확인 다이얼로그 모달 오픈) */}
                            <button
                              type="button"
                              onClick={() => handleOpenReceiveModal(item)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded shadow-xs active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                              title="현재 실사재고와 이번 입고량을 확인 후 전산에 확정 반영합니다"
                            >
                              <Check className="w-4 h-4" />
                              <span>
                                합산 입고확정 (총 {calculatedFinalStock}{item.packUnit})
                              </span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-mono text-sm pl-2">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Dedicated Field Audit Card View (block md:hidden) */}
        <div className="block md:hidden divide-y divide-slate-200">
          {sortedItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              조건에 일치하는 품목이 없습니다.
            </div>
          ) : (
            sortedItems.map((item, idx) => {
              const isAwaiting = item.orderStatus === '발주완료(입고대기)';
              const isDraftChanged = draftStocks[item.id] !== undefined;
              const currentStockVal = isDraftChanged
                ? draftStocks[item.id]
                : item.currentPackStock;
              const draftBaseStock = currentStockVal * item.unitConversion;
              const draftRemainingDays =
                item.dailyUsage > 0
                  ? draftBaseStock / item.dailyUsage
                  : 999;

              const isIncomingEdited = incomingQuantities[item.id] !== undefined;
              const currentIncomingVal = isIncomingEdited
                ? incomingQuantities[item.id]
                : item.orderedPackQty || item.recommendedPackOrderQty;
              const calculatedFinalStock = Number(
                (currentStockVal + currentIncomingVal).toFixed(2)
              );

              return (
                <div
                  key={item.id}
                  className={`p-4 transition-colors ${
                    isDraftChanged
                      ? 'bg-amber-50/70 border-l-4 border-amber-500'
                      : isAwaiting
                      ? 'bg-sky-50/40 border-l-4 border-sky-400'
                      : item.isAuditDelayed
                      ? 'bg-orange-50/40 border-l-4 border-orange-500'
                      : 'bg-white'
                  }`}
                >
                  {/* Card Top: Line badge, Category, Vendor + Status */}
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] text-slate-400">
                        #{idx + 1}
                      </span>
                      <span className={`text-xs ${getLineTextColor(item.line)}`}>
                        [{getLineShortLabel(item.line)}]
                      </span>
                      <span className="text-xs text-slate-700 font-semibold">
                        {item.categoryName}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-500">
                        {item.vendorName}
                      </span>
                      {item.isAuditDelayed && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-orange-100 text-orange-800 border border-orange-300">
                          <AlertTriangle className="w-2.5 h-2.5 text-orange-600" />
                          {item.daysSinceLastAudit !== null
                            ? `실사지연 (${item.daysSinceLastAudit}일경과)`
                            : '실사누락'}
                        </span>
                      )}
                    </div>

                    <div>
                      {isAwaiting ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300 font-bold text-xs shadow-2xs">
                          <Truck className="w-3 h-3 text-sky-700" />
                          <span>입고대기</span>
                          <span className="font-mono text-[10px] text-sky-700">
                            ({item.dDayText})
                          </span>
                        </span>
                      ) : item.needsOrder ? (
                        <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-extrabold text-xs shadow-2xs">
                          발주요망
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
                    </div>
                  </div>

                  {/* Card Middle: Item Name + Spec */}
                  <div className="py-1">
                    <div className="text-base font-normal text-slate-900 leading-snug">
                      {item.itemName} {item.spec}
                    </div>
                    {item.purpose && (
                      <p className="text-[11px] font-normal text-slate-500 mt-0.5 line-clamp-1">
                        {item.purpose}
                      </p>
                    )}
                  </div>

                  {/* Converted Stock & Remaining Days Metrics Strip */}
                  <div className="mt-2 grid grid-cols-2 gap-2 bg-slate-100/70 p-2.5 rounded-lg border border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block">환산 재고수량</span>
                      <span className="font-bold font-mono text-blue-700 text-sm">
                        {formatNumber(draftBaseStock)} {item.baseUnit}
                      </span>
                      <span className="text-slate-400 text-[10px] block">
                        (1{item.packUnit} = {formatNumber(item.unitConversion)}{item.baseUnit})
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-slate-500 text-[10px] block">
                        {item.isQtyBased && item.dailyUsage === 0 ? '발주점 기준' : '예상 잔여일수'}
                      </span>
                      {item.isQtyBased && item.dailyUsage === 0 ? (
                        <span className="font-bold text-slate-800 text-xs">
                          {item.triggerPackQty}{item.packUnit} 이하 시 발주
                        </span>
                      ) : (
                        <span
                          className={`font-mono text-sm font-bold ${
                            draftRemainingDays <= (item.safetyStockBase / (item.dailyUsage || 1))
                              ? 'text-rose-600'
                              : item.isOrderImminent
                              ? 'text-amber-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {draftRemainingDays === 999 ? '999일+' : `${draftRemainingDays.toFixed(1)}일`}
                        </span>
                      )}
                      {item.dailyUsage > 0 && (
                        <span className="text-slate-400 text-[10px] block">
                          (일사용 {formatNumber(item.dailyUsage)}{item.baseUnit})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom: Field Stock Input Touch Controls */}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <ClipboardCheck className="w-3.5 h-3.5 text-blue-600" />
                        현장 실사재고 입력 ({item.packUnit})
                      </span>
                      {isDraftChanged ? (
                        <span className="text-[11px] font-bold text-amber-900 bg-amber-200 border border-amber-400 px-2 py-0.5 rounded">
                          기존 {item.currentPackStock} → {currentStockVal} {item.packUnit}
                        </span>
                      ) : item.isAuditDelayed ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-orange-700 font-bold font-mono">
                            {item.lastAuditDate
                              ? `최근실사: ${item.lastAuditDate.slice(5, 10)}`
                              : '실사 이력 없음'}
                          </span>
                          {onConfirmAuditWithoutChange && (
                            <button
                              type="button"
                              onClick={() => onConfirmAuditWithoutChange([item.id])}
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                            >
                              실사확인
                            </button>
                          )}
                        </div>
                      ) : item.lastAuditDate ? (
                        <span className="text-[10px] text-slate-400 font-mono">
                          최근실사: {item.lastAuditDate.replace(TODAY_STR + ' ', '')}
                        </span>
                      ) : null}
                    </div>

                    {/* Touch-Optimized Large Controls: min 44x44px touch targets */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStepDraftStock(item, -1)}
                        className="w-12 h-12 bg-white hover:bg-yellow-50 active:bg-yellow-200 border-2 border-yellow-400 rounded-xl flex items-center justify-center font-black text-slate-800 text-xl shadow-xs active:scale-95 transition-transform cursor-pointer shrink-0"
                        aria-label="1 감소"
                      >
                        <Minus className="w-6 h-6 text-slate-700" />
                      </button>

                      <div className="relative flex-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={currentStockVal === 0 ? '' : currentStockVal}
                          placeholder="0"
                          onChange={(e) =>
                            handleSetDraftStock(item.id, Number(e.target.value) || 0)
                          }
                          className={`w-full h-12 text-center font-black font-mono text-xl rounded-xl shadow-inner border-2 transition-all ${
                            isDraftChanged
                              ? 'bg-amber-200 text-amber-950 border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500'
                              : 'bg-yellow-100 text-slate-950 border-yellow-400 focus:bg-white focus:ring-2 focus:ring-yellow-500'
                          }`}
                        />
                        <span className="absolute right-3.5 top-3.5 text-xs font-bold text-slate-600 pointer-events-none">
                          {item.packUnit}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStepDraftStock(item, +1)}
                        className="w-12 h-12 bg-white hover:bg-yellow-50 active:bg-yellow-200 border-2 border-yellow-400 rounded-xl flex items-center justify-center font-black text-slate-800 text-xl shadow-xs active:scale-95 transition-transform cursor-pointer shrink-0"
                        aria-label="1 증가"
                      >
                        <Plus className="w-6 h-6 text-slate-700" />
                      </button>
                    </div>

                    {/* Receiving Controls if Item is Awaiting Arrival */}
                    {isAwaiting && (
                      <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-300 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-950 flex items-center gap-1">
                            <Truck className="w-4 h-4 text-emerald-700" />
                            현장 트럭 도착 입고확정
                          </span>
                          <span className="text-[11px] text-emerald-800 font-mono">
                            예정: {formatShortDate(item.expectedArrivalDate)} ({item.dDayText})
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs bg-white/80 p-2 rounded-lg border border-emerald-200">
                          <span className="text-slate-700 font-medium">
                            이번 실 입고수량:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              value={currentIncomingVal}
                              onChange={(e) =>
                                setIncomingQty(item.id, Number(e.target.value) || 1)
                              }
                              className="w-16 px-2 py-1 text-center font-bold font-mono border-2 border-emerald-400 rounded-md bg-white text-emerald-900 focus:ring-2 focus:ring-emerald-500 text-sm"
                            />
                            <span className="font-bold text-emerald-900">{item.packUnit}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenReceiveModal(item)}
                          className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5 active:scale-98 transition-transform cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>
                            합산 입고확정 (잔여 {currentStockVal} + 입고 {currentIncomingVal} = 최종 {calculatedFinalStock}{item.packUnit})
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Confirmation Modal for Receiving (입고 확정 무결성 검증 다이얼로그) */}
      {confirmModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm sm:text-base">
                  물품 입고 확정 및 전산 반영 확인
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModalData(null)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Item Summary */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`${getLineTextColor(confirmModalData.item.line)} font-bold`}>
                    [{confirmModalData.item.line}]
                  </span>
                  <span className="font-semibold text-slate-700">
                    {confirmModalData.item.categoryName}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">
                    공급처: {confirmModalData.item.vendorName}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {confirmModalData.item.itemName}
                  <span className="ml-2 text-xs font-normal text-slate-600 font-mono">
                    {confirmModalData.item.spec}
                  </span>
                </div>
              </div>

              {/* Math Formula Card */}
              <div className="p-4 bg-amber-50/80 rounded-lg border border-amber-300 space-y-2">
                <div className="text-[11px] font-bold text-amber-950">
                  입고 수량 합산 내역:
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm font-mono font-bold text-slate-800 bg-white p-3 rounded-md border border-amber-200 shadow-2xs">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 font-sans font-normal mb-0.5">
                      입고 전 잔여재고
                    </div>
                    <span className="text-slate-800 font-bold text-sm sm:text-base">
                      {confirmModalData.beforeStock}
                    </span>{' '}
                    <span className="text-xs text-slate-500">{confirmModalData.item.packUnit}</span>
                  </div>
                  <span className="text-slate-400 text-lg">+</span>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 font-sans font-normal mb-0.5">
                      금회 입고량
                    </div>
                    <span className="text-amber-700 font-bold text-sm sm:text-base">
                      {confirmModalData.incomingQty}
                    </span>{' '}
                    <span className="text-xs text-slate-500">{confirmModalData.item.packUnit}</span>
                  </div>
                  <span className="text-slate-400 text-lg">=</span>
                  <div className="text-center bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200">
                    <div className="text-[10px] text-emerald-700 font-sans font-bold mb-0.5">
                      최종 확정재고
                    </div>
                    <span className="text-emerald-700 font-black text-base sm:text-lg">
                      {confirmModalData.finalStock}
                    </span>{' '}
                    <span className="text-xs text-emerald-600 font-bold">{confirmModalData.item.packUnit}</span>
                  </div>
                </div>
              </div>

              {/* Notice guidelines */}
              <div className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-700">확정 시 처리 사항:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                  <li>
                    현장 실사재고가 최종{' '}
                    <strong className="text-slate-900">
                      {confirmModalData.finalStock} {confirmModalData.item.packUnit}
                    </strong>
                    (으)로 즉시 갱신됩니다.
                  </li>
                  <li>
                    해당 품목의 발주 진행상태가 <strong>'발주대기'</strong>로 자동 전환됩니다.
                  </li>
                  <li>
                    도착 수량이 다른 경우 [취소] 후 행의 [이번입고] 칸에서 수량을 변경해주세요.
                  </li>
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmModalData(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecuteReceive}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>입고 확정 반영</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Floating Save Bar (fixed bottom-0 inset-x-0 z-40 md:hidden) */}
      {changedCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-slate-900/95 text-white backdrop-blur px-4 py-3 shadow-2xl border-t border-slate-700 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <div className="truncate">
              <div className="text-xs font-bold text-amber-300">
                실사재고 {changedCount}건 수정됨
              </div>
              <div className="text-[10px] text-slate-300 truncate">
                저장 시 전산에 즉시 확정 반영됩니다
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetDrafts}
              className="px-2.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-lg cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCommitBatch}
              className="flex items-center gap-1 px-3.5 py-2 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-95 rounded-lg shadow-md cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>저장 ({changedCount}건)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
