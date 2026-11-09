import React, { useState, useEffect, useMemo } from 'react';
import { CalculatedItem, CompanyProfile, Vendor } from '../types';
import {
  formatCurrency,
  formatNumber,
  isAsanLine,
  isPoseungLine,
  TODAY_STR,
} from '../utils/calculations';
import { INITIAL_COMPANY_PROFILE } from '../mockData';
import {
  Printer,
  Copy,
  Check,
  X,
  Building2,
  Phone,
  Mail,
  Calendar,
  MapPin,
  UserCheck,
  RefreshCw,
} from 'lucide-react';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor | undefined;
  items: CalculatedItem[];
  orderDate: string;
  expectedArrivalDate: string;
  onConfirmOrder?: () => void;
  isAlreadyOrdered?: boolean;
  companyProfile?: CompanyProfile;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  vendor,
  items,
  orderDate,
  expectedArrivalDate,
  onConfirmOrder,
  isAlreadyOrdered = false,
  companyProfile,
}) => {
  const [copied, setCopied] = useState(false);

  // Active profile fallback
  const activeProfile = companyProfile || INITIAL_COMPANY_PROFILE;

  // Detect whether items belong to Asan, Poseung, or mixed
  const isAllAsan = useMemo(() => items.every((i) => isAsanLine(i.line)), [items]);
  const isMixedFactory = useMemo(
    () => items.some((i) => isAsanLine(i.line)) && items.some((i) => isPoseungLine(i.line)),
    [items]
  );

  // Factory selection state: 'poseung' | 'asan'
  const [selectedFactory, setSelectedFactory] = useState<'poseung' | 'asan'>(() => {
    return isAllAsan ? 'asan' : 'poseung';
  });

  useEffect(() => {
    setSelectedFactory(isAllAsan ? 'asan' : 'poseung');
  }, [isAllAsan, isOpen]);

  // Delivery address based on selected factory
  const defaultFactoryAddress = useMemo(() => {
    return selectedFactory === 'asan'
      ? activeProfile.asanAddress
      : activeProfile.poseungAddress;
  }, [selectedFactory, activeProfile]);

  const [deliveryAddress, setDeliveryAddress] = useState<string>(defaultFactoryAddress);

  useEffect(() => {
    setDeliveryAddress(defaultFactoryAddress);
  }, [defaultFactoryAddress, isOpen]);

  // Receiver info based on items or factory default
  const defaultReceiver = useMemo(() => {
    const withReceiver = items.find((i) => i.receiverName);
    if (withReceiver?.receiverName) {
      return `${withReceiver.receiverName} (${withReceiver.receiverPhone || '-'})`;
    }
    return selectedFactory === 'asan'
      ? activeProfile.asanDefaultReceiver
      : activeProfile.poseungDefaultReceiver;
  }, [items, selectedFactory, activeProfile]);

  const [receiverContact, setReceiverContact] = useState<string>(defaultReceiver);

  useEffect(() => {
    setReceiverContact(defaultReceiver);
  }, [defaultReceiver, isOpen]);

  // Detail location
  const initialDetailLocation = useMemo(() => {
    const locs = Array.from(
      new Set(items.map((it) => it.deliveryDetailLocation || it.deliveryLocation).filter(Boolean))
    );
    if (locs.length > 0) return locs.join(', ');
    return selectedFactory === 'asan'
      ? '아산공장 SL라인 진입부'
      : '포승공장 출하1번홈 (공용포장장)';
  }, [items, selectedFactory]);

  const [detailLocation, setDetailLocation] = useState<string>(initialDetailLocation);

  useEffect(() => {
    setDetailLocation(initialDetailLocation);
  }, [initialDetailLocation, isOpen]);

  if (!isOpen || !vendor || items.length === 0) return null;

  // Calculate totals
  const subtotal = items.reduce((sum, item) => {
    const packQty = item.orderedPackQty || item.recommendedPackOrderQty;
    const baseQty = packQty * item.unitConversion;
    return sum + baseQty * item.unitPrice;
  }, 0);

  const vat = Math.round(subtotal * 0.1);
  const total = subtotal + vat;

  // Generate plain text template for KakaoTalk / SMS / Email
  const generateTextMessage = () => {
    const factoryName = selectedFactory === 'asan' ? '아산공장' : '포승공장';
    const lines = [
      `[${activeProfile.companyName} 발주 요청서]`,
      `수신: ${vendor.name} 귀중 (${vendor.contactPerson || '담당자님'})`,
      `발신: ${activeProfile.companyName} (발주담당: ${activeProfile.orderManagerDept} ${activeProfile.orderManagerName} / ${activeProfile.orderManagerPhone})`,
      `발주일자: ${orderDate}`,
      `납기요청일: ${expectedArrivalDate}`,
      `납품공장: [${factoryName}] ${deliveryAddress}`,
      `세부하역장소: ${detailLocation}`,
      `현장수령담당: ${receiverContact}`,
      `----------------------------------------`,
      `■ 발주 품목 내역:`,
      ...items.map((it, idx) => {
        const packQty = it.orderedPackQty || it.recommendedPackOrderQty;
        const baseQty = packQty * it.unitConversion;
        const itemAmount = Math.round(baseQty * it.unitPrice);
        const itemReceiver = it.receiverName
          ? ` (수령: ${it.receiverName} ${it.receiverPhone || ''})`
          : '';
        const itemLocation = it.deliveryDetailLocation ? ` [하역: ${it.deliveryDetailLocation}]` : '';
        return `${idx + 1}. [${it.line}] ${it.itemName} (${it.spec})\n   - 발주수량: ${packQty} ${it.packUnit} (${formatNumber(baseQty)} ${it.baseUnit})\n   - 단가: ${formatNumber(it.unitPrice)}원 | 공급가: ${formatNumber(itemAmount)}원\n   - 용도: ${it.purpose || '-'}${itemReceiver}${itemLocation}`;
      }),
      `----------------------------------------`,
      `공급가액: ${formatCurrency(subtotal)}`,
      `부가세(10%): ${formatCurrency(vat)}`,
      `총 합계금액: ${formatCurrency(total)} (VAT포함)`,
      `----------------------------------------`,
      `※ 특기사항:`,
      `1. 납품 시 거래명세서 2부 필히 동봉 바랍니다.`,
      `2. ${activeProfile.defaultOrderNote}`,
      `3. 문의사항: 발주담당 ${activeProfile.orderManagerPhone} / 현장수령 ${receiverContact}`,
    ];
    return lines.join('\n');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateTextMessage());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2 sm:p-4 overflow-y-auto">
      {/* Container */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col my-auto overflow-hidden print-container">
        {/* Modal Top Bar (Hidden during print) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-4 sm:px-6 py-3 bg-slate-800 text-white no-print shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold">
              공식 발주서 미리보기 · {vendor.name}
            </h2>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleCopyText}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium text-slate-100 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? '복사 완료!' : '카톡/문자 텍스트 복사'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>A4 발주서 인쇄</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action confirmation strip if order not yet confirmed */}
        {!isAlreadyOrdered && onConfirmOrder && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-2.5 flex items-center justify-between no-print">
            <p className="text-xs text-blue-900 font-medium">
              이 발주서를 확정하면 대상 {items.length}개 품목이 <strong>'발주완료(입고대기)'</strong> 상태로 자동 전환되고 현장 실사판에 입고예정일이 등록됩니다.
            </p>
            <button
              onClick={() => {
                onConfirmOrder();
              }}
              className="px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm whitespace-nowrap"
            >
              발주 전산 확정하기
            </button>
          </div>
        )}

        {/* A4 Printable Purchase Order Sheet */}
        <div className="p-4 sm:p-8 md:p-12 text-slate-900 bg-white print:p-0 overflow-y-auto flex-1">
          {/* Sheet Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-extrabold tracking-widest text-slate-900">
                  발 주 서
                </h1>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                  Purchase Order · {activeProfile.companyName}
                </p>
              </div>

              {/* Approval Stamp Box (담당 - 검토 - 승인) */}
              <div className="flex border border-slate-700 text-center text-xs">
                <div className="w-16 border-r border-slate-700">
                  <div className="bg-slate-100 py-1 font-semibold border-b border-slate-700">
                    담당
                  </div>
                  <div className="h-14 flex items-center justify-center text-[11px] text-slate-400">
                    (서명)
                  </div>
                </div>
                <div className="w-16 border-r border-slate-700">
                  <div className="bg-slate-100 py-1 font-semibold border-b border-slate-700">
                    검토
                  </div>
                  <div className="h-14 flex items-center justify-center text-[11px] text-slate-400">
                    (인)
                  </div>
                </div>
                <div className="w-16">
                  <div className="bg-slate-100 py-1 font-semibold border-b border-slate-700">
                    승인
                  </div>
                  <div className="h-14 flex items-center justify-center text-[11px] text-slate-400">
                    (인)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Supplier & Buyer Two-column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 text-xs">
            {/* Left: Supplier Info */}
            <div className="border border-slate-300 rounded p-3 bg-slate-50/50">
              <div className="font-bold text-slate-800 text-sm mb-2 border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>[공급자] 수신처</span>
                <span className="text-[11px] text-blue-600 font-semibold">거래처 귀중</span>
              </div>
              <table className="w-full text-slate-700">
                <tbody>
                  <tr>
                    <td className="w-20 font-semibold text-slate-500 py-0.5">상 호:</td>
                    <td className="font-bold text-slate-900">{vendor.name}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5">담 당 자:</td>
                    <td>{vendor.contactPerson || '-'}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5">연 락 처:</td>
                    <td className="font-mono">{vendor.phone || '-'}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5">이 메 일:</td>
                    <td className="font-mono">{vendor.email || '-'}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5">주 소:</td>
                    <td>{vendor.address || '정보 미등록'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right: Buyer (Daeseong Steel) Info */}
            <div className="border border-slate-300 rounded p-3 bg-slate-50/50">
              <div className="font-bold text-slate-800 text-sm mb-2 border-b border-slate-200 pb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span>[발주처] 공급받는 자</span>
                  <span className="text-[11px] text-blue-600 font-semibold">
                    ({selectedFactory === 'asan' ? '아산공장' : '포승공장'})
                  </span>
                </div>
                {/* Factory Switch Button (Hidden in Print) */}
                <div className="no-print flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = selectedFactory === 'asan' ? 'poseung' : 'asan';
                      setSelectedFactory(next);
                      setDeliveryAddress(
                        next === 'asan' ? activeProfile.asanAddress : activeProfile.poseungAddress
                      );
                      setReceiverContact(
                        next === 'asan'
                          ? activeProfile.asanDefaultReceiver
                          : activeProfile.poseungDefaultReceiver
                      );
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 shadow-2xs transition-colors cursor-pointer"
                    title="배송공장을 포승과 아산 중 즉시 전환합니다"
                  >
                    <RefreshCw className="w-3 h-3 text-blue-600" />
                    <span>{selectedFactory === 'asan' ? '포승공장 전환' : '아산공장 전환'}</span>
                  </button>
                </div>
              </div>
              <table className="w-full text-slate-700">
                <tbody>
                  <tr>
                    <td className="w-24 font-semibold text-slate-500 py-0.5">사업자번호:</td>
                    <td className="font-bold text-slate-900 font-mono">{activeProfile.bizNumber}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5">상호 / 대표:</td>
                    <td className="font-bold text-slate-900">
                      {activeProfile.companyName} / {activeProfile.ceoName}
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5">발주담당:</td>
                    <td className="font-semibold text-slate-800">
                      {activeProfile.orderManagerDept} {activeProfile.orderManagerName} (
                      <span className="font-mono">{activeProfile.orderManagerPhone}</span>)
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5">배송처 주소:</td>
                    <td>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-900 font-semibold bg-white focus:ring-1 focus:ring-blue-500 print:border-none print:p-0 print:bg-transparent print:text-slate-900"
                        title="배송 공장 도로명 주소 (수정 가능)"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="w-24 font-semibold text-slate-500 py-0.5 whitespace-nowrap">세부하역장소:</td>
                    <td>
                      <input
                        type="text"
                        value={detailLocation}
                        onChange={(e) => setDetailLocation(e.target.value)}
                        placeholder="예: 포승공장 출하1번홈"
                        className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-900 font-bold bg-white focus:ring-1 focus:ring-blue-500 print:border-none print:p-0 print:bg-transparent print:text-slate-900"
                        title="클릭하여 이번 발주서의 하역장소를 수기 수정할 수 있습니다"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5 whitespace-nowrap">현장수령담당:</td>
                    <td>
                      <input
                        type="text"
                        value={receiverContact}
                        onChange={(e) => setReceiverContact(e.target.value)}
                        placeholder="예: 박현장 반장 (010-8899-7721)"
                        className="w-full border border-blue-300 rounded px-1.5 py-0.5 text-xs text-blue-900 font-bold bg-blue-50/50 focus:ring-1 focus:ring-blue-500 print:border-none print:p-0 print:bg-transparent print:text-slate-900"
                        title="물품 도착 시 인수받을 현장 담당자 및 연락처"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-500 py-0.5">발주일 / 납기:</td>
                    <td className="font-bold text-blue-700 font-mono">
                      {orderDate} / {expectedArrivalDate} (입고희망)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6 overflow-x-auto border border-slate-700">
            <table className="w-full text-sm text-left border-collapse min-w-[700px] sm:min-w-full">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-700 text-sm">
                  <th className="px-2.5 py-2.5 border-r border-slate-300 w-10 text-center">No</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 w-18 text-center">라인</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300">품목명 (규격)</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 text-right w-24">발주수량</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 text-center w-14">단위</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 text-right w-24">단가(원)</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 text-right w-28">공급가액(원)</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[140px]">현장 수령담당 / 하역</th>
                  <th className="px-2.5 py-2.5 text-center w-28">용도/비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {items.map((it, idx) => {
                  const packQty = it.orderedPackQty || it.recommendedPackOrderQty;
                  const baseQty = packQty * it.unitConversion;
                  const itemAmount = Math.round(baseQty * it.unitPrice);
                  const displayReceiver = it.receiverName
                    ? `${it.receiverName} (${it.receiverPhone || ''})`
                    : receiverContact;
                  const displayLoc = it.deliveryDetailLocation || detailLocation;

                  return (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="px-2.5 py-2.5 border-r border-slate-300 text-center text-slate-500 font-mono">
                        {idx + 1}
                      </td>
                      <td className="px-2.5 py-2.5 border-r border-slate-300 text-center font-bold text-slate-800">
                        {it.line}
                      </td>
                      <td className="px-2.5 py-2.5 border-r border-slate-300 font-medium text-slate-900">
                        <div className="text-sm sm:text-base font-medium leading-snug">{it.itemName}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5 leading-snug">{it.spec}</div>
                      </td>
                      <td className="px-2.5 py-2.5 border-r border-slate-300 text-right font-extrabold text-blue-700 font-mono text-base">
                        {formatNumber(packQty)}
                      </td>
                      <td className="px-2.5 py-2.5 border-r border-slate-300 text-center text-slate-700 font-semibold">
                        {it.packUnit}
                      </td>
                      <td className="px-2.5 py-2.5 border-r border-slate-300 text-right text-slate-700 font-mono">
                        {formatNumber(it.unitPrice)}
                      </td>
                      <td className="px-2.5 py-2.5 border-r border-slate-300 text-right font-extrabold text-slate-900 font-mono text-base">
                        {formatNumber(itemAmount)}
                      </td>
                      <td className="px-2.5 py-2.5 border-r border-slate-300 text-xs text-slate-700">
                        <div className="font-bold text-slate-900">{displayReceiver}</div>
                        <div className="text-slate-500 truncate">{displayLoc}</div>
                      </td>
                      <td className="px-2.5 py-2.5 text-slate-500 text-xs truncate">
                        {it.purpose || it.moqDescription}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-700 font-bold text-slate-900 text-sm">
                  <td colSpan={3} className="p-3 text-center border-r border-slate-300">
                    합 계 (Total Amount)
                  </td>
                  <td colSpan={2} className="p-3 text-center border-r border-slate-300">
                    {items.length}개 품목
                  </td>
                  <td className="p-3 text-right border-r border-slate-300 text-slate-600">
                    공급가
                  </td>
                  <td className="p-3 text-right border-r border-slate-300 font-mono font-extrabold text-blue-700 text-base">
                    {formatCurrency(subtotal)}
                  </td>
                  <td colSpan={2} className="p-3 text-center text-xs text-slate-500">
                    VAT 별도
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Amount Summary Box */}
          <div className="bg-slate-50 border border-slate-300 rounded p-4 mb-6 text-xs flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-600 mr-2">총 발주금액 (VAT 포함):</span>
              <span className="text-base font-extrabold text-blue-800 font-mono">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="text-slate-600 space-x-4">
              <span>공급가액: <strong className="font-mono text-slate-900">{formatCurrency(subtotal)}</strong></span>
              <span>세액 (10%): <strong className="font-mono text-slate-900">{formatCurrency(vat)}</strong></span>
            </div>
          </div>

          {/* Terms & Notes */}
          <div className="border border-slate-300 rounded p-4 text-xs text-slate-600 space-y-1.5">
            <h4 className="font-bold text-slate-800 mb-1">[발주 특기사항 및 준수사항]</h4>
            <p>1. 모든 납품 물품은 상기 규격과 오차 범위 내 일치하여야 하며, 불량 발생 시 전량 무상 교환을 원칙으로 합니다.</p>
            <p>2. 납품 시 본 발주서 사본과 거래명세서 2부를 필히 첨부하여 공장별 현장 수령담당자에게 확인 도장을 득하여야 합니다.</p>
            <p>3. {activeProfile.defaultOrderNote}</p>
            <p>4. 배송 및 하차 문의: 본사 발주담당자({activeProfile.orderManagerPhone}) 또는 현장 수령담당자({receiverContact})</p>
            <div className="pt-3 flex justify-end text-slate-900 font-bold text-sm">
              {activeProfile.companyName} {activeProfile.ceoName} (직인생략)
            </div>
          </div>
        </div>

        {/* Modal Footer Controls (Hidden in Print) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-slate-100 border-t border-slate-200 no-print shrink-0">
          <p className="text-[11px] sm:text-xs text-slate-500 text-center sm:text-left">
            * 'A4 발주서 인쇄' 클릭 시 배경 없이 A4 규격으로 인쇄하거나 PDF로 저장할 수 있습니다.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            {!isAlreadyOrdered && onConfirmOrder && (
              <button
                onClick={onConfirmOrder}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer w-full sm:w-auto"
              >
                <Check className="w-4 h-4" />
                <span>발주 전산 확정하기</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer w-full sm:w-auto"
            >
              <Printer className="w-4 h-4" />
              <span>A4 발주서 인쇄</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer w-full sm:w-auto"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
