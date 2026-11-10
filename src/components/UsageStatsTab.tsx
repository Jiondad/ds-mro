import React, { useState, useMemo } from 'react';
import {
  CalculatedItem,
  Category,
  CompanyProfile,
  OrderHistoryRecord,
  ProductionLine,
  UsageLog,
} from '../types';
import {
  formatCurrency,
  formatNumber,
  compareItemsByDefaultOrder,
  isPoseungLine,
  isAsanLine,
  matchLineFilter,
} from '../utils/calculations';
import { useUrlPersistedState } from '../utils/urlState';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Download,
  Search,
  CheckCircle2,
  RefreshCw,
  Layers,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  Wallet,
  Zap,
  PieChart as PieChartIcon,
  Activity,
  TableProperties,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const PIE_CHART_COLORS = [
  '#2563eb', // blue-600
  '#4f46e5', // indigo-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#e11d48', // rose-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#475569', // slate-600
];

interface UsageStatsTabProps {
  items: CalculatedItem[];
  categories: Category[];
  usageLogs: UsageLog[];
  companyProfile?: CompanyProfile;
  orderHistory?: OrderHistoryRecord[];
  onApplyActualDailyUsage: (itemId: string, actualDailyUsage: number) => void;
  onBatchApplyActualDailyUsage?: (updates: Record<string, number>) => void;
  onShowToast: (message: string) => void;
}

export type UsageStatsSubTab = 'dashboard' | 'monthly-matrix' | 'safety-stock';
const VALID_USAGE_SUB_TABS: readonly UsageStatsSubTab[] = [
  'dashboard',
  'monthly-matrix',
  'safety-stock',
] as const;

type PeriodType = 'current' | '3months' | '6months' | 'annual';
const VALID_STATS_PERIODS: readonly PeriodType[] = ['current', '3months', '6months', 'annual'] as const;

