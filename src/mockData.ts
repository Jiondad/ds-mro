import {
  Category,
  CompanyProfile,
  InventoryItem,
  OrderHistoryRecord,
  Unit,
  UsageLog,
  UserAccount,
  Vendor,
} from './types';

// 실무 운영 환경: 품목, 카테고리, 공급업체, 이력은 빈 배열 []로 시작
export const INITIAL_INVENTORY_ITEMS: InventoryItem[] = [];
export const INITIAL_CATEGORIES: Category[] = [];
export const INITIAL_VENDORS: Vendor[] = [];
export const INITIAL_UNITS: Unit[] = [
  { id: 'u_dabal', name: '다발', type: 'pack' },
  { id: 'u_box', name: '박스', type: 'pack' },
  { id: 'u_coil', name: '코일', type: 'pack' },
  { id: 'u_roll', name: '롤', type: 'pack' },
  { id: 'u_ea', name: 'EA', type: 'base' },
  { id: 'u_kg', name: 'kg', type: 'base' },
  { id: 'u_sqm', name: '㎡', type: 'base' },
  { id: 'u_ton', name: '톤', type: 'base' },
  { id: 'u_pair', name: '켤레', type: 'both' },
];
export const INITIAL_USAGE_LOGS: UsageLog[] = [];
export const INITIAL_ORDER_HISTORY: OrderHistoryRecord[] = [];

export const INITIAL_COMPANY_PROFILE: CompanyProfile = {
  companyName: '주식회사 대성스틸',
  bizNumber: '125-81-34996',
  ceoName: '대표이사',
  orderManagerDept: '관리팀',
  orderManagerName: '김종현 실장',
  orderManagerPhone: '031-647-6471 / 010-8899-7700',
  orderManagerEmail: 'admin@daesungsteel.com',
  poseungAddress: '경기도 평택시 포승읍 포승공단로 123 (주)대성스틸 포승공장',
  poseungDefaultReceiver: '포승 현장 자재실 (010-8899-7722)',
  asanAddress: '충청남도 아산시 인주면 인주산단로 123-80 (주)대성스틸 (아산공장)',
  asanDefaultReceiver: '아산 현장 자재실 (010-5390-1120)',
  defaultOrderNote: '납기일 준수 요망하며, 도착 전 반드시 품목별 현장 수령담당자에게 사전 연락 바랍니다.',
  monthlyBudget: 5000000,
  managerName: '김종현 실장',
  managerDept: '관리팀',
  phone: '031-647-6471',
  email: 'admin@daesungsteel.com',
  addressMain: '경기도 평택시 포승읍 포승공단로 123 (주)대성스틸 포승공장',
  addressSub: '충청남도 아산시 인주면 인주산단로 123-80 (주)대성스틸 (아산공장)',
};

export const INITIAL_MEMO = `[대성스틸 스마트 자재·소모품 관리 시스템]
- 사용자 권한 4단계(최고관리자 LV.0 / 현장관리자 LV.1 / 현장사용자 LV.2 / 사무실사용자 LV.3)가 적용되어 있습니다.`;

// 4단계 사용자 권한 계정 풀
export const INITIAL_USER_ACCOUNTS: UserAccount[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    password: '1234',
    name: '김종현 실장',
    level: 0,
    roleLabel: 'LV.0 최고관리자',
    affiliation: '포승공장',
    department: '관리팀 / 총괄',
    phone: '010-8899-7700',
    isActive: true,
    createdAt: '2026-01-01',
    description: '시스템 전반 모든 기능, 사용자 계정 관리, 전체 데이터 수정/삭제 전권 보유',
  },
  {
    id: 'usr_field_mgr',
    username: 'field_mgr',
    password: '1234',
    name: '박총괄 팀장',
    level: 1,
    roleLabel: 'LV.1 현장관리자',
    affiliation: '포승공장',
    department: '생산관리팀',
    phone: '010-8899-7710',
    isActive: true,
    createdAt: '2026-01-10',
    description: '현장 내 모든 라인 재고/실사/사용량 데이터 수정 및 사용량 통계/모니터링 관리 (발주 불가)',
  },
  {
    id: 'usr_field_sl1',
    username: 'field_sl1',
    password: '1234',
    name: '박현장 반장',
    level: 2,
    roleLabel: 'LV.2 현장사용자',
    affiliation: 'SL1',
    department: '포승 SL1라인',
    phone: '010-8899-7721',
    isActive: true,
    createdAt: '2026-02-01',
    description: '소속 라인(SL1)의 담당 수령 품목 실사 및 입고확정 전용',
  },
  {
    id: 'usr_office',
    username: 'office1',
    password: '1234',
    name: '이지원 대리',
    level: 3,
    roleLabel: 'LV.3 사무실사용자',
    affiliation: '포승공장',
    department: '구매자재팀',
    phone: '031-647-6471',
    isActive: true,
    createdAt: '2026-01-15',
    description: '거래처 발주서 발행 및 발주 관리, 전사 사용량/재고 통계 분석 (현장 자재/실사 수정 불가)',
  },
];