export type ProductionLine = 'SL1' | 'SL2' | '아산공장' | '공용' | '아산SL' | '공용(포장장)';

export interface CompanyProfile {
  companyName: string;
  bizNumber: string;
  ceoName: string;
  orderManagerDept: string;
  orderManagerName: string;
  orderManagerPhone: string;
  orderManagerEmail: string;
  poseungAddress: string;
  poseungDefaultReceiver: string;
  asanAddress: string;
  asanDefaultReceiver: string;
  defaultOrderNote: string;
  monthlyBudget?: number; // 월별 소모품 예산 한도 (원, 기본값: 5,000,000)
  // legacy backward-compatible aliases
  managerName?: string;
  managerDept?: string;
  phone?: string;
  email?: string;
  addressMain?: string;
  addressSub?: string;
}

export type OrderPolicyType = 'DAYS_BASED' | 'QTY_BASED';

export interface Category {
  id: string;
  name: string;
  orderPolicyType?: OrderPolicyType; // 'DAYS_BASED' (안전재고 일수 기준) | 'QTY_BASED' (일정 재고수량 기준)
  safetyDays: number; // 안전재고 기준일수 (일수 기준일 때: 예: 10, 15, 20, 30일)
  orderCycleDays: number; // 발주 주기 (일수 기준일 때: 예: 15, 20, 30, 60, 90일)
  defaultTriggerPackQty?: number; // 수량 기준일 때 기본값: 발주 기준 포장수량 (예: 5박스, 3코일 이하 시 발주)
  defaultOrderPackQty?: number; // 수량 기준일 때 기본값: 1회 고정 발주 포장수량 (예: 10박스, 20코일 발주)
  description?: string;
  deliveryLocation?: string; // 카테고리별 납품장소 (예: "포승공장 출하1번홈", "아산공장 SL2라인", "입고2번 창고")
}

export interface Unit {
  id: string;
  name: string;
  type: 'pack' | 'base' | 'both';
}

export interface Vendor {
  id: string;
  name: string;
  defaultLeadTime: number; // 납품기간 (일수)
  isActive: boolean;
  phone?: string;
  email?: string;
  contactPerson?: string;
  address?: string;
}

export interface InventoryItem {
  id: string;
  line: ProductionLine;
  categoryId: string;
  vendorId: string;
  itemName: string;
  spec: string;
  packUnit: string; // 포장 단위 (예: 다발, 코일, 박스, 롤, EA)
  baseUnit: string; // 기본 소모 단위 (예: EA, kg, ㎡)
  unitConversion: number; // 1 포장단위당 기본단위 수량 (예: 1다발 = 20 EA)
  currentPackStock: number; // 현장 입력: 현재 포장단위 재고수량
  dailyUsage: number; // 일평균 사용량 (기본단위 기준)
  unitPrice: number; // 현재 단가 (원)
  moqDescription: string; // 1회 기준 주문량 메모 (예: '10톤', '10,000EA')
  leadTimeDays: number; // 납품 소요일수 (일)
  orderStatus: '발주대기' | '발주완료(입고대기)';
  orderDate: string | null; // YYYY-MM-DD
  expectedArrivalDate: string | null; // 입고예정일 YYYY-MM-DD
  orderedPackQty: number | null; // 실제 발주한 포장단위 수량
  lastOrderDate: string | null; // 최근 발주일 이력 YYYY-MM-DD
  lastAuditDate?: string | null; // 마지막 실사확정 일시 (예: 2026-11-07 14:30)
  purpose: string; // 용도 (예: 생산설비 세척, 내수제품포장, 목재파렛트 제조 등)
  triggerPackQty?: number | null; // 품목 개별 발주 기준 포장수량 (미지정 시 카테고리 기본값 사용)
  fixedOrderPackQty?: number | null; // 품목 개별 1회 고정 발주 포장수량 (미지정 시 카테고리 기본값 사용)
  receiverLoginId?: string; // 품목별 현장 수령 담당자 로그인 아이디 (자동으로 LV.1 현장사용자 권한 부여)
  receiverName?: string; // 품목별 현장 수령 담당자명/직급 (예: '박현장 반장', '이아산 기장')
  receiverPhone?: string; // 품목별 현장 수령 담당자 연락처 (예: '010-8899-7721')
  deliveryDetailLocation?: string; // 품목별 세부 하역장소 오버라이드 (미입력 시 카테고리 납품장소 사용)
}