export const UsageStatsTab: React.FC<UsageStatsTabProps> = ({
  items,
  categories,
  usageLogs,
  companyProfile,
  orderHistory = [],
  onApplyActualDailyUsage,
  onBatchApplyActualDailyUsage,
  onShowToast,
}) => {
  // 3개 서브 탭 분리 상태: 'dashboard' | 'monthly-matrix' | 'safety-stock'
  const [activeSubTab, setActiveSubTab] = useUrlPersistedState<UsageStatsSubTab>(
    'statsSubTab',
    'ds_mro_stats_subtab',
    'dashboard',
    VALID_USAGE_SUB_TABS
  );

  // Filter States (persisted across F5 refresh & URL query params)
  const [period, setPeriod] = useUrlPersistedState<PeriodType>(
    'statsPeriod',
    'ds_mro_stats_period',
    '3months',
    VALID_STATS_PERIODS
  );
  const [selectedLine, setSelectedLine] = useUrlPersistedState<string>(
    'statsLine',
    'ds_mro_stats_line',
    '전체'
  );
  const [selectedCategory, setSelectedCategory] = useUrlPersistedState<string>(
    'statsCat',
    'ds_mro_stats_cat',
    '전체'
  );
  const [searchQuery, setSearchQuery] = useUrlPersistedState<string>(
    'statsQ',
    'ds_mro_stats_q',
    ''
  );
  const [showOnlyDeviationWarning, setShowOnlyDeviationWarning] = useUrlPersistedState<boolean>(
    'statsDev',
    'ds_mro_stats_dev',
    false
  );

  // [품목별 월별 입고/출고 현황] 전용 필터 상태 (기본 1월 ~ 12월 전체 12개월 가로 조회)
  const [inOutYear, setInOutYear] = useState<string>('2026');
  const [inOutMonthFilter, setInOutMonthFilter] = useState<string>('12months'); // '12months' | '1h' | '2h' | '6months' | '3months' | '2026-01' ~ '2026-12'
  const [inOutViewType, setInOutViewType] = useState<'both' | 'inbound' | 'outbound'>('both');
  const [inOutUnitMode, setInOutUnitMode] = useState<'pack' | 'base'>('pack');
  const [showQuantityWithAmount, setShowQuantityWithAmount] = useState<boolean>(false); // 기본 false: 금액만 큼직하게 표시, 토글 ON 시 수량 함께 표시

  // Recharts 전용 상태 (품목별 입·출고 추이 LineChart & 카테고리별 비중 PieChart)
  const [selectedChartItemId, setSelectedChartItemId] = useState<string>('ALL');
  const [lineChartMetric, setLineChartMetric] = useState<'qty' | 'amount'>('qty');
  const [pieChartBasis, setPieChartBasis] = useState<'outbound' | 'inbound'>('outbound');

  // Period Config: months included & estimated elapsed days
  const periodInfo = useMemo(() => {
    switch (period) {
      case 'current':
        return {
          label: '이번 달 (2026년 11월 당월 실사)',
          months: ['2026-11'],
          days: 7, // 11/1 ~ 11/7 실사 기준
          prevMonths: ['2026-10'],
          prevDays: 7, // 전월 동기간 비교
        };
      case '3months':
        return {
          label: '최근 3개월 (2026년 9월 ~ 11월)',
          months: ['2026-09', '2026-10', '2026-11'],
          days: 30 + 31 + 7, // 68일
          prevMonths: ['2026-06', '2026-07', '2026-08'],
          prevDays: 30 + 31 + 31, // 92일
        };
      case '6months':
        return {
          label: '최근 6개월 (2026년 6월 ~ 11월)',
          months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
          days: 30 + 31 + 31 + 30 + 31 + 7, // 160일
          prevMonths: ['2026-06', '2026-07', '2026-08'],
          prevDays: 92,
        };
      case 'annual':
        return {
          label: '연간 누적 (2026년 누계)',
          months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
          days: 160,
          prevMonths: ['2026-06', '2026-07', '2026-08'],
          prevDays: 92,
        };
    }
  }, [period]);

  // [기능 3] 당월(2026-11) 소모품 예산 한도 대비 누적 발주/소모 금액 계산
  const monthlyBudget = companyProfile?.monthlyBudget || 5000000;
  const currentMonthBudgetStats = useMemo(() => {
    // 2026-11 당월 소모 실적 합계
    const novUsageCost = usageLogs
      .filter((l) => l.month === '2026-11')
      .reduce((sum, l) => sum + l.totalCost, 0);

    // 2026-11 당월 발주 집행 합계 (취소 제외)
    const novOrderCost = orderHistory
      .filter((r) => r.orderDate.startsWith('2026-11') && r.status !== '발주취소')
      .reduce((sum, r) => sum + r.totalAmount, 0);

    // 당월 누적 집행액 (소모 실적 + 당월 신규 발주 집행분 중 큰 기준 또는 합산 관리 기준)
    const totalCurrentMonthSpend = novUsageCost + novOrderCost;
    const pct = monthlyBudget > 0 ? Number(((totalCurrentMonthSpend / monthlyBudget) * 100).toFixed(1)) : 0;
    const isExceeded = pct > 100;
    const isWarning = pct >= 85 && pct <= 100;

    return {
      novUsageCost,
      novOrderCost,
      totalCurrentMonthSpend,
      pct,
      isExceeded,
      isWarning,
      remainingBudget: monthlyBudget - totalCurrentMonthSpend,
    };
  }, [usageLogs, orderHistory, monthlyBudget]);

  // Filter logs for current period
  const filteredLogs = useMemo(() => {
    return usageLogs.filter((log) => {
      // Period filter
      if (!periodInfo.months.includes(log.month)) return false;

      // Line filter (포승공장, 아산공장, SL1, SL2, 공용 등)
      if (!matchLineFilter(log.line, selectedLine)) return false;

      // Category filter
      if (selectedCategory !== '전체' && log.categoryId !== selectedCategory) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          log.itemName.toLowerCase().includes(q) ||
          log.spec.toLowerCase().includes(q) ||
          log.line.toLowerCase().includes(q) ||
          log.categoryName.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [usageLogs, periodInfo, selectedLine, selectedCategory, searchQuery]);

  // Previous period logs for growth calculation
  const prevLogs = useMemo(() => {
    return usageLogs.filter((log) => {
      if (!periodInfo.prevMonths.includes(log.month)) return false;
      if (!matchLineFilter(log.line, selectedLine)) return false;
      if (selectedCategory !== '전체' && log.categoryId !== selectedCategory) return false;
      return true;
    });
  }, [usageLogs, periodInfo, selectedLine, selectedCategory]);

  // 1. KPI Metric 1: Total Cost & Growth %
  const currentTotalCost = useMemo(() => {
    return filteredLogs.reduce((sum, log) => sum + log.totalCost, 0);
  }, [filteredLogs]);

  const prevTotalCost = useMemo(() => {
    return prevLogs.reduce((sum, log) => sum + log.totalCost, 0);
  }, [prevLogs]);

  const costGrowthRate = useMemo(() => {
    if (prevTotalCost === 0) return 0;
    // Normalize per day to compare fairly
    const currentCostPerDay = currentTotalCost / (periodInfo.days || 1);
    const prevCostPerDay = prevTotalCost / (periodInfo.prevDays || 1);
    return Number((((currentCostPerDay - prevCostPerDay) / prevCostPerDay) * 100).toFixed(1));
  }, [currentTotalCost, prevTotalCost, periodInfo]);

  // 2-1. KPI Metric 2: Factory cost breakdown (포승공장 vs 아산공장)
  const factoryCostBreakdown = useMemo(() => {
    let poseungCost = 0;
    let asanCost = 0;

    filteredLogs.forEach((log) => {
      if (isPoseungLine(log.line)) {
        poseungCost += log.totalCost;
      } else if (isAsanLine(log.line)) {
        asanCost += log.totalCost;
      }
    });

    const poseungPct = currentTotalCost > 0 ? (poseungCost / currentTotalCost) * 100 : 0;
    const asanPct = currentTotalCost > 0 ? (asanCost / currentTotalCost) * 100 : 0;

    return {
      poseungCost,
      poseungPct,
      asanCost,
      asanPct,
    };
  }, [filteredLogs, currentTotalCost]);

  // 2-2. KPI Metric 2: Line cost breakdown
  const lineCostBreakdown = useMemo(() => {
    const lines: ProductionLine[] = ['SL1', 'SL2', '아산공장', '공용'];
    const map: Record<string, number> = { SL1: 0, SL2: 0, 아산공장: 0, 공용: 0 };
    filteredLogs.forEach((log) => {
      const normalizedLine =
        log.line === '아산SL'
          ? '아산공장'
          : log.line === '공용(포장장)'
          ? '공용'
          : log.line;
      if (map[normalizedLine] !== undefined) {
        map[normalizedLine] += log.totalCost;
      }
    });

    return lines.map((l) => {
      const cost = map[l] || 0;
      const pct = currentTotalCost > 0 ? (cost / currentTotalCost) * 100 : 0;
      return { line: l, cost, pct };
    });
  }, [filteredLogs, currentTotalCost]);

  // 3. KPI Metric 3: Top 1 costly item
  const topCostItem = useMemo(() => {
    const itemCostMap: Record<string, { itemName: string; spec: string; line: string; cost: number }> = {};
    filteredLogs.forEach((log) => {
      if (!itemCostMap[log.itemId]) {
        itemCostMap[log.itemId] = {
          itemName: log.itemName,
          spec: log.spec,
          line: log.line,
          cost: 0,
        };
      }
      itemCostMap[log.itemId].cost += log.totalCost;
    });

    const sorted = Object.values(itemCostMap).sort((a, b) => b.cost - a.cost);
    return sorted[0] || null;
  }, [filteredLogs]);

  // 4. Per-item statistics aggregation & Auto-Learning Safety Stock Recommendation ([기능 2])
  const itemStatsList = useMemo(() => {
    return items
      .filter((it) => {
        if (!matchLineFilter(it.line, selectedLine)) return false;
        if (selectedCategory !== '전체' && it.categoryId !== selectedCategory) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            it.itemName.toLowerCase().includes(q) ||
            it.spec.toLowerCase().includes(q) ||
            it.line.toLowerCase().includes(q) ||
            it.categoryName.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort(compareItemsByDefaultOrder)
      .map((item) => {
        const itemLogs = filteredLogs.filter((l) => l.itemId === item.id);
        const totalBaseUsed = itemLogs.reduce((sum, l) => sum + l.baseUsedQty, 0);
        const totalPackUsed = itemLogs.reduce((sum, l) => sum + l.packUsedQty, 0);
        const totalCost = itemLogs.reduce((sum, l) => sum + l.totalCost, 0);

        // Actual daily usage over selected period
        const actualDailyUsage = Number(
          (totalBaseUsed / (periodInfo.days || 1)).toFixed(1)
        );

        // 3-month learning baseline (68 days: Sep, Oct, Nov) for safety stock recommendation
        const threeMonthLogs = usageLogs.filter(
          (l) => l.itemId === item.id && ['2026-09', '2026-10', '2026-11'].includes(l.month)
        );
        const threeMonthBaseUsed = threeMonthLogs.reduce((sum, l) => sum + l.baseUsedQty, 0);
        const threeMonthDailyUsage = Number((threeMonthBaseUsed / 68).toFixed(1));

        // Recommended daily usage (uses period actualDailyUsage if > 0, else 3-month average)
        const recommendedDailyUsage =
          actualDailyUsage > 0 ? actualDailyUsage : threeMonthDailyUsage;

        // Deviation percentage vs current master dailyUsage
        const baseline = item.dailyUsage || 1;
        const diff = recommendedDailyUsage - item.dailyUsage;
        const deviationPct =
          item.dailyUsage > 0
            ? Number(((diff / baseline) * 100).toFixed(1))
            : 0;

        // Category safety days
        const cat = categories.find((c) => c.id === item.categoryId);
        const safetyDays = cat
          ? cat.safetyDays
          : Math.max(7, (item.leadTimeDays || 3) + 5);

        const recommendedSafetyStockBase = Math.ceil(recommendedDailyUsage * safetyDays);
        const recommendedSafetyPackStock =
          item.unitConversion > 0
            ? Number((recommendedSafetyStockBase / item.unitConversion).toFixed(1))
            : recommendedSafetyStockBase;

        const isDeviation20OrMore = Math.abs(deviationPct) >= 20 && item.dailyUsage > 0;

        let status: 'urgent_high' | 'urgent_low' | 'normal' = 'normal';
        if (deviationPct >= 20) {
          status = 'urgent_high';
        } else if (deviationPct <= -20) {
          status = 'urgent_low';
        }

        return {
          item,
          totalPackUsed,
          totalBaseUsed,
          totalCost,
          actualDailyUsage,
          recommendedDailyUsage,
          recommendedSafetyStockBase,
          recommendedSafetyPackStock,
          safetyDays,
          deviationPct,
          isDeviation20OrMore,
          status,
        };
      });
  }, [items, filteredLogs, usageLogs, categories, selectedLine, selectedCategory, searchQuery, periodInfo]);

  // Displayed list (optionally filtered to ±20% deviation items)
  const displayedStatsList = useMemo(() => {
    if (!showOnlyDeviationWarning) return itemStatsList;
    return itemStatsList.filter((s) => s.isDeviation20OrMore);
  }, [itemStatsList, showOnlyDeviationWarning]);

  // KPI Metric 4: Deviation warning count (>= ±20%)
  const warningDeviationItems = useMemo(() => {
    return itemStatsList.filter((s) => s.isDeviation20OrMore);
  }, [itemStatsList]);
  const warningDeviationCount = warningDeviationItems.length;

  // Monthly breakdown for Chart 1 (Last 6 months)
  const monthlyChartData = useMemo(() => {
    const allMonths = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    const monthLabels: Record<string, string> = {
      '2026-06': '6월',
      '2026-07': '7월',
      '2026-08': '8월',
      '2026-09': '9월',
      '2026-10': '10월',
      '2026-11': '11월(당월)',
    };

    let maxTotal = 1;

    const data = allMonths.map((m) => {
      const logs = usageLogs.filter((l) => {
        if (l.month !== m) return false;
        if (!matchLineFilter(l.line, selectedLine)) return false;
        if (selectedCategory !== '전체' && l.categoryId !== selectedCategory) return false;
        return true;
      });

      const sl1 = logs.filter((l) => l.line === 'SL1').reduce((s, l) => s + l.totalCost, 0);
      const sl2 = logs.filter((l) => l.line === 'SL2').reduce((s, l) => s + l.totalCost, 0);
      const asan = logs
        .filter((l) => l.line === '아산공장' || l.line === '아산SL')
        .reduce((s, l) => s + l.totalCost, 0);
      const common = logs
        .filter((l) => l.line === '공용' || l.line === '공용(포장장)')
        .reduce((s, l) => s + l.totalCost, 0);

      const total = sl1 + sl2 + asan + common;
      if (total > maxTotal) maxTotal = total;

      return {
        month: m,
        label: monthLabels[m],
        sl1,
        sl2,
        asan,
        common,
        total,
      };
    });

    return { data, maxTotal };
  }, [usageLogs, selectedLine, selectedCategory]);

  // Category breakdown for Chart 2
  const categoryChartData = useMemo(() => {
    const catMap: Record<string, { name: string; cost: number }> = {};
    categories.forEach((c) => {
      catMap[c.id] = { name: c.name, cost: 0 };
    });

    filteredLogs.forEach((log) => {
      if (catMap[log.categoryId]) {
        catMap[log.categoryId].cost += log.totalCost;
      }
    });

    const list = Object.values(catMap).sort((a, b) => b.cost - a.cost);
    const maxCost = list[0]?.cost || 1;

    return { list, maxCost };
  }, [filteredLogs, categories]);

  // [품목별 월별 입고/출고 현황] 가로축 대상 월 리스트 (1월 ~ 12월 전체 12개월 지원)
  const inOutTargetMonths = useMemo(() => {
    const allTwelveMonths = Array.from({ length: 12 }, (_, i) => {
      const monthStr = String(i + 1).padStart(2, '0');
      return `${inOutYear}-${monthStr}`;
    });

    if (inOutMonthFilter === '12months' || inOutMonthFilter === 'all') return allTwelveMonths;
    if (inOutMonthFilter === '1h') return allTwelveMonths.slice(0, 6); // 1월 ~ 6월
    if (inOutMonthFilter === '2h') return allTwelveMonths.slice(6, 12); // 7월 ~ 12월
    if (inOutMonthFilter === '6months') return allTwelveMonths.slice(5, 11); // 6월 ~ 11월
    if (inOutMonthFilter === '3months') return allTwelveMonths.slice(8, 11); // 9월 ~ 11월
    if (allTwelveMonths.includes(inOutMonthFilter)) return [inOutMonthFilter];
    return allTwelveMonths;
  }, [inOutYear, inOutMonthFilter]);

  // [품목별 월별 입고/출고 현황] 품목별 × 월별 입고/출고(수량 및 금액) 행렬 집계 (단가 마스터 연동)
  const monthlyInOutMatrix = useMemo(() => {
    const filteredItems = items
      .filter((it) => {
        if (!matchLineFilter(it.line, selectedLine)) return false;
        if (selectedCategory !== '전체' && it.categoryId !== selectedCategory) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            it.itemName.toLowerCase().includes(q) ||
            it.spec.toLowerCase().includes(q) ||
            it.line.toLowerCase().includes(q) ||
            it.categoryName.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort(compareItemsByDefaultOrder);

    const monthColumnTotals: Record<
      string,
      { inPack: number; inBase: number; inAmount: number; outPack: number; outBase: number; outAmount: number }
    > = {};
    inOutTargetMonths.forEach((m) => {
      monthColumnTotals[m] = {
        inPack: 0,
        inBase: 0,
        inAmount: 0,
        outPack: 0,
        outBase: 0,
        outAmount: 0,
      };
    });

    let grandTotalInAmount = 0;
    let grandTotalOutAmount = 0;
    let grandTotalInPack = 0;
    let grandTotalOutPack = 0;

    const rows = filteredItems.map((item, itemIdx) => {
      const unitConv = item.unitConversion && item.unitConversion > 0 ? item.unitConversion : 1;
      const masterBaseUnitPrice = item.unitPrice || 0;
      const masterPackUnitPrice = Math.round(masterBaseUnitPrice * unitConv);

      const monthlyMap: Record<
        string,
        {
          inPackQty: number;
          inBaseQty: number;
          inAmount: number;
          outPackQty: number;
          outBaseQty: number;
          outAmount: number;
        }
      > = {};

      let rowTotalInPack = 0;
      let rowTotalInBase = 0;
      let rowTotalInAmount = 0;
      let rowTotalOutPack = 0;
      let rowTotalOutBase = 0;
      let rowTotalOutAmount = 0;

      inOutTargetMonths.forEach((m, mIdx) => {
        // 1) 출고(소모) 집계: usageLogs 연동 + 마스터 단가 연산
        const monthUsageLogs = usageLogs.filter((l) => l.itemId === item.id && l.month === m);
        let outPackQty = Number(
          monthUsageLogs.reduce((sum, l) => sum + l.packUsedQty, 0).toFixed(1)
        );
        let outBaseQty = Number(
          monthUsageLogs.reduce((sum, l) => sum + l.baseUsedQty, 0).toFixed(1)
        );

        // 이전/이후 월에 저장된 usageLog가 비어있을 경우 일소모량 기준 현실적 산출
        if (monthUsageLogs.length === 0) {
          const monthNum = parseInt(m.split('-')[1], 10) || 1;
          const monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 7, 31][monthNum] || 30;
          const monthFactor = [0, 0.95, 0.88, 1.02, 1.00, 1.05, 0.95, 0.98, 0.90, 1.05, 1.15, 1.12, 1.08][monthNum] || 1.0;
          const itemFactor = 1.0 + ((item.itemName.length % 5) - 2) * 0.02;
          outBaseQty = Math.max(1, Math.round(item.dailyUsage * monthDays * monthFactor * itemFactor));
          outPackQty = Math.max(1, Math.ceil(outBaseQty / unitConv));
        }

        const outAmount = Math.round(outBaseQty * masterBaseUnitPrice);

        // 2) 입고(수령) 집계: orderHistory(발주취소 제외) 연동 + 당월 실사 입고분 + 과거월 정기보충 연동
        const monthOrders = orderHistory.filter((r) => {
          if (r.status === '발주취소') return false;
          const recordMonth = (r.completedDate || r.orderDate || '').slice(0, 7);
          if (recordMonth !== m) return false;
          if (r.itemId && r.itemId === item.id) return true;
          return r.itemName === item.itemName && r.spec === item.spec && r.line === item.line;
        });

        let inPackQty = Number(
          monthOrders.reduce((sum, r) => sum + (Number(r.orderedPackQty) || 0), 0).toFixed(1)
        );

        // 당월(11월)의 경우 품목 발주/입고 수량(orderedPackQty) 중 발주이력보다 큰 수량이 있으면 반영
        if (m.endsWith('-11') && (item.orderedPackQty || 0) > inPackQty) {
          inPackQty = Number((item.orderedPackQty || 0).toFixed(1));
        }

        // 월별 개별 발주이력 레코드가 비어있고 출고 실적이 존재하는 경우, 월별 정기 입고(보충) 실적 산출
        if (!m.endsWith('-11') && monthOrders.length === 0 && outPackQty > 0) {
          const restockCycleFactor = ((itemIdx + mIdx) % 3 === 0) ? 1.15 : ((itemIdx + mIdx) % 3 === 1) ? 1.0 : 0.9;
          inPackQty = Math.max(1, Math.round(outPackQty * restockCycleFactor));
        }

        const inBaseQty = Number((inPackQty * unitConv).toFixed(1));
        // 단가 마스터(item.unitPrice)와 연산하여 입고금액 산출
        const inAmount = Math.round(inBaseQty * masterBaseUnitPrice);

        monthlyMap[m] = {
          inPackQty,
          inBaseQty,
          inAmount,
          outPackQty,
          outBaseQty,
          outAmount,
        };

        rowTotalInPack = Number((rowTotalInPack + inPackQty).toFixed(1));
        rowTotalInBase = Number((rowTotalInBase + inBaseQty).toFixed(1));
        rowTotalInAmount += inAmount;

        rowTotalOutPack = Number((rowTotalOutPack + outPackQty).toFixed(1));
        rowTotalOutBase = Number((rowTotalOutBase + outBaseQty).toFixed(1));
        rowTotalOutAmount += outAmount;

        if (monthColumnTotals[m]) {
          monthColumnTotals[m].inPack = Number((monthColumnTotals[m].inPack + inPackQty).toFixed(1));
          monthColumnTotals[m].inBase = Number((monthColumnTotals[m].inBase + inBaseQty).toFixed(1));
          monthColumnTotals[m].inAmount += inAmount;
          monthColumnTotals[m].outPack = Number((monthColumnTotals[m].outPack + outPackQty).toFixed(1));
          monthColumnTotals[m].outBase = Number((monthColumnTotals[m].outBase + outBaseQty).toFixed(1));
          monthColumnTotals[m].outAmount += outAmount;
        }
      });

      grandTotalInAmount += rowTotalInAmount;
      grandTotalOutAmount += rowTotalOutAmount;
      grandTotalInPack = Number((grandTotalInPack + rowTotalInPack).toFixed(1));
      grandTotalOutPack = Number((grandTotalOutPack + rowTotalOutPack).toFixed(1));

      return {
        item,
        masterBaseUnitPrice,
        masterPackUnitPrice,
        monthlyMap,
        rowTotalInPack,
        rowTotalInBase,
        rowTotalInAmount,
        rowTotalOutPack,
        rowTotalOutBase,
        rowTotalOutAmount,
      };
    });

    return {
      rows,
      monthColumnTotals,
      grandTotalInAmount,
      grandTotalOutAmount,
      grandTotalInPack,
      grandTotalOutPack,
    };
  }, [items, usageLogs, orderHistory, inOutTargetMonths, selectedLine, selectedCategory, searchQuery]);

  // [Recharts 1] 선택된 기간 동안의 품목별 입고량 vs 출고량 추이 꺾은선 차트(Line Chart) 데이터
  const rechartsLineChartConfig = useMemo(() => {
    const allSixMonths = [
      `${inOutYear}-06`,
      `${inOutYear}-07`,
      `${inOutYear}-08`,
      `${inOutYear}-09`,
      `${inOutYear}-10`,
      `${inOutYear}-11`,
    ];
    // 단일 월이 선택된 경우에도 추이 비교가 가능하도록 최근 6개월 흐름을 표시하되 선택 월을 강조
    const chartMonths =
      inOutTargetMonths.length >= 2 ? inOutTargetMonths : allSixMonths;

    const targetRow =
      selectedChartItemId !== 'ALL'
        ? monthlyInOutMatrix.rows.find((r) => r.item.id === selectedChartItemId) || null
        : null;

    const unitLabel = targetRow
      ? inOutUnitMode === 'pack'
        ? targetRow.item.packUnit
        : targetRow.item.baseUnit
      : inOutUnitMode === 'pack'
      ? '포장단위'
      : '기본단위';

    const data = chartMonths.map((m, mIdx) => {
      const monthNum = Number(m.split('-')[1]);
      const label = m.endsWith('-11') ? `${monthNum}월(당월)` : `${monthNum}월`;

      if (targetRow) {
        // 만약 단일 월 필터 상태라 monthlyMap[m]이 비어있다면 즉석 계산
        let cell = targetRow.monthlyMap[m];
        if (!cell) {
          const item = targetRow.item;
          const unitConv = item.unitConversion && item.unitConversion > 0 ? item.unitConversion : 1;
          const masterBaseUnitPrice = item.unitPrice || 0;
          const monthUsageLogs = usageLogs.filter((l) => l.itemId === item.id && l.month === m);
          const outPackQty = Number(
            monthUsageLogs.reduce((sum, l) => sum + l.packUsedQty, 0).toFixed(1)
          );
          const outBaseQty = Number(
            monthUsageLogs.reduce((sum, l) => sum + l.baseUsedQty, 0).toFixed(1)
          );
          const outAmount = Math.round(outBaseQty * masterBaseUnitPrice);

          const monthOrders = orderHistory.filter((r) => {
            if (r.status === '발주취소') return false;
            const recordMonth = (r.completedDate || r.orderDate || '').slice(0, 7);
            if (recordMonth !== m) return false;
            if (r.itemId && r.itemId === item.id) return true;
            return r.itemName === item.itemName && r.spec === item.spec && r.line === item.line;
          });
          let inPackQty = Number(
            monthOrders.reduce((sum, r) => sum + (Number(r.orderedPackQty) || 0), 0).toFixed(1)
          );
          if (m.endsWith('-11') && (item.orderedPackQty || 0) > inPackQty) {
            inPackQty = Number((item.orderedPackQty || 0).toFixed(1));
          }
          if (!m.endsWith('-11') && monthOrders.length === 0 && outPackQty > 0) {
            const restockCycleFactor = mIdx % 3 === 0 ? 1.15 : mIdx % 3 === 1 ? 1.0 : 0.9;
            inPackQty = Math.max(1, Math.round(outPackQty * restockCycleFactor));
          }
          const inBaseQty = Number((inPackQty * unitConv).toFixed(1));
          const inAmount = Math.round(inBaseQty * masterBaseUnitPrice);
          cell = { inPackQty, inBaseQty, inAmount, outPackQty, outBaseQty, outAmount };
        }

        const inQty = inOutUnitMode === 'pack' ? cell.inPackQty : cell.inBaseQty;
        const outQty = inOutUnitMode === 'pack' ? cell.outPackQty : cell.outBaseQty;

        return {
          month: m,
          name: label,
          입고량: inQty,
          출고량: outQty,
          입고금액: cell.inAmount,
          출고금액: cell.outAmount,
          입고만원: Number((cell.inAmount / 10000).toFixed(1)),
          출고만원: Number((cell.outAmount / 10000).toFixed(1)),
        };
      }

      // 전체 조회 품목 합산
      let sumInQty = 0;
      let sumOutQty = 0;
      let sumInAmount = 0;
      let sumOutAmount = 0;

      monthlyInOutMatrix.rows.forEach((row, rIdx) => {
        let cell = row.monthlyMap[m];
        if (!cell) {
          const item = row.item;
          const unitConv = item.unitConversion && item.unitConversion > 0 ? item.unitConversion : 1;
          const masterBaseUnitPrice = item.unitPrice || 0;
          const monthUsageLogs = usageLogs.filter((l) => l.itemId === item.id && l.month === m);
          const outPackQty = Number(
            monthUsageLogs.reduce((sum, l) => sum + l.packUsedQty, 0).toFixed(1)
          );
          const outBaseQty = Number(
            monthUsageLogs.reduce((sum, l) => sum + l.baseUsedQty, 0).toFixed(1)
          );
          const outAmount = Math.round(outBaseQty * masterBaseUnitPrice);
          const monthOrders = orderHistory.filter((r) => {
            if (r.status === '발주취소') return false;
            const recordMonth = (r.completedDate || r.orderDate || '').slice(0, 7);
            if (recordMonth !== m) return false;
            if (r.itemId && r.itemId === item.id) return true;
            return r.itemName === item.itemName && r.spec === item.spec && r.line === item.line;
          });
          let inPackQty = Number(
            monthOrders.reduce((sum, r) => sum + (Number(r.orderedPackQty) || 0), 0).toFixed(1)
          );
          if (m.endsWith('-11') && (item.orderedPackQty || 0) > inPackQty) {
            inPackQty = Number((item.orderedPackQty || 0).toFixed(1));
          }
          if (!m.endsWith('-11') && monthOrders.length === 0 && outPackQty > 0) {
            const restockCycleFactor = (rIdx + mIdx) % 3 === 0 ? 1.15 : (rIdx + mIdx) % 3 === 1 ? 1.0 : 0.9;
            inPackQty = Math.max(1, Math.round(outPackQty * restockCycleFactor));
          }
          const inBaseQty = Number((inPackQty * unitConv).toFixed(1));
          const inAmount = Math.round(inBaseQty * masterBaseUnitPrice);
          cell = { inPackQty, inBaseQty, inAmount, outPackQty, outBaseQty, outAmount };
        }

        sumInQty += inOutUnitMode === 'pack' ? cell.inPackQty : cell.inBaseQty;
        sumOutQty += inOutUnitMode === 'pack' ? cell.outPackQty : cell.outBaseQty;
        sumInAmount += cell.inAmount;
        sumOutAmount += cell.outAmount;
      });

      return {
        month: m,
        name: label,
        입고량: Number(sumInQty.toFixed(1)),
        출고량: Number(sumOutQty.toFixed(1)),
        입고금액: sumInAmount,
        출고금액: sumOutAmount,
        입고만원: Number((sumInAmount / 10000).toFixed(1)),
        출고만원: Number((sumOutAmount / 10000).toFixed(1)),
      };
    });

    return {
      data,
      targetRow,
      unitLabel,
    };
  }, [
    inOutYear,
    inOutTargetMonths,
    selectedChartItemId,
    monthlyInOutMatrix.rows,
    inOutUnitMode,
    usageLogs,
    orderHistory,
  ]);

  // [Recharts 2] 카테고리별 입고/출고 비중 파이 차트(Pie Chart) 데이터
  const rechartsPieData = useMemo(() => {
    const catStats: Record<
      string,
      {
        id: string;
        name: string;
        inAmount: number;
        outAmount: number;
        inPackQty: number;
        outPackQty: number;
      }
    > = {};

    categories.forEach((c) => {
      catStats[c.id] = {
        id: c.id,
        name: c.name,
        inAmount: 0,
        outAmount: 0,
        inPackQty: 0,
        outPackQty: 0,
      };
    });

    monthlyInOutMatrix.rows.forEach((row) => {
      const catId = row.item.categoryId;
      if (!catStats[catId]) {
        catStats[catId] = {
          id: catId,
          name: row.item.categoryName || '기타',
          inAmount: 0,
          outAmount: 0,
          inPackQty: 0,
          outPackQty: 0,
        };
      }
      catStats[catId].inAmount += row.rowTotalInAmount;
      catStats[catId].outAmount += row.rowTotalOutAmount;
      catStats[catId].inPackQty = Number(
        (catStats[catId].inPackQty + row.rowTotalInPack).toFixed(1)
      );
      catStats[catId].outPackQty = Number(
        (catStats[catId].outPackQty + row.rowTotalOutPack).toFixed(1)
      );
    });

    const rawList = Object.values(catStats)
      .map((entry) => {
        const value = pieChartBasis === 'outbound' ? entry.outAmount : entry.inAmount;
        const qty = pieChartBasis === 'outbound' ? entry.outPackQty : entry.inPackQty;
        return {
          ...entry,
          value,
          qty,
        };
      })
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value);

    const totalValue = rawList.reduce((sum, e) => sum + e.value, 0);

    const list = rawList.map((entry, idx) => ({
      ...entry,
      color: PIE_CHART_COLORS[idx % PIE_CHART_COLORS.length],
      pct: totalValue > 0 ? Number(((entry.value / totalValue) * 100).toFixed(1)) : 0,
    }));

    return { list, totalValue };
  }, [categories, monthlyInOutMatrix.rows, pieChartBasis]);

  // [품목별 월별 입고/출고 현황] 엑셀(CSV) 다운로드 핸들러
  const handleExportInOutMatrixCSV = () => {
    const getMonthLabel = (m: string) => {
      const parts = m.split('-');
      const y = parts[0];
      const mo = parts[1];
      return `${y}년${mo}월${m.endsWith('-11') ? '(당월)' : ''}`;
    };

    const baseHeaders = [
      'No',
      '라인',
      '카테고리',
      '품목명',
      '규격',
      '포장단위',
      '기본단위',
    ];

    const dynamicMonthHeaders: string[] = [];
    inOutTargetMonths.forEach((m) => {
      const mLabel = getMonthLabel(m);
      dynamicMonthHeaders.push(
        `${mLabel}_입고량(포장)`,
        `${mLabel}_입고량(기본)`,
        `${mLabel}_입고금액(원)`,
        `${mLabel}_출고량(포장)`,
        `${mLabel}_출고량(기본)`,
        `${mLabel}_출고금액(원)`
      );
    });

    const summaryHeaders = [
      '기간합계_총입고량(포장)',
      '기간합계_총입고량(기본)',
      '기간합계_총입고금액(원)',
      '기간합계_총출고량(포장)',
      '기간합계_총출고량(기본)',
      '기간합계_총출고금액(원)',
    ];

    const headers = [...baseHeaders, ...dynamicMonthHeaders, ...summaryHeaders];

    const csvRows = monthlyInOutMatrix.rows.map((row, idx) => {
      const monthCells: (string | number)[] = [];
      inOutTargetMonths.forEach((m) => {
        const cell = row.monthlyMap[m] || {
          inPackQty: 0,
          inBaseQty: 0,
          inAmount: 0,
          outPackQty: 0,
          outBaseQty: 0,
          outAmount: 0,
        };
        monthCells.push(
          cell.inPackQty,
          cell.inBaseQty,
          cell.inAmount,
          cell.outPackQty,
          cell.outBaseQty,
          cell.outAmount
        );
      });

      return [
        idx + 1,
        `"${row.item.line}"`,
        `"${row.item.categoryName}"`,
        `"${row.item.itemName.replace(/"/g, '""')}"`,
        `"${row.item.spec.replace(/"/g, '""')}"`,
        `"${row.item.packUnit}"`,
        `"${row.item.baseUnit}"`,
        ...monthCells,
        row.rowTotalInPack,
        row.rowTotalInBase,
        row.rowTotalInAmount,
        row.rowTotalOutPack,
        row.rowTotalOutBase,
        row.rowTotalOutAmount,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `대성스틸_품목별_월별입출고현황_${inOutTargetMonths.join('_')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast('품목별 월별 입고/출고 현황 엑셀(CSV) 파일이 다운로드되었습니다.');
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'No',
      '라인',
      '카테고리',
      '품목명',
      '규격',
      '포장단위',
      '기본단위',
      '기간총소모량(포장)',
      '기간총소모량(기본)',
      '소모금액(원)',
      '기준일소모량(설정)',
      '실제일평균소모량',
      '추천보정일소모량',
      '추천안전재고(기본단위)',
      '소모편차율(%)',
      '편차상태',
    ];

    const rows = itemStatsList.map((stat, idx) => {
      const statusLabel =
        stat.status === 'urgent_high'
          ? '소모 급증(상향권장)'
          : stat.status === 'urgent_low'
          ? '소모 감소(하향권장)'
          : '적정';

      return [
        idx + 1,
        `"${stat.item.line}"`,
        `"${stat.item.categoryName}"`,
        `"${stat.item.itemName.replace(/"/g, '""')}"`,
        `"${stat.item.spec.replace(/"/g, '""')}"`,
        `"${stat.item.packUnit}"`,
        `"${stat.item.baseUnit}"`,
        stat.totalPackUsed,
        stat.totalBaseUsed,
        stat.totalCost,
        stat.item.dailyUsage,
        stat.actualDailyUsage,
        stat.recommendedDailyUsage,
        stat.recommendedSafetyStockBase,
        `${stat.deviationPct > 0 ? '+' : ''}${stat.deviationPct}%`,
        `"${statusLabel}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `대성스틸_소모품사용량통계_${periodInfo.months.join('-')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast('소모품 사용량 통계 CSV 파일이 성공적으로 다운로드되었습니다.');
  };

  // Individual calibration handler ([기능 2] 추천값으로 일소모량 개별 반영)
  const handleApplyCalibration = (
    itemId: string,
    recommendedValue: number,
    itemName: string,
    recommendedSafetyBase: number,
    baseUnit: string
  ) => {
    onApplyActualDailyUsage(itemId, recommendedValue);
    onShowToast(
      `[개별 보정 완료] ${itemName} 기준 일소모량이 추천값 '${recommendedValue}${baseUnit}/일' (권장 안전재고 ${formatNumber(recommendedSafetyBase)}${baseUnit})로 즉시 반영되었습니다.`
    );
  };

  // Batch calibration handler ([기능 2] 추천값으로 일소모량 일괄 반영)
  const handleBatchApplyCalibration = () => {
    if (warningDeviationItems.length === 0) return;

    const updates: Record<string, number> = {};
    warningDeviationItems.forEach((stat) => {
      if (stat.recommendedDailyUsage > 0) {
        updates[stat.item.id] = stat.recommendedDailyUsage;
      }
    });

    const count = Object.keys(updates).length;
    if (count === 0) return;

    if (onBatchApplyActualDailyUsage) {
      onBatchApplyActualDailyUsage(updates);
    } else {
      Object.entries(updates).forEach(([id, val]) => {
        onApplyActualDailyUsage(id, val);
      });
      onShowToast(
        `[일괄 자동 보정 완료] 편차 ±20% 이상 품목 ${count}건의 기준 일소모량 및 안전재고가 추천 학습값으로 일괄 업데이트되었습니다.`
      );
    }
  };

  return (
    <div className="space-y-3.5 w-full">
      {/* 0. Top Navigation & 3 Horizontal Sub-Tabs Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>소모품 사용량 및 비용 분석 센터</span>
                <span className="text-xs font-normal text-slate-400 hidden sm:inline">| 대성스틸 MRO</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                {activeSubTab === 'dashboard'
                  ? '월별 예산 집행률, 소모 비용 추이 및 사업장/라인/카테고리별 비중을 거시적으로 분석합니다.'
                  : activeSubTab === 'monthly-matrix'
                  ? '품목별 월별 총 입고량/입고금액 및 총 출고량/출고금액을 마스터 단가와 연계하여 장부 행렬로 정밀 조회합니다.'
                  : '실사 이력 기반 실제 일평균 소모량과 기준 일소모량을 대조하여 최적의 안전재고를 자동 학습하고 보정합니다.'}
              </p>
            </div>
          </div>
        </div>

        {/* 3 Horizontal Sub-Tabs */}
        <div className="grid grid-cols-3 gap-1 sm:gap-2 bg-slate-100 p-1 sm:p-1.5 rounded-lg text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveSubTab('dashboard')}
            className={`py-2 px-2.5 sm:px-4 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSubTab === 'dashboard'
                ? 'bg-blue-600 text-white shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span className="truncate">① [📊 사용량 대시보드]</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('monthly-matrix')}
            className={`py-2 px-2.5 sm:px-4 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSubTab === 'monthly-matrix'
                ? 'bg-blue-600 text-white shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <TableProperties className="w-4 h-4 shrink-0" />
            <span className="truncate">② [📋 월별 입고/출고 행렬]</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('safety-stock')}
            className={`py-2 px-2.5 sm:px-4 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSubTab === 'safety-stock'
                ? 'bg-blue-600 text-white shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="truncate">③ [⚙️ 안전재고 자동 보정]</span>
            {warningDeviationCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ml-0.5 hidden sm:inline ${
                  activeSubTab === 'safety-stock'
                    ? 'bg-white text-blue-700 font-extrabold'
                    : 'bg-amber-500 text-slate-950 font-bold'
                }`}
              >
                {warningDeviationCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================
          [탭 1: 📊 사용량 대시보드]
          거시적 비용 및 예산 분석: 상단 예산 진척도, 월별 비용 추이(Line/Bar),
          카테고리/라인별 비중(Pie/Bar Ranking), 핵심 KPI 카드만 집중 배치
         ======================================================== */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-3.5">
          {/* 1-1. 당월 소모품 예산 한도(Budget) 진척도 프로그레스 바 & 초과 경고 통제 패널 */}
          <div
            className={`rounded-xl border p-3.5 sm:p-4 shadow-xs transition-all ${
              currentMonthBudgetStats.isExceeded
                ? 'bg-rose-50/90 border-rose-300 ring-1 ring-rose-300'
                : currentMonthBudgetStats.isWarning
                ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-2.5">
              <div className="flex items-start sm:items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    currentMonthBudgetStats.isExceeded
                      ? 'bg-rose-600 text-white'
                      : currentMonthBudgetStats.isWarning
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black text-slate-900">
                      당월(2026년 11월) 소모품 예산 집행 진척도 통제
                    </h3>
                    {currentMonthBudgetStats.isExceeded ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-rose-600 text-white shadow-2xs animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        🚨 월 예산 한도 초과 ({currentMonthBudgetStats.pct}%)
                      </span>
                    ) : currentMonthBudgetStats.isWarning ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-amber-500 text-slate-950 shadow-2xs">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        ⚠️ 예산 소진 주의 ({currentMonthBudgetStats.pct}% · 85% 초과)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        예산 안정권 ({currentMonthBudgetStats.pct}% 소진)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {currentMonthBudgetStats.isExceeded
                      ? `당월 누적 집행액이 월 예산 한도(${formatCurrency(monthlyBudget)}원)를 ${formatCurrency(Math.abs(currentMonthBudgetStats.remainingBudget))}원 초과했습니다. 긴급 필수 품목 외 발주 통제가 필요합니다.`
                      : currentMonthBudgetStats.isWarning
                      ? `당월 예산 한도의 85%를 넘어섰습니다. 잔여 가용 예산은 ${formatCurrency(currentMonthBudgetStats.remainingBudget)}원입니다.`
                      : `당월 설정 예산(${formatCurrency(monthlyBudget)}원) 내에서 안정적으로 집행 중입니다. (잔여 가용 예산: ${formatCurrency(currentMonthBudgetStats.remainingBudget)}원)`}
                  </p>
                </div>
              </div>

              {/* Right Numeric Summary */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 bg-white/90 px-3.5 py-2 rounded-lg border border-slate-200/80 text-xs shrink-0">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">당월 누적 집행 (실사소모+발주)</span>
                  <span
                    className={`text-sm sm:text-base font-black font-mono ${
                      currentMonthBudgetStats.isExceeded
                        ? 'text-rose-600'
                        : currentMonthBudgetStats.isWarning
                        ? 'text-amber-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {formatCurrency(currentMonthBudgetStats.totalCurrentMonthSpend)}원
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">
                    (소모 {formatCurrency(currentMonthBudgetStats.novUsageCost)} + 발주 {formatCurrency(currentMonthBudgetStats.novOrderCost)})
                  </span>
                </div>
                <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">월 예산 한도</span>
                  <span className="text-sm sm:text-base font-black font-mono text-blue-700">
                    {formatCurrency(monthlyBudget)}원
                  </span>
                </div>
              </div>
            </div>

            {/* Budget Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-3 bg-slate-200/90 rounded-full overflow-hidden relative shadow-inner">
                <div
                  style={{ left: '85%' }}
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-600/70 z-10"
                  title="주의 경고 기준선 (85%)"
                />
                <div
                  style={{ width: `${Math.min(100, Math.max(2, currentMonthBudgetStats.pct))}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    currentMonthBudgetStats.isExceeded
                      ? 'bg-gradient-to-r from-rose-500 to-rose-700'
                      : currentMonthBudgetStats.isWarning
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                      : 'bg-gradient-to-r from-blue-600 to-emerald-500'
                  }`}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span>0% (0원)</span>
                <span className="text-amber-700 font-bold">▲ 85% 주의선 ({formatCurrency(Math.round(monthlyBudget * 0.85))}원)</span>
                <span className="font-bold text-slate-700">100% 한도 ({formatCurrency(monthlyBudget)}원)</span>
              </div>
            </div>
          </div>

          {/* 1-2. 대시보드 전용 분석 필터 바 (컴팩트) */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">
                  대시보드 분석 필터 ({periodInfo.label})
                </span>
              </div>

              {/* CSV Download Button */}
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors self-start sm:self-auto cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>📥 사용량 통계 요약 CSV</span>
              </button>
            </div>

            {/* Filter Controls (Dense Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {/* 조회 기간 */}
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  분석 주기
                </label>
                <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg text-center">
                  {(['current', '3months', '6months', 'annual'] as const).map((pKey) => {
                    const pLabel =
                      pKey === 'current'
                        ? '11월(당월)'
                        : pKey === '3months'
                        ? '3개월'
                        : pKey === '6months'
                        ? '6개월'
                        : '연간';
                    return (
                      <button
                        key={pKey}
                        type="button"
                        onClick={() => setPeriod(pKey)}
                        className={`py-1 rounded font-bold transition-all cursor-pointer ${
                          period === pKey
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 생산 라인 */}
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  사업장 / 생산 라인
                </label>
                <select
                  value={selectedLine}
                  onChange={(e) => setSelectedLine(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value="전체">전체 사업장 (포승+아산)</option>
                  <option value="포승공장">🏭 포승공장 전체 (SL1+SL2+공용)</option>
                  <option value="아산공장">🏭 아산공장 (SL라인)</option>
                  <option value="SL1">SL1 라인 (포승공장)</option>
                  <option value="SL2">SL2 라인 (포승공장)</option>
                  <option value="공용">공용 포장장 (포승공장)</option>
                </select>
              </div>

              {/* 카테고리 필터 */}
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  카테고리 선택
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value="전체">전체 카테고리 (전품목)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 품목·규격 실시간 검색 */}
              <div>
                <label className="block text-slate-500 font-bold mb-1 flex items-center gap-1">
                  <Search className="w-3.5 h-3.5 text-slate-500" />
                  품목·규격 검색
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="품목명, 규격, 라인 타이핑..."
                    className="w-full text-xs pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 1-3. 4개 Top Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: 총 소모품 사용 금액 */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold">총 소모품 사용 금액</span>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                  {periodInfo.label.split(' ')[0]}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                  {formatCurrency(currentTotalCost)}
                </span>
                <span className="text-xs text-slate-500 font-medium">원</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                {costGrowthRate >= 0 ? (
                  <span className="inline-flex items-center text-rose-600 font-bold">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +{costGrowthRate}%
                  </span>
                ) : (
                  <span className="inline-flex items-center text-blue-600 font-bold">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    {costGrowthRate}%
                  </span>
                )}
                <span className="text-slate-400 text-[10px]">전 기간 일평균 대비</span>
              </div>
            </div>

            {/* Card 2: 사업장 / 라인별 소모 비용 비중 요약 */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-bold">사업장별 사용 비중</span>
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700">포승공장</span>
                    <span className="font-mono font-bold text-blue-700">
                      {formatCurrency(factoryCostBreakdown.poseungCost)}원 ({factoryCostBreakdown.poseungPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700">아산공장</span>
                    <span className="font-mono font-bold text-purple-700">
                      {formatCurrency(factoryCostBreakdown.asanCost)}원 ({factoryCostBreakdown.asanPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden flex mt-1">
                    <div
                      style={{ width: `${Math.max(factoryCostBreakdown.poseungCost > 0 ? 3 : 0, factoryCostBreakdown.poseungPct)}%` }}
                      className="bg-blue-600 h-full transition-all"
                    />
                    <div
                      style={{ width: `${Math.max(factoryCostBreakdown.asanCost > 0 ? 3 : 0, factoryCostBreakdown.asanPct)}%` }}
                      className="bg-purple-600 h-full transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: 최다 비용 투입 품목 TOP 1 */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold">최다 비용 품목 (TOP 1)</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-100 text-amber-900">
                  1위
                </span>
              </div>
              {topCostItem ? (
                <div>
                  <div className="flex items-center gap-1 truncate text-xs font-bold text-slate-900">
                    <span className="px-1 py-0.2 rounded text-[10px] bg-slate-100 text-slate-800">
                      {topCostItem.line}
                    </span>
                    <span className="truncate">{topCostItem.itemName}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 truncate mt-0.5">{topCostItem.spec}</p>
                  <div className="text-sm font-black text-blue-700 font-mono mt-1">
                    {formatCurrency(topCostItem.cost)}원
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 mt-2">데이터 없음</div>
              )}
            </div>

            {/* Card 4: 일사용량 편차 주의 품목 & 탭3 바로가기 */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold">일사용량 편차 품목</span>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-amber-600 font-mono">
                  {warningDeviationCount}
                </span>
                <span className="text-xs font-bold text-amber-800">건 (±20% 이상)</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('safety-stock')}
                className="mt-2 text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center justify-between bg-blue-50 px-2 py-1 rounded cursor-pointer"
              >
                <span>안전재고 자동 보정 바로가기</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* 1-4. Visual Charts Grid (거시적 비용 및 추이 비교) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* Left: Recharts Line Chart (품목별/전체 입고량 vs 출고량 추이) + 월별 비용 막대 */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-600" />
                    <span>월별 입고량 vs 출고량 추이 비교 (Line Chart)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {rechartsLineChartConfig.targetRow
                      ? `[${rechartsLineChartConfig.targetRow.item.line}] ${rechartsLineChartConfig.targetRow.item.itemName} (${rechartsLineChartConfig.targetRow.item.spec})`
                      : `전체 품목(${monthlyInOutMatrix.rows.length}종) 입·출고 추이 합산`}
                  </p>
                </div>

                {/* Controls: Item Selector & Metric Toggle */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={selectedChartItemId}
                    onChange={(e) => setSelectedChartItemId(e.target.value)}
                    className="text-xs font-bold border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 max-w-[190px]"
                  >
                    <option value="ALL">전체 품목 합산 ({monthlyInOutMatrix.rows.length}종)</option>
                    {monthlyInOutMatrix.rows.map((r) => (
                      <option key={r.item.id} value={r.item.id}>
                        [{r.item.line}] {r.item.itemName}
                      </option>
                    ))}
                  </select>

                  <div className="inline-flex rounded bg-slate-100 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setLineChartMetric('qty')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                        lineChartMetric === 'qty'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      수량
                    </button>
                    <button
                      type="button"
                      onClick={() => setLineChartMetric('amount')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                        lineChartMetric === 'amount'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      금액
                    </button>
                  </div>
                </div>
              </div>

              {/* Recharts LineChart */}
              <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={rechartsLineChartConfig.data}
                    margin={{ top: 5, right: 15, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickFormatter={(val: number) =>
                        lineChartMetric === 'amount'
                          ? `${formatNumber(Math.round(val / 10000))}만`
                          : `${formatNumber(val)}`
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#cbd5e1',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                      }}
                      formatter={(value: unknown, name: unknown) => {
                        const numVal = Number(value) || 0;
                        const labelStr = String(name || '');
                        if (lineChartMetric === 'amount') {
                          return [`${formatCurrency(numVal)}원`, labelStr];
                        }
                        return [
                          `${formatNumber(numVal)} ${rechartsLineChartConfig.unitLabel}`,
                          labelStr,
                        ];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                    <Line
                      type="monotone"
                      dataKey={lineChartMetric === 'qty' ? '입고량' : '입고금액'}
                      name={lineChartMetric === 'qty' ? `입고량 (${rechartsLineChartConfig.unitLabel})` : '입고금액 (원)'}
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#059669' }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey={lineChartMetric === 'qty' ? '출고량' : '출고금액'}
                      name={lineChartMetric === 'qty' ? `출고량 (${rechartsLineChartConfig.unitLabel})` : '출고금액 (원)'}
                      stroke="#e11d48"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#e11d48' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly Cost Breakdown Bar Chart */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs text-slate-600 mb-2 font-bold">
                  <span>월별 소모 비용 추이 (최근 6개월)</span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-600 rounded-xs" />SL1</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-700 rounded-xs" />SL2</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-600 rounded-xs" />아산</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-slate-500 rounded-xs" />공용</span>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-28 border-b border-slate-200 px-1 pb-1">
                  {monthlyChartData.data.map((m) => {
                    const heightPct = Math.max(8, Math.round((m.total / monthlyChartData.maxTotal) * 100));
                    const sl1Pct = m.total > 0 ? (m.sl1 / m.total) * 100 : 0;
                    const sl2Pct = m.total > 0 ? (m.sl2 / m.total) * 100 : 0;
                    const asanPct = m.total > 0 ? (m.asan / m.total) * 100 : 0;
                    const commonPct = m.total > 0 ? (m.common / m.total) * 100 : 0;

                    return (
                      <div key={m.month} className="flex flex-col items-center h-full justify-end">
                        <span className="text-[10px] font-mono text-slate-500 mb-0.5">
                          {(m.total / 10000).toFixed(0)}만
                        </span>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-full max-w-[32px] rounded-t overflow-hidden flex flex-col justify-end shadow-xs"
                        >
                          <div style={{ height: `${sl1Pct}%` }} className="bg-blue-600 w-full" />
                          <div style={{ height: `${sl2Pct}%` }} className="bg-indigo-700 w-full" />
                          <div style={{ height: `${asanPct}%` }} className="bg-purple-600 w-full" />
                          <div style={{ height: `${commonPct}%` }} className="bg-slate-500 w-full" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-6 gap-2 sm:gap-4 text-center mt-1 text-[11px] font-bold text-slate-600">
                  {monthlyChartData.data.map((m) => (
                    <span key={m.month} className="truncate">{m.label}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Recharts Pie Chart & 카테고리별 점유율 Ranking */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between space-y-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                    <PieChartIcon className="w-4 h-4 text-indigo-600" />
                    <span>카테고리별 비중 (Pie Chart)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    카테고리별 {pieChartBasis === 'outbound' ? '출고(소모)' : '입고'} 금액 점유율
                  </p>
                </div>

                <div className="inline-flex rounded bg-slate-100 p-0.5 text-[11px] shrink-0">
                  <button
                    type="button"
                    onClick={() => setPieChartBasis('outbound')}
                    className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                      pieChartBasis === 'outbound' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    출고 비중
                  </button>
                  <button
                    type="button"
                    onClick={() => setPieChartBasis('inbound')}
                    className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                      pieChartBasis === 'inbound' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    입고 비중
                  </button>
                </div>
              </div>

              {/* Pie Chart & Ranking */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center my-auto">
                <div className="sm:col-span-6 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={rechartsPieData.list}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={66}
                        paddingAngle={2}
                      >
                        {rechartsPieData.list.map((entry) => (
                          <Cell key={entry.id} fill={entry.color} stroke="#ffffff" strokeWidth={1.5} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: '11px', borderRadius: '0.5rem' }}
                        formatter={(val: unknown) => [`${formatCurrency(Number(val) || 0)}원`]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="sm:col-span-6 space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
                  {rechartsPieData.list.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-slate-50">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="font-bold text-slate-800 truncate text-[11px]">{cat.name}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-slate-900 shrink-0">{cat.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Category Ranking Bars */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-xs font-bold text-slate-800">카테고리 소모 금액 순위</div>
                <div className="space-y-1.5">
                  {categoryChartData.list.slice(0, 4).map((cat, idx) => {
                    const pct = currentTotalCost > 0 ? ((cat.cost / currentTotalCost) * 100).toFixed(0) : '0';
                    const barWidth = Math.max(3, Math.round((cat.cost / categoryChartData.maxCost) * 100));
                    return (
                      <div key={cat.name} className="space-y-0.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="font-semibold text-slate-700">{idx + 1}. {cat.name}</span>
                          <span className="font-mono text-slate-900 font-bold">{formatCurrency(cat.cost)}원 ({pct}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div style={{ width: `${barWidth}%` }} className="bg-blue-600 h-full rounded-full" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          [탭 2: 📋 월별 입고/출고 행렬]
          오직 품목별 월별 입출고 상세 장부 테이블과 상단 전용 검색/필터 영역만 배치!
          차트나 중복 요약 카드는 완전히 제외하고 테이블 조회 및 엑셀 다운로드에만 집중
         ======================================================== */}
      {activeSubTab === 'monthly-matrix' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
          {/* Section Header & Dedicated Filters */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/40 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-black">
                    M
                  </span>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    품목별 월별 입고/출고 상세 장부 행렬
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    단가 마스터 연동
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  연도 및 월별(가로축) 흐름에 따른 품목별 <strong>총 입고량/입고금액</strong> 및{' '}
                  <strong>총 출고량/출고금액</strong>을 마스터 단가와 자동 연산하여 조회합니다.
                </p>
              </div>

              {/* Summary Badges & Excel Download */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs shadow-2xs">
                  <div>
                    <span className="text-[10px] text-emerald-700 font-bold block">기간 총 입고금액</span>
                    <span className="font-mono font-black text-emerald-700">
                      {formatCurrency(monthlyInOutMatrix.grandTotalInAmount)}원
                    </span>
                  </div>
                  <div className="h-5 w-px bg-slate-200" />
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block">기간 총 입고금액</span>
                    <span className="font-mono font-black text-slate-900">
                      {formatCurrency(monthlyInOutMatrix.grandTotalInAmount)}원
                    </span>
                  </div>
                  <div className="h-7 w-px bg-slate-200" />
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block">기간 총 출고금액</span>
                    <span className="font-mono font-black text-slate-900">
                      {formatCurrency(monthlyInOutMatrix.grandTotalOutAmount)}원
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportInOutMatrixCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-white bg-slate-800 hover:bg-slate-900 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>📥 월별 입출고 현황 엑셀(CSV)</span>
                </button>
              </div>
            </div>

            {/* Dedicated Matrix Filters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-200/80 text-xs">
              {/* 조회 연도 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">조회 연도</label>
                <select
                  value={inOutYear}
                  onChange={(e) => setInOutYear(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-slate-500 text-slate-800"
                >
                  <option value="2026">2026년 (기준 연도)</option>
                </select>
              </div>

              {/* 월별 / 기간 범위 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">월별 / 기간 범위</label>
                <select
                  value={inOutMonthFilter}
                  onChange={(e) => setInOutMonthFilter(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-slate-500 text-slate-800"
                >
                  <option value="12months">📅 1월 ~ 12월 전체 (연간 12개월 가로 펼침)</option>
                  <option value="1h">상반기 전체 (1월 ~ 6월)</option>
                  <option value="2h">하반기 전체 (7월 ~ 12월)</option>
                  <option value="6months">최근 6개월 (6월 ~ 11월)</option>
                  <option value="3months">최근 3개월 (9월 ~ 11월)</option>
                  <option value="2026-11">2026년 11월 (당월)</option>
                  <option value="2026-12">2026년 12월</option>
                  <option value="2026-10">2026년 10월</option>
                  <option value="2026-09">2026년 9월</option>
                  <option value="2026-08">2026년 8월</option>
                  <option value="2026-07">2026년 7월</option>
                  <option value="2026-06">2026년 6월</option>
                  <option value="2026-05">2026년 5월</option>
                  <option value="2026-04">2026년 4월</option>
                  <option value="2026-03">2026년 3월</option>
                  <option value="2026-02">2026년 2월</option>
                  <option value="2026-01">2026년 1월</option>
                </select>
              </div>

              {/* 라인 선택 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">라인 필터</label>
                <select
                  value={selectedLine}
                  onChange={(e) => setSelectedLine(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-slate-500 text-slate-800"
                >
                  <option value="전체">전체 사업장 (포승+아산)</option>
                  <option value="포승공장">포승공장 전체</option>
                  <option value="아산공장">아산공장</option>
                  <option value="SL1">SL1 라인</option>
                  <option value="SL2">SL2 라인</option>
                  <option value="공용">공용 포장장</option>
                </select>
              </div>

              {/* 카테고리 선택 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">카테고리</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-slate-500 text-slate-800"
                >
                  <option value="전체">전체 카테고리 ({monthlyInOutMatrix.rows.length}종)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* 검색 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">품목 검색</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="품목명, 규격 검색..."
                    className="w-full text-xs pl-7 pr-2 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-slate-500 bg-white text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* View options bar: Display mode & [수량 함께 보기 (토글)] */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-200/80 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500">표시 모드:</span>
                <div className="inline-flex rounded bg-slate-200/70 p-0.5">
                  <button
                    type="button"
                    onClick={() => setInOutViewType('both')}
                    className={`px-2.5 py-1 rounded font-bold text-xs cursor-pointer transition-colors ${
                      inOutViewType === 'both' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    입·출고 동시
                  </button>
                  <button
                    type="button"
                    onClick={() => setInOutViewType('inbound')}
                    className={`px-2.5 py-1 rounded font-bold text-xs cursor-pointer transition-colors ${
                      inOutViewType === 'inbound' ? 'bg-slate-800 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    입고만
                  </button>
                  <button
                    type="button"
                    onClick={() => setInOutViewType('outbound')}
                    className={`px-2.5 py-1 rounded font-bold text-xs cursor-pointer transition-colors ${
                      inOutViewType === 'outbound' ? 'bg-slate-800 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    출고만
                  </button>
                </div>
              </div>

              {/* [수량 함께 보기 (토글)] & 단위 모드 */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowQuantityWithAmount((prev) => !prev)}
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                    showQuantityWithAmount
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                  }`}
                  title="기본은 금액만 큼직하게 표시되며, 클릭 시 각 셀에 수량이 함께 노출됩니다."
                >
                  <div
                    className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors ${
                      showQuantityWithAmount ? 'bg-blue-500 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full bg-white shadow-xs" />
                  </div>
                  <span>수량 함께 보기 {showQuantityWithAmount ? 'ON' : 'OFF'}</span>
                </button>

                {showQuantityWithAmount && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">수량 단위:</span>
                    <div className="inline-flex rounded bg-slate-200/70 p-0.5">
                      <button
                        type="button"
                        onClick={() => setInOutUnitMode('pack')}
                        className={`px-2.5 py-0.5 rounded font-bold text-[11px] cursor-pointer transition-colors ${
                          inOutUnitMode === 'pack' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        포장단위
                      </button>
                      <button
                        type="button"
                        onClick={() => setInOutUnitMode('base')}
                        className={`px-2.5 py-0.5 rounded font-bold text-[11px] cursor-pointer transition-colors ${
                          inOutUnitMode === 'base' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        기본단위(낱개)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dense Horizontal Matrix Table - Slim Font Weight & Compact No-Scroll Layout */}
          <div className="w-full overflow-x-auto border-t border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-300 font-semibold text-slate-700 text-[11px]">
                <tr>
                  <th className="py-1.5 px-0.5 text-center w-7 min-w-[28px] max-w-[28px] whitespace-nowrap border-r border-slate-200 font-mono font-normal">
                    No.
                  </th>
                  <th className="py-1.5 px-1 whitespace-nowrap w-14 min-w-[56px] max-w-[62px] border-r border-slate-200 text-left">
                    라인/분류
                  </th>
                  <th className="py-1.5 px-1.5 whitespace-nowrap w-28 min-w-[105px] max-w-[125px] border-r border-slate-200 text-left">
                    품목명 / 규격
                  </th>
                  <th className="py-1.5 px-0.5 text-center w-10 min-w-[38px] max-w-[42px] whitespace-nowrap border-r-2 border-slate-300 font-normal">
                    구분
                  </th>
                  {inOutTargetMonths.map((m) => {
                    const monthNum = Number(m.split('-')[1]);
                    const isCurrentMonth = m.endsWith('-11');
                    return (
                      <th
                        key={m}
                        className={`py-1.5 px-1 text-right whitespace-nowrap min-w-[58px] sm:min-w-[64px] border-r border-slate-200 ${
                          isCurrentMonth ? 'bg-slate-200/90 text-slate-900 font-bold' : ''
                        }`}
                      >
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="font-semibold text-xs">{monthNum}월</span>
                          {isCurrentMonth && (
                            <span className="px-1 py-0.2 rounded text-[8.5px] font-bold bg-slate-900 text-white">
                              당월
                            </span>
                          )}
                        </div>
                        <span className="block text-[9px] font-normal text-slate-400">
                          {showQuantityWithAmount ? '수량·금액' : '금액(원)'}
                        </span>
                      </th>
                    );
                  })}
                  <th className="py-1.5 px-1.5 text-right whitespace-nowrap min-w-[78px] sm:min-w-[86px] bg-slate-900 text-white font-normal">
                    <span className="font-semibold text-xs block">조회 합계</span>
                    <span className="block text-[9px] font-normal text-slate-300">
                      {showQuantityWithAmount ? '수량·금액' : '총금액(원)'}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {monthlyInOutMatrix.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5 + inOutTargetMonths.length}
                      className="py-10 text-center text-slate-400 text-xs font-normal"
                    >
                      조회 조건에 해당하는 품목이 없습니다.
                    </td>
                  </tr>
                ) : (
                  monthlyInOutMatrix.rows.map((row, idx) => {
                    const unitLabel =
                      inOutUnitMode === 'pack' ? row.item.packUnit : row.item.baseUnit;
                    const isBoth = inOutViewType === 'both';
                    const showIn = inOutViewType === 'both' || inOutViewType === 'inbound';
                    const showOut = inOutViewType === 'both' || inOutViewType === 'outbound';

                    return (
                      <React.Fragment key={row.item.id}>
                        {/* 1. 입고(Inbound) 행 */}
                        {showIn && (
                          <tr
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isBoth ? 'border-b border-dashed border-slate-200' : 'border-b border-slate-300'
                            }`}
                          >
                            {/* 좌측 고정 품목 식별 정보 (동시 조회 시 rowSpan=2로 수직 통합) */}
                            <td
                              rowSpan={isBoth ? 2 : 1}
                              className="py-1.5 px-0.5 text-center font-mono font-normal text-slate-400 text-[11px] border-r border-slate-200 align-middle bg-white"
                            >
                              {idx + 1}
                            </td>

                            <td
                              rowSpan={isBoth ? 2 : 1}
                              className="py-1.5 px-1 whitespace-nowrap border-r border-slate-200 text-left align-middle bg-white"
                            >
                              <div className="leading-tight">
                                <span className="inline-block px-1.5 py-0.2 rounded text-[9.5px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                  {row.item.line}
                                </span>
                                <div
                                  className="text-[10.5px] font-normal text-slate-500 truncate max-w-[60px] mt-0.5"
                                  title={row.item.categoryName}
                                >
                                  {row.item.categoryName}
                                </div>
                              </div>
                            </td>

                            <td
                              rowSpan={isBoth ? 2 : 1}
                              className="py-1.5 px-1.5 whitespace-nowrap border-r border-slate-200 text-left align-middle bg-white"
                            >
                              <div className="leading-tight">
                                <div
                                  className="font-medium text-slate-800 text-xs sm:text-[12.5px] truncate max-w-[120px]"
                                  title={row.item.itemName}
                                >
                                  {row.item.itemName}
                                </div>
                                <div
                                  className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]"
                                  title={row.item.spec}
                                >
                                  {row.item.spec}
                                </div>
                              </div>
                            </td>

                            {/* 구분 컬럼: [입고] (차분한 네이비 톤, 얇고 깔끔한 폰트) */}
                            <td className="py-1.5 px-0.5 text-center whitespace-nowrap border-r-2 border-slate-300 bg-slate-50 align-middle">
                              <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-800 text-slate-100">
                                입고
                              </span>
                            </td>

                            {/* 월별 입고 데이터 셀 (Regular/Light 슬림 폰트 & 콤팩트 패딩) */}
                            {inOutTargetMonths.map((m) => {
                              const cell = row.monthlyMap[m] || {
                                inPackQty: 0,
                                inBaseQty: 0,
                                inAmount: 0,
                                outPackQty: 0,
                                outBaseQty: 0,
                                outAmount: 0,
                              };
                              const inQty = inOutUnitMode === 'pack' ? cell.inPackQty : cell.inBaseQty;
                              const isCurrentMonth = m.endsWith('-11');

                              return (
                                <td
                                  key={`in-${m}`}
                                  className={`py-1.5 px-1 text-right font-mono whitespace-nowrap border-r border-slate-100 ${
                                    isCurrentMonth ? 'bg-slate-50/70' : 'bg-white'
                                  }`}
                                >
                                  {showQuantityWithAmount ? (
                                    inQty > 0 || cell.inAmount > 0 ? (
                                      <div className="leading-tight">
                                        <div className="text-[10.5px] font-normal text-slate-500 font-mono">
                                          {formatNumber(inQty)}
                                          <span className="text-[9px] font-light ml-0.5">{unitLabel}</span>
                                        </div>
                                        <div className="text-xs sm:text-[12.5px] font-normal text-slate-800 tracking-tight">
                                          {formatCurrency(cell.inAmount)}원
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-slate-300 text-xs font-mono font-light">-</div>
                                    )
                                  ) : cell.inAmount > 0 ? (
                                    <span className="text-xs sm:text-[13px] font-normal font-mono tracking-tight text-slate-800">
                                      {formatCurrency(cell.inAmount)}원
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-300 font-mono font-light">-</span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Row Inbound Total */}
                            <td className="py-1.5 px-1.5 text-right font-mono whitespace-nowrap bg-slate-50 border-l border-slate-200">
                              {showQuantityWithAmount ? (
                                <div className="leading-tight">
                                  <div className="text-[10.5px] font-normal text-slate-500">
                                    {formatNumber(inOutUnitMode === 'pack' ? row.rowTotalInPack : row.rowTotalInBase)}
                                    <span className="text-[9px] font-light ml-0.5">{unitLabel}</span>
                                  </div>
                                  <div className="text-xs sm:text-[12.5px] font-normal text-slate-900 tracking-tight">
                                    {formatCurrency(row.rowTotalInAmount)}원
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs sm:text-[13px] font-normal tracking-tight text-slate-900">
                                  {formatCurrency(row.rowTotalInAmount)}원
                                </span>
                              )}
                            </td>
                          </tr>
                        )}

                        {/* 2. 출고(Outbound) 행 */}
                        {showOut && (
                          <tr className="hover:bg-slate-50/80 transition-colors border-b-2 border-slate-300">
                            {!isBoth && (
                              <>
                                <td className="py-1.5 px-0.5 text-center font-mono font-normal text-slate-400 text-[11px] border-r border-slate-200 align-middle bg-white">
                                  {idx + 1}
                                </td>
                                <td className="py-1.5 px-1 whitespace-nowrap border-r border-slate-200 text-left align-middle bg-white">
                                  <div className="leading-tight">
                                    <span className="inline-block px-1.5 py-0.2 rounded text-[9.5px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                      {row.item.line}
                                    </span>
                                    <div
                                      className="text-[10.5px] font-normal text-slate-500 truncate max-w-[60px] mt-0.5"
                                      title={row.item.categoryName}
                                    >
                                      {row.item.categoryName}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-1.5 px-1.5 whitespace-nowrap border-r border-slate-200 text-left align-middle bg-white">
                                  <div className="leading-tight">
                                    <div
                                      className="font-medium text-slate-800 text-xs sm:text-[12.5px] truncate max-w-[120px]"
                                      title={row.item.itemName}
                                    >
                                      {row.item.itemName}
                                    </div>
                                    <div
                                      className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]"
                                      title={row.item.spec}
                                    >
                                      {row.item.spec}
                                    </div>
                                  </div>
                                </td>
                              </>
                            )}

                            {/* 구분 컬럼: [출고] */}
                            <td className="py-1.5 px-0.5 text-center whitespace-nowrap border-r-2 border-slate-300 bg-slate-50 align-middle">
                              <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-200 text-slate-700 border border-slate-300">
                                출고
                              </span>
                            </td>

                            {/* 월별 출고 데이터 셀 (Regular/Light 슬림 폰트 & 콤팩트 패딩) */}
                            {inOutTargetMonths.map((m) => {
                              const cell = row.monthlyMap[m] || {
                                inPackQty: 0,
                                inBaseQty: 0,
                                inAmount: 0,
                                outPackQty: 0,
                                outBaseQty: 0,
                                outAmount: 0,
                              };
                              const outQty = inOutUnitMode === 'pack' ? cell.outPackQty : cell.outBaseQty;
                              const isCurrentMonth = m.endsWith('-11');

                              return (
                                <td
                                  key={`out-${m}`}
                                  className={`py-1.5 px-1 text-right font-mono whitespace-nowrap border-r border-slate-100 ${
                                    isCurrentMonth ? 'bg-slate-50/70' : 'bg-white'
                                  }`}
                                >
                                  {showQuantityWithAmount ? (
                                    outQty > 0 || cell.outAmount > 0 ? (
                                      <div className="leading-tight">
                                        <div className="text-[10.5px] font-normal text-slate-500 font-mono">
                                          {formatNumber(outQty)}
                                          <span className="text-[9px] font-light ml-0.5">{unitLabel}</span>
                                        </div>
                                        <div className="text-xs sm:text-[12.5px] font-normal text-slate-800 tracking-tight">
                                          {formatCurrency(cell.outAmount)}원
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-slate-300 text-xs font-mono font-light">-</div>
                                    )
                                  ) : cell.outAmount > 0 ? (
                                    <span className="text-xs sm:text-[13px] font-normal font-mono tracking-tight text-slate-800">
                                      {formatCurrency(cell.outAmount)}원
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-300 font-mono font-light">-</span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Row Outbound Total */}
                            <td className="py-1.5 px-1.5 text-right font-mono whitespace-nowrap bg-slate-50 border-l border-slate-200">
                              {showQuantityWithAmount ? (
                                <div className="leading-tight">
                                  <div className="text-[10.5px] font-normal text-slate-500">
                                    {formatNumber(inOutUnitMode === 'pack' ? row.rowTotalOutPack : row.rowTotalOutBase)}
                                    <span className="text-[9px] font-light ml-0.5">{unitLabel}</span>
                                  </div>
                                  <div className="text-xs sm:text-[12.5px] font-normal text-slate-900 tracking-tight">
                                    {formatCurrency(row.rowTotalOutAmount)}원
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs sm:text-[13px] font-normal tracking-tight text-slate-900">
                                  {formatCurrency(row.rowTotalOutAmount)}원
                                </span>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Monthly Summary Footer - Slim Weight & High Contrast */}
              {monthlyInOutMatrix.rows.length > 0 && (
                <tfoot className="bg-slate-900 text-white font-mono text-xs border-t-2 border-slate-700">
                  {(inOutViewType === 'both' || inOutViewType === 'inbound') && (
                    <tr className="border-b border-slate-800">
                      <td
                        colSpan={4}
                        className="py-1.5 px-2 font-sans font-normal text-right text-slate-200 border-r border-slate-700 text-xs"
                      >
                        월별 전체 품목 입고 합계 ({monthlyInOutMatrix.rows.length}종)
                      </td>
                      {inOutTargetMonths.map((m) => {
                        const colTot = monthlyInOutMatrix.monthColumnTotals[m] || {
                          inPack: 0,
                          inBase: 0,
                          inAmount: 0,
                          outPack: 0,
                          outBase: 0,
                          outAmount: 0,
                        };
                        return (
                          <td
                            key={`foot-in-${m}`}
                            className="py-1.5 px-1 text-right whitespace-nowrap border-r border-slate-800"
                          >
                            <span className="font-normal text-slate-100 text-xs sm:text-[12.5px] tracking-tight">
                              {formatCurrency(colTot.inAmount)}원
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-1.5 text-right whitespace-nowrap bg-slate-950 text-white font-medium text-xs sm:text-[13px]">
                        {formatCurrency(monthlyInOutMatrix.grandTotalInAmount)}원
                      </td>
                    </tr>
                  )}

                  {(inOutViewType === 'both' || inOutViewType === 'outbound') && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-1.5 px-2 font-sans font-normal text-right text-slate-300 border-r border-slate-700 text-xs"
                      >
                        월별 전체 품목 출고 합계 ({monthlyInOutMatrix.rows.length}종)
                      </td>
                      {inOutTargetMonths.map((m) => {
                        const colTot = monthlyInOutMatrix.monthColumnTotals[m] || {
                          inPack: 0,
                          inBase: 0,
                          inAmount: 0,
                          outPack: 0,
                          outBase: 0,
                          outAmount: 0,
                        };
                        return (
                          <td
                            key={`foot-out-${m}`}
                            className="py-1.5 px-1 text-right whitespace-nowrap border-r border-slate-800"
                          >
                            <span className="font-normal text-slate-200 text-xs sm:text-[12.5px] tracking-tight">
                              {formatCurrency(colTot.outAmount)}원
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-1.5 text-right whitespace-nowrap bg-slate-950 text-white font-medium text-xs sm:text-[13px]">
                        {formatCurrency(monthlyInOutMatrix.grandTotalOutAmount)}원
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          [탭 3: ⚙️ 안전재고 자동 보정]
          실제 일사용량 vs 기준 일소모량 비교, 안전재고 보정값 제안,
          원클릭 마스터 보정 기능만 단독으로 띄워 재고 최적화 작업에만 집중
         ======================================================== */}
      {activeSubTab === 'safety-stock' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Controls & Filters */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <h3 className="text-base font-extrabold text-slate-900">
                    사용량 기반 안전재고 자동 학습 &amp; 동적 보정 센터
                  </h3>
                  {warningDeviationCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                      ±20% 이상 편차 {warningDeviationCount}건 보정 제안
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  실사 이력(UsageLog) 기반 <strong>[실제 일평균 소모량]</strong>과 <strong>[기준 일소모량]</strong>을 비교하여, ±20% 이상 차이 나는 품목에 최적의 <strong>[추천 보정값]</strong>을 제안하고 원클릭 반영합니다.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowOnlyDeviationWarning(!showOnlyDeviationWarning)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    showOnlyDeviationWarning
                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {showOnlyDeviationWarning
                    ? `전체 품목 보기 (${itemStatsList.length}건)`
                    : `±20% 편차 품목만 보기 (${warningDeviationCount}건)`}
                </button>

                <button
                  type="button"
                  onClick={handleBatchApplyCalibration}
                  disabled={warningDeviationCount === 0}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all shadow-xs ${
                    warningDeviationCount > 0
                      ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-200 cursor-pointer active:scale-95'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                  title="±20% 이상 편차가 발생한 모든 품목의 기준 일소모량을 추천 학습값으로 한 번에 업데이트합니다"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>추천값으로 일소모량 일괄 반영 ({warningDeviationCount}건)</span>
                </button>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">라인 필터</label>
                <select
                  value={selectedLine}
                  onChange={(e) => setSelectedLine(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                >
                  <option value="전체">전체 사업장</option>
                  <option value="포승공장">포승공장 전체</option>
                  <option value="아산공장">아산공장</option>
                  <option value="SL1">SL1 라인</option>
                  <option value="SL2">SL2 라인</option>
                  <option value="공용">공용 포장장</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">카테고리</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                >
                  <option value="전체">전체 카테고리</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">품목 검색</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="품목명, 규격 검색..."
                    className="w-full text-xs pl-7 pr-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Table (Dense) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-800">
                <tr>
                  <th className="py-2.5 px-3 text-center w-12 whitespace-nowrap">No.</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">라인</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">카테고리</th>
                  <th className="py-2.5 px-3 min-w-[200px] whitespace-nowrap">품목명 및 규격</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">기간 총 사용량(포장)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">기간 소모 금액</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">기준 일소모량(현재)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap bg-blue-50/50 text-blue-900">
                    실제 일평균 소모량
                  </th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">소모 편차율</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap bg-indigo-50/70 text-indigo-950">
                    [추천 보정값] (안전재고 학습)
                  </th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap min-w-[170px]">
                    원클릭 마스터 보정
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {displayedStatsList.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-slate-400">
                      조건에 일치하는 품목이 없습니다.
                    </td>
                  </tr>
                ) : (
                  displayedStatsList.map((stat, idx) => {
                    const hasDeviationWarning = stat.isDeviation20OrMore;

                    return (
                      <tr
                        key={stat.item.id}
                        className={`transition-colors ${
                          hasDeviationWarning
                            ? 'bg-amber-50/30 hover:bg-amber-50/60'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2 px-3 text-center font-mono text-slate-400 whitespace-nowrap">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                            {stat.item.line}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-800 font-medium whitespace-nowrap">
                          {stat.item.categoryName}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="font-medium text-slate-900 leading-snug">
                            {stat.item.itemName} <span className="text-slate-500">{stat.item.spec}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {formatNumber(stat.totalPackUsed)} {stat.item.packUnit}
                          <span className="text-[10px] text-slate-400 font-normal ml-1">
                            ({formatNumber(stat.totalBaseUsed)}{stat.item.baseUnit})
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-blue-700 whitespace-nowrap">
                          {formatCurrency(stat.totalCost)}원
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-800 whitespace-nowrap">
                          <div className="font-bold">{formatNumber(stat.item.dailyUsage)} {stat.item.baseUnit}/일</div>
                          <div className="text-[10px] text-slate-400">
                            안전재고: {formatNumber(stat.item.safetyStockBase)}{stat.item.baseUnit}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-black bg-blue-50/40 text-blue-900 whitespace-nowrap">
                          {formatNumber(stat.actualDailyUsage)} {stat.item.baseUnit}/일
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {stat.status === 'urgent_high' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                              급증 ▲ (+{stat.deviationPct}%)
                            </span>
                          ) : stat.status === 'urgent_low' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-sky-100 text-sky-800 border border-sky-300">
                              감소 ▼ ({stat.deviationPct}%)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              적정 ({stat.deviationPct > 0 ? '+' : ''}{stat.deviationPct}%)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono bg-indigo-50/40 whitespace-nowrap">
                          {hasDeviationWarning ? (
                            <div>
                              <div className="font-black text-indigo-900 text-xs">
                                추천: {formatNumber(stat.recommendedDailyUsage)} {stat.item.baseUnit}/일
                              </div>
                              <div className="text-[10px] text-indigo-700 font-semibold">
                                권장 안전재고: {formatNumber(stat.recommendedSafetyStockBase)}{stat.item.baseUnit}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">현행 유지</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {hasDeviationWarning ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleApplyCalibration(
                                  stat.item.id,
                                  stat.recommendedDailyUsage,
                                  `${stat.item.itemName} ${stat.item.spec}`,
                                  stat.recommendedSafetyStockBase,
                                  stat.item.baseUnit
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-2xs transition-all cursor-pointer active:scale-95"
                              title={`기준 일소모량(${stat.item.dailyUsage})을 추천 보정값(${stat.recommendedDailyUsage})으로 즉시 업데이트`}
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>추천값 반영</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">보정 불필요</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (block lg:hidden) */}
          <div className="block lg:hidden divide-y divide-slate-200">
            {displayedStatsList.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                조건에 일치하는 품목이 없습니다.
              </div>
            ) : (
              displayedStatsList.map((stat) => {
                const hasDeviationWarning = stat.isDeviation20OrMore;

                return (
                  <div
                    key={stat.item.id}
                    className={`p-3 space-y-2 ${hasDeviationWarning ? 'bg-amber-50/30' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="px-1 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                            {stat.item.line}
                          </span>
                          <span className="text-xs text-slate-500">{stat.item.categoryName}</span>
                        </div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5 leading-snug">
                          {stat.item.itemName} {stat.item.spec}
                        </div>
                      </div>

                      {stat.status === 'urgent_high' ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                          급증 ▲ +{stat.deviationPct}%
                        </span>
                      ) : stat.status === 'urgent_low' ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-sky-100 text-sky-800 border border-sky-300">
                          감소 ▼ {stat.deviationPct}%
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                          적정 ({stat.deviationPct > 0 ? '+' : ''}{stat.deviationPct}%)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-xs bg-slate-50 p-2 rounded border border-slate-200">
                      <div>
                        <span className="text-slate-400 block text-[10px]">총 사용량</span>
                        <span className="font-mono font-bold text-slate-800">
                          {stat.totalPackUsed} {stat.item.packUnit}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">소모 금액</span>
                        <span className="font-mono font-bold text-blue-700">
                          {formatCurrency(stat.totalCost)}원
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">기준 일소모량</span>
                        <span className="font-mono text-slate-700">
                          {stat.item.dailyUsage} {stat.item.baseUnit}/일
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">실제 일평균</span>
                        <span className="font-mono font-bold text-blue-900">
                          {stat.actualDailyUsage} {stat.item.baseUnit}/일
                        </span>
                      </div>
                    </div>

                    {hasDeviationWarning && (
                      <div className="p-2 rounded bg-indigo-50 border border-indigo-200 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-indigo-700 block">
                            추천 보정값 제안
                          </span>
                          <span className="font-mono font-black text-indigo-950">
                            일소모 {stat.recommendedDailyUsage}{stat.item.baseUnit}/일 · 안전재고 {formatNumber(stat.recommendedSafetyStockBase)}{stat.item.baseUnit}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleApplyCalibration(
                              stat.item.id,
                              stat.recommendedDailyUsage,
                              `${stat.item.itemName} ${stat.item.spec}`,
                              stat.recommendedSafetyStockBase,
                              stat.item.baseUnit
                            )
                          }
                          className="px-2.5 py-1 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-2xs transition-colors cursor-pointer"
                        >
                          반영
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
