import { Category, CalculatedItem, InventoryItem, OrderPolicyType, UserAccount, Vendor } from '../types';

export const TODAY_STR = '2026-11-07';

export function calculateItemMetrics(
  item: InventoryItem,
  category: Category | undefined,
  vendor: Vendor | undefined
): CalculatedItem {
  // 1. 현재재고(기본단위) = 현재 포장수량 * 입고단위 환산계수
  const currentBaseStock = Number((item.currentPackStock * item.unitConversion).toFixed(2));

  // 2. 발주 정책 판정 (DAYS_BASED vs QTY_BASED)
  const orderPolicyType: OrderPolicyType = category?.orderPolicyType || 'DAYS_BASED';
  const isQtyBased = orderPolicyType === 'QTY_BASED';

  const safetyDays = category ? category.safetyDays : 10;
  const orderCycleDays = category ? category.orderCycleDays : 30;

  // 수량 기준 파라미터 (품목 마스터 설정 우선, 미지정 시 카테고리 기본값 사용)
  const triggerPackQty =
    item.triggerPackQty !== null && item.triggerPackQty !== undefined
      ? item.triggerPackQty
      : category?.defaultTriggerPackQty ?? 5;

  const triggerBaseQty = Number((triggerPackQty * item.unitConversion).toFixed(2));

  const fixedOrderPackQty =
    item.fixedOrderPackQty !== null && item.fixedOrderPackQty !== undefined
      ? item.fixedOrderPackQty
      : category?.defaultOrderPackQty ?? 10;

  let remainingDays = 999;
  let safetyStockBase = 0;
  let isStockLow = false;
  let isImminent = false;
  let recommendedBaseOrderQty = 0;
  let recommendedPackOrderQty = 1;

  if (isQtyBased) {
    // ==========================================
    // Case B: 재고수량(고정) 기준 ('QTY_BASED')
    // ==========================================
    safetyStockBase = triggerBaseQty;

    // 잔여일수: 일사용량이 있으면 계산, 없으면 999
    remainingDays =
      item.dailyUsage > 0
        ? Number((currentBaseStock / item.dailyUsage).toFixed(2))
        : 999;

    // 발주 필요: 현재 실사재고(포장) <= 기준 재고수량(포장)
    isStockLow = item.currentPackStock <= triggerPackQty;

    // 발주 임박: 기준재고 초과이나 기준수량의 125% 이하로 근접했을 때
    const imminentThresholdPackQty = Math.max(triggerPackQty + 1, Math.ceil(triggerPackQty * 1.25));
    isImminent = !isStockLow && item.currentPackStock <= imminentThresholdPackQty;

    // 권장 발주량: 고정 발주 수량
    recommendedPackOrderQty = Math.max(1, fixedOrderPackQty);
    recommendedBaseOrderQty = Number((recommendedPackOrderQty * item.unitConversion).toFixed(2));
  } else {
    // ==========================================
    // Case A: 안전재고(일수) 기준 ('DAYS_BASED')
    // ==========================================
    remainingDays =
      item.dailyUsage > 0
        ? Number((currentBaseStock / item.dailyUsage).toFixed(2))
        : 999;

    safetyStockBase = Math.round(item.dailyUsage * safetyDays);

    const leadTime = item.leadTimeDays || (vendor ? vendor.defaultLeadTime : 3);
    const imminentThresholdDays = Number((safetyDays + Math.max(3, leadTime)).toFixed(2));

    isStockLow = currentBaseStock <= safetyStockBase || remainingDays <= safetyDays;
    isImminent = !isStockLow && remainingDays <= imminentThresholdDays;

    recommendedBaseOrderQty = Math.round(item.dailyUsage * orderCycleDays);
    recommendedPackOrderQty =
      item.unitConversion > 0
        ? Math.max(1, Math.ceil(recommendedBaseOrderQty / item.unitConversion))
        : 1;
  }

  const orderUrgency: 'urgent' | 'warning' | 'normal' = isStockLow
    ? 'urgent'
    : isImminent
    ? 'warning'
    : 'normal';

  const needsOrder = isStockLow && item.orderStatus === '발주대기';
  const isOrderImminent = isImminent && item.orderStatus === '발주대기';

  // D-Day 계산
  const { dDayText, dDayStatus } = calculateDDay(item.expectedArrivalDate, item.orderStatus);

  // 주간실사 지연 판정 (7일 이상 경과 또는 미실사 품목 경고)
  const { isAuditDelayed, daysSinceLastAudit } = calculateAuditDelay(item.lastAuditDate);

  const defaultDeliveryLocation = getDefaultDeliveryLocationForLine(item.line, category);
  const customLoc = item.deliveryDetailLocation?.trim();
  const isCustomDeliveryLocation = Boolean(customLoc);
  const effectiveDeliveryLocation = customLoc || defaultDeliveryLocation;

  return {
    ...item,
    currentBaseStock,
    remainingDays,
    safetyStockBase,
    needsOrder,
    isOrderImminent,
    orderUrgency,
    recommendedBaseOrderQty,
    recommendedPackOrderQty,
    categoryName: category?.name || '기타',
    vendorName: vendor?.name || '미지정',
    dDayText,
    dDayStatus,
    orderPolicyType,
    isQtyBased,
    triggerPackQty,
    triggerBaseQty,
    fixedOrderPackQty,
    deliveryLocation: effectiveDeliveryLocation,
    defaultDeliveryLocation,
    isCustomDeliveryLocation,
    receiverLoginId: item.receiverLoginId,
    receiverName: item.receiverName,
    receiverPhone: item.receiverPhone,
    deliveryDetailLocation: customLoc || undefined,
    isAuditDelayed,
    daysSinceLastAudit,
  };
}

