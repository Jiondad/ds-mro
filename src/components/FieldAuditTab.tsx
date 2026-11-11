import React, { useState, useMemo } from 'react';
import { CalculatedItem, Category, ProductionLine, UserAccount } from '../types';
import {
  formatNumber,
  compareItemsByDefaultOrder,
  TODAY_STR,
  isPoseungLine,
  isAsanLine,
  matchLineFilter,
} from '../utils/calculations';
import { checkItemAssignedToUser } from '../utils/rbac';
import { useUrlPersistedState } from '../utils/urlState';
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
  UserCheck,
  Lock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';

interface FieldAuditTabProps {
  onOpenNewItemModal?: () => void;
  items: CalculatedItem[];
  categories: Category[];
  userAccounts?: UserAccount[];
  currentUser?: UserAccount | null;
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
  onOpenNewItemModal,
  items,
  categories,
  userAccounts = [],
  currentUser = null,
  isWorkerMode = false,
  onUpdateStock,
  onReceiveStock,
  onBatchCommitStock,
  onConfirmAuditWithoutChange,
}) => {
  // Line & Factory filter ('전체', '포승공장', 'SL1', 'SL2', '공용', '아산공장')
  const [selectedLine, setSelectedLine] = useUrlPersistedState<string>(
    'auditLine',
    'ds_mro_audit_line',
    '전체'
  );

  // Category filter
  const [selectedCategory, setSelectedCategory] = useUrlPersistedState<string>(
    'auditCat',
    'ds_mro_audit_cat',
    '전체'
  );

  // Receiver (수령인/담당자) filter
  const [selectedReceiver, setSelectedReceiver] = useUrlPersistedState<string>(
    'auditReceiver',
    'ds_mro_audit_receiver',
    '전체'
  );

  // Filter toggle: only items awaiting delivery
  const [filterOnlyAwaiting, setFilterOnlyAwaiting] = useUrlPersistedState<boolean>(
    'auditAwait',
    'ds_mro_audit_await',
    false
  );

  // Filter toggle: only items with delayed or missing weekly audit
  const [filterOnlyAuditDelayed, setFilterOnlyAuditDelayed] = useUrlPersistedState<boolean>(
    'auditDelay',
    'ds_mro_audit_delay',
    false
  );

  // Search query
  const [searchQuery, setSearchQuery] = useUrlPersistedState<string>(
    'auditQ',
    'ds_mro_audit_q',
    ''
  );

  // 화면 너비 기반: PC(1024px 이상)는 디폴트 펼침, 모바일은 디폴트 히든(접힘) 처리
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  // Sorting state: default is fixed '라인 > 카테고리 > 품목명' (절대 실사 입력 중 행 점프 없음)
  const [sortField, setSortField] = useUrlPersistedState<'default' | 'remainingDays' | 'itemName'>(
    'auditSort',
    'ds_mro_audit_sort',
    'default'
  );
  const [sortAsc, setSortAsc] = useUrlPersistedState<boolean>(
    'auditAsc',
    'ds_mro_audit_asc',
    true
  );

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

  const doesItemMatchAccount = (item: CalculatedItem, acc: UserAccount) => {
    return checkItemAssignedToUser(item, acc);
  };

  const isTopAdminUser = useMemo(() => {
    if (!currentUser) return true;
    if (currentUser.level === 0 || currentUser.username === 'admin') return true;
    if ((currentUser.roleLabel || '').includes('최고관리자')) return true;
    return false;
  }, [currentUser]);

  const canUserEditItem = (item: CalculatedItem): boolean => {
    if (!currentUser) return true;
    if (isTopAdminUser) return true;
    if (currentUser.level === 1) return true;
    if (currentUser.level === 3) return false;
    return checkItemAssignedToUser(item, currentUser);
  };

  const receiverOptions = useMemo(() => {
    return userAccounts
      .filter((u) => u.isActive !== false)
      .map((acc) => {
        const fullName =
          acc.title && !acc.name.includes(acc.title)
            ? `${acc.name} ${acc.title}`
            : acc.name;
        const aff = acc.affiliation || '현장';
        const count = items.filter((it) => doesItemMatchAccount(it, acc)).length;
        return {
          value: acc.username,
          label: `[${aff}] ${fullName} (${count}건)`,
          shortLabel: `[${aff}] ${fullName}`,
          count,
        };
      });
  }, [userAccounts, items]);

  const unassignedReceiverCount = useMemo(() => {
    return items.filter(
      (it) => !it.receiverLoginId && !(it.receiverName && it.receiverName.trim())
    ).length;
  }, [items]);

  const getItemReceiverDisplay = (item: CalculatedItem): string | null => {
    if (item.receiverName && item.receiverName.trim()) {
      if (item.receiverName.includes('[')) {
        return item.receiverName.trim();
      }
      return `[${getLineShortLabel(item.line)}] ${item.receiverName.trim()}`;
    }

    const matchedAcc = userAccounts.find((acc) => doesItemMatchAccount(item, acc));
    if (matchedAcc) {
      const fullName =
        matchedAcc.title && !matchedAcc.name.includes(matchedAcc.title)
          ? `${matchedAcc.name} ${matchedAcc.title}`
          : matchedAcc.name;
      return `[${matchedAcc.affiliation || '현장'}] ${fullName}`;
    }

    return null;
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    if (!matchLineFilter(item.line, selectedLine)) return false;
    if (selectedCategory !== '전체' && item.categoryId !== selectedCategory)
      return false;

    if (selectedReceiver !== '전체') {
      if (selectedReceiver === '미지정') {
        const isUnassigned =
          !item.receiverLoginId && !(item.receiverName && item.receiverName.trim());
        if (!isUnassigned) return false;
      } else {
        const acc = userAccounts.find((u) => u.username === selectedReceiver);
        if (acc) {
          if (!doesItemMatchAccount(item, acc)) return false;
        } else if (
          item.receiverLoginId !== selectedReceiver &&
          (item.receiverName || '').trim() !== selectedReceiver
        ) {
          return false;
        }
      }
    }

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
      const matchReceiver =
        (item.receiverName || '').toLowerCase().includes(q) ||
        (item.receiverLoginId || '').toLowerCase().includes(q);
      if (
        !matchName &&
        !matchSpec &&
        !matchVendor &&
        !matchCategory &&
        !matchReceiver
      )
        return false;
    }
    return true;
  });

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

      {/* Level 3 Office User Read-Only Banner */}
      {currentUser?.level === 3 && (
        <div className="bg-amber-50 border border-amber-300 p-3 rounded-xl flex items-center justify-between gap-3 text-amber-900 text-xs font-semibold shadow-2xs">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>[직무 영역 분리 안내]</strong> 사무실사용자(Level 3) 권한으로 접속 중입니다. 현장 자재/재고 수정 및 실사·입고 처리는 불가하며 조회 전용으로 제공됩니다.
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold text-[10px] shrink-0">
            조회 전용 (Read-Only)
          </span>
        </div>
      )}

      {/* 1. 공장 라인 선택 버튼 영역 (항상 최상단 고정 노출) */}
      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 w-full">
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
        </div>
      </div>

      {/* 2. '모든 카테고리'부터 하단 알림 영역까지를 접고 펼치는 토글 바 */}
      <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-lg shadow-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs font-bold">
            상세 필터 및 공지 요약
          </span>
          {!isFilterExpanded && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium hidden sm:inline">
              접힘 (시인성 확보 모드)
            </span>
          )}
          {totalAuditDelayedCount > 0 && !isFilterExpanded && (
            <span className="px-2 py-0.5 rounded bg-orange-600 text-white text-[10px] font-bold animate-pulse">
              지연 {totalAuditDelayedCount}건
            </span>
          )}
          {changedCount > 0 && !isFilterExpanded && (
            <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-bold">
              수정 {changedCount}건
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-bold transition-colors cursor-pointer shrink-0"
        >
          <span>{isFilterExpanded ? '필터 접기 ▲' : '상세 필터 및 요약 열기 ▼'}</span>
          {isFilterExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 토글로 여닫을 수 있는 상세 필터 및 공지 영역 */}
      {isFilterExpanded && (
        <div className="space-y-3 animate-in fade-in zoom-in-98 duration-150">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
            {/* Category & Receiver Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* '모든 카테고리' 드롭다운 바로 우측에 '신규 품목 등록' 버튼 배치 */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="w-full sm:w-48">
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
                {onOpenNewItemModal && (currentUser?.level ?? 0) === 0 && (
                  <button
                    type="button"
                    onClick={onOpenNewItemModal}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-md shadow-xs transition-colors whitespace-nowrap cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>신규 품목 등록</span>
                  </button>
                )}
              </div>

              <div className="relative flex items-center w-full sm:w-56">
                <UserCheck
                  className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none ${
                    selectedReceiver !== '전체' ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <select
                  value={selectedReceiver}
                  onChange={(e) => setSelectedReceiver(e.target.value)}
                  className={`w-full text-xs font-semibold border rounded-md py-1.5 pl-8 ${
                    selectedReceiver !== '전체' ? 'pr-7' : 'pr-2'
                  } focus:ring-1 focus:ring-blue-500 whitespace-nowrap shadow-2xs transition-colors cursor-pointer ${
                    selectedReceiver !== '전체'
                      ? 'border-blue-500 bg-blue-50/70 text-blue-900 font-bold ring-1 ring-blue-200'
                      : 'border-slate-300 bg-white text-slate-800'
                  }`}
                  title="수령인(담당자)별 담당 품목 필터링"
                >
                  <option value="전체">
                    모든 수령인·담당자 (전체 {items.length}건)
                  </option>
                  {receiverOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {unassignedReceiverCount > 0 && (
                    <option value="미지정">
                      [미지정] 담당자 미지정 품목 ({unassignedReceiverCount}건)
                    </option>
                  )}
                </select>
                {selectedReceiver !== '전체' && (
                  <button
                    type="button"
                    onClick={() => setSelectedReceiver('전체')}
                    className="absolute right-2 text-blue-500 hover:text-blue-800 p-0.5 rounded cursor-pointer"
                    title="수령인 필터 해제"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Search box & Toggles */}
            <div className="flex flex-wrap items-center gap-2 flex-1 justify-start lg:justify-end w-full lg:w-auto">
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="품목·규격·업체·수령인 검색..."
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

          {/* 통합 상단 실사 공지 & 데이터 저장 통합 센터 */}
          <div
            className={`rounded-lg border shadow-2xs transition-all overflow-hidden ${
              totalAuditDelayedCount > 0 && filterOnlyAuditDelayed
                ? 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-200'
                : totalAuditDelayedCount > 0
                ? 'bg-amber-50/60 border-amber-300'
                : changedCount > 0
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="p-2.5 sm:p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  {totalAuditDelayedCount > 0 ? (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-black shadow-2xs ${
                        filterOnlyAuditDelayed
                          ? 'bg-rose-600 text-white'
                          : 'bg-orange-600 text-white animate-pulse'
                      }`}
                      title="최근 실사일시가 7일 이상 경과했거나 실사 이력이 누락된 품목입니다"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>실사 지연 {totalAuditDelayedCount}건</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>주간실사 100% 정상</span>
                    </span>
                  )}

                  {changedCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black bg-amber-500 text-slate-950 shadow-2xs">
                      <span className="flex h-2 w-2 relative shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-950"></span>
                      </span>
                      <span>{changedCount}건 수정 중 (미반영)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>전산 안전 저장됨</span>
                    </span>
                  )}
                </div>

                <div className="hidden sm:block h-6 w-px bg-slate-200 shrink-0" />

                <div className="text-xs text-slate-700 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                    {totalAuditDelayedCount > 0 ? (
                      <span className="font-bold text-orange-900">
                        주간실사 주기(7일) 경과 품목이 감지되었습니다.
                      </span>
                    ) : (
                      <span className="font-semibold text-slate-800">
                        모든 현장 실사 재고가 정상 동기화되어 있습니다.
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 hidden xl:inline">
                      · 주간실사 주기: 7일 이내 정기 점검 관리
                    </span>
                    <span className="text-[11px] text-blue-700 font-medium hidden md:inline">
                      · ⌨️ 방향키(↓/↑) & Enter 빠른 연속 입력 지원
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {changedCount > 0
                      ? '수정된 실사 수량은 임시 보관 중이며, [실사 변경사항 저장]을 눌러야 전산 DB에 최종 확정됩니다.'
                      : totalAuditDelayedCount > 0
                      ? filterOnlyAuditDelayed
                        ? '현재 지연 품목만 필터링하여 표시 중입니다. 실사 수량을 입력하거나 일괄 완료할 수 있습니다.'
                        : '우측 [지연 품목 필터링] 또는 [일괄 실사완료] 버튼으로 빠르게 점검을 마무리하세요.'
                      : '실사 수량 변경 즉시 계산되며, 우측 버튼으로 전산에 안전하게 저장됩니다.'}
                  </p>
                </div>
              </div>

              {/* Right: 통합 액션 버튼 제어부 */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200/80 justify-end">
                {totalAuditDelayedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterOnlyAuditDelayed(!filterOnlyAuditDelayed);
                      if (!filterOnlyAuditDelayed) {
                        setFilterOnlyAwaiting(false);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                      filterOnlyAuditDelayed
                        ? 'bg-white text-orange-950 border border-orange-400 hover:bg-orange-50 font-black'
                        : 'bg-orange-600 hover:bg-orange-700 text-white'
                    }`}
                    title="지연 품목만 모아보거나 전체 목록으로 복귀"
                  >
                    {filterOnlyAuditDelayed ? '전체 품목 보기' : `지연 ${totalAuditDelayedCount}건만 필터`}
                  </button>
                )}

                {totalAuditDelayedCount > 0 && onConfirmAuditWithoutChange && (
                  <button
                    type="button"
                    onClick={() => {
                      const delayedIds = items
                        .filter((i) => i.isAuditDelayed && canUserEditItem(i))
                        .map((i) => i.id);
                      if (delayedIds.length > 0) {
                        onConfirmAuditWithoutChange(delayedIds);
                        setFilterOnlyAuditDelayed(false);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-md text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
                    title="현재 전산 수량과 현장 실물이 동일한 본인 담당 지연 품목들의 실사일시를 금일자로 일괄 갱신합니다"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>지연품목 일괄 실사완료</span>
                  </button>
                )}

                {changedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetDrafts}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-300 rounded-md transition-colors flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer whitespace-nowrap"
                    title="임시 수정한 실사 수량을 전산 기존값으로 되돌립니다"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>변경 취소</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCommitBatch}
                  disabled={changedCount === 0}
                  className={`px-3.5 py-1.5 text-xs font-black rounded-md flex items-center gap-1.5 transition-all shadow-xs whitespace-nowrap ${
                    changedCount > 0
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300 active:scale-95 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                  title={
                    changedCount > 0
                      ? `임시 수정된 ${changedCount}건의 실사 수량을 전산 DB에 최종 확정 저장합니다`
                      : '현재 수정된 항목이 없습니다'
                  }
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>
                    {changedCount > 0
                      ? `실사 변경사항 저장 (${changedCount}건)`
                      : '전산 저장 완료'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main High-Density Compact Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Top Header Strip */}
        <div className="px-3.5 py-2 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
            <span className="font-bold">현장 소모품 실사 & 입고확정 시트</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300 font-mono text-[11px]">
              총 <strong>{sortedItems.length}</strong> / {items.length}개 품목 (행 이동 없는 안정된 실사 모드)
            </span>
            {selectedReceiver !== '전체' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500 text-white font-bold text-[11px]">
                <UserCheck className="w-3 h-3" />
                <span>
                  수령인 필터:{' '}
                  {selectedReceiver === '미지정'
                    ? '담당자 미지정'
                    : receiverOptions.find((o) => o.value === selectedReceiver)
                        ?.shortLabel || selectedReceiver}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedReceiver('전체')}
                  className="ml-0.5 hover:text-blue-200 cursor-pointer"
                  title="수령인 필터 해제"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
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
                <th className="px-3.5 py-3 border-r border-slate-200 text-center w-14 text-slate-500 font-mono">
                  No.
                </th>
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
                <th className="px-3.5 py-3 border-r border-slate-200 w-32 text-left whitespace-nowrap min-w-[120px]">
                  카테고리
                </th>
                <th
                  onClick={() => handleHeaderSort('itemName')}
                  className="px-3.5 py-3 border-r border-slate-200 min-w-[220px] cursor-pointer hover:bg-slate-200"
                >
                  <div className="flex items-center gap-1">
                    <span>품목명 / 규격 (거래처·환산기준)</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 text-center bg-yellow-50 text-yellow-950 w-52">
                  현재 실사재고 입력
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 text-right w-28 whitespace-nowrap">
                  환산재고
                </th>
                <th
                  onClick={() => handleHeaderSort('remainingDays')}
                  className="px-3.5 py-3 border-r border-slate-200 text-right w-24 cursor-pointer hover:bg-slate-200 whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>잔여일</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 text-center min-w-[170px] whitespace-nowrap">
                  발주·입고 상태
                </th>
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
                  const canEdit = canUserEditItem(item);
                  const assignedReceiverLabel = getItemReceiverDisplay(item) || '미지정';
                  const noPermissionTooltip =
                    currentUser?.level === 3
                      ? '사무실사용자(Level 3)는 현장 자재/재고 수정 및 현장 실사 처리가 불가합니다.'
                      : `본인 소속 라인의 담당 수령 품목이 아닙니다 (담당 수령인: ${assignedReceiverLabel})`;

                  return (
                    <tr
                      key={item.id}
                      title={!canEdit ? noPermissionTooltip : undefined}
                      className={`transition-colors whitespace-nowrap ${
                        !canEdit
                          ? 'bg-slate-50/80 text-slate-500'
                          : isDraftChanged
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
                      <td className="px-3.5 py-3 border-r border-slate-200 text-center font-mono text-slate-400 text-sm">
                        {idx + 1}
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200 text-center whitespace-nowrap">
                        <span className={`${getLineTextColor(item.line)} text-sm font-bold`}>
                          {getLineShortLabel(item.line)}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200 whitespace-nowrap">
                        <span className="font-medium text-slate-800 text-sm">
                          {item.categoryName}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm sm:text-base font-medium text-slate-800 leading-snug">
                            {`${item.itemName} ${item.spec}`}
                          </span>
                          {!canEdit && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300"
                              title={noPermissionTooltip}
                            >
                              <Lock className="w-3 h-3 text-slate-500" />
                              타 담당자 품목
                            </span>
                          )}
                          {item.isAuditDelayed && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-extrabold bg-orange-100 text-orange-800 border border-orange-300">
                              <AlertTriangle className="w-3 h-3 text-orange-600" />
                              {item.daysSinceLastAudit !== null
                                ? `실사지연 (${item.daysSinceLastAudit}일경과)`
                                : '실사누락'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-slate-600 mt-0.5 leading-snug flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-700 font-medium">{item.vendorName}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono font-medium text-slate-600">1{item.packUnit} = {item.unitConversion}{item.baseUnit}</span>
                          {getItemReceiverDisplay(item) && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span
                                className={`font-medium ${
                                  canEdit ? 'text-blue-700' : 'text-slate-600'
                                }`}
                              >
                                수령인: {getItemReceiverDisplay(item)}
                              </span>
                            </>
                          )}
                          {item.deliveryLocation && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-slate-700 font-medium">
                                수령장소: {item.deliveryDetailLocation || item.deliveryLocation}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td
                        title={!canEdit ? noPermissionTooltip : undefined}
                        className={`px-3.5 py-2.5 border-r border-slate-200 text-center transition-colors ${
                          !canEdit
                            ? 'bg-slate-100/70'
                            : isDraftChanged
                            ? 'bg-amber-100/60'
                            : 'bg-yellow-50/30'
                        }`}
                      >
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => canEdit && handleStepDraftStock(item, -1)}
                            className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm shadow-2xs transition-transform ${
                              canEdit
                                ? 'bg-white hover:bg-yellow-100 border border-yellow-300 text-slate-700 active:scale-95 cursor-pointer'
                                : 'bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed opacity-60'
                            }`}
                            title={canEdit ? '1 차감' : noPermissionTooltip}
                          >
                            <Minus className="w-4 h-4" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={!canEdit}
                            readOnly={!canEdit}
                            data-audit-idx={canEdit ? idx : undefined}
                            value={currentStockVal}
                            onChange={(e) => {
                              if (!canEdit) return;
                              handleSetDraftStock(
                                item.id,
                                Number(e.target.value) || 0
                              );
                            }}
                            onKeyDown={(e) => canEdit && handleInputKeyDown(e, idx)}
                            title={canEdit ? '실사 재고 수량 입력' : noPermissionTooltip}
                            className={`w-22 px-1.5 py-1.5 text-center font-black font-mono rounded text-base shadow-inner transition-colors ${
                              !canEdit
                                ? 'bg-slate-200/80 text-slate-500 border border-slate-300 cursor-not-allowed'
                                : isDraftChanged
                                ? 'bg-amber-200 text-amber-950 border-2 border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500'
                                : 'bg-yellow-100 hover:bg-yellow-200 text-slate-950 border border-yellow-400 focus:bg-white focus:ring-2 focus:ring-yellow-500'
                            }`}
                          />

                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => canEdit && handleStepDraftStock(item, +1)}
                            className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm shadow-2xs transition-transform ${
                              canEdit
                                ? 'bg-white hover:bg-yellow-100 border border-yellow-300 text-slate-700 active:scale-95 cursor-pointer'
                                : 'bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed opacity-60'
                            }`}
                            title={canEdit ? '1 증가' : noPermissionTooltip}
                          >
                            <Plus className="w-4 h-4" />
                          </button>

                          <span className="text-xs text-slate-700 font-bold w-9 text-left pl-1 shrink-0">
                            {item.packUnit}
                          </span>
                        </div>

                        {!canEdit ? (
                          <div
                            className="mt-1 flex items-center justify-center gap-1 text-[11px] text-slate-500 font-medium"
                            title={noPermissionTooltip}
                          >
                            <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>본인 담당 수령 품목이 아닙니다</span>
                          </div>
                        ) : isDraftChanged ? (
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

                      <td className="px-3.5 py-3 border-r border-slate-200 text-right whitespace-nowrap">
                        <span className="font-extrabold text-blue-700 font-mono text-base">
                          {formatNumber(draftBaseStock)} {item.baseUnit}
                        </span>
                      </td>

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

                      <td
                        title={!canEdit ? noPermissionTooltip : undefined}
                        className="px-3.5 py-3 whitespace-nowrap text-left"
                      >
                        {isAwaiting ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs text-slate-600 font-semibold">
                                이번입고:
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={!canEdit}
                                readOnly={!canEdit}
                                value={incomingQty}
                                onChange={(e) =>
                                  canEdit &&
                                  setIncomingQty(
                                    item.id,
                                    Number(e.target.value) || 0
                                  )
                                }
                                title={canEdit ? '이번 입고 수량 입력' : noPermissionTooltip}
                                className={`w-16 px-1.5 py-1 text-center text-sm font-bold font-mono rounded shadow-2xs ${
                                  canEdit
                                    ? 'text-amber-900 bg-white border border-amber-400 focus:ring-1 focus:ring-amber-500'
                                    : 'text-slate-400 bg-slate-200 border border-slate-300 cursor-not-allowed'
                                }`}
                              />
                              <span className="text-xs text-slate-600 font-semibold">
                                {item.packUnit}
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => canEdit && handleOpenReceiveModal(item)}
                              className={`px-3 py-1.5 font-bold text-xs rounded shadow-xs transition-all flex items-center gap-1 shrink-0 ${
                                canEdit
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 cursor-pointer'
                                  : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-75'
                              }`}
                              title={
                                canEdit
                                  ? '현재 실사재고와 이번 입고량을 확인 후 전산에 확정 반영합니다'
                                  : noPermissionTooltip
                              }
                            >
                              {canEdit ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <Lock className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {canEdit
                                  ? `합산 입고확정 (총 ${calculatedFinalStock}${item.packUnit})`
                                  : '본인 담당 수령 품목 아님'}
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

        {/* Mobile Dedicated Field Audit Card View */}
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
              const canEdit = canUserEditItem(item);
              const assignedReceiverLabel = getItemReceiverDisplay(item) || '미지정';
              const noPermissionTooltip = `본인 담당 수령 품목이 아닙니다 (담당 수령인: ${assignedReceiverLabel})`;

              return (
                <div
                  key={item.id}
                  title={!canEdit ? noPermissionTooltip : undefined}
                  className={`p-4 transition-colors ${
                    !canEdit
                      ? 'bg-slate-50/90 opacity-85'
                      : isDraftChanged
                      ? 'bg-amber-50/70 border-l-4 border-amber-500'
                      : isAwaiting
                      ? 'bg-sky-50/40 border-l-4 border-sky-400'
                      : item.isAuditDelayed
                      ? 'bg-orange-50/40 border-l-4 border-orange-500'
                      : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] text-slate-400">
                        #{idx + 1}
                      </span>
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

                  <div className="py-1">
                    <div className="text-base font-medium text-slate-800 leading-snug">
                      {item.itemName} {item.spec}
                    </div>
                    <div className="text-[11px] font-medium text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>
                        수령장소: {item.deliveryDetailLocation || item.deliveryLocation || '-'}
                      </span>
                      {getItemReceiverDisplay(item) && (
                        <>
                          <span>·</span>
                          <span className="text-blue-700 font-bold">수령인: {getItemReceiverDisplay(item)}</span>
                        </>
                      )}
                      {item.purpose && (
                        <>
                          <span>·</span>
                          <span className="line-clamp-1">{item.purpose}</span>
                        </>
                      )}
                    </div>
                  </div>

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

                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <ClipboardCheck className="w-3.5 h-3.5 text-blue-600" />
                        현장 실사재고 입력 ({item.packUnit})
                      </span>
                      {!canEdit ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                          <Lock className="w-3 h-3 text-slate-500" />
                          본인 담당 수령 품목이 아닙니다
                        </span>
                      ) : isDraftChanged ? (
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

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => canEdit && handleStepDraftStock(item, -1)}
                        title={canEdit ? '1 감소' : noPermissionTooltip}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-xs transition-transform shrink-0 ${
                          canEdit
                            ? 'bg-white hover:bg-yellow-50 active:bg-yellow-200 border-2 border-yellow-400 text-slate-800 active:scale-95 cursor-pointer'
                            : 'bg-slate-200 border-2 border-slate-300 text-slate-400 cursor-not-allowed'
                        }`}
                        aria-label="1 감소"
                      >
                        <Minus className="w-6 h-6" />
                      </button>

                      <div className="relative flex-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={!canEdit}
                          readOnly={!canEdit}
                          value={currentStockVal === 0 ? '' : currentStockVal}
                          placeholder="0"
                          title={canEdit ? '실사 재고 수량 입력' : noPermissionTooltip}
                          onChange={(e) =>
                            canEdit &&
                            handleSetDraftStock(item.id, Number(e.target.value) || 0)
                          }
                          className={`w-full h-12 text-center font-black font-mono text-xl rounded-xl shadow-inner border-2 transition-all ${
                            !canEdit
                              ? 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed'
                              : isDraftChanged
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
                        disabled={!canEdit}
                        onClick={() => canEdit && handleStepDraftStock(item, +1)}
                        title={canEdit ? '1 증가' : noPermissionTooltip}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-xs transition-transform shrink-0 ${
                          canEdit
                            ? 'bg-white hover:bg-yellow-50 active:bg-yellow-200 border-2 border-yellow-400 text-slate-800 active:scale-95 cursor-pointer'
                            : 'bg-slate-200 border-2 border-slate-300 text-slate-400 cursor-not-allowed'
                        }`}
                        aria-label="1 증가"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>

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
                              disabled={!canEdit}
                              readOnly={!canEdit}
                              value={currentIncomingVal}
                              onChange={(e) =>
                                canEdit &&
                                setIncomingQty(item.id, Number(e.target.value) || 1)
                              }
                              title={canEdit ? '이번 입고 수량 입력' : noPermissionTooltip}
                              className={`w-16 px-2 py-1 text-center font-bold font-mono border-2 rounded-md text-sm ${
                                canEdit
                                  ? 'border-emerald-400 bg-white text-emerald-900 focus:ring-2 focus:ring-emerald-500'
                                  : 'border-slate-300 bg-slate-200 text-slate-400 cursor-not-allowed'
                              }`}
                            />
                            <span className="font-bold text-emerald-900">{item.packUnit}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => canEdit && handleOpenReceiveModal(item)}
                          title={canEdit ? '합산 입고확정' : noPermissionTooltip}
                          className={`w-full py-2.5 px-3 font-bold rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5 transition-transform ${
                            canEdit
                              ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white active:scale-98 cursor-pointer'
                              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {canEdit ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Lock className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {canEdit
                              ? `합산 입고확정 (잔여 ${currentStockVal} + 입고 ${currentIncomingVal} = 최종 ${calculatedFinalStock}${item.packUnit})`
                              : '본인 담당 수령 품목이 아닙니다'}
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

      {/* Confirmation Modal for Receiving */}
      {confirmModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
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

            <div className="p-5 space-y-4">
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
                <div className="flex flex-wrap items-center gap-2 pt-1 text-slate-600 border-t border-slate-200/80">
                  <span>
                    수령장소:{' '}
                    <strong className="text-slate-800">
                      [{confirmModalData.item.line}]{' '}
                      {confirmModalData.item.deliveryDetailLocation ||
                        confirmModalData.item.deliveryLocation ||
                        '-'}
                    </strong>
                  </span>
                  {confirmModalData.item.receiverName && (
                    <span>
                      · 수령담당: <strong className="text-slate-800">{confirmModalData.item.receiverName}</strong>
                    </span>
                  )}
                </div>
              </div>

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

      {/* Mobile Sticky Bottom Floating Save Bar */}
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
