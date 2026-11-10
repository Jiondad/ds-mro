import React, { useState, useMemo } from 'react';
import {
  CalculatedItem,
  CompanyProfile,
  OrderHistoryRecord,
  OrderHistoryStatus,
  UsageLog,
  Vendor,
} from '../types';
import {
  addDaysToDate,
  formatCurrency,
  formatNumber,
  TODAY_STR,
  compareItemsByDefaultOrder,
  isAsanLine,
  isPoseungLine,
  getDeliveryAddressForLine,
  getDefaultReceiverForLine,
} from '../utils/calculations';
import { INITIAL_COMPANY_PROFILE } from '../mockData';
import {
  FileText,
  Printer,
  Copy,
  Check,
  Send,
  Building2,
  Calendar,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronRight,
  Clock,
  Search,
  Trash2,
  Edit2,
  Truck,
  RotateCcw,
  RefreshCw,
  ClipboardList,
  MapPin,
  HelpCircle,
  UserCheck,
  Wallet,
  CheckCircle2,
} from 'lucide-react';
import { EditOrderModal } from './EditOrderModal';
import { EditHistoryModal } from './EditHistoryModal';
import { useUrlPersistedState } from '../utils/urlState';

interface OrderManagementTabProps {
  items: CalculatedItem[];
  vendors: Vendor[];
  orderHistory: OrderHistoryRecord[];
  usageLogs?: UsageLog[];
  companyProfile?: CompanyProfile;
  onConfirmOrder: (
    itemIds: string[],
    orderDate: string,
    expectedArrivalDate: string,
    quantities: Record<string, number>
  ) => void;
  onOpenPOMetaModal: (
    vendor: Vendor,
    items: CalculatedItem[],
    orderDate: string,
    expectedArrivalDate: string
  ) => void;
  onUpdateOrder: (
    itemId: string,
    orderDate: string,
    expectedArrivalDate: string,
    orderedPackQty: number
  ) => void;
  onCancelOrder: (itemId: string) => void;
  onUpdateOrderHistoryRecord: (record: OrderHistoryRecord) => void;
  onDeleteOrderHistoryRecord: (recordId: string) => void;
  onShowToast: (message: string) => void;
}

const VALID_ORDER_SUB_TABS = ['create', 'history'] as const;
const VALID_ORDER_FILTER_MODES = ['needed', 'imminent', 'all'] as const;

