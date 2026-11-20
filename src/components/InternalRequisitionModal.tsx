import React, { useState, useEffect } from 'react';
import { CalculatedItem, CompanyProfile, UserAccount } from '../types';
import { formatNumber, TODAY_STR } from '../utils/calculations';
import { INITIAL_COMPANY_PROFILE } from '../mockData';
import { Printer, X, FileCheck2, RotateCcw } from 'lucide-react';

interface InternalRequisitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CalculatedItem[];
  requisitionDate?: string;
  companyProfile?: CompanyProfile;
  currentUser?: UserAccount | null;
}

interface EditableRequisitionRow {
  id: string;
  itemName: string;
  unit: string;
  spec: string;
  qty: string;
  purpose: string;
}

// 원본 양식 기준 기본 6행 (210mm × 99mm 규격 최적화)
const MIN_TABLE_ROWS = 6;

const formatSpacedName = (rawName: string): string => {
  const cleaned = (rawName || '')
    .replace(/\s*(실장|팀장|과장|대리|주임|사원|반장|기장|부장|차장|대표이사)\s*$/g, '')
    .trim();
  if (/^[가-힣]{2,4}$/.test(cleaned)) {
    return cleaned.split('').join(' ');
  }
  return cleaned || '김 종 현';
};

const formatSpacedDept = (rawDept: string): string => {
  const withoutSuffix = (rawDept || '관리팀').replace(/팀$/, '').trim();
  if (!withoutSuffix || withoutSuffix.includes('공장')) {
    return '관 리';
  }
  if (/^[가-힣]{2,4}$/.test(withoutSuffix)) {
    return withoutSuffix.split('').join(' ');
  }
  return withoutSuffix || '관 리';
};

const formatLineForPurpose = (line: string): string => {
  if (line === 'SL1') return 'SL1 라인';
  if (line === 'SL2') return 'SL2 라인';
  if (line === '아산공장' || line === '아산SL') return '아산 SL';
  if (line === '공용' || line === '공용(포장장)') return '공용 포장장';
  return line;
};

