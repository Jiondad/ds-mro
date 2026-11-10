import React, { useState, useEffect, useMemo } from 'react';
import {
  CalculatedItem,
  Category,
  CompanyProfile,
  OrderPolicyType,
  ProductionLine,
  Unit,
  UserAccount,
  Vendor,
} from '../types';
import {
  formatNumber,
  formatCurrency,
  compareItemsByDefaultOrder,
} from '../utils/calculations';
import { useUrlPersistedState } from '../utils/urlState';
import {
  Settings,
  Plus,
  Trash2,
  Edit2,
  Check,
  RotateCcw,
  Building2,
  Layers,
  Ruler,
  Package,
  Search,
  X,
  Save,
  MapPin,
  Loader2,
} from 'lucide-react';

interface MasterDataTabProps {
  items?: CalculatedItem[];
  categories: Category[];
  vendors: Vendor[];
  units: Unit[];
  userAccounts?: UserAccount[];
  companyProfile?: CompanyProfile;
  currentUser?: UserAccount | null;
  isResetting?: boolean;
  onAssignItemReceiver?: (itemId: string, account: UserAccount | null) => void;
  onUpdateItemDeliveryLocation?: (itemId: string, deliveryDetailLocation: string | undefined) => void;
  onUpdateItemLine?: (itemId: string, newLine: ProductionLine) => void;
  onUpdateCategory: (cat: Category) => void;
  onAddCategory: (cat: Category) => void;
  onDeleteCategory: (id: string) => void;
  onUpdateVendor: (vendor: Vendor) => void;
  onAddVendor: (vendor: Vendor) => void;
  onDeleteVendor: (id: string) => void;
  onAddUnit: (unit: Unit) => void;
  onDeleteUnit: (id: string) => void;
  onEditItem?: (item: CalculatedItem) => void;
  onDeleteItem?: (itemId: string) => void;
  onOpenNewItemModal?: () => void;
  onResetAllData: () => Promise<void> | void;
  onUpdateCompanyProfile?: (profile: CompanyProfile) => void;
  onShowToast?: (message: string) => void;
  onSaveAllChanges?: () => void;
}

const VALID_MASTER_SUB_TABS = ['item', 'category', 'vendor', 'unit', 'company'] as const;
const LINE_SELECT_OPTIONS: { value: ProductionLine; label: string }[] = [
  { value: 'SL1', label: 'SL1' },
  { value: 'SL2', label: 'SL2' },
  { value: '공용', label: '공용' },
  { value: '아산공장', label: '아산공장' },
];

