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
  deliveryLocation?: string; // 카테고리별 기본(Default) 납품장소 (예: "포승공장 출하1번홈", "아산공장 SL2라인", "입고2번 창고")
  lineDeliveryLocations?: Partial<Record<ProductionLine, string>>; // 동일 카테고리 내 라인별(SL1, SL2, 공용, 아산공장) 기본 수령장소 오버라이드
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
  lastAuditDate?: string | null; // 마지막 실사확정 일시 (예: 2026-11-07 14:30 실사확정)
  lastAuditedBy?: string | null; // 마지막 실사/입고 처리자명 (예: 박현장 반장)
  lastAuditUpdatedAt?: number | null; // 마지막 실사 갱신 타임스탬프(ms, 최신순 정렬용)
  purpose: string; // 용도 (예: 생산설비 세척, 내수제품포장, 목재파렛트 제조 등)
  triggerPackQty?: number | null; // 품목 개별 발주 기준 포장수량 (미지정 시 카테고리 기본값 사용)
  fixedOrderPackQty?: number | null; // 품목 개별 1회 고정 발주 포장수량 (미지정 시 카테고리 기본값 사용)
  receiverLoginId?: string; // 품목별 현장 수령 담당자 로그인 아이디 (자동으로 LV.1 현장사용자 권한 부여)
  receiverName?: string; // 품목별 현장 수령 담당자명/직급 (예: '박현장 반장', '이아산 기장')
  receiverPhone?: string; // 품목별 현장 수령 담당자 연락처 (예: '010-8899-7721')
  deliveryDetailLocation?: string; // 품목별 세부 하역장소 오버라이드 (미입력 시 카테고리/라인 기본 납품장소 사용)
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
  deliveryLocation?: string; // 최종 적용된 납품장소 (품목 개별 지정 > 카테고리 라인별 기본값 > 카테고리 기본값)
  defaultDeliveryLocation?: string; // 카테고리 및 배정 라인 기준 기본(Default) 납품장소
  isCustomDeliveryLocation?: boolean; // 품목 마스터에서 수령장소를 개별 오버라이드했는지 여부
  receiverLoginId?: string;
  receiverName?: string;
  receiverPhone?: string;
  deliveryDetailLocation?: string;
  isAuditDelayed: boolean; // 주간실사 주기(7일) 경과 또는 실사일시 누락 여부
  daysSinceLastAudit: number | null; // 최근 실사일로부터 경과 일수 (미실사 시 null)
}

export type ActiveTab =
  | 'dashboard'
  | 'field-audit'
  | 'order-sheet'
  | 'master-data'
  | 'stats'
  | 'account-management'
  | 'audit-log';

/**
 * 데이터 변경 이력(Audit Log) 작업 유형
 */
export type AuditActionType =
  | 'STOCK_UPDATE'            // 재고 실사 수량 변경 (➕/➖ 또는 직접 입력)
  | 'STOCK_BATCH_AUDIT'      // 실사 수량 일괄 확정
  | 'RECEIVE_CONFIRM'        // 입고 확정 처리
  | 'ORDER_CREATE'           // 거래처 발주서 발행
  | 'ORDER_UPDATE'           // 발주 내용(수량/납기 등) 수정
  | 'ORDER_CANCEL'           // 발주 취소
  | 'ORDER_HISTORY_DELETE'   // 발주 이력 삭제
  | 'SAFETY_STOCK_CALIBRATE' // 안전재고/일소모량 동적 보정
  | 'ITEM_CREATE'            // 신규 품목 등록
  | 'ITEM_UPDATE'            // 품목 마스터 수정
  | 'ITEM_DELETE'            // 품목 삭제
  | 'ITEM_RECEIVER_ASSIGN'   // 담당 수령인 지정/변경
  | 'ITEM_LOCATION_UPDATE'   // 하역/납품 장소 변경
  | 'ITEM_LINE_UPDATE'       // 소속 생산라인 변경
  | 'CATEGORY_MUTATE'        // 카테고리 추가/수정/삭제
  | 'VENDOR_MUTATE'          // 거래처 추가/수정/삭제
  | 'ACCOUNT_MUTATE'         // 사용자 계정 생성/수정/삭제/비밀번호 변경
  | 'SYSTEM_RESET';          // 초기 데이터 리셋

