import React, { useState } from 'react';
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
  Menu,
  X,
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const userLevel = currentUser?.level ?? 0;
  const isEffectiveWorkerView = (isWorkerMode && userLevel !== 3) || userLevel === 2;
  const canAccessMasterData = userLevel === 0 && !isEffectiveWorkerView;
  const canAccessOrderSheet = (userLevel === 0 || userLevel === 3) && !isEffectiveWorkerView;
  const canAccessStats = (userLevel === 0 || userLevel === 1 || userLevel === 3) && !isEffectiveWorkerView;
  const canAccessAuditLog = (userLevel === 0 || userLevel === 1 || userLevel === 3) && !isEffectiveWorkerView;
  const canAccessFieldAudit = userLevel === 0 || userLevel === 1 || userLevel === 2;

  const getRoleChipStyle = (level: number) => {
    if (level === 0) return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    if (level === 1) return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    if (level === 2) return 'bg-amber-400/20 text-amber-300 border-amber-400/40';
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  };

  const getRoleIcon = (level: number) => {
    if (level === 0) return <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    if (level === 1) return <HardHat className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    if (level === 2) return <HardHat className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    return <Briefcase className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  };

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

  const handleTabClick = (tab: ActiveTab) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
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
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm sm:text-base tracking-wider shadow-inner shrink-0 ${
                isEffectiveWorkerView
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {isEffectiveWorkerView ? '현장' : 'DS'}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-extrabold tracking-tight text-white">
                  대성스틸 스마트 자재·소모품
                </span>
                {isEffectiveWorkerView && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                    현장전용
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Navigation Tabs (PC 화면 전용 가로형 메뉴) */}
          <div className="hidden lg:flex items-center gap-1 xl:gap-1.5">
            {isEffectiveWorkerView ? (
              <nav className="flex items-center gap-2">
                <button
                  onClick={() => handleTabClick('field-audit')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-black rounded-xl transition-all cursor-pointer ${
                    activeTab === 'field-audit'
                      ? 'bg-amber-400 text-slate-950 shadow-md ring-2 ring-amber-200'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <ClipboardCheck className="w-4 h-4 shrink-0" />
                  <span>현장 실사 & 입고 확정</span>
                  {awaitingArrivalCount > 0 && (
                    <span className="bg-rose-600 text-white text-[11px] font-black px-1.5 py-0.2 rounded-full tabular-nums">
                      {awaitingArrivalCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleTabClick('dashboard')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-black rounded-xl transition-all cursor-pointer ${
                    activeTab === 'dashboard'
                      ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>통합 모니터링 시트 (읽기 전용)</span>
                </button>
              </nav>
            ) : (
              <nav className="flex items-center gap-1 xl:gap-1.5">
                <button
                  onClick={() => handleTabClick('dashboard')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer ${
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
                    onClick={() => handleTabClick('field-audit')}
                    className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'field-audit'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                    <span>현장 실사 & 입고</span>
                    {awaitingArrivalCount > 0 && (
                      <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full tabular-nums">
                        {awaitingArrivalCount}
                      </span>
                    )}
                  </button>
                )}

                {canAccessOrderSheet && (
                  <button
                    onClick={() => handleTabClick('order-sheet')}
                    className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer ${
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
                    onClick={() => handleTabClick('master-data')}
                    className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer ${
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
                    onClick={() => handleTabClick('stats')}
                    className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer ${
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
                    onClick={() => handleTabClick('audit-log')}
                    className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer ${
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
                    onClick={() => handleTabClick('account-management')}
                    className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs xl:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer ${
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
          </div>

          {/* Desktop Right Controls (PC 전용 우측 버튼 그룹) */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {onToggleWorkerMode && userLevel !== 2 && userLevel !== 3 && (
              <button
                type="button"
                onClick={onToggleWorkerMode}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  isWorkerMode
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <HardHat className="w-3.5 h-3.5 shrink-0" />
                <span>현장 작업자 모드</span>
                <span className={`px-1 rounded text-[10px] font-black ${isWorkerMode ? 'bg-slate-950 text-amber-400' : 'bg-slate-700 text-slate-300'}`}>
                  {isWorkerMode ? 'ON' : 'OFF'}
                </span>
              </button>
            )}

            {!isEffectiveWorkerView && userLevel === 0 && (
              <>
                <button
                  onClick={onResetData}
                  title="초기 시드 데이터로 리셋"
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onOpenNewItemModal}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>신규 품목 등록</span>
                </button>
              </>
            )}

            {currentUser && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs">
                  {getRoleIcon(currentUser.level)}
                  <span className={`px-1 rounded text-[10px] font-black border ${getRoleChipStyle(currentUser.level)}`}>
                    LV.{currentUser.level}
                  </span>
                  <span className="font-bold text-slate-100">{getCompactProfileLabel(currentUser)}</span>
                </div>

                {onRefreshCloudData && (
                  <button
                    type="button"
                    onClick={onRefreshCloudData}
                    disabled={isCloudSyncing}
                    className="p-1.5 rounded-lg border bg-slate-800 border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                    title="클라우드 DB 새로고침"
                  >
                    <RefreshCw className={`w-4 h-4 ${isCloudSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                )}

                {userLevel === 0 && onOpenDbConfig && (
                  <button
                    type="button"
                    onClick={onOpenDbConfig}
                    className={`p-1.5 rounded-lg border cursor-pointer ${isDbConnected ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                    title="Supabase DB 설정"
                  >
                    <Database className="w-4 h-4" />
                  </button>
                )}

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-200 hover:text-white bg-rose-950 hover:bg-rose-600 border border-rose-800 rounded-lg cursor-pointer"
                    title="로그아웃"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>로그아웃</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile Hamburger Button (< lg): 모바일 화면 전용 삼선 햄버거 버튼 */}
          <div className="flex items-center gap-1.5 lg:hidden">
            {currentUser && (
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 px-2 py-1 rounded-lg text-[11px]">
                {getRoleIcon(currentUser.level)}
                <span className="font-bold text-slate-100">{currentUser.name}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 border border-slate-700 cursor-pointer transition-colors"
              aria-label="메뉴 열기"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6 text-amber-400" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Dropdown Drawer (모바일 삼선 메뉴 클릭 시 펼쳐지는 세로형 히든 패널) */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-slate-950 border-t border-slate-800 px-4 py-4 space-y-4 animate-in slide-in-from-top-2 duration-150">
          
          {/* 사용자 정보 & 권한 칩 */}
          {currentUser && (
            <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <div className="flex items-center gap-2">
                {getRoleIcon(currentUser.level)}
                <div>
                  <div className="font-bold text-sm text-white">{currentUser.name} {currentUser.title}</div>
                  <div className="text-[11px] text-slate-400">{currentUser.department || currentUser.affiliation}</div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${getRoleChipStyle(currentUser.level)}`}>
                LV.{currentUser.level}
              </span>
            </div>
          )}

          {/* 모바일 메인 네비게이션 탭 목록 */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">메뉴 네비게이션</div>
            
            <button
              onClick={() => handleTabClick('dashboard')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4 text-blue-400" />
                <span>통합 모니터링 시트</span>
              </div>
              {orderNeededCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {orderNeededCount}건 발주필요
                </span>
              )}
            </button>

            {canAccessFieldAudit && (
              <button
                onClick={() => handleTabClick('field-audit')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === 'field-audit' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardCheck className="w-4 h-4 text-amber-400" />
                  <span>현장 실사 & 입고 확정</span>
                </div>
                {awaitingArrivalCount > 0 && (
                  <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    입고 {awaitingArrivalCount}
                  </span>
                )}
              </button>
            )}

            {canAccessOrderSheet && (
              <button
                onClick={() => handleTabClick('order-sheet')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === 'order-sheet' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>거래처 발주서 발행</span>
              </button>
            )}

            {canAccessMasterData && (
              <button
                onClick={() => handleTabClick('master-data')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === 'master-data' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Settings className="w-4 h-4 text-purple-400" />
                <span>기준정보 관리</span>
              </button>
            )}

            {canAccessStats && (
              <button
                onClick={() => handleTabClick('stats')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === 'stats' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <span>사용량 통계 분석</span>
              </button>
            )}

            {canAccessAuditLog && (
              <button
                onClick={() => handleTabClick('audit-log')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === 'audit-log' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <History className="w-4 h-4 text-indigo-400" />
                <span>데이터 변경 이력</span>
              </button>
            )}

            {canAccessMasterData && (
              <button
                onClick={() => handleTabClick('account-management')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === 'account-management' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4 text-pink-400" />
                <span>계정 관리 & 권한</span>
              </button>
            )}
          </div>

          {/* 모바일 빠른 작업 버튼 (품목등록, 현장모드, 새로고침 등) */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">빠른 제어 & 작업</div>
            
            <div className="grid grid-cols-2 gap-2">
              {onToggleWorkerMode && userLevel !== 2 && userLevel !== 3 && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleWorkerMode();
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-extrabold border ${
                    isWorkerMode
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-900 text-amber-300 border-slate-800'
                  }`}
                >
                  <HardHat className="w-4 h-4" />
                  <span>현장모드 {isWorkerMode ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {userLevel === 0 && !isEffectiveWorkerView && (
                <button
                  onClick={() => {
                    onOpenNewItemModal();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500"
                >
                  <Plus className="w-4 h-4" />
                  <span>신규 품목 등록</span>
                </button>
              )}

              {onRefreshCloudData && (
                <button
                  type="button"
                  onClick={() => {
                    onRefreshCloudData();
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={isCloudSyncing}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 text-slate-200"
                >
                  <RefreshCw className={`w-4 h-4 ${isCloudSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>데이터 새로고침</span>
                </button>
              )}

              {userLevel === 0 && onOpenDbConfig && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenDbConfig();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 text-emerald-400"
                >
                  <Database className="w-4 h-4" />
                  <span>Supabase 설정</span>
                </button>
              )}
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-white bg-rose-950 hover:bg-rose-900 border border-rose-800 rounded-xl mt-2"
              >
                <LogOut className="w-4 h-4 text-rose-300" />
                <span>안전하게 로그아웃</span>
              </button>
            )}
          </div>

        </div>
      )}

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
                    <strong>{currentUser ? getCompactProfileLabel(currentUser) : '현장사용자'}</strong> 권한으로 접속 중입니다. <strong>[현장 실사 & 입고 확정]</strong> 및 <strong>[통합 모니터링(읽기 전용)]</strong>만 활성화됩니다.
                  </>
                ) : (
                  <>
                    현장 작업자 보호 모드가 켜져 있습니다. <strong>실사 입력</strong>과 <strong>입고확정</strong>만 빠르게 수행할 수 있습니다.
                  </>
                )}
              </span>
            </div>
            {userLevel !== 2 && onToggleWorkerMode && (
              <button
                type="button"
                onClick={onToggleWorkerMode}
                className="px-2.5 py-0.5 bg-slate-950 hover:bg-slate-800 text-white rounded text-[11px] font-bold cursor-pointer shrink-0"
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