export const OrderManagementTab: React.FC<OrderManagementTabProps> = ({
  items,
  vendors,
  orderHistory,
  usageLogs = [],
  companyProfile,
  onConfirmOrder,
  onOpenPOMetaModal,
  onUpdateOrder,
  onCancelOrder,
  onUpdateOrderHistoryRecord,
  onDeleteOrderHistoryRecord,
  onShowToast,
}) => {
  const activeProfile = companyProfile || INITIAL_COMPANY_PROFILE;
  // Main Sub-Tab: 'create' (신규 발주서 작성) vs 'history' (발주 진행 & 이력 관리)
  const [activeSubTab, setActiveSubTab] = useUrlPersistedState<'create' | 'history'>(
    'orderSub',
    'ds_mro_order_sub_tab',
    'create',
    VALID_ORDER_SUB_TABS
  );

  // Modal states for editing
  const [editingOrderItem, setEditingOrderItem] = useState<CalculatedItem | null>(null);
  const [editingHistoryRecord, setEditingHistoryRecord] = useState<OrderHistoryRecord | null>(null);

  // History filtering
  const [historyStatusFilter, setHistoryStatusFilter] = useUrlPersistedState<'전체' | OrderHistoryStatus>(
    'histStatus',
    'ds_mro_order_hist_status',
    '전체'
  );
  const [historySearchQuery, setHistorySearchQuery] = useUrlPersistedState<string>(
    'histQ',
    'ds_mro_order_hist_q',
    ''
  );

  // Mode: Show only items needing order OR imminent OR all items
  const [filterMode, setFilterMode] = useUrlPersistedState<'needed' | 'imminent' | 'all'>(
    'orderMode',
    'ds_mro_order_filter_mode',
    'needed',
    VALID_ORDER_FILTER_MODES
  );

  // Track expanded other items per vendor
  const [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({});

  // Per-vendor order configuration state (orderDate, leadTime, expectedArrivalDate, selected itemIds, custom quantities)
  const [vendorConfig, setVendorConfig] = useState<
    Record<
      string,
      {
        orderDate: string;
        expectedArrivalDate: string;
        selectedItemIds: string[];
        customQuantities: Record<string, number>;
      }
    >
  >(() => {
    // Initialize config for each vendor with urgent items pre-selected
    const initial: Record<string, any> = {};
    vendors.forEach((v) => {
      const orderDate = TODAY_STR;
      const expectedArrivalDate = addDaysToDate(orderDate, v.defaultLeadTime);
      const neededIds = items
        .filter((it) => it.vendorId === v.id && it.needsOrder)
        .map((it) => it.id);

      initial[v.id] = {
        orderDate,
        expectedArrivalDate,
        selectedItemIds: neededIds,
        customQuantities: {},
      };
    });
    return initial;
  });

  const [copiedVendorId, setCopiedVendorId] = useState<string | null>(null);

  const toggleExpandVendor = (vendorId: string) => {
    setExpandedVendors((prev) => ({
      ...prev,
      [vendorId]: !prev[vendorId],
    }));
  };

  // Group items by vendor
  const vendorGroups = vendors.map((vendor) => {
    const allVendorItems = items
      .filter((it) => it.vendorId === vendor.id)
      .sort(compareItemsByDefaultOrder);

    const neededItems = allVendorItems.filter((it) => it.needsOrder);
    const imminentItems = allVendorItems.filter((it) => it.isOrderImminent);
    const isExpanded = !!expandedVendors[vendor.id];

    let displayedItems: CalculatedItem[];
    if (filterMode === 'all' || isExpanded) {
      displayedItems = allVendorItems;
    } else if (filterMode === 'imminent') {
      displayedItems = allVendorItems.filter((it) => it.needsOrder || it.isOrderImminent);
    } else {
      displayedItems = neededItems;
    }

    return {
      vendor,
      allVendorItems,
      displayedItems,
      neededCount: neededItems.length,
      imminentCount: imminentItems.length,
      totalCount: allVendorItems.length,
      hiddenCount: Math.max(0, allVendorItems.length - displayedItems.length),
    };
  });

  // Handle change in order date for a vendor
  const handleOrderDateChange = (vendorId: string, newDate: string) => {
    const v = vendors.find((vend) => vend.id === vendorId);
    const leadTime = v ? v.defaultLeadTime : 3;
    const newExpected = addDaysToDate(newDate, leadTime);

    setVendorConfig((prev) => ({
      ...prev,
      [vendorId]: {
        ...(prev[vendorId] || {
          orderDate: TODAY_STR,
          expectedArrivalDate: newExpected,
          selectedItemIds: [],
          customQuantities: {},
        }),
        orderDate: newDate,
        expectedArrivalDate: newExpected,
      },
    }));
  };

  // Handle manual change in expected arrival date
  const handleExpectedDateChange = (vendorId: string, newArrival: string) => {
    setVendorConfig((prev) => ({
      ...prev,
      [vendorId]: {
        ...(prev[vendorId] || {
          orderDate: TODAY_STR,
          expectedArrivalDate: newArrival,
          selectedItemIds: [],
          customQuantities: {},
        }),
        expectedArrivalDate: newArrival,
      },
    }));
  };

  // Toggle item selection
  const handleToggleItem = (vendorId: string, itemId: string) => {
    setVendorConfig((prev) => {
      const current = prev[vendorId] || {
        orderDate: TODAY_STR,
        expectedArrivalDate: addDaysToDate(TODAY_STR, 3),
        selectedItemIds: [],
        customQuantities: {},
      };
      const isSelected = current.selectedItemIds.includes(itemId);
      const nextSelected = isSelected
        ? current.selectedItemIds.filter((id) => id !== itemId)
        : [...current.selectedItemIds, itemId];

      return {
        ...prev,
        [vendorId]: {
          ...current,
          selectedItemIds: nextSelected,
        },
      };
    });
  };

  // Toggle all visible items for a vendor
  const handleToggleAllForVendor = (vendorId: string, visibleItems: CalculatedItem[]) => {
    setVendorConfig((prev) => {
      const current = prev[vendorId] || {
        orderDate: TODAY_STR,
        expectedArrivalDate: addDaysToDate(TODAY_STR, 3),
        selectedItemIds: [],
        customQuantities: {},
      };
      const allVisibleSelected = visibleItems.every((i) =>
        current.selectedItemIds.includes(i.id)
      );

      let nextSelected: string[];
      if (allVisibleSelected) {
        // Uncheck all visible items
        const visibleIds = visibleItems.map((i) => i.id);
        nextSelected = current.selectedItemIds.filter((id) => !visibleIds.includes(id));
      } else {
        // Add all visible items
        const set = new Set([...current.selectedItemIds, ...visibleItems.map((i) => i.id)]);
        nextSelected = Array.from(set);
      }

      return {
        ...prev,
        [vendorId]: {
          ...current,
          selectedItemIds: nextSelected,
        },
      };
    });
  };

  // Handle quantity adjustment
  const handleQtyChange = (vendorId: string, itemId: string, qty: number) => {
    setVendorConfig((prev) => {
      const current = prev[vendorId] || {
        orderDate: TODAY_STR,
        expectedArrivalDate: addDaysToDate(TODAY_STR, 3),
        selectedItemIds: [],
        customQuantities: {},
      };
      return {
        ...prev,
        [vendorId]: {
          ...current,
          customQuantities: {
            ...current.customQuantities,
            [itemId]: Math.max(1, qty),
          },
        },
      };
    });
  };

  // Get active items to order for vendor
  const getSelectedItemsForVendor = (
    vendor: Vendor,
    vendorAllItems: CalculatedItem[]
  ) => {
    const cfg = vendorConfig[vendor.id];
    const selectedIds = cfg ? cfg.selectedItemIds : [];

    return vendorAllItems
      .filter((it) => selectedIds.includes(it.id))
      .map((it) => {
        const customQty = cfg?.customQuantities[it.id];
        return {
          ...it,
          orderedPackQty: customQty || it.recommendedPackOrderQty,
        };
      });
  };

  // Copy text template
  const handleCopyVendorText = async (
    vendor: Vendor,
    vendorItems: CalculatedItem[]
  ) => {
    const itemsToOrder = getSelectedItemsForVendor(vendor, vendorItems);
    if (itemsToOrder.length === 0) {
      alert('발주할 품목이 선택되지 않았습니다.');
      return;
    }

    const cfg = vendorConfig[vendor.id] || {
      orderDate: TODAY_STR,
      expectedArrivalDate: addDaysToDate(TODAY_STR, vendor.defaultLeadTime),
    };

    const subtotal = itemsToOrder.reduce((sum, it) => {
      const packQty = it.orderedPackQty || it.recommendedPackOrderQty;
      const baseQty = packQty * it.unitConversion;
      return sum + baseQty * it.unitPrice;
    }, 0);
    const vat = Math.round(subtotal * 0.1);
    const total = subtotal + vat;

    const hasAsan = itemsToOrder.some((it) => isAsanLine(it.line));
    const hasPoseung = itemsToOrder.some((it) => isPoseungLine(it.line));
    const factoryAddress =
      hasAsan && !hasPoseung
        ? `아산공장 (${activeProfile.asanAddress})`
        : !hasAsan && hasPoseung
        ? `포승공장 (${activeProfile.poseungAddress})`
        : `[포승] ${activeProfile.poseungAddress} / [아산] ${activeProfile.asanAddress}`;
    const defaultReceiver =
      hasAsan && !hasPoseung
        ? activeProfile.asanDefaultReceiver
        : activeProfile.poseungDefaultReceiver;

    const deliveryLocations = Array.from(
      new Set(
        itemsToOrder
          .map((it) => it.deliveryDetailLocation || it.deliveryLocation)
          .filter(Boolean)
      )
    );
    const deliveryLocationText =
      deliveryLocations.length > 0
        ? deliveryLocations.join(', ')
        : hasAsan && !hasPoseung
        ? '아산공장 SL라인'
        : '포승공장 출하1번홈 (공용포장장)';

    const noteLines = activeProfile.defaultOrderNote
      ? activeProfile.defaultOrderNote.split('\n').filter((l) => l.trim())
      : [
          '납품 시 거래명세서 2부 필히 동봉 바랍니다.',
          '하차 시 현장 도크 이용 바랍니다 (지게차 지원).',
          `발주 문의: ${activeProfile.orderManagerPhone} (${activeProfile.orderManagerDept} ${activeProfile.orderManagerName})`,
        ];

    const lines = [
      `[${activeProfile.companyName} 발주 요청서]`,
      `수신: ${vendor.name} 귀중 (${vendor.contactPerson || '영업부'})`,
      `발신: ${activeProfile.companyName} ${activeProfile.orderManagerDept} (${activeProfile.orderManagerName} / ${activeProfile.orderManagerPhone})`,
      `발주일자: ${cfg.orderDate}`,
      `납기요청일: ${cfg.expectedArrivalDate}`,
      `배송지: ${factoryAddress}`,
      `하역위치: ${deliveryLocationText}`,
      `----------------------------------------`,
      `■ 발주 품목 내역:`,
      ...itemsToOrder.map((it, idx) => {
        const packQty = it.orderedPackQty || it.recommendedPackOrderQty;
        const baseQty = packQty * it.unitConversion;
        const amount = Math.round(baseQty * it.unitPrice);
        const itemReceiver = it.receiverName
          ? `${it.receiverName}${it.receiverPhone ? ` (${it.receiverPhone})` : ''}`
          : defaultReceiver;
        return `${idx + 1}. [${it.line}] ${it.itemName} (${it.spec})\n   - 발주수량: ${packQty} ${it.packUnit} (${formatNumber(baseQty)} ${it.baseUnit})\n   - 단가: ${formatNumber(it.unitPrice)}원 | 공급가: ${formatNumber(amount)}원\n   - 수령담당: ${itemReceiver} | 위치: ${it.deliveryDetailLocation || it.deliveryLocation || '-'}`;
      }),
      `----------------------------------------`,
      `공급가액: ${formatCurrency(subtotal)}`,
      `부가세(10%): ${formatCurrency(vat)}`,
      `총 합계: ${formatCurrency(total)} (VAT포함)`,
      `----------------------------------------`,
      `※ 특기사항:`,
      ...noteLines.map((n, i) => `${i + 1}. ${n}`),
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedVendorId(vendor.id);
      setTimeout(() => setCopiedVendorId(null), 2500);
    } catch {
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  // Submit official order in system
  const handleConfirmOrderForVendor = (
    vendor: Vendor,
    vendorItems: CalculatedItem[]
  ) => {
    const itemsToOrder = getSelectedItemsForVendor(vendor, vendorItems);
    if (itemsToOrder.length === 0) {
      alert('발주할 품목을 선택해주세요.');
      return;
    }

    const cfg = vendorConfig[vendor.id] || {
      orderDate: TODAY_STR,
      expectedArrivalDate: addDaysToDate(TODAY_STR, vendor.defaultLeadTime),
      customQuantities: {},
    };

    const quantities: Record<string, number> = {};
    itemsToOrder.forEach((it) => {
      quantities[it.id] = it.orderedPackQty || it.recommendedPackOrderQty;
    });

    onConfirmOrder(
      itemsToOrder.map((i) => i.id),
      cfg.orderDate,
      cfg.expectedArrivalDate,
      quantities
    );
  };

  // Awaiting items
  const awaitingItems = items.filter((it) => it.orderStatus === '발주완료(입고대기)');

  // Filtered order history
  const filteredHistory = orderHistory.filter((rec) => {
    if (historyStatusFilter !== '전체' && rec.status !== historyStatusFilter) {
      return false;
    }
    if (!historySearchQuery.trim()) return true;
    const q = historySearchQuery.toLowerCase();
    return (
      rec.itemName.toLowerCase().includes(q) ||
      rec.spec.toLowerCase().includes(q) ||
      rec.vendorName.toLowerCase().includes(q) ||
      rec.line.toLowerCase().includes(q) ||
      (rec.deliveryLocation && rec.deliveryLocation.toLowerCase().includes(q)) ||
      (rec.note && rec.note.toLowerCase().includes(q))
    );
  });

  // Single item copy Kakao text
  const handleCopySingleItemKakao = (it: CalculatedItem) => {
    const packQty = it.orderedPackQty || it.recommendedPackOrderQty || 1;
    const baseQty = packQty * (it.unitConversion || 1);
    const totalAmount = baseQty * it.unitPrice;
    const vat = Math.round(totalAmount * 0.1);
    const isAsan = isAsanLine(it.line);
    const factoryAddress = isAsan ? activeProfile.asanAddress : activeProfile.poseungAddress;
    const defaultRec = isAsan ? activeProfile.asanDefaultReceiver : activeProfile.poseungDefaultReceiver;
    const receiver = it.receiverName
      ? `${it.receiverName}${it.receiverPhone ? ` (${it.receiverPhone})` : ''}`
      : defaultRec;
    const location = it.deliveryDetailLocation || it.deliveryLocation || (isAsan ? '아산공장 SL라인' : '포승공장 출하1번홈');

    const text = `[${activeProfile.companyName} 발주 요청]
- 거래처: ${it.vendorName}
- 라인: ${it.line}
- 품목명: ${it.itemName} (${it.spec})
- 발주수량: ${packQty} ${it.packUnit} (환산 ${formatNumber(baseQty)} ${it.baseUnit})
- 발주일자: ${it.orderDate || TODAY_STR}
- 입고예정일: ${it.expectedArrivalDate || '-'}
- 배송지: ${isAsan ? '아산공장' : '포승공장'} (${factoryAddress})
- 하역위치: ${location}
- 수령담당: ${receiver}
- 발주담당: ${activeProfile.orderManagerDept} ${activeProfile.orderManagerName} (${activeProfile.orderManagerPhone})
- 공급가액: ${formatCurrency(totalAmount)}원 / 합계: ${formatCurrency(totalAmount + vat)}원 (VAT포함)
* 트럭 출발 전 도착시간 사전 연락 부탁드립니다.`;
    navigator.clipboard.writeText(text);
    onShowToast(`[${it.itemName}] 발주 내용이 클립보드(카톡용)에 복사되었습니다.`);
  };

  // Single item open PO
  const handleOpenSingleItemPO = (it: CalculatedItem) => {
    const v = vendors.find((vend) => vend.id === it.vendorId) || {
      id: it.vendorId,
      name: it.vendorName,
      defaultLeadTime: it.leadTimeDays,
      isActive: true,
    };
    onOpenPOMetaModal(
      v,
      [it],
      it.orderDate || TODAY_STR,
      it.expectedArrivalDate || TODAY_STR
    );
  };

  // Single item cancel order
  const handleCancelSingleOrder = (it: CalculatedItem) => {
    if (
      window.confirm(
        `[${it.itemName} ${it.spec}] 발주를 취소하시겠습니까?\n\n현장 입고대기 목록에서 즉시 제거되며, 발주대기 상태로 복귀합니다.`
      )
    ) {
      onCancelOrder(it.id);
    }
  };

  // Delete history record
  const handleDeleteHistory = (recordId: string, itemName: string) => {
    if (
      window.confirm(
        `[${itemName}] 발주 이력 레코드를 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      onDeleteOrderHistoryRecord(recordId);
    }
  };

  // [기능 3] 당월(2026-11) 소모품 예산 한도 대비 누적 발주/소모 및 금회 선택 발주액 계산
  const monthlyBudget = activeProfile.monthlyBudget || 5000000;
  const orderBudgetStats = useMemo(() => {
    const novUsageCost = usageLogs
      .filter((l) => l.month === '2026-11')
      .reduce((sum, l) => sum + l.totalCost, 0);

    const novConfirmedOrderCost = orderHistory
      .filter((r) => r.orderDate.startsWith('2026-11') && r.status !== '발주취소')
      .reduce((sum, r) => sum + r.totalAmount, 0);

    const committedSpend = novUsageCost + novConfirmedOrderCost;

    // Currently selected items across all vendors in 'create' tab
    let selectedDraftOrderCost = 0;
    vendors.forEach((v) => {
      const cfg = vendorConfig[v.id];
      const selectedIds = cfg ? cfg.selectedItemIds : [];
      items
        .filter((it) => it.vendorId === v.id && selectedIds.includes(it.id))
        .forEach((it) => {
          const packQty = cfg?.customQuantities[it.id] || it.recommendedPackOrderQty;
          selectedDraftOrderCost += packQty * it.unitConversion * it.unitPrice;
        });
    });

    const projectedTotalSpend = committedSpend + selectedDraftOrderCost;
    const committedPct =
      monthlyBudget > 0 ? Number(((committedSpend / monthlyBudget) * 100).toFixed(1)) : 0;
    const projectedPct =
      monthlyBudget > 0 ? Number(((projectedTotalSpend / monthlyBudget) * 100).toFixed(1)) : 0;

    const isExceeded = projectedPct > 100;
    const isWarning = projectedPct >= 85 && projectedPct <= 100;

    return {
      committedSpend,
      selectedDraftOrderCost,
      projectedTotalSpend,
      committedPct,
      projectedPct,
      isExceeded,
      isWarning,
      remainingAfterOrder: monthlyBudget - projectedTotalSpend,
    };
  }, [usageLogs, orderHistory, vendors, vendorConfig, items, monthlyBudget]);

  return (
    <div className="space-y-5">
      {/* [기능 3] 월별 소모품 예산 한도(Budget) 진척도 프로그레스 바 & 초과 경고 배지 */}
      <div
        className={`rounded-xl border p-4 sm:p-5 shadow-xs transition-all ${
          orderBudgetStats.isExceeded
            ? 'bg-rose-50/90 border-rose-300 ring-1 ring-rose-300'
            : orderBudgetStats.isWarning
            ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-300'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                orderBudgetStats.isExceeded
                  ? 'bg-rose-600 text-white'
                  : orderBudgetStats.isWarning
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-blue-600 text-white'
              }`}
            >
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  당월(11월) 발주 예산 한도 통제 &amp; 시뮬레이션
                </h3>
                {orderBudgetStats.isExceeded ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-rose-600 text-white shadow-2xs animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    🚨 월 예산 한도 초과 경고 ({orderBudgetStats.projectedPct}%)
                  </span>
                ) : orderBudgetStats.isWarning ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-amber-500 text-slate-950 shadow-2xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    ⚠️ 예산 주의 구간 ({orderBudgetStats.projectedPct}% · 85% 초과)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    예산 한도 내 적정 ({orderBudgetStats.projectedPct}%)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {orderBudgetStats.isExceeded
                  ? `현재 체크된 발주 예정 품목을 포함하면 월 예산 한도(${formatCurrency(monthlyBudget)}원)를 ${formatCurrency(Math.abs(orderBudgetStats.remainingAfterOrder))}원 초과합니다. 발주 수량을 조정하거나 필수 품목만 선택하세요.`
                  : orderBudgetStats.isWarning
                  ? `현재 선택된 발주 건 포함 시 월 예산의 85%를 초과합니다. 발주 후 잔여 예산은 ${formatCurrency(orderBudgetStats.remainingAfterOrder)}원입니다.`
                  : `기집행액(${formatCurrency(orderBudgetStats.committedSpend)}원)과 현재 체크된 발주 예정액(${formatCurrency(orderBudgetStats.selectedDraftOrderCost)}원) 합산 시 예산 한도 내 안전 구간입니다.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 bg-white/90 px-3.5 py-2 rounded-lg border border-slate-200/80 text-xs shrink-0">
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">기집행 누적액</span>
              <span className="font-mono font-bold text-slate-800">
                {formatCurrency(orderBudgetStats.committedSpend)}원
              </span>
            </div>
            <span className="text-slate-300 font-bold">+</span>
            <div>
              <span className="text-[10px] text-blue-600 block font-semibold">금회 체크 발주예정</span>
              <span className="font-mono font-bold text-blue-700">
                {formatCurrency(orderBudgetStats.selectedDraftOrderCost)}원
              </span>
            </div>
            <span className="text-slate-300 font-bold">=</span>
            <div>
              <span className="text-[10px] text-slate-500 block font-semibold">발주 후 예상 누적 / 월 한도</span>
              <span
                className={`font-mono font-black text-sm ${
                  orderBudgetStats.isExceeded
                    ? 'text-rose-600'
                    : orderBudgetStats.isWarning
                    ? 'text-amber-700'
                    : 'text-slate-900'
                }`}
              >
                {formatCurrency(orderBudgetStats.projectedTotalSpend)}원
              </span>
              <span className="text-slate-400 font-mono text-xs">
                {' '}/ {formatCurrency(monthlyBudget)}원
              </span>
            </div>
          </div>
        </div>

        {/* Dual-Layer Progress Bar (Committed + Selected Draft) */}
        <div className="space-y-1">
          <div className="w-full h-3.5 bg-slate-200/90 rounded-full overflow-hidden relative flex shadow-inner">
            <div
              style={{ left: '85%' }}
              className="absolute top-0 bottom-0 w-0.5 bg-amber-600/80 z-10"
              title="85% 예산 주의 기준선"
            />
            <div
              style={{ width: `${Math.min(100, orderBudgetStats.committedPct)}%` }}
              className={`h-full transition-all duration-300 ${
                orderBudgetStats.isExceeded
                  ? 'bg-rose-600'
                  : orderBudgetStats.isWarning
                  ? 'bg-amber-500'
                  : 'bg-blue-600'
              }`}
              title={`기집행: ${formatCurrency(orderBudgetStats.committedSpend)}원`}
            />
            {orderBudgetStats.selectedDraftOrderCost > 0 && (
              <div
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100 - orderBudgetStats.committedPct, orderBudgetStats.projectedPct - orderBudgetStats.committedPct)
                  )}%`,
                }}
                className={`h-full transition-all duration-300 ${
                  orderBudgetStats.isExceeded
                    ? 'bg-rose-400 animate-pulse'
                    : orderBudgetStats.isWarning
                    ? 'bg-orange-400'
                    : 'bg-sky-400'
                }`}
                title={`금회 선택 발주예정: ${formatCurrency(orderBudgetStats.selectedDraftOrderCost)}원`}
              />
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>기집행 {orderBudgetStats.committedPct}%</span>
            <span className="text-amber-700 font-bold">▲ 85% 주의선 ({formatCurrency(Math.round(monthlyBudget * 0.85))}원)</span>
            <span className="font-bold text-slate-700">월 한도 100% ({formatCurrency(monthlyBudget)}원)</span>
          </div>
        </div>
      </div>

      {/* 1. Main Sub-tab Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-2xs flex flex-col sm:flex-row gap-1.5">
        <button
          onClick={() => setActiveSubTab('create')}
          className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-bold transition-all ${
            activeSubTab === 'create'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>📝 신규 발주서 작성 (발주필요/합발주)</span>
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-bold transition-all relative ${
            activeSubTab === 'history'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>📋 발주 진행 &amp; 이력 관리 (수정/취소)</span>
          {awaitingItems.length > 0 && (
            <span
              className={`px-2 py-0.5 text-xs font-black rounded-full ${
                activeSubTab === 'history'
                  ? 'bg-white text-blue-700'
                  : 'bg-rose-600 text-white animate-pulse'
              }`}
            >
              진행중 {awaitingItems.length}
            </span>
          )}
        </button>
      </div>

      {/* 2. Sub-Tab 1: 신규 발주서 작성 (기존 화면) */}
      {activeSubTab === 'create' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Controls Banner */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            거래처별 자동 발주서 생성 &amp; 조기 묶음발주(합발주) 관리
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            소모품의 안전재고 부족 항목을 거래처(삼전성림, 덕일휄트, 대일특수강 등)별로 자동 그룹핑하며, 같은 거래처의 임박·여유 품목을 체크하여 묶음 발주할 수 있습니다.
          </p>
        </div>

        {/* Filter Toggle */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setFilterMode('needed')}
            className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
              filterMode === 'needed'
                ? 'bg-rose-600 text-white shadow-xs font-bold'
                : 'text-rose-700 hover:text-rose-900'
            }`}
          >
            발주 필요만 ({items.filter((i) => i.needsOrder).length})
          </button>
          <button
            onClick={() => setFilterMode('imminent')}
            className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
              filterMode === 'imminent'
                ? 'bg-amber-500 text-slate-950 shadow-xs font-extrabold'
                : 'text-amber-800 hover:text-amber-950'
            }`}
          >
            발주 임박 포함 ({items.filter((i) => i.needsOrder || i.isOrderImminent).length})
          </button>
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
              filterMode === 'all'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            전체 품목 보기 ({items.length})
          </button>
        </div>
      </div>

      {/* Vendor Groups List */}
      <div className="space-y-6">
        {vendorGroups.map(
          ({
            vendor,
            allVendorItems,
            displayedItems,
            neededCount,
            imminentCount,
            hiddenCount,
          }) => {
            if (displayedItems.length === 0) return null;

            const cfg = vendorConfig[vendor.id] || {
              orderDate: TODAY_STR,
              expectedArrivalDate: addDaysToDate(TODAY_STR, vendor.defaultLeadTime),
              selectedItemIds: [],
              customQuantities: {},
            };

            const selectedItems = getSelectedItemsForVendor(vendor, allVendorItems);
            const allVisibleSelected =
              displayedItems.length > 0 &&
              displayedItems.every((i) => cfg.selectedItemIds.includes(i.id));

            const groupTotal = selectedItems.reduce((sum, it) => {
              const packQty = it.orderedPackQty || it.recommendedPackOrderQty;
              const baseQty = packQty * it.unitConversion;
              return sum + baseQty * it.unitPrice;
            }, 0);

            const isExpanded = !!expandedVendors[vendor.id];

            return (
              <div
                key={vendor.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Group Header */}
                <div className="bg-slate-900 text-white px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-600/30 border border-blue-400 flex items-center justify-center font-bold text-blue-300 text-xs sm:text-sm shrink-0">
                      {vendor.name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-extrabold text-white">
                          {vendor.name}
                        </h4>
                        <span className="text-[11px] bg-slate-800 text-blue-300 px-2 py-0.5 rounded border border-slate-700">
                          기본납기: {vendor.defaultLeadTime}일
                        </span>
                        {neededCount > 0 && (
                          <span className="text-[11px] bg-rose-600 text-white font-bold px-1.5 py-0.2 rounded">
                            필요 {neededCount}건
                          </span>
                        )}
                        {imminentCount > 0 && (
                          <span className="text-[11px] bg-amber-500 text-slate-950 font-extrabold px-1.5 py-0.2 rounded">
                            임박 {imminentCount}건
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                        담당: {vendor.contactPerson || '-'} · 전화:{' '}
                        {vendor.phone || '-'}
                      </p>
                    </div>
                  </div>

                  {/* Date Selection Box */}
                  <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2.5 text-xs bg-slate-800/80 p-2 sm:p-2.5 rounded-lg border border-slate-700 w-full lg:w-auto">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">발주일자:</span>
                      <input
                        type="date"
                        value={cfg.orderDate}
                        onChange={(e) =>
                          handleOrderDateChange(vendor.id, e.target.value)
                        }
                        className="bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 font-mono text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-blue-300 font-bold">입고예정일:</span>
                      <input
                        type="date"
                        value={cfg.expectedArrivalDate}
                        onChange={(e) =>
                          handleExpectedDateChange(vendor.id, e.target.value)
                        }
                        className="bg-blue-950 text-blue-200 border border-blue-600 rounded px-2 py-1 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Items Table (Desktop: md+) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200 text-sm">
                        <th className="p-3 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={() =>
                              handleToggleAllForVendor(vendor.id, displayedItems)
                            }
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                            title="표시된 품목 전체 선택/해제"
                          />
                        </th>
                        <th className="p-3 w-20 text-center">라인</th>
                        <th className="p-3 min-w-[220px]">품목명 (규격)</th>
                        <th className="p-3 text-center w-24">발주상태</th>
                        <th className="p-3 text-right w-28">현재재고</th>
                        <th className="p-3 text-right w-28">잔여일수</th>
                        <th className="p-3 text-right w-40 bg-blue-50/50 text-blue-950">
                          발주수량(포장단위)
                        </th>
                        <th className="p-3 text-right w-32">환산 기본수량</th>
                        <th className="p-3 text-right w-28">단가</th>
                        <th className="p-3 text-right w-32">공급가액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium text-sm">
                      {displayedItems.map((item) => {
                        const isSelected = cfg.selectedItemIds.includes(item.id);
                        const currentQty =
                          cfg.customQuantities[item.id] !== undefined
                            ? cfg.customQuantities[item.id]
                            : item.recommendedPackOrderQty;
                        const baseQty = currentQty * item.unitConversion;
                        const amount = Math.round(baseQty * item.unitPrice);

                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-50 transition-colors ${
                              isSelected
                                ? 'bg-white'
                                : 'opacity-60 bg-slate-50/80'
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  handleToggleItem(vendor.id, item.id)
                                }
                                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800">
                                {item.line}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="text-sm sm:text-base font-medium text-slate-900 leading-snug">
                                {`${item.itemName} ${item.spec}`}
                              </div>
                              <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 leading-snug">
                                <span>용도: {item.purpose || item.moqDescription}</span>
                                {item.isQtyBased && (
                                  <span className="text-[11px] font-medium px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    수량기준 ({item.triggerPackQty}{item.packUnit}↓)
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 3-tier Urgency Status Badge */}
                            <td className="p-3 text-center whitespace-nowrap">
                              {item.orderStatus === '발주완료(입고대기)' ? (
                                <span className="px-2 py-0.5 bg-sky-100 text-sky-900 rounded font-bold text-xs border border-sky-300">
                                  입고대기중
                                </span>
                              ) : item.orderUrgency === 'urgent' ? (
                                <span className="px-2.5 py-0.5 bg-rose-600 text-white rounded font-extrabold text-xs shadow-xs">
                                  필요
                                </span>
                              ) : item.orderUrgency === 'warning' ? (
                                <span className="px-2.5 py-0.5 bg-amber-500 text-slate-950 rounded font-extrabold text-xs shadow-xs">
                                  임박
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium text-xs border border-slate-300">
                                  여유
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-right font-mono font-bold text-slate-900 text-base">
                              {formatNumber(item.currentPackStock)} {item.packUnit}
                            </td>
                            <td className="p-3 text-right font-mono font-black text-base">
                              {item.isQtyBased && item.dailyUsage === 0 ? (
                                <span className="text-slate-400 font-mono text-xs font-normal">
                                  - (수량기준)
                                </span>
                              ) : (
                                <span
                                  className={
                                    item.needsOrder
                                      ? 'text-rose-600'
                                      : item.isOrderImminent
                                      ? 'text-amber-700 font-extrabold'
                                      : 'text-slate-800 font-bold'
                                  }
                                >
                                  {item.remainingDays === 999
                                    ? '999일+'
                                    : `${item.remainingDays.toFixed(1)}일`}
                                </span>
                              )}
                            </td>
                            {/* Pack Order Qty Input */}
                            <td className="p-2.5 text-right bg-blue-50/30">
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  value={currentQty}
                                  onChange={(e) =>
                                    handleQtyChange(
                                      vendor.id,
                                      item.id,
                                      Number(e.target.value) || 1
                                    )
                                  }
                                  disabled={!isSelected}
                                  className={`w-20 p-1.5 text-right text-base font-black font-mono border rounded shadow-inner ${
                                    isSelected
                                      ? 'text-blue-900 bg-white border-blue-400 focus:ring-2 focus:ring-blue-500'
                                      : 'text-slate-400 bg-slate-100 border-slate-300 cursor-not-allowed'
                                  }`}
                                />
                                <span className="text-xs text-slate-600 font-bold w-9 text-left">
                                  {item.packUnit}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-800 text-sm">
                              {formatNumber(baseQty)} {item.baseUnit}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-600 text-sm">
                              {formatNumber(item.unitPrice)}원
                            </td>
                            <td className="p-3 text-right font-mono font-extrabold text-blue-800 text-base">
                              {formatNumber(amount)}원
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Items Card List (block md:hidden) */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {displayedItems.map((item) => {
                    const isSelected = cfg.selectedItemIds.includes(item.id);
                    const packQty =
                      cfg.customQuantities[item.id] ||
                      item.orderedPackQty ||
                      item.recommendedPackOrderQty;
                    const baseQty = packQty * item.unitConversion;
                    const amount = baseQty * item.unitPrice;

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 transition-colors ${
                          isSelected ? 'bg-blue-50/30' : 'bg-white opacity-80'
                        }`}
                      >
                        {/* Top: Selection Checkbox + Line + Badges */}
                        <div className="flex items-center justify-between gap-2 pb-1.5">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleItem(vendor.id, item.id)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-700">
                              [{item.line}]
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              {item.categoryName}
                            </span>
                          </label>

                          <div className="flex items-center gap-1">
                            {item.needsOrder ? (
                              <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-extrabold text-[10px]">
                                발주요망
                              </span>
                            ) : item.isOrderImminent ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-extrabold text-[10px]">
                                발주임박
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[10px]">
                                정상
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle: Item Name + Spec */}
                        <div className="pl-6 py-1">
                          <div className="text-sm font-medium text-slate-900 leading-snug">
                            {item.itemName} {item.spec}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>
                              현재고:{' '}
                              <strong className="font-mono text-slate-700">
                                {formatNumber(item.currentPackStock)}
                                {item.packUnit}
                              </strong>{' '}
                              ({formatNumber(item.currentBaseStock)}
                              {item.baseUnit})
                            </span>
                            <span>·</span>
                            <span>
                              {item.isQtyBased && item.dailyUsage === 0
                                ? `기준: ${item.triggerPackQty}${item.packUnit} 이하`
                                : `잔여: ${item.remainingDays.toFixed(1)}일`}
                            </span>
                          </div>
                        </div>

                        {/* Bottom: Pack Qty Stepper & Pricing */}
                        <div className="pl-6 pt-2 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-600 font-medium">발주:</span>
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => handleQtyChange(vendor.id, item.id, packQty - 1)}
                                className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-l border border-slate-300 flex items-center justify-center font-bold text-slate-700 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={packQty}
                                onChange={(e) =>
                                  handleQtyChange(vendor.id, item.id, Number(e.target.value) || 1)
                                }
                                className="w-14 h-8 text-center font-bold font-mono text-xs border-y border-slate-300 bg-white text-blue-900"
                              />
                              <button
                                type="button"
                                onClick={() => handleQtyChange(vendor.id, item.id, packQty + 1)}
                                className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-r border border-slate-300 flex items-center justify-center font-bold text-slate-700 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                            <span className="text-xs font-semibold text-slate-700">
                              {item.packUnit}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({formatNumber(baseQty)}{item.baseUnit})
                            </span>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-blue-800">
                              {formatNumber(amount)}원
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              단가: {formatNumber(item.unitPrice)}원
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Expand / Fold Same-Vendor Early Order Items */}
                {hiddenCount > 0 && (
                  <div className="p-3 bg-amber-50/50 border-t border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpandVendor(vendor.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded shadow-xs transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span>
                        + 같은 거래처의 임박/정상 품목 추가 (조기 합발주) ({hiddenCount}건)
                      </span>
                    </button>
                    <span className="text-[11px] text-slate-600 font-medium">
                      동일 배송차량에 묶음발주하여 물류비 절감 및 품절을 사전 예방합니다.
                    </span>
                  </div>
                )}

                {isExpanded && hiddenCount === 0 && allVendorItems.length > neededCount && (
                  <div className="p-2.5 bg-blue-50/50 border-t border-blue-100 flex items-center justify-between text-xs">
                    <span className="text-blue-900 font-medium text-[11px]">
                      * 체크박스를 선택한 품목만 발주서(PO) 및 전산 확정에 포함됩니다.
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpandVendor(vendor.id)}
                      className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-semibold px-2.5 py-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>조기 합발주 목록 접기</span>
                    </button>
                  </div>
                )}

                {/* Group Footer Controls */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                  <div className="text-xs text-slate-700">
                    선택 품목: <strong className="text-slate-900">{selectedItems.length}</strong>종 / 예상
                    공급총액:{' '}
                    <strong className="text-sm font-mono text-blue-800">
                      {formatCurrency(groupTotal)}
                    </strong>{' '}
                    <span className="text-slate-500 text-[11px]">(VAT 별도)</span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                    {/* Clipboard Text Copy */}
                    <button
                      onClick={() => handleCopyVendorText(vendor, allVendorItems)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer w-full sm:w-auto active:scale-98"
                    >
                      {copiedVendorId === vendor.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span>
                        {copiedVendorId === vendor.id
                          ? '복사 완료!'
                          : '카톡/문자 텍스트 복사'}
                      </span>
                    </button>

                    {/* A4 Printable PO Modal */}
                    <button
                      onClick={() =>
                        onOpenPOMetaModal(
                          vendor,
                          selectedItems,
                          cfg.orderDate,
                          cfg.expectedArrivalDate
                        )
                      }
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer w-full sm:w-auto active:scale-98"
                    >
                      <Printer className="w-4 h-4" />
                      <span>공식 발주서(PO) A4 미리보기 &amp; 인쇄</span>
                    </button>

                    {/* Confirm Order in System */}
                    <button
                      onClick={() => handleConfirmOrderForVendor(vendor, allVendorItems)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer w-full sm:w-auto active:scale-98"
                    >
                      <Send className="w-4 h-4" />
                      <span>발주 확정 &amp; 입고예정 등록</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }
        )}

        {vendorGroups.every((g) => g.displayedItems.length === 0) && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <Check className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
            <h4 className="text-base font-bold text-slate-800">
              {filterMode === 'needed'
                ? '현재 안전재고 미달(발주 필요) 소모품이 없습니다!'
                : '조건에 해당하는 소모품이 없습니다.'}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              조기 묶음발주(합발주)를 진행하려면 아래 버튼을 눌러 임박 품목 또는 전체 품목을 확인하세요.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setFilterMode('imminent')}
                className="px-4 py-2 text-xs font-bold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors"
              >
                발주 임박 품목 보기
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className="px-4 py-2 text-xs font-semibold text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
              >
                전체 품목 목록 보기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )}

  {/* 3. Sub-Tab 2: 발주 진행 & 이력 관리 (수정/취소/이력) */}
  {activeSubTab === 'history' && (
    <div className="space-y-6 animate-fade-in">
      {/* ========================================================================= */}
      {/* SECTION A: 현재 현장 입고대기 중인 발주 건 관리 (수정 / 취소 / 재발행) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-sky-50 to-blue-50/60 border-b border-sky-100 p-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-2xs">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  🚚 현재 입고대기 중인 발주 건 관리 (수정 / 취소 / 재발행)
                </h3>
                <span className="px-2 py-0.5 text-xs font-black rounded-full bg-blue-600 text-white">
                  {awaitingItems.length}건
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                공급처에 발주서 발행 후 트럭 도착 대기 중인 품목입니다. 발주 수량, 입고예정일을 수정하거나 필요 시 발주를 취소할 수 있습니다.
              </p>
            </div>
          </div>
        </div>

        {awaitingItems.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Check className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
            <p className="text-sm font-bold text-slate-700">현재 입고 대기 중인 발주 건이 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">
              모든 발주 품목의 입고가 완료되었습니다. 새 발주를 넣으려면 상단의 [신규 발주서 작성] 탭을 이용하세요.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-800 text-sm">
                  <tr>
                    <th className="py-3 px-3.5 text-center w-14 whitespace-nowrap">No.</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">발주일자</th>
                    <th className="py-3 px-3.5 text-center whitespace-nowrap">입고예정일</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">라인</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">카테고리</th>
                    <th className="py-3 px-3.5 whitespace-nowrap min-w-[220px]">품목명 &amp; 규격</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">거래처</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">발주수량(포장·환산)</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">발주금액</th>
                    <th className="py-3 px-3.5 text-center whitespace-nowrap">납품장소</th>
                    <th className="py-3 px-3.5 text-center whitespace-nowrap min-w-[210px]">관리 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {awaitingItems.map((item, idx) => {
                    const packQty = item.orderedPackQty || 1;
                    const baseQty = packQty * (item.unitConversion || 1);
                    const totalAmount = baseQty * item.unitPrice;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3.5 text-center font-mono text-slate-400 whitespace-nowrap">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-slate-800 font-bold whitespace-nowrap">
                          {item.orderDate || item.lastOrderDate || TODAY_STR}
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-50 border border-sky-200">
                            <span className="font-mono font-bold text-blue-900">
                              {item.expectedArrivalDate || '-'}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-extrabold text-xs leading-tight ${
                                item.dDayStatus === 'today'
                                  ? 'bg-red-600 text-white animate-pulse'
                                  : item.dDayStatus === 'overdue'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-blue-600 text-white'
                              }`}
                            >
                              {item.dDayText}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800">
                            {item.line}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-slate-800 font-medium whitespace-nowrap">
                          {item.categoryName}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="text-sm sm:text-base font-medium text-slate-900 leading-snug">
                            {item.itemName} {item.spec}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200 text-xs">
                            {item.vendorName}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono whitespace-nowrap">
                          <span className="font-extrabold text-slate-900 text-base">
                            {packQty} {item.packUnit}
                          </span>
                          <span className="text-xs text-slate-500 block">
                            (환산 {formatNumber(baseQty)} {item.baseUnit})
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-extrabold text-blue-700 text-base whitespace-nowrap">
                          {formatCurrency(totalAmount)}원
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                            {item.deliveryDetailLocation || item.deliveryLocation || '포승공장 출하1번홈'}
                          </span>
                          {item.receiverName && (
                            <span className="text-xs text-slate-500 block mt-0.5 font-medium">
                              수령: {item.receiverName}{item.receiverPhone ? ` (${item.receiverPhone})` : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingOrderItem(item)}
                              className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors shadow-2xs"
                              title="발주일자/입고예정일/발주수량 수정"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopySingleItemKakao(item)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-2xs"
                              title="카카오톡/문자용 발주내용 복사"
                            >
                              카톡
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenSingleItemPO(item)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-2xs"
                              title="발주서(PO) 다시 인쇄"
                            >
                              인쇄
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelSingleOrder(item)}
                              className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition-colors shadow-2xs"
                              title="발주 취소 (발주대기로 복구)"
                            >
                              발주취소
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (block md:hidden) */}
            <div className="block md:hidden divide-y divide-slate-200">
              {awaitingItems.map((item) => {
                const packQty = item.orderedPackQty || 1;
                const baseQty = packQty * (item.unitConversion || 1);
                const totalAmount = baseQty * item.unitPrice;

                return (
                  <div key={item.id} className="p-4 space-y-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                            {item.line}
                          </span>
                          <span className="text-xs text-slate-500">{item.categoryName}</span>
                          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {item.vendorName}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-slate-900 mt-1 leading-snug">
                          {item.itemName} {item.spec}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded font-black text-[10px] ${
                          item.dDayStatus === 'today'
                            ? 'bg-red-600 text-white animate-pulse'
                            : item.dDayStatus === 'overdue'
                            ? 'bg-rose-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {item.dDayText}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-400 block text-[10px]">발주일 → 입고예정</span>
                        <span className="font-mono text-slate-800 font-bold">
                          {item.orderDate || item.lastOrderDate} → {item.expectedArrivalDate}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">발주수량 (금액)</span>
                        <span className="font-mono font-bold text-blue-700">
                          {packQty} {item.packUnit} ({formatCurrency(totalAmount)}원)
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block text-[10px]">납품장소 / 수령담당</span>
                        <div className="flex items-center justify-between text-xs gap-1">
                          <span className="font-medium text-slate-700 truncate">
                            {item.deliveryDetailLocation || item.deliveryLocation || '포승공장 출하1번홈'}
                          </span>
                          {item.receiverName && (
                            <span className="font-bold text-slate-600 shrink-0 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.receiverName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mobile Actions */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingOrderItem(item)}
                        className="py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 text-center"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopySingleItemKakao(item)}
                        className="py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-center"
                      >
                        카톡
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenSingleItemPO(item)}
                        className="py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-center"
                      >
                        PO인쇄
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelSingleOrder(item)}
                        className="py-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 text-center"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION B: 전체 발주 이력 히스토리 (Order History Log) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header & Filter Controls */}
        <div className="p-4 sm:px-6 border-b border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-slate-700" />
              <h3 className="text-base font-extrabold text-slate-900">
                📑 전체 발주 이력 히스토리 (Order History Log)
              </h3>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-600">
                총 {orderHistory.length}건
              </span>
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="품목명, 거래처, 규격 검색..."
                className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(['전체', '입고대기', '입고완료', '발주취소'] as const).map((st) => {
              const count =
                st === '전체'
                  ? orderHistory.length
                  : orderHistory.filter((r) => r.status === st).length;
              const isActive = historyStatusFilter === st;

              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setHistoryStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    isActive
                      ? st === '입고대기'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : st === '입고완료'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : st === '발주취소'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* History Table Desktop (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-800 text-sm">
              <tr>
                <th className="py-3 px-3.5 text-center w-14 whitespace-nowrap">No.</th>
                <th className="py-3 px-3.5 whitespace-nowrap">발주일자</th>
                <th className="py-3 px-3.5 whitespace-nowrap">입고(예정)일</th>
                <th className="py-3 px-3.5 whitespace-nowrap">거래처</th>
                <th className="py-3 px-3.5 whitespace-nowrap">라인</th>
                <th className="py-3 px-3.5 whitespace-nowrap min-w-[220px]">품목명 &amp; 규격</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">발주수량</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">총금액</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">납품장소</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">상태</th>
                <th className="py-3 px-3.5 whitespace-nowrap">비고</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap w-24">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-400">
                    조건에 해당하는 발주 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((rec, idx) => {
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3.5 text-center font-mono text-slate-400 whitespace-nowrap">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {rec.orderDate}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                        {rec.completedDate
                          ? `${rec.completedDate} (${rec.status === '입고완료' ? '입고' : '취소'})`
                          : `${rec.expectedArrivalDate} (예정)`}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200 text-xs">
                          {rec.vendorName}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800">
                          {rec.line}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="text-sm sm:text-base font-medium text-slate-900 leading-snug">
                          {rec.itemName} {rec.spec}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-extrabold text-base text-slate-900 whitespace-nowrap">
                        {rec.orderedPackQty} {rec.packUnit}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-extrabold text-base text-slate-900 whitespace-nowrap">
                        {formatCurrency(rec.totalAmount)}원
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                          {rec.deliveryLocation || '포승공장 출하1번홈'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 text-xs font-bold rounded ${
                            rec.status === '입고대기'
                              ? 'bg-sky-100 text-sky-800 border border-sky-300'
                              : rec.status === '입고완료'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-500 max-w-xs truncate text-xs" title={rec.note || ''}>
                        {rec.note || '-'}
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingHistoryRecord(rec)}
                            title="이력 수정"
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHistory(rec.id, rec.itemName)}
                            title="이력 삭제"
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* History Mobile Cards (block md:hidden) */}
        <div className="block md:hidden divide-y divide-slate-200">
          {filteredHistory.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              조건에 해당하는 발주 이력이 없습니다.
            </div>
          ) : (
            filteredHistory.map((rec) => {
              return (
                <div key={rec.id} className="p-4 space-y-2.5 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                          {rec.line}
                        </span>
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {rec.vendorName}
                        </span>
                        <span
                          className={`px-2 py-0.2 text-[10px] font-bold rounded ${
                            rec.status === '입고대기'
                              ? 'bg-sky-100 text-sky-800 border border-sky-300'
                              : rec.status === '입고완료'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-900 mt-1 leading-snug">
                        {rec.itemName} {rec.spec}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingHistoryRecord(rec)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHistory(rec.id, rec.itemName)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-slate-400 block text-[10px]">발주일 → 완료/예정</span>
                      <span className="font-mono text-slate-800 font-bold">
                        {rec.orderDate} → {rec.completedDate || rec.expectedArrivalDate}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">발주수량 (총금액)</span>
                      <span className="font-mono font-bold text-blue-700">
                        {rec.orderedPackQty} {rec.packUnit} ({formatCurrency(rec.totalAmount)}원)
                      </span>
                    </div>
                    {rec.note && (
                      <div className="col-span-2 text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                        비고: {rec.note}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  )}

  {/* Edit Order Modal (For Awaiting Items) */}
  <EditOrderModal
    item={editingOrderItem}
    isOpen={!!editingOrderItem}
    onClose={() => setEditingOrderItem(null)}
    onSaveOrder={onUpdateOrder}
    onCancelOrder={onCancelOrder}
  />

  {/* Edit History Modal (For Historical Records) */}
  <EditHistoryModal
    record={editingHistoryRecord}
    isOpen={!!editingHistoryRecord}
    onClose={() => setEditingHistoryRecord(null)}
    onSave={onUpdateOrderHistoryRecord}
  />
</div>
);
};
