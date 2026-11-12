import React, { useState, useEffect } from 'react';
import { Category, InventoryItem, ProductionLine, Unit, UserAccount, Vendor } from '../types';
import { getDefaultDeliveryLocationForLine } from '../utils/calculations';
import { X, Plus, AlertCircle, Package, RotateCcw, MapPin, Copy } from 'lucide-react';

interface NewItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: InventoryItem) => void;
  categories: Category[];
  vendors: Vendor[];
  units: Unit[];
  userAccounts?: UserAccount[];
  editingItem?: InventoryItem | null;
  allItems?: InventoryItem[]; // 기존 품목 복사 기능을 위한 전체 품목 리스트 추가
}

const normalizeLine = (val?: string): ProductionLine => {
  if (!val) return 'SL1';
  if (val === '공용' || val === '공용(포장장)') return '공용';
  if (val === 'SL2') return 'SL2';
  if (val === '아산SL' || val === '아산공장') return '아산공장';
  return 'SL1';
};

export const NewItemModal: React.FC<NewItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categories,
  vendors,
  units,
  userAccounts = [],
  editingItem,
  allItems = [],
}) => {
  const [line, setLine] = useState<ProductionLine>('SL1');
  const [categoryId, setCategoryId] = useState<string>('');
  const [vendorId, setVendorId] = useState<string>('');
  const [itemName, setItemName] = useState<string>('');
  const [spec, setSpec] = useState<string>('');
  const [packUnit, setPackUnit] = useState<string>('다발');
  const [baseUnit, setBaseUnit] = useState<string>('EA');
  const [unitConversion, setUnitConversion] = useState<number>(20);
  const [currentPackStock, setCurrentPackStock] = useState<number>(0);
  const [dailyUsage, setDailyUsage] = useState<number>(10);
  const [unitPrice, setUnitPrice] = useState<number>(10000);
  const [moqDescription, setMoqDescription] = useState<string>('5 다발');
  const [leadTimeDays, setLeadTimeDays] = useState<number>(3);
  const [purpose, setPurpose] = useState<string>('');
  const [triggerPackQty, setTriggerPackQty] = useState<string>('');
  const [fixedOrderPackQty, setFixedOrderPackQty] = useState<string>('');
  const [receiverLoginId, setReceiverLoginId] = useState<string>('');
  const [receiverName, setReceiverName] = useState<string>('');
  const [receiverPhone, setReceiverPhone] = useState<string>('');
  const [deliveryDetailLocation, setDeliveryDetailLocation] = useState<string>('');

  // 복사할 대상 기존 품목 선택 상태
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Synchronize form states whenever modal opens or editingItem changes
  useEffect(() => {
    if (!isOpen) return;

    setSelectedTemplateId('');

    if (editingItem) {
      setLine(normalizeLine(editingItem.line));
      setCategoryId(editingItem.categoryId || (categories[0]?.id || ''));
      setVendorId(editingItem.vendorId || (vendors[0]?.id || ''));
      setItemName(editingItem.itemName || '');
      setSpec(editingItem.spec || '');
      setPackUnit(editingItem.packUnit || '다발');
      setBaseUnit(editingItem.baseUnit || 'EA');
      setUnitConversion(editingItem.unitConversion ?? 1);
      setCurrentPackStock(editingItem.currentPackStock ?? 0);
      setDailyUsage(editingItem.dailyUsage ?? 0);
      setUnitPrice(editingItem.unitPrice ?? 0);
      setMoqDescription(editingItem.moqDescription || '');
      setLeadTimeDays(editingItem.leadTimeDays ?? 3);
      setPurpose(editingItem.purpose || '');
      setTriggerPackQty(
        editingItem.triggerPackQty !== undefined && editingItem.triggerPackQty !== null
          ? String(editingItem.triggerPackQty)
          : ''
      );
      setFixedOrderPackQty(
        editingItem.fixedOrderPackQty !== undefined && editingItem.fixedOrderPackQty !== null
          ? String(editingItem.fixedOrderPackQty)
          : ''
      );
      setReceiverLoginId(editingItem.receiverLoginId || '');
      setReceiverName(editingItem.receiverName || '');
      setReceiverPhone(editingItem.receiverPhone || '');
      setDeliveryDetailLocation(editingItem.deliveryDetailLocation || '');
    } else {
      setLine('SL1');
      setCategoryId(categories[0]?.id || '');
      setVendorId(vendors[0]?.id || '');
      setItemName('');
      setSpec('');
      setPackUnit('다발');
      setBaseUnit('EA');
      setUnitConversion(20);
      setCurrentPackStock(0);
      setDailyUsage(10);
      setUnitPrice(10000);
      setMoqDescription('5 다발');
      setLeadTimeDays(vendors[0]?.defaultLeadTime || 3);
      setPurpose('');
      setTriggerPackQty('');
      setFixedOrderPackQty('');
      setReceiverLoginId('');
      setReceiverName('');
      setReceiverPhone('');
      setDeliveryDetailLocation('');
    }
  }, [isOpen, editingItem, categories, vendors]);

  // 기존 품목 선택 시 해당 품목의 속성으로 폼을 채워주는 템플릿 적용 함수 (신규 등록 모드일 때만 유효)
  const handleApplyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const templateItem = allItems.find((i) => i.id === templateId);
    if (!templateItem) return;

    setLine(normalizeLine(templateItem.line));
    if (templateItem.categoryId) setCategoryId(templateItem.categoryId);
    if (templateItem.vendorId) setVendorId(templateItem.vendorId);
    // 품목명은 복사본임을 직관적으로 알 수 있도록 뒤에 ' (복사본)' 추가 혹은 그대로 가져오기
    setItemName(templateItem.itemName ? `${templateItem.itemName} (복사)` : '');
    setSpec(templateItem.spec || '');
    setPackUnit(templateItem.packUnit || '다발');
    setBaseUnit(templateItem.baseUnit || 'EA');
    setUnitConversion(templateItem.unitConversion ?? 20);
    setCurrentPackStock(0); // 신규 등록이므로 재고는 0으로 초기화
    setDailyUsage(templateItem.dailyUsage ?? 10);
    setUnitPrice(templateItem.unitPrice ?? 10000);
    setMoqDescription(templateItem.moqDescription || '');
    setLeadTimeDays(templateItem.leadTimeDays ?? 3);
    setPurpose(templateItem.purpose || '');
    setTriggerPackQty(
      templateItem.triggerPackQty !== undefined && templateItem.triggerPackQty !== null
        ? String(templateItem.triggerPackQty)
        : ''
    );
    setFixedOrderPackQty(
      templateItem.fixedOrderPackQty !== undefined && templateItem.fixedOrderPackQty !== null
        ? String(templateItem.fixedOrderPackQty)
        : ''
    );
    setReceiverLoginId(templateItem.receiverLoginId || '');
    setReceiverName(templateItem.receiverName || '');
    setReceiverPhone(templateItem.receiverPhone || '');
    setDeliveryDetailLocation(templateItem.deliveryDetailLocation || '');
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isCategoryQtyBased = selectedCategory?.orderPolicyType === 'QTY_BASED';

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      alert('품목명을 입력해주세요.');
      return;
    }

    const newItem: InventoryItem = {
      id: editingItem ? editingItem.id : `item_${Date.now()}`,
      line,
      categoryId,
      vendorId,
      itemName: itemName.trim(),
      spec: spec.trim(),
      packUnit,
      baseUnit,
      unitConversion: Number(unitConversion) || 1,
      currentPackStock: Number(currentPackStock) || 0,
      dailyUsage: Number(dailyUsage) || 0,
      unitPrice: Number(unitPrice) || 0,
      moqDescription: moqDescription.trim(),
      leadTimeDays: Number(leadTimeDays) || 3,
      orderStatus: editingItem ? editingItem.orderStatus : '발주대기',
      orderDate: editingItem ? editingItem.orderDate : null,
      expectedArrivalDate: editingItem ? editingItem.expectedArrivalDate : null,
      orderedPackQty: editingItem ? editingItem.orderedPackQty : null,
      lastOrderDate: editingItem ? editingItem.lastOrderDate : null,
      lastAuditDate: editingItem ? editingItem.lastAuditDate : undefined,
      purpose: purpose.trim(),
      triggerPackQty:
        triggerPackQty.trim() !== '' ? Number(triggerPackQty) : null,
      fixedOrderPackQty:
        fixedOrderPackQty.trim() !== '' ? Number(fixedOrderPackQty) : null,
      receiverLoginId: receiverLoginId.trim() || undefined,
      receiverName: receiverName.trim() || undefined,
      receiverPhone: receiverPhone.trim() || undefined,
      deliveryDetailLocation: deliveryDetailLocation.trim() || undefined,
    };

    onSave(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm sm:text-base">
              {editingItem ? '소모품 기준정보 수정' : '신규 소모품 등록'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm overflow-y-auto">
          
          {/* [신규 기능] 기존 등록 품목 복사(템플릿) 셀렉터 영역 (신규 등록 시에만 노출) */}
          {!editingItem && allItems.length > 0 && (
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                <Copy className="w-4 h-4 text-blue-600 shrink-0" />
                <span>기존 품목 복사 (템플릿 불러오기)</span>
              </div>
              <div className="w-full sm:w-72">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleApplyTemplate(e.target.value)}
                  className="w-full border border-blue-300 rounded-md p-1.5 bg-white text-xs text-slate-900 font-semibold focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">-- 기존 품목 선택하여 불러오기 --</option>
                  {allItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      [{item.line}] {item.itemName} ({item.spec})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Row 1: Line & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                사용 라인 <span className="text-red-500">*</span>
              </label>
              <select
                value={line}
                onChange={(e) => setLine(normalizeLine(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="SL1">SL1 (1호 슬리터 - 포승공장)</option>
                <option value="SL2">SL2 (2호 슬리터 - 포승공장)</option>
                <option value="공용">공용 (포장장/출하홈 - 포승공장)</option>
                <option value="아산공장">아산공장 (SL라인)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                카테고리 <span className="text-red-500">*</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => {
                  const newCatId = e.target.value;
                  setCategoryId(newCatId);
                  const cat = categories.find((c) => c.id === newCatId);
                  if (cat?.orderPolicyType === 'QTY_BASED') {
                    if (!triggerPackQty && cat.defaultTriggerPackQty) {
                      setTriggerPackQty(String(cat.defaultTriggerPackQty));
                    }
                    if (!fixedOrderPackQty && cat.defaultOrderPackQty) {
                      setFixedOrderPackQty(String(cat.defaultOrderPackQty));
                    }
                  }
                }}
                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-medium"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{' '}
                    {c.orderPolicyType === 'QTY_BASED'
                      ? `[수량기준: 기본 ${c.defaultTriggerPackQty ?? 5}개↓ / 발주 ${c.defaultOrderPackQty ?? 10}개]`
                      : `[일수기준: 안전 ${c.safetyDays}일 / 주기 ${c.orderCycleDays}일]`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Item Name & Spec */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                품목명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="예: DNP 350(m/d), STEEL BAND"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                규격 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="예: 10T*200*1600, 0.8*32 Blue"
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                required
              />
            </div>
          </div>

          {/* Row 3: Vendor & Lead Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                공급업체 <span className="text-red-500">*</span>
              </label>
              <select
                value={vendorId}
                onChange={(e) => {
                  setVendorId(e.target.value);
                  const v = vendors.find((vend) => vend.id === e.target.value);
                  if (v) setLeadTimeDays(v.defaultLeadTime);
                }}
                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-medium"
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (기본 납기 {v.defaultLeadTime}일)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                납품소요일수 (Lead Time 일)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Row 4: Units and Conversion factor */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <span>단위 및 입고 환산 설정 (1 포장단위당 기본단위 수량)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 text-xs mb-1">
                  실사/포장단위
                </label>
                <select
                  value={packUnit}
                  onChange={(e) => setPackUnit(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 bg-white text-slate-900"
                >
                  {units
                    .filter((u) => u.type === 'pack' || u.type === 'both')
                    .map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 text-xs mb-1">
                  소모/기본단위
                </label>
                <select
                  value={baseUnit}
                  onChange={(e) => setBaseUnit(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 bg-white text-slate-900"
                >
                  {units
                    .filter((u) => u.type === 'base' || u.type === 'both')
                    .map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 text-xs mb-1">
                  환산계수 (기본단위 수량)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={unitConversion}
                  onChange={(e) => setUnitConversion(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded p-2 bg-white text-slate-900 font-mono font-bold"
                  placeholder="예: 20 (1다발 = 20EA)"
                  required
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              * 예시: 1 {packUnit} = {unitConversion} {baseUnit} 로 자동 환산되어 잔여일수가 계산됩니다.
            </p>
          </div>

          {/* Row: Quantity-based Replenishment Settings */}
          {isCategoryQtyBased && (
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-300 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-700" />
                  <span>재고수량(고정) 기준 발주점 설정 (품목 개별값)</span>
                </div>
                <span className="text-[10px] text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                  카테고리 기본값: {selectedCategory?.defaultTriggerPackQty ?? 5}{packUnit} 이하 시 {selectedCategory?.defaultOrderPackQty ?? 10}{packUnit} 발주
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    발주 기준수량 ({packUnit} 이하 시 발주)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={triggerPackQty}
                    onChange={(e) => setTriggerPackQty(e.target.value)}
                    placeholder={`미입력 시 카테고리 기본값 (${selectedCategory?.defaultTriggerPackQty ?? 5} ${packUnit})`}
                    className="w-full border border-emerald-300 rounded p-2 bg-white text-slate-900 font-mono font-bold focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    1회 고정 발주수량 ({packUnit} 발주)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={fixedOrderPackQty}
                    onChange={(e) => setFixedOrderPackQty(e.target.value)}
                    placeholder={`미입력 시 카테고리 기본값 (${selectedCategory?.defaultOrderPackQty ?? 10} ${packUnit})`}
                    className="w-full border border-emerald-300 rounded p-2 bg-white text-slate-900 font-mono font-bold focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Row 5: Current Stock, Daily usage, Unit price */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                현재 실사재고 ({packUnit})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={currentPackStock}
                onChange={(e) => setCurrentPackStock(Number(e.target.value))}
                className="w-full border border-yellow-300 bg-yellow-50 rounded-lg p-2.5 text-slate-900 font-bold font-mono focus:bg-yellow-100"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                일평균 사용량 ({baseUnit}/일)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={dailyUsage}
                onChange={(e) => setDailyUsage(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                단가 (원 / {baseUnit})
              </label>
              <input
                type="number"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
              />
            </div>
          </div>

          {/* Row 6: MOQ & Purpose */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                1회 기준 주문량 (MOQ 메모)
              </label>
              <input
                type="text"
                placeholder="예: 5 다발 (100EA), 10톤"
                value={moqDescription}
                onChange={(e) => setMoqDescription(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                용도 및 비고
              </label>
              <input
                type="text"
                placeholder="예: SL1 라인 코일 표면 세척용"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-slate-900"
              />
            </div>
          </div>

          {/* Row 7: Receiver & Location */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                수령자(담당자) 지정 & 납품장소 ([계정 관리] 연동)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs">
                  수령자(담당자) 선택
                </label>
                <select
                  value={receiverLoginId}
                  onChange={(e) => {
                    const selectedUsername = e.target.value;
                    setReceiverLoginId(selectedUsername);
                    const matchedUser = userAccounts.find(
                      (u) => u.username === selectedUsername
                    );
                    if (matchedUser) {
                      setReceiverName(matchedUser.name);
                      setReceiverPhone(matchedUser.phone || '');
                    } else if (!selectedUsername) {
                      setReceiverName('');
                      setReceiverPhone('');
                    }
                  }}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-900 bg-white focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">공장 기본담당자 (미지정)</option>
                  {userAccounts
                    .filter((u) => u.isActive !== false)
                    .map((u) => (
                      <option key={u.id} value={u.username}>
                        [{u.affiliation || (u.level === 0 ? '총괄' : '현장')}] {u.name} ({u.username})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs">
                  수령 담당자 연락처
                </label>
                <input
                  type="text"
                  placeholder="예: 010-8899-7721"
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-900 bg-white font-mono focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-3 pt-1 border-t border-slate-200/80">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>품목/라인별 수령장소</span>
                  </label>
                  {deliveryDetailLocation.trim() && (
                    <button
                      type="button"
                      onClick={() => setDeliveryDetailLocation('')}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-blue-700 bg-white border border-slate-300 px-2 py-0.5 rounded transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>기본값으로 복원</span>
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder={`미입력 시 [${line}] 기본값 자동 적용: ${getDefaultDeliveryLocationForLine(
                    line,
                    selectedCategory
                  )}`}
                  value={deliveryDetailLocation}
                  onChange={(e) => setDeliveryDetailLocation(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 font-normal"
                />
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors"
            >
              {editingItem ? '수정 완료' : '품목 등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