export const InternalRequisitionModal: React.FC<InternalRequisitionModalProps> = ({
  isOpen,
  onClose,
  items,
  requisitionDate = TODAY_STR,
  companyProfile,
  currentUser,
}) => {
  const activeProfile = companyProfile || INITIAL_COMPANY_PROFILE;

  // 단위 기준: 'base' (기본단위 환산수량, 예: EA / 300) | 'pack' (포장단위, 예: 다발 / 15)
  const [unitBasis, setUnitBasis] = useState<'base' | 'pack'>('base');
  // 사용목적 표기 기준: 'line' (SL1 라인, 아산 SL 등) | 'purpose' (품목 마스터 용도)
  const [purposeBasis, setPurposeBasis] = useState<'line' | 'purpose'>('line');
  // 우측 작성부서 검토란 사선(/) 표시 여부
  const [slashWriterReview, setSlashWriterReview] = useState<boolean>(true);

  const [docDate, setDocDate] = useState<string>(requisitionDate || TODAY_STR);
  // 기본 부서명은 '관 리'팀으로 고정 (포승공장/아산공장 등 사업장명 배제)
  const [deptName, setDeptName] = useState<string>(() =>
    formatSpacedDept(activeProfile.orderManagerDept || '관리팀')
  );
  const [writerName, setWriterName] = useState<string>(() =>
    formatSpacedName(currentUser?.name || activeProfile.orderManagerName || '김종현')
  );

  const [rows, setRows] = useState<EditableRequisitionRow[]>([]);

  useEffect(() => {
    setDocDate(requisitionDate || TODAY_STR);
  }, [requisitionDate, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const mapped: EditableRequisitionRow[] = items.map((it) => {
      const packQty = it.orderedPackQty || it.recommendedPackOrderQty || 1;
      const baseQty = packQty * (it.unitConversion || 1);
      const qtyVal = unitBasis === 'base' ? baseQty : packQty;
      const unitVal = unitBasis === 'base' ? it.baseUnit : it.packUnit;
      const purposeVal =
        purposeBasis === 'line'
          ? formatLineForPurpose(it.line)
          : it.purpose || formatLineForPurpose(it.line);

      return {
        id: it.id,
        itemName: it.itemName,
        unit: unitVal,
        spec: it.spec,
        qty: formatNumber(qtyVal),
        purpose: purposeVal,
      };
    });
    setRows(mapped);
  }, [isOpen, items, unitBasis, purposeBasis]);

  if (!isOpen || items.length === 0) return null;

  // 날짜 파싱 (YYYY-MM-DD -> 년, 월, 일)
  const dateParts = docDate.split('-');
  const yearNum = dateParts[0] || '2026';
  const monthNum = dateParts[1] ? String(Number(dateParts[1])) : '11';
  const dayNum = dateParts[2] ? String(Number(dateParts[2])) : '20';

  const handleRowChange = (
    index: number,
    field: keyof EditableRequisitionRow,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r, idx) => (idx === index ? { ...r, [field]: value } : r))
    );
  };

  const handleResetRows = () => {
    const mapped: EditableRequisitionRow[] = items.map((it) => {
      const packQty = it.orderedPackQty || it.recommendedPackOrderQty || 1;
      const baseQty = packQty * (it.unitConversion || 1);
      return {
        id: it.id,
        itemName: it.itemName,
        unit: unitBasis === 'base' ? it.baseUnit : it.packUnit,
        spec: it.spec,
        qty: formatNumber(unitBasis === 'base' ? baseQty : packQty),
        purpose:
          purposeBasis === 'line'
            ? formatLineForPurpose(it.line)
            : it.purpose || formatLineForPurpose(it.line),
      };
    });
    setRows(mapped);
  };

  const handlePrint = () => {
    window.print();
  };

  // 최소 6행 유지 (품목이 많으면 동적 확장)
  const totalDisplayRows = Math.max(MIN_TABLE_ROWS, rows.length);
  const emptyRowCount = Math.max(0, totalDisplayRows - rows.length);

  return (
    <>
      {/* A4 세로 최상단 210mm × 99mm 정중앙 배치 & 1장 고정 인쇄 CSS */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
          html, body {
            width: 210mm !important;
            height: 99mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
          }
          body * {
            visibility: hidden !important;
          }
          .requisition-print-root,
          .requisition-print-root * {
            visibility: visible !important;
          }
          .requisition-print-root {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            height: 99mm !important;
            margin: 0 auto !important;
            padding: 4mm 6mm 3mm 6mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            background: #ffffff !important;
            z-index: 99999 !important;
            overflow: hidden !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .requisition-print-root .req-inner-sheet {
            width: 100% !important;
            margin: 0 auto !important;
          }
          .requisition-print-root table {
            width: 100% !important;
            margin: 0 auto !important;
            border-collapse: collapse !important;
          }
          .requisition-print-root .req-title {
            font-size: 18pt !important;
            line-height: 1.2 !important;
          }
          .requisition-print-root .req-sign-row {
            height: 11mm !important;
          }
          .requisition-print-root .req-date-row {
            height: 4.5mm !important;
            font-size: 7.5pt !important;
          }
          .requisition-print-root .req-head-row {
            height: 6.5mm !important;
            font-size: 9.5pt !important;
          }
          .requisition-print-root .req-data-row {
            height: ${rows.length > 6 ? '6.2mm' : '7.8mm'} !important;
            font-size: 8.5pt !important;
          }
          .requisition-print-root .req-footer-row {
            height: 7.5mm !important;
            font-size: 9.5pt !important;
          }
          .requisition-print-root .req-company-name {
            margin-top: 1.5mm !important;
            font-size: 11pt !important;
            line-height: 1.2 !important;
          }
          .requisition-print-root input {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-2 sm:p-4 overflow-y-auto">
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col my-auto overflow-hidden">
          {/* 상단 컨트롤 바 (인쇄 시 숨김) */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2.5 px-4 sm:px-6 py-3 bg-slate-900 text-white no-print shrink-0">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <h2 className="text-sm sm:text-base font-bold">
                  내부결재용 (소모품)청구서 미리보기 · 210mm × 99mm (A4 3등분)
                </h2>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  표 안의 글자나 하단 부서·성명을 클릭하면 인쇄 전 직접 수정할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
              {/* 단위 기준 전환 */}
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-[11px] border border-slate-700">
                <button
                  type="button"
                  onClick={() => setUnitBasis('base')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-colors ${
                    unitBasis === 'base'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  기본단위(EA)
                </button>
                <button
                  type="button"
                  onClick={() => setUnitBasis('pack')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-colors ${
                    unitBasis === 'pack'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  포장단위
                </button>
              </div>

              {/* 사용목적 기준 전환 */}
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-[11px] border border-slate-700">
                <button
                  type="button"
                  onClick={() => setPurposeBasis('line')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-colors ${
                    purposeBasis === 'line'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  목적: 라인표기
                </button>
                <button
                  type="button"
                  onClick={() => setPurposeBasis('purpose')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-colors ${
                    purposeBasis === 'purpose'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  목적: 용도표기
                </button>
              </div>

              <button
                type="button"
                onClick={handleResetRows}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium text-slate-200 cursor-pointer"
                title="수정한 내용을 원래 발주 데이터로 초기화"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">초기화</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-extrabold text-white shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>청구서 인쇄 (210×99mm)</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 인쇄 전 세부 옵션 바 (인쇄 시 숨김) */}
          <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs no-print shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                <span>청구일자:</span>
                <input
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-0.5 bg-white text-slate-900 font-mono text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={slashWriterReview}
                  onChange={(e) => setSlashWriterReview(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>우측 작성부서 검토란 사선(/) 표시</span>
              </label>
            </div>
            <span className="text-[11px] text-slate-500">
              * 총 <strong>{rows.length}</strong>개 품목 · 출력 규격: <strong>A4 세로 상단 210mm × 99mm (1매 고정)</strong>
            </span>
          </div>

          {/* ============================================================
              인쇄 전용 영역 (A4 세로 최상단 210mm × 99mm 좌우 정중앙)
             ============================================================ */}
          <div className="p-4 sm:p-6 bg-slate-200/70 overflow-auto flex-1">
            <div
              className="requisition-print-root mx-auto flex flex-col items-center justify-start bg-white text-black font-sans shadow-md border border-slate-300 print:shadow-none print:border-none"
              style={{ width: '210mm', minHeight: '99mm', padding: '4mm 6mm 3mm 6mm', boxSizing: 'border-box' }}
            >
              <div className="req-inner-sheet w-full mx-auto">
                {/* 메인 외곽 테두리 박스 */}
                <table className="w-full mx-auto border-collapse border-2 border-black text-center table-fixed">
                  <colgroup>
                    <col style={{ width: '4%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '4%' }} />
                    <col style={{ width: '7.6%' }} />
                    <col style={{ width: '7.7%' }} />
                    <col style={{ width: '7.7%' }} />
                  </colgroup>

                  <tbody>
                    {/* [상단 결재 헤더 영역 - 3행 구조] */}
                    <tr>
                      <td
                        rowSpan={3}
                        className="border border-black font-bold text-xs leading-tight py-0.5 bg-white select-none"
                      >
                        청<br />구<br />부<br />서
                      </td>
                      <td className="border border-black py-0.5 text-[11px] font-bold tracking-widest">
                        작 성
                      </td>
                      <td className="border border-black py-0.5 text-[11px] font-bold tracking-widest">
                        검 토
                      </td>
                      <td className="border border-black py-0.5 text-[11px] font-bold tracking-widest">
                        승 인
                      </td>

                      {/* 중앙 타이틀: (소모품)청구서 */}
                      <td
                        colSpan={4}
                        rowSpan={3}
                        className="border border-black align-middle px-2"
                      >
                        <h1 className="req-title text-2xl font-black tracking-[0.18em] underline underline-offset-4 decoration-2 text-black">
                          (소모품)청구서
                        </h1>
                      </td>

                      <td
                        rowSpan={3}
                        className="border border-black font-bold text-xs leading-tight py-0.5 bg-white select-none"
                      >
                        작<br />성<br />부<br />서
                      </td>
                      <td className="border border-black py-0.5 text-[11px] font-bold tracking-widest">
                        작 성
                      </td>
                      <td className="border border-black py-0.5 text-[11px] font-bold tracking-widest">
                        검 토
                      </td>
                      <td className="border border-black py-0.5 text-[11px] font-bold tracking-widest">
                        승 인
                      </td>
                    </tr>

                    {/* 결재 도장/서명 빈칸 행 */}
                    <tr className="req-sign-row h-11">
                      <td className="border border-black"></td>
                      <td className="border border-black"></td>
                      <td className="border border-black"></td>

                      {/* 우측 작성부서 도장칸 */}
                      <td className="border border-black"></td>
                      <td
                        className="border border-black relative p-0"
                        style={
                          slashWriterReview
                            ? {
                                backgroundImage:
                                  'linear-gradient(to top left, transparent calc(50% - 0.8px), #000 calc(50% - 0.8px), #000 calc(50% + 0.8px), transparent calc(50% + 0.8px))',
                              }
                            : undefined
                        }
                      ></td>
                      <td className="border border-black"></td>
                    </tr>

                    {/* 결재 일자 행 */}
                    <tr className="req-date-row h-5 text-[11px] text-blue-900 font-semibold">
                      <td className="border border-black">/</td>
                      <td className="border border-black">/</td>
                      <td className="border border-black">/</td>

                      {/* 우측 작성부서 날짜 */}
                      <td className="border border-black font-mono text-blue-800">
                        {monthNum} / {dayNum}
                      </td>
                      <td className="border border-black">/</td>
                      <td className="border border-black">/</td>
                    </tr>

                    {/* [품목 내역 헤더 행] */}
                    <tr className="req-head-row h-7 border-t-2 border-black font-extrabold text-xs sm:text-sm text-blue-950 bg-white">
                      <td colSpan={4} className="border border-black tracking-[0.4em]">
                        품 명
                      </td>
                      <td className="border border-black tracking-wider">단위</td>
                      <td colSpan={3} className="border border-black tracking-[0.6em]">
                        규 격
                      </td>
                      <td colSpan={2} className="border border-black tracking-[0.2em]">
                        수 량
                      </td>
                      <td colSpan={2} className="border border-black tracking-[0.2em]">
                        사 용 목 적
                      </td>
                    </tr>

                    {/* [데이터 행 목록] */}
                    {rows.map((row, idx) => (
                      <tr key={row.id} className="req-data-row h-7 text-xs text-blue-800 font-medium">
                        <td colSpan={4} className="border border-black px-1.5">
                          <input
                            type="text"
                            value={row.itemName}
                            onChange={(e) => handleRowChange(idx, 'itemName', e.target.value)}
                            className="w-full text-center bg-transparent text-blue-800 font-medium focus:outline-none focus:bg-blue-50/60"
                          />
                        </td>
                        <td className="border border-black px-1">
                          <input
                            type="text"
                            value={row.unit}
                            onChange={(e) => handleRowChange(idx, 'unit', e.target.value)}
                            className="w-full text-center bg-transparent text-blue-800 font-medium focus:outline-none focus:bg-blue-50/60"
                          />
                        </td>
                        <td colSpan={3} className="border border-black px-1.5">
                          <input
                            type="text"
                            value={row.spec}
                            onChange={(e) => handleRowChange(idx, 'spec', e.target.value)}
                            className="w-full text-center bg-transparent text-blue-800 font-medium focus:outline-none focus:bg-blue-50/60"
                          />
                        </td>
                        <td colSpan={2} className="border border-black px-1.5">
                          <input
                            type="text"
                            value={row.qty}
                            onChange={(e) => handleRowChange(idx, 'qty', e.target.value)}
                            className="w-full text-center bg-transparent text-blue-800 font-semibold font-mono focus:outline-none focus:bg-blue-50/60"
                          />
                        </td>
                        <td colSpan={2} className="border border-black px-1.5">
                          <input
                            type="text"
                            value={row.purpose}
                            onChange={(e) => handleRowChange(idx, 'purpose', e.target.value)}
                            className="w-full text-center bg-transparent text-blue-800 font-medium focus:outline-none focus:bg-blue-50/60"
                          />
                        </td>
                      </tr>
                    ))}

                    {/* 부족한 행만큼 빈 격자 줄 추가 */}
                    {Array.from({ length: emptyRowCount }).map((_, emptyIdx) => (
                      <tr key={`empty-${emptyIdx}`} className="req-data-row h-7">
                        <td colSpan={4} className="border border-black"> </td>
                        <td className="border border-black"> </td>
                        <td colSpan={3} className="border border-black"> </td>
                        <td colSpan={2} className="border border-black"> </td>
                        <td colSpan={2} className="border border-black"> </td>
                      </tr>
                    ))}

                    {/* [하단 일자 / 부서 / 성명 서명 행] */}
                    <tr className="req-footer-row h-8 border-t-2 border-black text-xs sm:text-sm font-bold text-blue-900">
                      <td colSpan={12} className="border border-black px-3">
                        <div className="flex items-center justify-around gap-3">
                          <div className="tracking-wider">
                            <span>{yearNum} 년</span>
                            <span className="ml-2.5">{monthNum} 월</span>
                            <span className="ml-2.5">{dayNum} 일</span>
                          </div>

                          <div className="flex items-center">
                            <span>(</span>
                            <input
                              type="text"
                              value={deptName}
                              onChange={(e) => setDeptName(e.target.value)}
                              className="w-16 text-center bg-transparent text-blue-900 font-bold focus:outline-none focus:bg-blue-50/60"
                              title="부서명 수정"
                            />
                            <span>)팀</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="tracking-[0.2em]">성 명 :</span>
                            <input
                              type="text"
                              value={writerName}
                              onChange={(e) => setWriterName(e.target.value)}
                              className="w-20 text-center bg-transparent text-blue-900 font-bold focus:outline-none focus:bg-blue-50/60"
                              title="성명 수정"
                            />
                            <span className="text-sm font-normal text-blue-900 ml-0.5">㊞</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 최하단 회사명 */}
                <div className="req-company-name text-center font-black text-base tracking-widest text-black mt-1.5">
                  {activeProfile.companyName || '(주)대성스틸'}
                </div>
              </div>
            </div>
          </div>

          {/* 모달 하단 안내 바 (인쇄 시 숨김) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 sm:px-6 py-3 bg-slate-100 border-t border-slate-200 no-print shrink-0">
            <p className="text-[11px] sm:text-xs text-slate-500">
              * <strong>A4 세로</strong> 상단 1/3(210×99mm) 정중앙에 맞춰 출력됩니다. 3등분 절단 용지 급지 시 용지 크기 오류가 뜨면 하단 <strong>[시스템 대화상자]</strong>에서 사용자 지정 용지를 선택하세요.
            </p>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>청구서 인쇄</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