/**
 * 라인 및 카테고리 설정에 따른 기본(Default) 수령장소 반환
 * 1순위: 카테고리에 설정된 라인별 기본 수령장소 (`category.lineDeliveryLocations[line]`)
 * 2순위: 카테고리의 기본 납품장소 (`category.deliveryLocation`) — 단, 라인(SL1, SL2, 아산공장)에 맞춰 자동 정교화
 * 3순위: 라인별 표준 기본 하역장소
 */
export function getDefaultDeliveryLocationForLine(
  line: string,
  category?: Category
): string {
  const normLine = normalizeLineName(line) as 'SL1' | 'SL2' | '공용' | '아산공장';

  // 1. 카테고리 내 라인별 지정 납품장소가 있으면 최우선 적용
  const lineSpecific =
    category?.lineDeliveryLocations?.[normLine]?.trim() ||
    category?.lineDeliveryLocations?.[line as keyof NonNullable<Category['lineDeliveryLocations']>]?.trim();
  if (lineSpecific) {
    return lineSpecific;
  }

  // 2. 카테고리 기본 납품장소(Default)가 있는 경우
  const catDefault = category?.deliveryLocation?.trim();
  if (catDefault) {
    // 아산공장 배정 품목인데 카테고리 기본값이 포승공장 전용 문구인 경우 아산공장 기본 위치로 자동 보정
    if (isAsanLine(line) && catDefault.includes('포승') && !catDefault.includes('아산')) {
      return `아산공장 SL라인 (${category?.name || '현장'} 하역장)`;
    }
    // 포승공장 배정 품목인데 카테고리 기본값이 아산공장 전용 문구인 경우 포승 라인 위치로 자동 보정
    if (isPoseungLine(line) && catDefault.includes('아산') && !catDefault.includes('포승')) {
      if (normLine === 'SL1') return '포승공장 SL1라인 작업대';
      if (normLine === 'SL2') return '포승공장 SL2라인 작업대';
      return '포승공장 출하1번홈 (공용포장장)';
    }
    // 카테고리 기본값이 'SL1/SL2' 공용 표기일 때 품목이 SL1 또는 SL2로 배정된 경우 해당 라인명으로 구체화
    if (catDefault.includes('SL1/SL2')) {
      if (normLine === 'SL1') return catDefault.replace('SL1/SL2', 'SL1라인');
      if (normLine === 'SL2') return catDefault.replace('SL1/SL2', 'SL2라인');
    }
    return catDefault;
  }

  // 3. 라인별 기본값 폴백
  if (isAsanLine(line)) return '아산공장 SL라인 진입부';
  if (normLine === 'SL1') return '포승공장 SL1라인 작업대';
  if (normLine === 'SL2') return '포승공장 SL2라인 작업대';
  return '포승공장 출하1번홈 (공용포장장)';
}

