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

const escapeHtml = (str: string): string =>
  (str || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, ''');

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
  // 인쇄 용지 모드: 'a4-top' (A4 세로 최상단 210×99mm 중앙) | 'custom' (210×99mm 사용자지정 용지)
  const [printMode, setPrintMode] = useState<'a4-top' | 'custom'>('a4-top');
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

  // 최소 6행 유지 (품목이 많으면 동적 확장)
  const totalDisplayRows = Math.max(MIN_TABLE_ROWS, rows.length);
  const emptyRowCount = Math.max(0, totalDisplayRows - rows.length);

  // 기존 앱 CSS·모달과 완전히 격리된 독립 iframe 인쇄 실행
  const handlePrint = () => {
    const pageRule =
      printMode === 'custom'
        ? 'size: 210mm 99mm; margin: 0;'
        : 'size: A4 portrait; margin: 0;';

    const dataRowHeightMm =
      rows.length > 6 ? Math.max(5.2, Number((45 / rows.length).toFixed(1))) : 7.5;

    const dataRowsHtml = rows
      .map(
        (r) => `
        <tr class="data-row">
          <td colspan="4">${escapeHtml(r.itemName)}</td>
          <td>${escapeHtml(r.unit)}</td>
          <td colspan="3">${escapeHtml(r.spec)}</td>
          <td colspan="2" class="qty-cell">${escapeHtml(r.qty)}</td>
          <td colspan="2">${escapeHtml(r.purpose)}</td>
        </tr>`
      )
      .join('');

    const emptyRowsHtml = Array.from({ length: emptyRowCount })
      .map(
        () => `
        <tr class="data-row">
          <td colspan="4"> </td>
          <td> </td>
          <td colspan="3"> </td>
          <td colspan="2"> </td>
          <td colspan="2"> </td>
        </tr>`
      )
      .join('');

    const slashSvg = slashWriterReview
      ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
           <line x1="0" y1="100" x2="100" y2="0" stroke="#000000" stroke-width="1.6" />
         </svg>`
      : '';

    const companyLabel = escapeHtml(activeProfile.companyName || '(주)대성스틸');

    const printHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>(소모품)청구서</title>
  <style>
    @page {
      ${pageRule}
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 210mm;
      height: 99mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
      color: #000000;
      overflow: hidden;
    }
    .sheet {
      width: 210mm;
      height: 99mm;
      padding: 4.5mm 7mm 3mm 7mm;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1.8px solid #000000;
      table-layout: fixed;
      text-align: center;
    }
    td {
      border: 1px solid #000000;
      padding: 0 2mm;
      vertical-align: middle;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .v-label {
      font-weight: 700;
      font-size: 8.5pt;
      line-height: 1.25;
      padding: 1mm 0;
    }
    .sign-head {
      height: 5mm;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.15em;
    }
    .sign-box {
      height: 11mm;
      position: relative;
      padding: 0;
    }
    .sign-date {
      height: 4.5mm;
      font-size: 7.5pt;
      font-weight: 600;
      color: #1e3a8a;
    }
    .title-cell {
      padding: 0 2mm;
    }
    .title-text {
      margin: 0;
      font-size: 18pt;
      font-weight: 900;
      letter-spacing: 0.18em;
      text-decoration: underline;
      text-underline-offset: 4px;
      text-decoration-thickness: 2px;
      color: #000000;
    }
    .head-row td {
      height: 6.8mm;
      border-top: 1.8px solid #000000;
      font-size: 9.5pt;
      font-weight: 800;
      color: #172554;
    }
    .data-row td {
      height: ${dataRowHeightMm}mm;
      font-size: 8.5pt;
      font-weight: 500;
      color: #1e40af;
    }
    .qty-cell {
      font-weight: 700;
    }
    .footer-row td {
      height: 7.8mm;
      border-top: 1.8px solid #000000;
      font-size: 9.5pt;
      font-weight: 700;
      color: #1e3a8a;
    }
    .footer-flex {
      display: flex;
      align-items: center;
      justify-content: space-around;
      width: 100%;
    }
    .company-name {
      width: 100%;
      text-align: center;
      font-size: 11.5pt;
      font-weight: 900;
      letter-spacing: 0.15em;
      margin-top: 1.8mm;
      color: #000000;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <table>
      <colgroup>
        <col style="width: 4%" />
        <col style="width: 7.5%" />
        <col style="width: 7.5%" />
        <col style="width: 7.5%" />
        <col style="width: 7.5%" />
        <col style="width: 14%" />
        <col style="width: 14%" />
        <col style="width: 11%" />
        <col style="width: 4%" />
        <col style="width: 7.6%" />
        <col style="width: 7.7%" />
        <col style="width: 7.7%" />
      </colgroup>
      <tbody>
        <tr>
          <td rowspan="3" class="v-label">청<br/>구<br/>부<br/>서</td>
          <td class="sign-head">작 성</td>
          <td class="sign-head">검 토</td>
          <td class="sign-head">승 인</td>
          <td colspan="4" rowspan="3" class="title-cell">
            <h1 class="title-text">(소모품)청구서</h1>
          </td>
          <td rowspan="3" class="v-label">작<br/>성<br/>부<br/>서</td>
          <td class="sign-head">작 성</td>
          <td class="sign-head">검 토</td>
          <td class="sign-head">승 인</td>
        </tr>
        <tr>
          <td class="sign-box"></td>
          <td class="sign-box"></td>
          <td class="sign-box"></td>
          <td class="sign-box"></td>
          <td class="sign-box">${slashSvg}</td>
          <td class="sign-box"></td>
        </tr>
        <tr>
          <td class="sign-date">/</td>
          <td class="sign-date">/</td>
          <td class="sign-date">/</td>
          <td class="sign-date">${escapeHtml(monthNum)} / ${escapeHtml(dayNum)}</td>
          <td class="sign-date">/</td>
          <td class="sign-date">/</td>
        </tr>
        <tr class="head-row">
          <td colspan="4" style="letter-spacing: 0.4em;">품 명</td>
          <td style="letter-spacing: 0.08em;">단위</td>
          <td colspan="3" style="letter-spacing: 0.6em;">규 격</td>
          <td colspan="2" style="letter-spacing: 0.2em;">수 량</td>
          <td colspan="2" style="letter-spacing: 0.2em;">사 용 목 적</td>
        </tr>
        ${dataRowsHtml}
        ${emptyRowsHtml}
        <tr class="footer-row">
          <td colspan="12">
            <div class="footer-flex">
              <span>${escapeHtml(yearNum)} 년   ${escapeHtml(monthNum)} 월   ${escapeHtml(dayNum)} 일</span>
              <span>(  ${escapeHtml(deptName)}  )팀</span>
              <span>성  명 :   ${escapeHtml(writerName)}  ㊞</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="company-name">${companyLabel}</div>
  </div>
</body>
</html>`;

    const existing = document.getElementById('ds-requisition-print-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'ds-requisition-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(printHtml);
    doc.close();

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1000);
      }
    };

    setTimeout(triggerPrint, 150);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-2 sm:p-4 overflow-y-auto">
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col my-auto overflow-hidden">
        {/* 상단 컨트롤 바 */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2.5 px-4 sm:px-6 py-3 bg-slate-900 text-white shrink-0">
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
              <span>청구서 인쇄</span>
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

        {/* 인쇄 전 세부 옵션 바 */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
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
              <span>검토란 사선(/) 표시</span>
            </label>

            {/* 출력 용지 모드 선택 */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-md p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setPrintMode('a4-top')}
                className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                  printMode === 'a4-top'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="A4 세로 용지 최상단 210×99mm 좌우 정중앙에 출력 (3등분 절단 용지 바로 급지용)"
              >
                A4 세로 상단 1/3 (권장)
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('custom')}
                className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                  printMode === 'custom'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="프린터에 210×99mm 사용자 지정 용지를 별도 등록한 경우 사용"
              >
                사용자지정 210×99mm
              </button>
            </div>
          </div>

          <span className="text-[11px] text-slate-500">
            * 총 <strong>{rows.length}</strong>개 품목 · <strong>210mm × 99mm</strong> (좌우 중앙 정렬)
          </span>
        </div>

        {/* 미리보기 시트 영역 */}
        <div className="p-4 sm:p-6 bg-slate-200/70 overflow-auto flex-1">
          <div
            className="mx-auto flex flex-col items-center justify-start bg-white text-black font-sans shadow-md border border-slate-300"
            style={{ width: '210mm', minHeight: '99mm', padding: '4.5mm 7mm 3mm 7mm', boxSizing: 'border-box' }}
          >
            <div className="w-full mx-auto">
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
                      <h1 className="text-2xl font-black tracking-[0.18em] underline underline-offset-4 decoration-2 text-black">
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
                  <tr className="h-11">
                    <td className="border border-black"></td>
                    <td className="border border-black"></td>
                    <td className="border border-black"></td>

                    {/* 우측 작성부서 도장칸 */}
                    <td className="border border-black"></td>
                    <td className="border border-black relative p-0">
                      {slashWriterReview && (
                        <svg
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          className="absolute inset-0 w-full h-full pointer-events-none"
                        >
                          <line x1="0" y1="100" x2="100" y2="0" stroke="#000" strokeWidth="1.6" />
                        </svg>
                      )}
                    </td>
                    <td className="border border-black"></td>
                  </tr>

                  {/* 결재 일자 행 */}
                  <tr className="h-5 text-[11px] text-blue-900 font-semibold">
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
                  <tr className="h-7 border-t-2 border-black font-extrabold text-xs sm:text-sm text-blue-950 bg-white">
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
                    <tr key={row.id} className="h-7 text-xs text-blue-800 font-medium">
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
                    <tr key={`empty-${emptyIdx}`} className="h-7">
                      <td colSpan={4} className="border border-black"> </td>
                      <td className="border border-black"> </td>
                      <td colSpan={3} className="border border-black"> </td>
                      <td colSpan={2} className="border border-black"> </td>
                      <td colSpan={2} className="border border-black"> </td>
                    </tr>
                  ))}

                  {/* [하단 일자 / 부서 / 성명 서명 행] */}
                  <tr className="h-8 border-t-2 border-black text-xs sm:text-sm font-bold text-blue-900">
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
              <div className="text-center font-black text-base tracking-widest text-black mt-1.5">
                {activeProfile.companyName || '(주)대성스틸'}
              </div>
            </div>
          </div>
        </div>

        {/* 모달 하단 안내 바 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 sm:px-6 py-3 bg-slate-100 border-t border-slate-200 shrink-0">
          <p className="text-[11px] sm:text-xs text-slate-500">
            * 독립 인쇄 창을 통해 <strong>A4 세로 상단 210×99mm 좌우 정중앙(1장)</strong>으로 깔끔하게 출력됩니다.
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
  );
};
