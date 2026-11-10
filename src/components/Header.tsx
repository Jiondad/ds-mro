import React from 'react';
import { ActiveTab, UserAccount } from '../types';
import {
  LayoutDashboard,
  ClipboardCheck,
  FileText,
  Settings,
  Plus,
  RotateCcw,
  BarChart3,
  HardHat,
  Lock,
  LogOut,
  ShieldCheck,
  Briefcase,
  Database,
  Users,
  History,
  RefreshCw,
} from 'lucide-react';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenNewItemModal: () => void;
  onResetData: () => void;
  orderNeededCount: number;
  awaitingArrivalCount: number;
  auditDelayedCount?: number;
  isWorkerMode?: boolean;
  onToggleWorkerMode?: () => void;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
  onOpenDbConfig?: () => void;
  isDbConnected?: boolean;
  onRefreshCloudData?: () => void;
  isCloudSyncing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onOpenNewItemModal,
  onResetData,
  orderNeededCount,
  awaitingArrivalCount,
  auditDelayedCount = 0,
  isWorkerMode = false,
  onToggleWorkerMode,
  currentUser,
  onLogout,
  onOpenDbConfig,
  isDbConnected = false,
  onRefreshCloudData,
  isCloudSyncing = false,
}) => {
  const userLevel = currentUser?.level ?? 0;
  // LV.2 현장사용자이거나 현장 계정에서 수동 작업자 모드가 켜진 경우 현장 중심 UI 적용 (LV.3 사무실사용자는 작업자모드 제외)
  const isEffectiveWorkerView = (isWorkerMode && userLevel !== 3) || userLevel === 2;
  // 기준정보 관리 및 계정 관리 접근 가능 여부 (LV.0 최고관리자만 허용)
  const canAccessMasterData = userLevel === 0 && !isEffectiveWorkerView;
  // 거래처 발주서 발행 접근 가능 여부 (LV.0 최고관리자, LV.3 사무실사용자 허용 / LV.1, LV.2 절대 불가)
  const canAccessOrderSheet = (userLevel === 0 || userLevel === 3) && !isEffectiveWorkerView;
  // 사용량 통계 접근 가능 여부 (LV.0 최고관리자, LV.1 현장관리자, LV.3 사무실사용자 허용 / LV.2 불가)
  const canAccessStats = (userLevel === 0 || userLevel === 1 || userLevel === 3) && !isEffectiveWorkerView;
  // 변경 이력(Audit Log) 접근 가능 여부 (LV.0, LV.1, LV.3 허용)
  const canAccessAuditLog = (userLevel === 0 || userLevel === 1 || userLevel === 3) && !isEffectiveWorkerView;
  // 현장 실사 & 입고 접근 가능 여부 (LV.0, LV.1, LV.2 허용 / LV.3 사무실사용자는 현장 수정 불가이므로 메인 네비게이션에서 제외)
  const canAccessFieldAudit = userLevel === 0 || userLevel === 1 || userLevel === 2;

  const getRoleChipStyle = (level: number) => {
    if (level === 0) {
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    }
    if (level === 1) {
      return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
    if (level === 2) {
      return 'bg-amber-400/20 text-amber-300 border-amber-400/40';
    }
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  };

  const getRoleIcon = (level: number) => {
    if (level === 0) return <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    if (level === 1) return <HardHat className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    if (level === 2) return <HardHat className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    return <Briefcase className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  };

  // 중복 표현 없이 깔끔한 프로필 칩 텍스트 생성
  const getCompactProfileLabel = (user: UserAccount) => {
    const cleanName = user.name.replace(/\s*\([^)]*\)/g, '').trim();
    const dept =
      user.department ||
      (user.level === 0
        ? '총괄관리'
        : user.level === 1
        ? '생산관리'
        : user.level === 2
        ? '현장라인'
        : '구매자재');
    return `${cleanName} (${dept})`;
  };

  return (
    <header
      className={`${
        isEffectiveWorkerView
          ? 'bg-slate-950 border-b-2 border-amber-500'
          : 'bg-slate-900 border-b border-slate-800'
      } text-white sticky top-0 z-40 shadow-sm no-print transition-colors`}
    >
      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:h-15 py-2 lg:py-0 gap-2 lg:gap-3">
          {/* Zone 1: Brand Logo & Title + Mobile Quick Controls */}
          <div className="flex items-center justify-between w-full lg:w-auto gap-2 shrink-0">
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm sm:text-base tracking-wider shadow-inner shrink-0 ${
                  isEffectiveWorkerView
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {isEffectiveWorkerView ? '현장' : 'DS'}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm sm:text-[15px] font-extrabold tracking-tight text-white whitespace-nowrap">
                    대성스틸 스마트 자재·소모품 관리
                  </span>
                  {isEffectiveWorkerView && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black whitespace-nowrap">
                      작업자 전용
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap hidden 2xl:inline">
                  {isEffectiveWorkerView
                    ? 'FIELD WORKER VIEW · 현장 실사 및 입고 확정 전용'
                    : 'DAESUNG STEEL Smart MRO Control System'}
                </span>
              </div>
            </div>

            {/* Mobile Controls (< lg) */}
            <div className="flex items-center gap-1.5 lg:hidden shrink-0 flex-wrap justify-end">
              {currentUser && (
                <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700 px-2 py-1 rounded-lg text-[11px]">
                  {getRoleIcon(currentUser.level)}
                  <span
                    className={`px-1 py-0.2 rounded text-[10px] font-black border ${getRoleChipStyle(
                      currentUser.level
                    )}`}
                  >
                    LV.{currentUser.level}
                  </span>
                  <span className="font-bold text-slate-100 whitespace-nowrap">
                    {getCompactProfileLabel(currentUser)}
                  </span>
                </div>
              )}

              {onToggleWorkerMode && userLevel !== 2 && userLevel !== 3 && (
                <button
                  type="button"
                  onClick={onToggleWorkerMode}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                    isWorkerMode
                      ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-200'
                      : 'bg-slate-800 text-amber-300 border border-slate-700 hover:bg-slate-700'
                  }`}
                  title="현장 작업자 간소화 모드 전환"
                >
                  <HardHat className="w-3.5 h-3.5" />
                  <span>{isWorkerMode ? '현장ON' : '현장모드'}</span>
                </button>
              )}

              {userLevel === 0 && (
                <button
                  onClick={onOpenNewItemModal}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>품목등록</span>
                </button>
              )}

              {currentUser?.level === 0 && onOpenDbConfig && (
                <button
                  type="button"
                  onClick={onOpenDbConfig}
                  className={`relative p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    isDbConnected
                      ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-400 hover:bg-emerald-900'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  title="Supabase 클라우드 DB 환경설정 (LV.0 최고관리자 전용)"
                  aria-label="Supabase DB 환경설정"
                >
                  <Database className="w-3.5 h-3.5" />
                </button>
              )}

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-rose-200 hover:text-white bg-rose-950/70 hover:bg-rose-700 border border-rose-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  title="로그아웃"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>로그아웃</span>
                </button>
              )}
            </div>
          </div>

          {/* Zone 2: Center Main Navigation Tabs */}
          {isEffectiveWorkerView ? (
            /* LV.1 현장사용자 또는 현장 작업자 간소화 모드: 현장 중심 2개 탭 */
            <nav className="grid grid-cols-2 lg:flex items-center gap-1.5 sm:gap-2 w-full lg:w-auto pb-1 lg:pb-0">
              <button
                onClick={() => onTabChange('field-audit')}
                className={`flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-black rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'field-audit'
                    ? 'bg-amber-400 text-slate-950 shadow-md ring-2 ring-amber-200'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span>현장 실사 &amp; 입고 확정</span>
                {awaitingArrivalCount > 0 && (
                  <span className="bg-rose-600 text-white text-[11px] font-black px-1.5 py-0.2 rounded-full tabular-nums">
                    입고 {awaitingArrivalCount}
                  </span>
                )}
                {auditDelayedCount > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full tabular-nums hidden sm:inline">
                    지연 {auditDelayedCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => onTabChange('dashboard')}
                className={`flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-black rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>통합 모니터링 시트 (읽기 전용)</span>
              </button>

              <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>발주·통계·기준정보 차단됨</span>
              </div>
            </nav>
          ) : (
            /* LV.0 최고관리자 (5개 탭) 및 LV.2 사무실관리자 (4개 탭) */
            <nav className="flex items-center gap-1 xl:gap-1.5 overflow-x-auto lg:overflow-visible no-scrollbar pb-1 lg:pb-0 -mx-3 px-3 lg:mx-0 lg:px-0 w-full lg:w-auto justify-start lg:justify-center">
              <button
                onClick={() => onTabChange('dashboard')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                <span>통합 모니터링</span>
                {orderNeededCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full tabular-nums">
                    {orderNeededCount}
                  </span>
                )}
              </button>

              {canAccessFieldAudit && (
                <button
                  onClick={() => onTabChange('field-audit')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'field-audit'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <ClipboardCheck className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                  <span>현장 실사 &amp; 입고</span>
                  {awaitingArrivalCount > 0 && (
                    <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full tabular-nums">
                      {awaitingArrivalCount}
                    </span>
                  )}
                </button>
              )}

              {canAccessOrderSheet && (
                <button
                  onClick={() => onTabChange('order-sheet')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'order-sheet'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                  <span>거래처 발주서 발행</span>
                </button>
              )}

              {canAccessMasterData && (
                <button
                  onClick={() => onTabChange('master-data')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'master-data'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                  <span>기준정보 관리</span>
                </button>
              )}

              {canAccessStats && (
                <button
                  onClick={() => onTabChange('stats')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'stats'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                  <span>사용량 통계</span>
                </button>
              )}

              {canAccessAuditLog && (
                <button
                  onClick={() => onTabChange('audit-log')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'audit-log'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                  <span>변경 이력</span>
                </button>
              )}

              {canAccessMasterData && (
                <button
                  onClick={() => onTabChange('account-management')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'account-management'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                  <span>계정 관리</span>
                </button>
              )}
            </nav>
          )}

          {/* Zone 3: Compact Desktop Controls + Profile Chip + Logout */}
          <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 shrink-0">
            {/* Worker Mode Toggle Switch */}
            {onToggleWorkerMode && userLevel !== 2 && userLevel !== 3 && (
              <button
                type="button"
                onClick={onToggleWorkerMode}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border whitespace-nowrap ${
                  isWorkerMode
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-xs'
                    : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white'
                }`}
                title="스마트폰/태블릿 현장 작업자용 간소화 화면으로 전환합니다"
              >
                <HardHat className="w-3.5 h-3.5 shrink-0" />
                <span>현장 작업자 모드</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black uppercase ${
                    isWorkerMode
                      ? 'bg-slate-950 text-amber-400'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {isWorkerMode ? 'ON' : 'OFF'}
                </span>
              </button>
            )}

            {!isEffectiveWorkerView && (
              <>
                {userLevel === 0 && (
                  <button
                    onClick={onResetData}
                    title="초기 시드 데이터로 리셋 (LV.0 최고관리자 전용)"
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}

                {userLevel === 0 && (
                  <button
                    onClick={onOpenNewItemModal}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>신규 품목 등록</span>
                  </button>
                )}
              </>
            )}

            {/* Compact Profile Chip & Logout */}
            {currentUser && (
              <div className="flex items-center gap-1.5 pl-1.5 ml-0.5 border-l border-slate-700/80">
                <div
                  className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap"
                  title={`접속 ID: ${currentUser.username} (권한 LV.${currentUser.level})`}
                >
                  {getRoleIcon(currentUser.level)}
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-black border ${getRoleChipStyle(
                      currentUser.level
                    )}`}
                  >
                    LV.{currentUser.level}
                  </span>
                  <span className="font-bold text-slate-100">
                    {getCompactProfileLabel(currentUser)}
                  </span>
                </div>

                {onRefreshCloudData && (
                  <button
                    type="button"
                    onClick={onRefreshCloudData}
                    disabled={isCloudSyncing}
                    className="p-1.5 rounded-lg border bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                    title="Supabase 클라우드 DB 최신 라이브 데이터 새로고침"
                    aria-label="클라우드 DB 새로고침"
                  >
                    <RefreshCw className={`w-4 h-4 shrink-0 ${isCloudSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                )}

                {currentUser.level === 0 && onOpenDbConfig && (
                  <button
                    type="button"
                    onClick={onOpenDbConfig}
                    className={`relative p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      isDbConnected
                        ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-400 hover:bg-emerald-900'
                        : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title="Supabase 클라우드 DB 환경설정 (LV.0 최고관리자 전용)"
                    aria-label="Supabase DB 환경설정"
                  >
                    <Database className="w-4 h-4 shrink-0" />
                  </button>
                )}

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-200 hover:text-white bg-rose-950/70 hover:bg-rose-600 border border-rose-800/80 hover:border-rose-500 rounded-lg transition-all whitespace-nowrap cursor-pointer active:scale-95"
                    title="로그아웃"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>로그아웃</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Worker Mode / LV.2 Field User Active Banner */}
      {isEffectiveWorkerView && (
        <div className="bg-amber-400 text-slate-950 px-3 sm:px-6 py-1.5 text-xs font-bold border-t border-amber-500/40">
          <div className="w-full max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-slate-950 text-amber-400 rounded text-[10px] font-black">
                {userLevel === 2 ? 'LV.2 현장사용자 전용 뷰' : 'WORKER VIEW'}
              </span>
              <span>
                {userLevel === 2 ? (
                  <>
                    <strong>
                      {currentUser ? getCompactProfileLabel(currentUser) : '현장사용자'}
                    </strong>{' '}
                    권한으로 접속 중입니다. 불필요한 사무실 메뉴가 숨겨지며{' '}
                    <strong>[현장 실사 &amp; 입고 확정]</strong> 및{' '}
                    <strong>[통합 모니터링(읽기 전용)]</strong>만 활성화됩니다.
                  </>
                ) : (
                  <>
                    현장 작업자 보호 모드가 켜져 있습니다. 실수로 인한 발주 발행 및 기준정보 삭제가 방지되며, <strong>실사 입력</strong>과 <strong>합산 입고확정</strong>만 빠르게 수행할 수 있습니다.
                  </>
                )}
              </span>
            </div>
            {userLevel !== 2 && onToggleWorkerMode && (
              <button
                type="button"
                onClick={onToggleWorkerMode}
                className="px-2.5 py-0.5 bg-slate-950 hover:bg-slate-800 text-white rounded text-[11px] font-bold transition-colors cursor-pointer shrink-0"
              >
                사무실 전체 모드로 복귀
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