/**
 * 품목의 최종 유효 수령장소(납품장소) 계산
 * - 품목 개별 지정(deliveryDetailLocation)이 있으면 최우선 적용 (오버라이드)
 * - 없으면 카테고리/라인 기본 수령장소(getDefaultDeliveryLocationForLine) 반환
 */
export function resolveEffectiveDeliveryLocation(
  item: Pick<InventoryItem, 'line' | 'deliveryDetailLocation'>,
  category?: Category
): string {
  const custom = item.deliveryDetailLocation?.trim();
  if (custom) return custom;
  return getDefaultDeliveryLocationForLine(item.line, category);
}

export const AUDIT_DELAY_THRESHOLD_DAYS = 7;

export function calculateAuditDelay(
  lastAuditDate?: string | null,
  thresholdDays: number = AUDIT_DELAY_THRESHOLD_DAYS
): { isAuditDelayed: boolean; daysSinceLastAudit: number | null } {
  if (!lastAuditDate || !lastAuditDate.trim()) {
    return { isAuditDelayed: true, daysSinceLastAudit: null };
  }
  const datePart = lastAuditDate.trim().slice(0, 10);
  const parsed = new Date(datePart);
  if (isNaN(parsed.getTime())) {
    return { isAuditDelayed: true, daysSinceLastAudit: null };
  }
  const today = new Date(TODAY_STR);
  const diffDays = Math.max(
    0,
    Math.round((today.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24))
  );
  return {
    isAuditDelayed: diffDays >= thresholdDays,
    daysSinceLastAudit: diffDays,
  };
}

export function getDeliveryAddressForLine(
  line: string,
  profile: { poseungAddress: string; asanAddress: string }
): string {
  return isAsanLine(line) ? profile.asanAddress : profile.poseungAddress;
}

export function getDefaultReceiverForLine(
  line: string,
  profile: { poseungDefaultReceiver: string; asanDefaultReceiver: string }
): string {
  return isAsanLine(line) ? profile.asanDefaultReceiver : profile.poseungDefaultReceiver;
}

export function calculateDDay(
  expectedArrivalDate: string | null,
  orderStatus: '발주대기' | '발주완료(입고대기)'
): { dDayText: string | null; dDayStatus: 'normal' | 'today' | 'overdue' | 'future' | null } {
  if (orderStatus !== '발주완료(입고대기)' || !expectedArrivalDate) {
    return { dDayText: null, dDayStatus: null };
  }

  const today = new Date(TODAY_STR);
  const target = new Date(expectedArrivalDate);

  // 차이 일수 계산 (밀리초 / 86400000)
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { dDayText: 'D-Day (오늘 입고)', dDayStatus: 'today' };
  } else if (diffDays > 0) {
    return { dDayText: `D-${diffDays}`, dDayStatus: 'future' };
  } else {
    return { dDayText: `지연 (+${Math.abs(diffDays)}일)`, dDayStatus: 'overdue' };
  }
}

export function addDaysToDate(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatNumber(num: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits,
  }).format(num);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount);
}

// 공장 표준 관리 라인 순서 ('SL1' > 'SL2' > '공용' > '아산공장')
export const LINE_ORDER: string[] = ['SL1', 'SL2', '공용', '공용(포장장)', '아산공장', '아산SL'];

export function normalizeLineName(line: string): string {
  if (line === '아산SL' || line === '아산공장') return '아산공장';
  if (line === '공용(포장장)' || line === '공용') return '공용';
  if (line === 'SL2') return 'SL2';
  return 'SL1';
}

export function isPoseungLine(line: string): boolean {
  return line === 'SL1' || line === 'SL2' || line === '공용' || line === '공용(포장장)';
}

export function isAsanLine(line: string): boolean {
  return line === '아산공장' || line === '아산SL';
}

