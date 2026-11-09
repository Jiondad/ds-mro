import React, { useState, useEffect } from 'react';
import { CalculatedItem, InventoryItem } from '../types';
import { formatCurrency, formatNumber, TODAY_STR } from '../utils/calculations';
import { X, Calendar, Package, AlertTriangle, Trash2, Check, Clock } from 'lucide-react';

interface EditOrderModalProps {
  item: CalculatedItem | InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveOrder: (
    itemId: string,
    orderDate: string,
    expectedArrivalDate: string,
    orderedPackQty: number
  ) => void;
  onCancelOrder: (itemId: string) => void;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
  item,
  isOpen,
  onClose,
  onSaveOrder,
  onCancelOrder,
}) => {
  const [orderDate, setOrderDate] = useState<string>(TODAY_STR);
  const [expectedArrivalDate, setExpectedArrivalDate] = useState<string>(TODAY_STR);
  const [orderedPackQty, setOrderedPackQty] = useState<number>(1);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);

  useEffect(() => {
    if (item && isOpen) {
      setOrderDate(item.orderDate || item.lastOrderDate || TODAY_STR);
      setExpectedArrivalDate(item.expectedArrivalDate || TODAY_STR);
      setOrderedPackQty(item.orderedPackQty || 1);
      setShowCancelConfirm(false);
    }
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  // Compute D-Day
  const computeDDay = () => {
    if (!expectedArrivalDate) return { text: '-', status: 'normal' };
    const today = new Date(TODAY_STR);
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expectedArrivalDate);
    exp.setHours(0, 0, 0, 0);
    const diffDays = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { text: 'D-Day (오늘 입고예정)', status: 'today' };
    if (diffDays < 0) return { text: `D+${Math.abs(diffDays)} (지연)`, status: 'overdue' };
    return { text: `D-${diffDays} (${diffDays}일 남음)`, status: 'future' };
  };

  const dDay = computeDDay();
  const conversion = item.unitConversion || 1;
  const totalBaseQty = orderedPackQty * conversion;
  const estimatedAmount = totalBaseQty * item.unitPrice;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderedPackQty <= 0) {
      alert('발주 수량은 1 이상이어야 합니다.');
      return;
    }
    if (!expectedArrivalDate) {
      alert('입고예정일을 입력해주세요.');
      return;
    }
    onSaveOrder(item.id, orderDate, expectedArrivalDate, orderedPackQty);
    onClose();
  };

  const handleConfirmCancel = () => {
    onCancelOrder(item.id);
    setShowCancelConfirm(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/10 rounded-lg">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">발주 정보 수정 & 입고일정 조율</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                현장 입고대기 중인 발주 건의 일정과 수량을 변경합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Item Summary Card */}
        <div className="bg-slate-50 border-b border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800">
              {item.line}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {'categoryName' in item ? (item as CalculatedItem).categoryName : ''}
            </span>
            {'vendorName' in item && (
              <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {(item as CalculatedItem).vendorName}
              </span>
            )}
          </div>
          <div className="text-base font-bold text-slate-900">
            {item.itemName} {item.spec}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
            <span>
              환산비율: 1 {item.packUnit} = {formatNumber(conversion)} {item.baseUnit}
            </span>
            <span>단가: {formatCurrency(item.unitPrice)}원/{item.baseUnit}</span>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. 발주일자 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                발주일자 (Order Date)
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
                className="w-full text-sm font-mono border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* 2. 입고예정일 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                입고예정일 (ETA)
              </label>
              <input
                type="date"
                value={expectedArrivalDate}
                onChange={(e) => setExpectedArrivalDate(e.target.value)}
                required
                className="w-full text-sm font-mono border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* D-Day Badge Preview */}
          <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-between">
            <span className="text-xs text-slate-600 font-medium">입고 D-Day 현황:</span>
            <span
              className={`text-xs font-black px-2.5 py-0.5 rounded-md ${
                dDay.status === 'today'
                  ? 'bg-red-600 text-white animate-pulse'
                  : dDay.status === 'overdue'
                  ? 'bg-rose-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {dDay.text}
            </span>
          </div>

          {/* 3. 발주 포장수량 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              발주 포장수량 ({item.packUnit})
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOrderedPackQty((prev) => Math.max(1, prev - 1))}
                className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 active:bg-slate-200 text-lg"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={orderedPackQty}
                onChange={(e) => setOrderedPackQty(Math.max(1, Number(e.target.value) || 1))}
                required
                className="flex-1 text-center text-lg font-black font-mono border border-slate-300 rounded-lg py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-sm font-bold text-slate-600 w-12 text-center">
                {item.packUnit}
              </span>
              <button
                type="button"
                onClick={() => setOrderedPackQty((prev) => prev + 1)}
                className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 active:bg-slate-200 text-lg"
              >
                +
              </button>
            </div>

            {/* Calculations preview */}
            <div className="mt-2 p-3 bg-slate-100 rounded-lg text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>환산 기본단위 수량:</span>
                <span className="font-bold text-slate-800 font-mono">
                  {formatNumber(totalBaseQty)} {item.baseUnit}
                </span>
              </div>
              <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200 font-semibold">
                <span>예상 발주금액:</span>
                <span className="font-black text-blue-700 font-mono text-sm">
                  {formatCurrency(estimatedAmount)} 원
                </span>
              </div>
            </div>
          </div>

          {/* Cancel Confirmation Dialog */}
          {showCancelConfirm ? (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>정말 이 발주 건을 취소하시겠습니까?</span>
              </div>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                취소 시 현장 입고대기 목록에서 즉시 제거되며, 발주대기 상태로 복귀합니다.
                발주 이력에는 [발주취소] 상태로 영구 기록됩니다.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50"
                >
                  돌아가기
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  className="px-3 py-1 text-xs font-bold text-white bg-rose-600 rounded hover:bg-rose-700 shadow-xs"
                >
                  예, 발주 취소 확정
                </button>
              </div>
            </div>
          ) : null}

          {/* Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            {!showCancelConfirm && (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                발주 취소하기
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                닫기
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
              >
                <Check className="w-4 h-4" />
                발주 변경 저장
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