/**
 * 데이터 변경 로그 (Audit Log Record)
 */
export interface AuditLogRecord {
  id: string; // 고유 로그 ID (예: log_1731234567890_abc)
  timestamp: string; // 작업 일시 (YYYY-MM-DD HH:mm:ss)
  timestampMs: number; // 밀리초 타임스탬프 (정렬용)
  operatorId: string; // 작업자 아이디 (예: admin, field_mgr)
  operatorName: string; // 작업자 성명 (예: 김종현 실장, 박현장 반장)
  operatorLevel: UserLevel; // 작업자 권한 레벨 (0: 최고, 1: 현장관리, 2: 현장실무, 3: 사무실)
  operatorRoleLabel: string; // 역할 라벨 (예: 'LV.0 최고관리자')
  operatorAffiliation?: string; // 소속/부서 (예: 포승공장, SL1라인, 구매자재팀)
  actionType: AuditActionType; // 작업 유형 코드
  actionLabel: string; // 한글 작업 유형 명칭 (예: '재고 실사', '입고 확정', '발주서 발행' 등)
  targetName: string; // 대상 명칭 (품목명 + 규격, 계정명, 카테고리명 등)
  targetLine?: ProductionLine | string; // 대상 라인 (SL1, SL2, 공용, 아산 등)
  targetId?: string; // 대상 데이터 고유 ID
  categoryName?: string; // 소모품 카테고리명
  beforeValue: string; // 변경 전 값
  afterValue: string; // 변경 후 값
  details?: string; // 세부 비고/차이 내역 (예: '소모 -2박스 반영', '납기 11/15')
  ipOrDevice?: string; // 작업 환경 (예: 'PC 웹', '모바일 현장')
}

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
 * 4단계 사용자 권한 체계 (RBAC)
 * - 0: LV.0 최고관리자 (시스템 전반의 모든 기능, 사용자 계정 관리, 전체 데이터 수정/삭제 전권 보유)
 * - 1: LV.1 현장관리자 (현장 내 모든 라인의 재고/실사/사용량 데이터 수정 가능 + 사용량 통계 및 현장 모니터링 조회/관리 권한 / 발주 및 기준정보 불가)
 * - 2: LV.2 현장사용자 (본인 소속 라인의 담당 수령 품목에 한정한 실사 및 입고 처리 권한 / 타 라인 수정, 발주, 통계, 기준정보 접근 불가)
 * - 3: LV.3 사무실사용자 (거래처 발주서 발행 및 발주 관리 권한 + 전사 사용량 및 재고 통계 데이터 조회/분석 권한 / 현장 자재 및 실사 처리 불가)
 */
export type UserLevel = 0 | 1 | 2 | 3;

export interface UserAccount {
  id: string;
  username: string; // 로그인 ID
  password?: string;
  name: string; // 사용자 이름 / 수령자명 (예: '김종현 실장', '박현장 반장')
  level: UserLevel; // 0: 최고관리자 | 1: 현장관리자 | 2: 현장사용자 | 3: 사무실사용자
  affiliation?: string; // 소속 (포승공장, SL1, SL2, 공용, 아산공장 등)
  phone?: string; // 수령자 연락처 (예: '010-8899-7721')
  isActive?: boolean; // 계정 활성 상태 (기본값: true)
  createdAt?: string; // 계정 등록일
  title?: string;
  department?: string;
  roleLabel?: string;
  allowedTabs?: ActiveTab[];
  description?: string;
}