export function matchLineFilter(itemLine: string, filter: string): boolean {
  if (
    filter === '전체' ||
    filter === '전체 사업장' ||
    filter === '전체 사업장 (포승+아산)'
  ) {
    return true;
  }
  if (
    filter === '포승공장' ||
    filter === '포승공장 전체' ||
    filter === '포승공장 전체 (SL1+SL2+공용)'
  ) {
    return isPoseungLine(itemLine);
  }
  if (
    filter === '아산공장' ||
    filter === '아산공장 (SL라인)' ||
    filter === '아산공장 전체'
  ) {
    return isAsanLine(itemLine);
  }
  if (filter === '공용' || filter === '공용(포장장)') {
    return itemLine === '공용' || itemLine === '공용(포장장)';
  }
  return itemLine === filter;
}

export function getLineSortPriority(line: string): number {
  const normalized = normalizeLineName(line);
  if (normalized === 'SL1') return 0;
  if (normalized === 'SL2') return 1;
  if (normalized === '공용') return 2;
  if (normalized === '아산공장') return 3;
  const idx = LINE_ORDER.indexOf(line);
  return idx !== -1 ? idx : 999;
}

export function compareItemsByDefaultOrder<
  T extends {
    line: string;
    categoryId?: string;
    categoryName?: string;
    itemName: string;
    spec: string;
  }
>(a: T, b: T, categoryOrderMap?: Map<string, number>): number {
  // 1순위: 라인 지정 순서 (SL1 > SL2 > 공용 > 아산공장)
  const scoreA = getLineSortPriority(a.line);
  const scoreB = getLineSortPriority(b.line);

  if (scoreA !== scoreB) {
    return scoreA - scoreB;
  }

  // 둘 다 지정 목록에 없는 신규 라인이면 가나다순
  if (scoreA === 999 && scoreB === 999) {
    const lineCmp = a.line.localeCompare(b.line, 'ko');
    if (lineCmp !== 0) return lineCmp;
  }

  // 2순위: 카테고리 마스터 순서 또는 이름순
  if (categoryOrderMap && a.categoryId && b.categoryId) {
    const catScoreA = categoryOrderMap.get(a.categoryId) ?? 999;
    const catScoreB = categoryOrderMap.get(b.categoryId) ?? 999;
    if (catScoreA !== catScoreB) {
      return catScoreA - catScoreB;
    }
  } else if (a.categoryName && b.categoryName) {
    const catCmp = a.categoryName.localeCompare(b.categoryName, 'ko');
    if (catCmp !== 0) return catCmp;
  }

  // 3순위: 품목명 순서
  const nameCmp = a.itemName.localeCompare(b.itemName, 'ko');
  if (nameCmp !== 0) return nameCmp;

  // 4순위: 동명 품목 규격 순서 (숫자 자연 정렬)
  return a.spec.localeCompare(b.spec, 'ko', { numeric: true });
}

/**
 * [계정 관리] 사용자 계정 정렬 함수 (소속 > 권한 레벨순)
 * - 1순위: 소속 공장/라인 기준 정렬 (포승공장, SL1, SL2, 공용, 아산공장 등)
 * - 2순위: 권한 레벨 순서 (LV.0 최고관리자 -> LV.1 현장관리자 -> LV.2 현장사용자 -> LV.3 사무실사용자 순)
 * - 3순위: 사용자 이름 가나다순 정렬
 */
export function compareUserAccountsByAffiliation(a: UserAccount, b: UserAccount): number {
  const affA = (a.affiliation || a.department || '포승공장').trim();
  const affB = (b.affiliation || b.department || '포승공장').trim();

  // 1순위: 소속 기준 오름차순 정렬 (가나다순)
  const lineCmp = affA.localeCompare(affB, 'ko', { numeric: true, sensitivity: 'base' });
  if (lineCmp !== 0) {
    return lineCmp;
  }

  // 2순위: 권한 레벨 순서 (숫자가 낮을수록 상위 권한: 0 -> 1 -> 2 -> 3)
  const levelA = Number.isFinite(a.level) ? a.level : 2;
  const levelB = Number.isFinite(b.level) ? b.level : 2;
  if (levelA !== levelB) {
    return levelA - levelB;
  }

  // 3순위: 사용자 이름(수령자명) 가나다순 정렬
  return (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true });   
  }

  // 4순위: 사용자 이름(수령자명) 가나다순 정렬
  return (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true });
}

