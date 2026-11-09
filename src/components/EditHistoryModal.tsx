import React, { useState, useEffect } from 'react';
import { OrderHistoryRecord, OrderHistoryStatus, ProductionLine } from '../types';
import { formatCurrency, formatNumber } from '../utils/calculations';
import { X, Calendar, Edit3, Check, FileText, MapPin } from 'lucide-react';

interface EditHistoryModalProps {
  record: OrderHistoryRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedRecord: OrderHistoryRecord) => void;
}

export const EditHistoryModal: React.FC<EditHistoryModalProps> = ({
  record,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<OrderHistoryRecord | null>(null);

  useEffect(() => {
    if (record && isOpen) {
      setFormData({ ...record });
    }
  }, [record, isOpen]);

  if (!isOpen || !formData) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.orderedPackQty <= 0) {
      alert('발주 수량은 1 이상이어야 합니다.');
      return;
    }
    // Auto recalculate total amount if unit price & conversion exist
    const conversion = formData.unitConversion || 1;
    const computedTotal = formData.orderedPackQty * conversion * (formData.unitPrice || 0);

    onSave({
      ...formData,
      totalAmount: computedTotal > 0 ? computedTotal : formData.totalAmount,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/10 rounded-lg">
              <Edit3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">발주 이력 상세 수정</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                과거 발주 기록의 일자, 수량, 비고 및 진행상태를 수정합니다.
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

        {/* Item Info Header */}
        <div className="bg-slate-50 border-b border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800">
              {formData.line}
            </span>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {formData.vendorName}
            </span>
            <span
              className={`ml-auto px-2 py-0.5 text-xs font-bold rounded ${
                formData.status === '입고대기'
                  ? 'bg-sky-100 text-sky-800 border border-sky-300'
                  : formData.status === '입고완료'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}
            >
              {formData.status}
            </span>
          </div>
          <div className="text-base font-bold text-slate-900">
            {formData.itemName} {formData.spec}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 발주일자 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">발주일자</label>
              <input
                type="date"
                value={formData.orderDate}
                onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                required
                className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* 입고예정일 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">입고예정일</label>
              <input
                type="date"
                value={formData.expectedArrivalDate}
                onChange={(e) =>
                  setFormData({ ...formData, expectedArrivalDate: e.target.value })
                }
                required
                className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* 발주수량 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                발주수량 ({formData.packUnit})
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={formData.orderedPackQty}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    orderedPackQty: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                required
                className="w-full text-xs font-mono font-bold border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* 상태 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">진행상태</label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as OrderHistoryStatus,
                    completedDate:
                      e.target.value === '입고대기'
                        ? null
                        : formData.completedDate || new Date().toISOString().split('T')[0],
                  })
                }
                className="w-full text-xs font-bold border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              >
                <option value="입고대기">입고대기 (현장 대기중)</option>
                <option value="입고완료">입고완료 (실제 입고됨)</option>
                <option value="발주취소">발주취소 (취소 처리됨)</option>
              </select>
            </div>
          </div>

          {/* 입고/취소 완료일자 (완료 또는 취소 상태일 때) */}
          {formData.status !== '입고대기' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {formData.status === '입고완료' ? '입고완료일자' : '발주취소일자'}
              </label>
              <input
                type="date"
                value={formData.completedDate || ''}
                onChange={(e) => setFormData({ ...formData, completedDate: e.target.value })}
                className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          )}

          {/* 납품장소 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              납품장소
            </label>
            <input
              type="text"
              value={formData.deliveryLocation}
              onChange={(e) => setFormData({ ...formData, deliveryLocation: e.target.value })}
              placeholder="예: 포승공장 출하1번홈, 아산공장 SL2라인"
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* 비고/메모 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              비고 및 관리 메모
            </label>
            <textarea
              rows={2}
              value={formData.note || ''}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="특이사항이나 공급사 협의 내용 입력..."
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              닫기
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
            >
              <Check className="w-4 h-4" />
              이력 수정 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