export const MasterDataTab: React.FC<MasterDataTabProps> = ({
  items = [],
  categories,
  vendors,
  units,
  userAccounts = [],
  companyProfile,
  currentUser,
  isResetting = false,
  onAssignItemReceiver,
  onUpdateItemDeliveryLocation,
  onUpdateItemLine,
  onUpdateCategory,
  onAddCategory,
  onDeleteCategory,
  onUpdateVendor,
  onAddVendor,
  onDeleteVendor,
  onAddUnit,
  onDeleteUnit,
  onEditItem,
  onDeleteItem,
  onOpenNewItemModal,
  onResetAllData,
  onUpdateCompanyProfile,
  onShowToast,
  onSaveAllChanges,
}) => {
  const [activeSubTab, setActiveSubTab] = useUrlPersistedState<'item' | 'category' | 'vendor' | 'unit' | 'company'>(
    'masterSub',
    'ds_mro_master_sub_tab',
    'item',
    VALID_MASTER_SUB_TABS
  );
  const [itemSearchQuery, setItemSearchQuery] = useUrlPersistedState<string>(
    'masterQ',
    'ds_mro_master_search',
    ''
  );

  // Company Profile form state
  const [profileForm, setProfileForm] = useState<CompanyProfile>(() => {
    return (
      companyProfile || {
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
        defaultOrderNote:
          '납기일 준수 요망하며, 도착 전 반드시 품목별 현장 수령담당자에게 사전 연락 바랍니다.',
      }
    );
  });

  useEffect(() => {
    if (companyProfile) {
      setProfileForm(companyProfile);
    }
  }, [companyProfile]);

  const handleSaveCompanyProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.companyName.trim()) {
      alert('상호(법인명)을 입력해주세요.');
      return;
    }
    if (onUpdateCompanyProfile) {
      onUpdateCompanyProfile(profileForm);
    }
    if (onShowToast) {
      onShowToast('대성스틸 자사 기준정보 및 공장별 배송처 주소가 성공적으로 저장되었습니다.');
    } else {
      alert('대성스틸 자사 기준정보가 저장되었습니다.');
    }
  };

  // Category new form
  const [newCatName, setNewCatName] = useState('');
  const [newCatPolicy, setNewCatPolicy] = useState<OrderPolicyType>('DAYS_BASED');
  const [newCatSafety, setNewCatSafety] = useState(10);
  const [newCatCycle, setNewCatCycle] = useState(30);
  const [newCatTriggerQty, setNewCatTriggerQty] = useState(5);
  const [newCatOrderQty, setNewCatOrderQty] = useState(10);
  const [newCatDeliveryLocation, setNewCatDeliveryLocation] = useState('');
  
  // Category edit modal state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Vendor new form
  const [newVenName, setNewVenName] = useState('');
  const [newVenLeadTime, setNewVenLeadTime] = useState(3);
  const [newVenPhone, setNewVenPhone] = useState('');
  const [newVenContact, setNewVenContact] = useState('');
  const [newVenEmail, setNewVenEmail] = useState('');
  const [newVenAddress, setNewVenAddress] = useState('');
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Unit new form
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitType, setNewUnitType] = useState<'pack' | 'base' | 'both'>('pack');

  // Category order mapping for master data sort
  const categoryOrderMap = useMemo(() => {
    return new Map(categories.map((c, idx) => [c.id, idx]));
  }, [categories]);

  // Inline delivery location draft state per item ID
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});

  // 상단 [변경사항 저장] 버튼 클릭 시 작성 중인 인라인 입력값(수령장소 등)을 모두 반영 후 DB에 영구 저장
  const handleCommitAllDraftsAndSave = () => {
    const draftEntries = Object.entries(locationDrafts) as [string, string][];
    if (draftEntries.length > 0 && onUpdateItemDeliveryLocation) {
      draftEntries.forEach(([itemId, draftVal]) => {
        const trimmed = draftVal.trim();
        onUpdateItemDeliveryLocation(itemId, trimmed || undefined);
      });
      setLocationDrafts({});
    }
    if (activeSubTab === 'company' && onUpdateCompanyProfile) {
      onUpdateCompanyProfile(profileForm);
      return;
    }
    if (onSaveAllChanges) {
      onSaveAllChanges();
    } else if (onShowToast) {
      onShowToast('💾 [저장 완료] 모든 변경사항이 안전하게 반영되었습니다.');
    }
  };

  // Sort items strictly according to 3-tier fixed order: 라인 > 카테고리 > 품목명
  const sortedMasterItems = useMemo(() => {
    return [...items]
      .filter((it) => {
        if (!itemSearchQuery.trim()) return true;
        const q = itemSearchQuery.toLowerCase();
        return (
          it.itemName.toLowerCase().includes(q) ||
          it.spec.toLowerCase().includes(q) ||
          it.vendorName.toLowerCase().includes(q) ||
          it.categoryName.toLowerCase().includes(q) ||
          it.line.toLowerCase().includes(q) ||
          (it.receiverName && it.receiverName.toLowerCase().includes(q)) ||
          (it.deliveryLocation && it.deliveryLocation.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => compareItemsByDefaultOrder(a, b, categoryOrderMap));
  }, [items, itemSearchQuery, categoryOrderMap]);

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    onAddCategory({
      id: `cat_${Date.now()}`,
      name: newCatName.trim(),
      orderPolicyType: newCatPolicy,
      safetyDays: Number(newCatSafety) || 10,
      orderCycleDays: Number(newCatCycle) || 30,
      defaultTriggerPackQty: Number(newCatTriggerQty) || 5,
      defaultOrderPackQty: Number(newCatOrderQty) || 10,
      deliveryLocation: newCatDeliveryLocation.trim() || undefined,
    });
    setNewCatName('');
    setNewCatDeliveryLocation('');
  };

  const handleSaveEditCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    if (!editingCategory.name.trim()) {
      alert('카테고리명을 입력해주세요.');
      return;
    }
    const cleanedLineLocs: NonNullable<Category['lineDeliveryLocations']> = {};
    if (editingCategory.lineDeliveryLocations) {
      (['SL1', 'SL2', '공용', '아산공장'] as const).forEach((ln) => {
        const val = editingCategory.lineDeliveryLocations?.[ln]?.trim();
        if (val) {
          cleanedLineLocs[ln] = val;
        }
      });
    }
    onUpdateCategory({
      ...editingCategory,
      name: editingCategory.name.trim(),
      safetyDays: Number(editingCategory.safetyDays) || 10,
      orderCycleDays: Number(editingCategory.orderCycleDays) || 30,
      defaultTriggerPackQty: Number(editingCategory.defaultTriggerPackQty) || 5,
      defaultOrderPackQty: Number(editingCategory.defaultOrderPackQty) || 10,
      deliveryLocation: editingCategory.deliveryLocation?.trim() || undefined,
      lineDeliveryLocations:
        Object.keys(cleanedLineLocs).length > 0 ? cleanedLineLocs : undefined,
      description: editingCategory.description?.trim() || undefined,
    });
    setEditingCategory(null);
  };

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVenName.trim()) return;
    onAddVendor({
      id: `ven_${Date.now()}`,
      name: newVenName.trim(),
      defaultLeadTime: Number(newVenLeadTime) || 3,
      isActive: true,
      phone: newVenPhone.trim(),
      contactPerson: newVenContact.trim(),
      email: newVenEmail.trim() || undefined,
      address: newVenAddress.trim() || undefined,
    });
    setNewVenName('');
    setNewVenPhone('');
    setNewVenContact('');
    setNewVenEmail('');
    setNewVenAddress('');
  };

  const handleSaveEditVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;
    if (!editingVendor.name.trim()) {
      alert('공급업체명을 입력해주세요.');
      return;
    }
    onUpdateVendor({
      ...editingVendor,
      name: editingVendor.name.trim(),
      defaultLeadTime: Number(editingVendor.defaultLeadTime) || 1,
      contactPerson: editingVendor.contactPerson?.trim() || '',
      phone: editingVendor.phone?.trim() || '',
      email: editingVendor.email?.trim() || '',
      address: editingVendor.address?.trim() || '',
      isActive: Boolean(editingVendor.isActive),
    });
    setEditingVendor(null);
  };

  const handleCreateUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim()) return;
    onAddUnit({
      id: `u_${Date.now()}`,
      name: newUnitName.trim(),
      type: newUnitType,
    });
    setNewUnitName('');
  };

  return (
    <div className="space-y-4 w-full">
      {/* Top Section */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            기준정보 (Master Data) 통합 관리
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            소모품 품목 마스터(라인·규격·단위환산·수령담당자 지정), 카테고리별 안전일수 및 발주주기, 공급업체 정보 환경설정
          </p>
        </div>

        {/* Save all changes & Master reset buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCommitAllDraftsAndSave}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>변경사항 저장</span>
          </button>

          <button
            type="button"
            disabled={isResetting}
            onClick={async () => {
              // 최고관리자 권한 검증 (Level 0, Level 1 최고관리자 또는 admin)
              if (currentUser && currentUser.level > 1 && currentUser.username !== 'admin') {
                onShowToast?.(
                  '⚠️ 최고관리자(Level 1 / LV.0) 권한이 있는 사용자만 초기 데이터 리셋을 수행할 수 있습니다.'
                );
                return;
              }
              const confirmed = window.confirm(
                '현장 실사 재고, 실사 수량 및 발주 데이터를 초기 시드(Seed) 상태로 복원하시겠습니까?\n\n※ 최고관리자 계정 정보와 기본 마스터 데이터는 안전하게 유지되며, 실사/재고/발주 내역만 초기화됩니다.'
              );
              if (confirmed) {
                await onResetAllData();
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              isResetting
                ? 'bg-rose-100 text-rose-400 border border-rose-200 cursor-not-allowed opacity-80'
                : 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer shadow-2xs'
            }`}
          >
            {isResetting ? (
              <Loader2 className="w-4 h-4 animate-spin text-rose-600 shrink-0" />
            ) : (
              <RotateCcw className="w-4 h-4 shrink-0" />
            )}
            <span>{isResetting ? '초기화 진행 중...' : '초기 데이터 리셋'}</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar whitespace-nowrap -mx-3 px-3 sm:mx-0 sm:px-0">
        <button
          onClick={() => setActiveSubTab('item')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeSubTab === 'item'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>품목 마스터 ({items.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('category')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeSubTab === 'category'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>카테고리 & 발주주기 ({categories.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('vendor')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeSubTab === 'vendor'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>공급업체 마스터 ({vendors.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('unit')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeSubTab === 'unit'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Ruler className="w-4 h-4" />
          <span>단위(Unit) 관리 ({units.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('company')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeSubTab === 'company'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-blue-700 bg-blue-50/60 hover:bg-blue-100/80'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>🏢 자사(대성스틸) 정보 관리</span>
        </button>
      </div>

      {/* Sub Tab 0: Inventory Item Master */}
      {activeSubTab === 'item' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-800">
                기본 정렬: <span className="font-extrabold">라인 → 카테고리 → 품목명</span> (고정 순서)
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500 font-mono">
                총 {sortedMasterItems.length}개 품목
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-blue-700">
                수령자(담당자)는 상단 [계정 관리] 탭에 등록된 사용자 목록과 연동됩니다.
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="품목·규격·라인·수령자 검색..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-md pl-8 pr-2 py-1.5 bg-white text-slate-900 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={handleCommitAllDraftsAndSave}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs whitespace-nowrap cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>변경사항 저장</span>
              </button>

              {onOpenNewItemModal && (
                <button
                  onClick={onOpenNewItemModal}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-md shadow-xs whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>신규 품목</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse table-auto whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 select-none text-sm">
                    <th className="px-3.5 py-3 border-r border-slate-200 text-center w-14 text-slate-500 font-mono">
                      No.
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 text-center min-w-[115px]">
                      라인
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 w-36">
                      카테고리
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 min-w-[230px]">
                      품목명 (규격)
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 w-32">
                      공급업체
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 min-w-[210px]">
                      수령자(담당자)
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 min-w-[260px]">
                      수령장소 (라인·품목별 하역위치)
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 text-center w-32">
                      입고단위 환산
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 text-right w-28">
                      일소모량
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 text-right w-28">
                      단가
                    </th>
                    <th className="px-3.5 py-3 border-r border-slate-200 text-center w-24">
                      납기
                    </th>
                    <th className="px-3.5 py-3 text-center w-24">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-normal text-sm">
                  {sortedMasterItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-400">
                        등록된 품목이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    sortedMasterItems.map((item, idx) => {
                      const activeAccounts = userAccounts.filter((u) => u.isActive !== false);
                      const selectedAcc =
                        userAccounts.find((u) => u.username === item.receiverLoginId) ||
                        userAccounts.find((u) => u.name === item.receiverName);
                      const normalizedLine: ProductionLine =
                        item.line === '공용(포장장)'
                          ? '공용'
                          : item.line === '아산SL'
                          ? '아산공장'
                          : item.line;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3.5 py-3 border-r border-slate-200 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="px-2.5 py-3 border-r border-slate-200 text-center font-normal text-slate-800">
                            {onUpdateItemLine ? (
                              <select
                                value={normalizedLine}
                                onChange={(e) =>
                                  onUpdateItemLine(
                                    item.id,
                                    e.target.value as ProductionLine
                                  )
                                }
                                className="w-full min-w-[96px] border border-slate-300 rounded-md px-2 py-1.5 text-sm font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                title="담당 라인 변경 시 DB에 즉시 반영됩니다."
                              >
                                {LINE_SELECT_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span>{normalizedLine}</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 text-slate-800 whitespace-nowrap font-normal">
                            <div className="font-normal text-slate-900">{item.categoryName}</div>
                            <div className="text-xs mt-0.5">
                              {item.isQtyBased ? (
                                <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                                  수량기준 ({item.triggerPackQty}{item.packUnit} 이하)
                                </span>
                              ) : (
                                <span className="text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                                  일수기준
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 font-normal">
                            <div className="text-base font-normal text-slate-900 leading-snug">
                              {`${item.itemName} ${item.spec}`}
                            </div>
                            {item.purpose && (
                              <div className="text-xs font-normal text-slate-500 mt-0.5 leading-snug truncate max-w-[250px]">
                                {item.purpose}
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 text-slate-800 font-normal">
                            {item.vendorName}
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 text-slate-900 font-normal">
                            {onAssignItemReceiver ? (
                              <div className="space-y-1">
                                <select
                                  value={selectedAcc ? selectedAcc.username : ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const targetAcc =
                                      userAccounts.find((u) => u.username === val) || null;
                                    onAssignItemReceiver(item.id, targetAcc);
                                  }}
                                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm font-normal bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                >
                                  <option value="">공장 기본담당자 (미지정)</option>
                                  {activeAccounts.map((acc) => (
                                    <option key={acc.id} value={acc.username}>
                                      [{acc.affiliation || '현장'}] {acc.name}
                                    </option>
                                  ))}
                                </select>
                                {(selectedAcc?.phone || item.receiverPhone) && (
                                  <div className="text-xs font-mono text-slate-500 pl-1">
                                    연락처: {selectedAcc?.phone || item.receiverPhone}
                                  </div>
                                )}
                              </div>
                            ) : item.receiverName ? (
                              <div>
                                <span className="font-normal text-slate-900">{item.receiverName}</span>
                                {item.receiverPhone && (
                                  <span className="block text-xs font-mono text-slate-500">
                                    {item.receiverPhone}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">공장 기본담당</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 text-slate-800 font-normal">
                            {onUpdateItemDeliveryLocation ? (
                              <div className="space-y-1 min-w-[240px]">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={
                                      locationDrafts[item.id] !== undefined
                                        ? locationDrafts[item.id]
                                        : item.deliveryDetailLocation || ''
                                    }
                                    placeholder={
                                      item.defaultDeliveryLocation ||
                                      item.deliveryLocation ||
                                      '라인 기본 수령장소 입력'
                                    }
                                    onChange={(e) =>
                                      setLocationDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    onBlur={() => {
                                      if (locationDrafts[item.id] !== undefined) {
                                        const nextVal = locationDrafts[item.id].trim();
                                        const currentVal = (item.deliveryDetailLocation || '').trim();
                                        if (nextVal !== currentVal) {
                                          onUpdateItemDeliveryLocation(
                                            item.id,
                                            nextVal || undefined
                                          );
                                        }
                                        setLocationDrafts((prev) => {
                                          const copy = { ...prev };
                                          delete copy[item.id];
                                          return copy;
                                        });
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    className={`w-full border rounded-md px-2.5 py-1.5 text-sm font-normal transition-colors focus:ring-2 focus:ring-blue-500 ${
                                      item.deliveryDetailLocation
                                        ? 'border-blue-300 bg-blue-50/40 text-slate-900'
                                        : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-500'
                                    }`}
                                    title="입력 후 포커스 이동(onBlur) 또는 우측 [저장] 버튼 클릭 시 DB에 즉시 반영됩니다."
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const draftVal =
                                        locationDrafts[item.id] !== undefined
                                          ? locationDrafts[item.id]
                                          : item.deliveryDetailLocation || '';
                                      const nextVal = draftVal.trim();
                                      onUpdateItemDeliveryLocation(
                                        item.id,
                                        nextVal || undefined
                                      );
                                      setLocationDrafts((prev) => {
                                        const copy = { ...prev };
                                        delete copy[item.id];
                                        return copy;
                                      });
                                    }}
                                    title="수령장소 변경사항 즉시 저장"
                                    className={`px-2 py-1.5 text-xs rounded border transition-colors cursor-pointer shrink-0 ${
                                      locationDrafts[item.id] !== undefined &&
                                      locationDrafts[item.id].trim() !==
                                        (item.deliveryDetailLocation || '').trim()
                                        ? 'bg-emerald-600 text-white border-emerald-700 font-bold hover:bg-emerald-700'
                                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-blue-50 hover:text-blue-700'
                                    }`}
                                  >
                                    저장
                                  </button>
                                  {item.deliveryDetailLocation && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLocationDrafts((prev) => {
                                          const copy = { ...prev };
                                          delete copy[item.id];
                                          return copy;
                                        });
                                        onUpdateItemDeliveryLocation(item.id, undefined);
                                      }}
                                      title={`기본값(${item.defaultDeliveryLocation || '-'})으로 복원`}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded border border-slate-200 transition-colors cursor-pointer shrink-0"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center justify-between gap-1 text-xs pl-0.5">
                                  {item.deliveryDetailLocation ? (
                                    <span className="inline-flex items-center gap-1 text-blue-700 font-normal">
                                      <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 text-[11px]">
                                        품목 개별지정
                                      </span>
                                      <span className="text-slate-400 truncate max-w-[145px]" title={`기본값: ${item.defaultDeliveryLocation}`}>
                                        (기본: {item.defaultDeliveryLocation})
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-slate-500 font-normal">
                                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[11px]">
                                        [{item.line}] 기본값
                                      </span>
                                      <span className="text-slate-700 truncate max-w-[165px]">
                                        {item.defaultDeliveryLocation || item.deliveryLocation}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm font-normal text-slate-900">
                                {item.deliveryDetailLocation || item.deliveryLocation || '-'}
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 text-center font-mono text-sm text-slate-700 font-normal">
                            1{item.packUnit} = {item.unitConversion}{item.baseUnit}
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 text-right font-mono font-normal text-emerald-800 text-base">
                            {formatNumber(item.dailyUsage)} {item.baseUnit}
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 text-right font-mono font-normal text-slate-900 text-base">
                            {formatNumber(item.unitPrice)}원
                          </td>
                          <td className="px-3.5 py-3 border-r border-slate-200 text-center font-mono text-slate-700 font-normal">
                            {item.leadTimeDays}일
                          </td>
                          <td className="px-3.5 py-3 text-center space-x-1">
                            {onEditItem && (
                              <button
                                onClick={() => onEditItem(item)}
                                title="품목 정보 수정"
                                className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            {onDeleteItem && (
                              <button
                                onClick={() => onDeleteItem(item.id)}
                                title="품목 삭제"
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 1: Category & Cycle Management */}
      {activeSubTab === 'category' && (
        <div className="space-y-4">
          {/* Add Category Form */}
          <form
            onSubmit={handleCreateCategory}
            className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-end gap-2.5 text-xs"
          >
            <div className="flex-1 min-w-[160px]">
              <label className="block font-semibold text-slate-700 mb-1">
                신규 카테고리명
              </label>
              <input
                type="text"
                placeholder="예: 안전보호구, 설비윤활유"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900"
                required
              />
            </div>

            <div className="w-48">
              <label className="block font-semibold text-slate-700 mb-1">
                발주 기준 방식
              </label>
              <select
                value={newCatPolicy}
                onChange={(e) => setNewCatPolicy(e.target.value as OrderPolicyType)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900 font-bold bg-white"
              >
                <option value="DAYS_BASED">안전재고(일수) 기준</option>
                <option value="QTY_BASED">재고수량(고정) 기준</option>
              </select>
            </div>

            {newCatPolicy === 'DAYS_BASED' ? (
              <>
                <div className="w-32">
                  <label className="block font-semibold text-slate-700 mb-1">
                    안전재고 기준일수
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newCatSafety}
                    onChange={(e) => setNewCatSafety(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded p-1.5 text-slate-900 font-mono"
                  />
                </div>

                <div className="w-36">
                  <label className="block font-semibold text-slate-700 mb-1">
                    발주 주기 (일수)
                  </label>
                  <select
                    value={newCatCycle}
                    onChange={(e) => setNewCatCycle(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded p-1.5 text-slate-900 font-medium"
                  >
                    <option value={15}>15일 주기</option>
                    <option value={20}>20일 주기</option>
                    <option value={30}>30일 (월 1회)</option>
                    <option value={60}>60일 (격월)</option>
                    <option value={90}>90일 (분기)</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="w-36">
                  <label className="block font-semibold text-emerald-800 mb-1">
                    발주 기준수량 (포장)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newCatTriggerQty}
                    onChange={(e) => setNewCatTriggerQty(Number(e.target.value))}
                    className="w-full border border-emerald-300 bg-emerald-50/50 rounded p-1.5 text-slate-900 font-mono font-bold"
                    placeholder="예: 5"
                  />
                </div>

                <div className="w-36">
                  <label className="block font-semibold text-emerald-800 mb-1">
                    1회 권장 발주량 (포장)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newCatOrderQty}
                    onChange={(e) => setNewCatOrderQty(Number(e.target.value))}
                    className="w-full border border-emerald-300 bg-emerald-50/50 rounded p-1.5 text-slate-900 font-mono font-bold"
                    placeholder="예: 10"
                  />
                </div>
              </>
            )}

            <div className="flex-1 min-w-[200px]">
              <label className="block font-semibold text-slate-700 mb-1">
                납품장소 (하역위치)
              </label>
              <input
                type="text"
                placeholder="예: 포승공장 출하1번홈, 아산공장 SL2라인"
                value={newCatDeliveryLocation}
                onChange={(e) => setNewCatDeliveryLocation(e.target.value)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors cursor-pointer shrink-0"
            >
              카테고리 추가
            </button>
          </form>

          {/* Category Table */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 text-sm">
                    <th className="p-3">카테고리명</th>
                    <th className="p-3 text-center w-40">발주 기준 방식</th>
                    <th className="p-3 text-center w-40">안전/기준 발주점</th>
                    <th className="p-3 text-center w-40">발주주기 / 권장발주량</th>
                    <th className="p-3 min-w-[280px]">기본 납품장소 (Default) &amp; 라인별 설정</th>
                    <th className="p-3">설명</th>
                    <th className="p-3 text-center w-24">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-sm">
                  {categories.map((cat) => {
                    const isQty = cat.orderPolicyType === 'QTY_BASED';

                    return (
                      <tr key={cat.id} className="hover:bg-slate-50">
                        <td className="p-3 font-extrabold text-base text-slate-900">{cat.name}</td>

                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateCategory({
                                ...cat,
                                orderPolicyType: isQty ? 'DAYS_BASED' : 'QTY_BASED',
                              })
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                              isQty
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200'
                            }`}
                            title="클릭하여 발주 기준 방식 전환 (일수 기준 ↔ 수량 기준)"
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isQty ? 'bg-emerald-600' : 'bg-blue-600'
                              }`}
                            />
                            <span>{isQty ? '재고수량(고정) 기준' : '안전재고(일수) 기준'}</span>
                          </button>
                        </td>

                        <td className="p-2.5 text-center">
                          {isQty ? (
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                value={cat.defaultTriggerPackQty ?? 5}
                                onChange={(e) =>
                                  onUpdateCategory({
                                    ...cat,
                                    defaultTriggerPackQty: Number(e.target.value) || 1,
                                  })
                                }
                                className="w-18 p-1.5 text-center font-mono font-bold border border-emerald-300 rounded bg-emerald-50 text-sm text-emerald-950 focus:bg-white"
                              />
                              <span className="text-emerald-800 font-semibold text-xs">
                                포장 이하
                              </span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                max="90"
                                value={cat.safetyDays}
                                onChange={(e) =>
                                  onUpdateCategory({
                                    ...cat,
                                    safetyDays: Number(e.target.value) || 1,
                                  })
                                }
                                className="w-18 p-1.5 text-center font-mono font-bold border border-slate-300 rounded bg-white text-sm"
                              />
                              <span className="text-slate-600 text-xs">일분</span>
                            </div>
                          )}
                        </td>

                        <td className="p-2.5 text-center">
                          {isQty ? (
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                value={cat.defaultOrderPackQty ?? 10}
                                onChange={(e) =>
                                  onUpdateCategory({
                                    ...cat,
                                    defaultOrderPackQty: Number(e.target.value) || 1,
                                  })
                                }
                                className="w-18 p-1.5 text-center font-mono font-bold border border-emerald-300 rounded bg-emerald-50 text-sm text-emerald-950 focus:bg-white"
                              />
                              <span className="text-emerald-800 font-semibold text-xs">
                                포장 발주
                              </span>
                            </div>
                          ) : (
                            <select
                              value={cat.orderCycleDays}
                              onChange={(e) =>
                                onUpdateCategory({
                                  ...cat,
                                  orderCycleDays: Number(e.target.value) || 30,
                                })
                              }
                              className="p-1.5 border border-slate-300 rounded bg-white text-slate-800 font-medium text-sm"
                            >
                              <option value={15}>15일 주기</option>
                              <option value={20}>20일 주기</option>
                              <option value={30}>30일 주기</option>
                              <option value={60}>60일 주기</option>
                              <option value={90}>90일 주기</option>
                            </select>
                          )}
                        </td>

                        <td className="p-2.5">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[11px] font-bold shrink-0">
                                기본(Default)
                              </span>
                              <input
                                type="text"
                                value={cat.deliveryLocation || ''}
                                placeholder="예: 포승공장 출하1번홈"
                                onChange={(e) =>
                                  onUpdateCategory({
                                    ...cat,
                                    deliveryLocation: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm text-slate-900 bg-white font-normal focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                              <div className="flex flex-wrap items-center gap-1">
                                {cat.lineDeliveryLocations &&
                                Object.keys(cat.lineDeliveryLocations).length > 0 ? (
                                  (['SL1', 'SL2', '공용', '아산공장'] as const).map((ln) => {
                                    const locVal = cat.lineDeliveryLocations?.[ln];
                                    if (!locVal) return null;
                                    return (
                                      <span
                                        key={ln}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-normal"
                                      >
                                        <strong className="font-semibold">{ln}:</strong> {locVal}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-slate-400 text-[11px]">
                                    라인별 미지정 시 위 기본 납품장소 적용
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditingCategory({ ...cat })}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
                              >
                                <MapPin className="w-3 h-3 text-blue-600" />
                                <span>라인별 장소 설정</span>
                              </button>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 text-slate-600 text-xs">
                          {cat.description || '-'}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 justify-center">
                            <button
                              onClick={() => setEditingCategory({ ...cat })}
                              title="카테고리 상세 정보 수정"
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`'${cat.name}' 카테고리를 삭제하시겠습니까?`)) {
                                  onDeleteCategory(cat.id);
                                }
                              }}
                              title="카테고리 삭제"
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 2: Vendor Management */}
      {activeSubTab === 'vendor' && (
        <div className="space-y-4">
          <form
            onSubmit={handleCreateVendor}
            className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-end gap-2.5 text-xs"
          >
            <div className="flex-1 min-w-[160px]">
              <label className="block font-semibold text-slate-700 mb-1">
                신규 공급업체명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="예: 대한철강산업"
                value={newVenName}
                onChange={(e) => setNewVenName(e.target.value)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900 font-bold"
                required
              />
            </div>

            <div className="w-24">
              <label className="block font-semibold text-slate-700 mb-1">
                기본 납기 (일)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={newVenLeadTime}
                onChange={(e) => setNewVenLeadTime(Number(e.target.value))}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900 font-mono"
              />
            </div>

            <div className="w-28">
              <label className="block font-semibold text-slate-700 mb-1">
                담당자
              </label>
              <input
                type="text"
                placeholder="홍길동 과장"
                value={newVenContact}
                onChange={(e) => setNewVenContact(e.target.value)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900"
              />
            </div>

            <div className="w-32">
              <label className="block font-semibold text-slate-700 mb-1">
                연락처
              </label>
              <input
                type="text"
                placeholder="031-123-4567"
                value={newVenPhone}
                onChange={(e) => setNewVenPhone(e.target.value)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900 font-mono"
              />
            </div>

            <div className="w-40">
              <label className="block font-semibold text-slate-700 mb-1">
                이메일
              </label>
              <input
                type="email"
                placeholder="order@vendor.com"
                value={newVenEmail}
                onChange={(e) => setNewVenEmail(e.target.value)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900"
              />
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="block font-semibold text-slate-700 mb-1">
                사업장 주소
              </label>
              <input
                type="text"
                placeholder="예: 경기 시흥시 시화공단 2마"
                value={newVenAddress}
                onChange={(e) => setNewVenAddress(e.target.value)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900"
              />
            </div>

            <button
              type="submit"
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors cursor-pointer shrink-0"
            >
              거래처 추가
            </button>
          </form>

          <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 text-sm">
                    <th className="p-3">업체명</th>
                    <th className="p-3 text-center w-32">기본납기(Lead Time)</th>
                    <th className="p-3 w-36">담당자</th>
                    <th className="p-3 w-40">연락처</th>
                    <th className="p-3">이메일 / 주소</th>
                    <th className="p-3 text-center w-28">거래상태</th>
                    <th className="p-3 text-center w-24">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-sm">
                  {vendors.map((v) => (
                    <tr
                      key={v.id}
                      className={`hover:bg-slate-50 ${
                        !v.isActive ? 'opacity-60 bg-slate-100' : ''
                      }`}
                    >
                      <td className="p-3 font-extrabold text-base text-slate-900">{v.name}</td>
                      <td className="p-2.5 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="60"
                            value={v.defaultLeadTime}
                            onChange={(e) =>
                              onUpdateVendor({
                                ...v,
                                defaultLeadTime: Number(e.target.value) || 1,
                              })
                            }
                            className="w-16 p-1.5 text-center font-mono font-bold border border-slate-300 rounded bg-white text-sm"
                          />
                          <span className="text-slate-600 text-xs">일</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-800 font-semibold">
                        {v.contactPerson || '-'}
                      </td>
                      <td className="p-3 text-slate-700 font-mono">
                        {v.phone || '-'}
                      </td>
                      <td className="p-3 text-slate-600 text-xs truncate max-w-xs">
                        {v.email} {v.address ? `· ${v.address}` : ''}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() =>
                            onUpdateVendor({
                              ...v,
                              isActive: !v.isActive,
                            })
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                            v.isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                          title="클릭하여 거래상태를 전환합니다"
                        >
                          {v.isActive ? '거래중' : '거래중단'}
                        </button>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 justify-center">
                          <button
                            onClick={() => setEditingVendor({ ...v })}
                            title="공급업체 정보 수정"
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`'${v.name}' 업체를 삭제하시겠습니까?`)) {
                                onDeleteVendor(v.id);
                              }
                            }}
                            title="공급업체 삭제"
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 3: Units Management */}
      {activeSubTab === 'unit' && (
        <div className="space-y-4">
          <form
            onSubmit={handleCreateUnit}
            className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-end gap-2.5 text-xs"
          >
            <div className="w-48">
              <label className="block font-semibold text-slate-700 mb-1">
                신규 단위명
              </label>
              <input
                type="text"
                placeholder="예: 파렛트, 세트, 포"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900"
                required
              />
            </div>

            <div className="w-40">
              <label className="block font-semibold text-slate-700 mb-1">
                단위 성격
              </label>
              <select
                value={newUnitType}
                onChange={(e) =>
                  setNewUnitType(e.target.value as 'pack' | 'base' | 'both')
                }
                className="w-full border border-slate-300 rounded p-1.5 text-slate-900"
              >
                <option value="pack">실사/포장 단위</option>
                <option value="base">소모/기본 단위</option>
                <option value="both">겸용</option>
              </select>
            </div>

            <button
              type="submit"
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors cursor-pointer"
            >
              단위 추가
            </button>
          </form>

          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
            <h4 className="font-bold text-xs text-slate-800 mb-3">
              등록된 관리 단위 목록
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {units.map((unit) => (
                <div
                  key={unit.id}
                  className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-slate-900 text-xs">
                      {unit.name}
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      {unit.type === 'pack'
                        ? '포장 단위'
                        : unit.type === 'base'
                        ? '기본 소모 단위'
                        : '겸용'}
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteUnit(unit.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 4: Daesung Steel Company Profile Management */}
      {activeSubTab === 'company' && (
        <form onSubmit={handleSaveCompanyProfile} className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-100 text-blue-700 rounded-md">
                  <Building2 className="w-4 h-4" />
                </span>
                <h4 className="text-sm font-extrabold text-slate-900">
                  대성스틸(발주처) 자사 기준정보 & 공장별 배송주소 관리
                </h4>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                공식 발주서(PO) 및 카톡 발주 메시지에 인쇄·연동되는 자사 법인정보, 발주담당자, 공장별 배송처를 관리합니다.
              </p>
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>자사 기준정보 저장</span>
            </button>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-2.5">
              <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                1. 기본 법인 정보 (발주처 기본 사업자정보)
              </h5>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">상호 (법인명) *</label>
                <input
                  type="text"
                  required
                  value={profileForm.companyName}
                  onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">사업자등록번호 *</label>
                <input
                  type="text"
                  required
                  value={profileForm.bizNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, bizNumber: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">대표자 성명 *</label>
                <input
                  type="text"
                  required
                  value={profileForm.ceoName}
                  onChange={(e) => setProfileForm({ ...profileForm, ceoName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-bold"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-2.5">
              <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                2. 본사 발주 담당자 정보 (발신처 및 문의처)
              </h5>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">담당 부서</label>
                <input
                  type="text"
                  value={profileForm.orderManagerDept}
                  onChange={(e) => setProfileForm({ ...profileForm, orderManagerDept: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">발주 담당자명 (직급) *</label>
                <input
                  type="text"
                  required
                  value={profileForm.orderManagerName}
                  onChange={(e) => setProfileForm({ ...profileForm, orderManagerName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">발주처 연락처 *</label>
                <input
                  type="text"
                  required
                  value={profileForm.orderManagerPhone}
                  onChange={(e) => setProfileForm({ ...profileForm, orderManagerPhone: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">발주처 이메일</label>
                <input
                  type="email"
                  value={profileForm.orderManagerEmail}
                  onChange={(e) => setProfileForm({ ...profileForm, orderManagerEmail: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 text-xs">발주서 하단 기본 특기사항 / 준수사항 문구</label>
              <textarea
                rows={2}
                value={profileForm.defaultOrderNote}
                onChange={(e) => setProfileForm({ ...profileForm, defaultOrderNote: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 bg-white"
              />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-2.5">
              <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                3. 공장별 배송처 주소 및 현장 기본 수령처 (포승공장 / 아산공장 2곳 구분)
              </h5>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                  <span className="font-extrabold text-blue-900 text-xs">포승공장 (SL1, SL2, 공용 라인)</span>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-xs">포승공장 주소 *</label>
                  <input
                    type="text"
                    required
                    value={profileForm.poseungAddress}
                    onChange={(e) => setProfileForm({ ...profileForm, poseungAddress: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white text-slate-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-xs">포승 기본 수령담당자</label>
                  <input
                    type="text"
                    value={profileForm.poseungDefaultReceiver}
                    onChange={(e) => setProfileForm({ ...profileForm, poseungDefaultReceiver: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white text-slate-900 font-medium"
                  />
                </div>
              </div>

              <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                  <span className="font-extrabold text-purple-900 text-xs">아산공장 (아산공장 라인)</span>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-xs">아산공장 주소 *</label>
                  <input
                    type="text"
                    required
                    value={profileForm.asanAddress}
                    onChange={(e) => setProfileForm({ ...profileForm, asanAddress: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white text-slate-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-xs">아산 기본 수령담당자</label>
                  <input
                    type="text"
                    value={profileForm.asanDefaultReceiver}
                    onChange={(e) => setProfileForm({ ...profileForm, asanDefaultReceiver: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white text-slate-900 font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. 월별 소모품 예산 한도 설정 ([기능 3]) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
              <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                4. 월별 소모품 예산 한도 (Budget) 설정 및 초과 통제
              </h5>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                85% 초과 시 주의 경고 · 100% 초과 시 예산 초과 알림
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  월간 소모품 총 예산 한도 (원, 부가세 별도 기준) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={100000}
                    step={100000}
                    required
                    value={profileForm.monthlyBudget ?? 5000000}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        monthlyBudget: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2.5 pr-12 bg-white text-slate-900 font-mono font-extrabold text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-500">
                    원 / 월
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  현재 설정 금액:{' '}
                  <strong className="text-blue-700 font-mono">
                    {formatCurrency(profileForm.monthlyBudget ?? 5000000)}원
                  </strong>{' '}
                  ([📊 사용량 통계] 및 [거래처 발주서 발행] 상단 예산 프로그레스 바에 즉시 연동됩니다)
                </p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-600 block">
                  빠른 예산 한도 프리셋 선택:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[3000000, 5000000, 7000000, 10000000, 15000000].map((preset) => {
                    const isSelected = (profileForm.monthlyBudget ?? 5000000) === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          setProfileForm({ ...profileForm, monthlyBudget: preset })
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {(preset / 10000).toLocaleString()}만원
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>자사 기준정보 및 월 예산 저장</span>
            </button>
          </div>
        </form>
      )}

      {/* Category Edit Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm sm:text-base">카테고리 상세 정보 수정</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCategory} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm overflow-y-auto">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  카테고리명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, name: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  발주 기준 방식
                </label>
                <select
                  value={editingCategory.orderPolicyType}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      orderPolicyType: e.target.value as OrderPolicyType,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"
                >
                  <option value="DAYS_BASED">안전재고(일수) 기준</option>
                  <option value="QTY_BASED">재고수량(고정) 기준</option>
                </select>
              </div>

              {editingCategory.orderPolicyType === 'DAYS_BASED' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      안전재고 기준일수 (일)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={editingCategory.safetyDays}
                      onChange={(e) =>
                        setEditingCategory({
                          ...editingCategory,
                          safetyDays: Number(e.target.value) || 1,
                        })
                      }
                      className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      발주 주기
                    </label>
                    <select
                      value={editingCategory.orderCycleDays}
                      onChange={(e) =>
                        setEditingCategory({
                          ...editingCategory,
                          orderCycleDays: Number(e.target.value) || 30,
                        })
                      }
                      className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-medium"
                    >
                      <option value={15}>15일 주기</option>
                      <option value={20}>20일 주기</option>
                      <option value={30}>30일 주기</option>
                      <option value={60}>60일 주기</option>
                      <option value={90}>90일 주기</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-emerald-800 font-semibold mb-1">
                      발주 기준수량 (포장)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={editingCategory.defaultTriggerPackQty ?? 5}
                      onChange={(e) =>
                        setEditingCategory({
                          ...editingCategory,
                          defaultTriggerPackQty: Number(e.target.value) || 1,
                        })
                      }
                      className="w-full border border-emerald-300 bg-emerald-50 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-emerald-800 font-semibold mb-1">
                      1회 권장 발주량 (포장)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={editingCategory.defaultOrderPackQty ?? 10}
                      onChange={(e) =>
                        setEditingCategory({
                          ...editingCategory,
                          defaultOrderPackQty: Number(e.target.value) || 1,
                        })
                      }
                      className="w-full border border-emerald-300 bg-emerald-50 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  카테고리 기본 납품장소 (Default 하역위치)
                </label>
                <input
                  type="text"
                  placeholder="예: 포승공장 출하1번홈"
                  value={editingCategory.deliveryLocation || ''}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      deliveryLocation: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  라인별 장소나 품목별 수령장소가 별도 지정되지 않았을 때 기본으로 적용되는 납품장소입니다.
                </p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>라인별 기본 수령장소 세분화 설정 (선택)</span>
                  </label>
                  <span className="text-[11px] text-slate-500">
                    동일 카테고리 내 라인별 수령장소 분리
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {(
                    [
                      { line: 'SL1', label: '포승 SL1라인', placeholder: '예: 포승공장 SL1라인 작업대' },
                      { line: 'SL2', label: '포승 SL2라인', placeholder: '예: 포승공장 SL2라인 작업대' },
                      { line: '공용', label: '포승 공용(포장/출하)', placeholder: '예: 포승공장 출하1번홈' },
                      { line: '아산공장', label: '아산공장 (SL라인)', placeholder: '예: 아산공장 SL라인 진입부' },
                    ] as const
                  ).map(({ line: ln, label, placeholder }) => (
                    <div key={ln}>
                      <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                        [{ln}] {label}
                      </label>
                      <input
                        type="text"
                        placeholder={placeholder}
                        value={editingCategory.lineDeliveryLocations?.[ln] || ''}
                        onChange={(e) =>
                          setEditingCategory({
                            ...editingCategory,
                            lineDeliveryLocations: {
                              ...(editingCategory.lineDeliveryLocations || {}),
                              [ln]: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-slate-300 rounded-lg p-2 bg-white text-slate-900 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  설명
                </label>
                <input
                  type="text"
                  placeholder="카테고리 설명 입력"
                  value={editingCategory.description || ''}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      description: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>수정 완료</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vendor Edit Modal */}
      {editingVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm sm:text-base">공급업체 정보 수정</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingVendor(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditVendor} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-semibold mb-1">
                    업체명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingVendor.name}
                    onChange={(e) =>
                      setEditingVendor({ ...editingVendor, name: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    기본 납기 (일) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={editingVendor.defaultLeadTime}
                    onChange={(e) =>
                      setEditingVendor({
                        ...editingVendor,
                        defaultLeadTime: Number(e.target.value) || 1,
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-mono font-bold focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    담당자명 / 직급
                  </label>
                  <input
                    type="text"
                    placeholder="예: 김영수 팀장"
                    value={editingVendor.contactPerson || ''}
                    onChange={(e) =>
                      setEditingVendor({
                        ...editingVendor,
                        contactPerson: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    연락처 (전화/휴대폰)
                  </label>
                  <input
                    type="text"
                    placeholder="예: 031-499-1234"
                    value={editingVendor.phone || ''}
                    onChange={(e) =>
                      setEditingVendor({
                        ...editingVendor,
                        phone: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  이메일 (발주서 수신용)
                </label>
                <input
                  type="email"
                  placeholder="예: order@deokilfelt.co.kr"
                  value={editingVendor.email || ''}
                  onChange={(e) =>
                    setEditingVendor({
                      ...editingVendor,
                      email: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  사업장 주소
                </label>
                <input
                  type="text"
                  placeholder="예: 경기도 시흥시 시화공단 2마 304"
                  value={editingVendor.address || ''}
                  onChange={(e) =>
                    setEditingVendor({
                      ...editingVendor,
                      address: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  거래 상태
                </label>
                <select
                  value={editingVendor.isActive ? 'active' : 'inactive'}
                  onChange={(e) =>
                    setEditingVendor({
                      ...editingVendor,
                      isActive: e.target.value === 'active',
                    })
                  }
                  className={`w-full border rounded-lg p-2.5 font-bold ${
                    editingVendor.isActive
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : 'border-slate-300 bg-slate-100 text-slate-600'
                  }`}
                >
                  <option value="active">거래중 (Active - 정상 발주 진행)</option>
                  <option value="inactive">거래중단 (Inactive - 발주 대상 제외)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingVendor(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>수정 완료</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};