export interface CalculatedItem extends InventoryItem {
  currentBaseStock: number; // currentPackStock * unitConversion
  remainingDays: number; // currentBaseStock / dailyUsage
  safetyStockBase: number; // 일수 기준: dailyUsage * category.safetyDays / 수량 기준: triggerPackQty * unitConversion
  needsOrder: boolean; // 발주 필요 여부
  recommendedBaseOrderQty: number; // 권장 발주량 (기본단위)
  recommendedPackOrderQty: number; // 권장 발주량 (포장단위)
  categoryName: string;
  vendorName: string;
  orderUrgency: 'urgent' | 'warning' | 'normal'; // 'urgent' (필요 - 빨강), 'warning' (임박 - 주황/노랑), 'normal' (여유)
  isOrderImminent: boolean; // 발주 임박 여부
  dDayText: string | null;
  dDayStatus: 'normal' | 'today' | 'overdue' | 'future' | null;
  orderPolicyType: OrderPolicyType;
  isQtyBased: boolean;
  triggerPackQty: number; // 적용된 발주점 포장수량
  triggerBaseQty: number; // 적용된 발주점 기본수량
  fixedOrderPackQty: number; // 적용된 1회 고정발주 포장수량
  deliveryLocation?: string; // 카테고리에서 상속된 납품장소 (또는 품목 세부 하역장소)
  receiverLoginId?: string;
  receiverName?: string;
  receiverPhone?: string;
  deliveryDetailLocation?: string;
  isAuditDelayed: boolean; // 주간실사 주기(7일) 경과 또는 실사일시 누락 여부
  daysSinceLastAudit: number | null; // 최근 실사일로부터 경과 일수 (미실사 시 null)
}

export type ActiveTab = 'dashboard' | 'field-audit' | 'order-sheet' | 'master-data' | 'stats';

export type OrderHistoryStatus = '입고대기' | '입고완료' | '발주취소';

export interface OrderHistoryRecord {
  id: string; // 고유 이력 ID
  itemId?: string; // 연결된 품목 ID
  orderDate: string; // 발주일자 YYYY-MM-DD
  expectedArrivalDate: string; // 입고예정일 YYYY-MM-DD
  completedDate?: string | null; // 입고완료일 또는 취소일자 YYYY-MM-DD
  vendorName: string;
  vendorId?: string;
  line: ProductionLine;
  itemName: string;
  spec: string;
  orderedPackQty: number; // 발주 포장수량
  packUnit: string; // 포장단위
  unitConversion?: number; // 환산비율
  baseUnit?: string; // 기본단위
  unitPrice: number; // 단가 (원)
  totalAmount: number; // 총 발주금액 (원)
  deliveryLocation: string; // 납품장소
  status: OrderHistoryStatus; // '입고대기' | '입고완료' | '발주취소'
  note?: string; // 비고
}

export interface UsageLog {
  id: string;
  itemId: string;
  itemName: string;
  spec: string;
  line: ProductionLine;
  categoryId: string;
  categoryName: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  packUsedQty: number; // 소모된 포장수량
  baseUsedQty: number; // 소모된 기본단위 수량
  unitPrice: number; // 당시 단가
  totalCost: number; // 소모 비용 (원)
  baseUnit: string;
  packUnit: string;
  recordedVia: 'audit' | 'receive' | 'manual' | 'simulated';
}

/**
 * 3단계 사용자 권한 레벨 (RBAC)
 * - 0: LV.0 최고관리자 (전체 5개 탭 접근 및 모든 마스터 설정 변경 권한)
 * - 1: LV.1 현장사용자 ([현장 실사 & 입고] 및 [통합 모니터링 시트(읽기 전용)]만 접근 가능)
 * - 2: LV.2 사무실관리자 ([기준정보 관리]를 제외한 4개 탭 접근 가능)
 */
export type UserLevel = 0 | 1 | 2;

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  name: string; // 표시 이름 (예: '최고관리자 (System Admin)')
  level: UserLevel; // 0: 최고관리자 | 1: 현장사용자 | 2: 사무실관리자
  title?: string;
  department?: string;
  roleLabel?: string;
  allowedTabs?: ActiveTab[];
  description?: string;
}



