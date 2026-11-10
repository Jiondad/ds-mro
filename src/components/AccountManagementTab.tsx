import React, { useState, useMemo } from 'react';
import { CalculatedItem, UserAccount, UserLevel } from '../types';
import { TODAY_STR } from '../utils/calculations';
import {
  Users,
  UserPlus,
  KeyRound,
  Edit2,
  Trash2,
  Power,
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  HardHat,
  Briefcase,
  Package,
  X,
} from 'lucide-react';

interface AccountManagementTabProps {
  accounts: UserAccount[];
  items: CalculatedItem[];
  userPasswords: Record<string, string>;
  currentUser?: UserAccount | null;
  onAddAccount: (newAccount: UserAccount) => void;
  onUpdateAccount: (updatedAccount: UserAccount, previousUsername?: string) => void;
  onDeleteAccount: (accountId: string) => void;
  onToggleAccountActive: (accountId: string) => void;
  onResetUserPassword: (username: string, displayName?: string) => void;
}

const AFFILIATION_OPTIONS = [
  'SL1',
  'SL2',
  '공용',
  '포승공장',
  '아산공장',
  '관리팀',
];

export const AccountManagementTab: React.FC<AccountManagementTabProps> = ({
  accounts,
  items,
  userPasswords,
  currentUser,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onToggleAccountActive,
  onResetUserPassword,
}) => {
  // New Account Form States
  const [affiliation, setAffiliation] = useState<string>('SL1');
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [level, setLevel] = useState<UserLevel>(1);
  const [formError, setFormError] = useState<string>('');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [affiliationFilter, setAffiliationFilter] = useState<string>('전체');
  const [roleFilter, setRoleFilter] = useState<string>('전체');

  // Edit Modal State
  const [editingAccount, setEditingAccount] = useState<UserAccount | null>(null);
  const [editOriginalUsername, setEditOriginalUsername] = useState<string>('');
  const [editError, setEditError] = useState<string>('');

  // Compute assigned item counts per account (matched by receiverLoginId or receiverName)
  const itemCountByAccount = useMemo(() => {
    const map = new Map<string, CalculatedItem[]>();
    accounts.forEach((acc) => {
      const matched = items.filter(
        (it) =>
          (it.receiverLoginId && it.receiverLoginId.trim() === acc.username) ||
          (!it.receiverLoginId && it.receiverName && it.receiverName.trim() === acc.name.trim())
      );
      map.set(acc.id, matched);
    });
    return map;
  }, [accounts, items]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (affiliationFilter !== '전체') {
        const aff = acc.affiliation || '포승공장';
        if (affiliationFilter === '포승공장 전체') {
          if (!['포승공장', 'SL1', 'SL2', '공용', '관리팀'].includes(aff)) return false;
        } else if (aff !== affiliationFilter) {
          return false;
        }
      }

      if (roleFilter !== '전체') {
        if (roleFilter === 'field' && acc.level !== 1) return false;
        if (roleFilter === 'office' && acc.level !== 2) return false;
        if (roleFilter === 'admin' && acc.level !== 0) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = acc.name.toLowerCase().includes(q);
        const matchId = acc.username.toLowerCase().includes(q);
        const matchAff = (acc.affiliation || '').toLowerCase().includes(q);
        const matchPhone = (acc.phone || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchAff && !matchPhone) return false;
      }

      return true;
    });
  }, [accounts, affiliationFilter, roleFilter, searchQuery]);

  const getRoleBadge = (lvl: UserLevel) => {
    if (lvl === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
          <span>최고관리자 (LV.0)</span>
        </span>
      );
    }
    if (lvl === 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
          <span>사무실관리자 (LV.2)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
        <HardHat className="w-3.5 h-3.5 text-blue-600" />
        <span>현장사용자 (LV.1)</span>
      </span>
    );
  };

  const getAffiliationBadge = (aff?: string) => {
    const label = aff || '포승공장';
    if (label === '아산공장') {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
          {label}
        </span>
      );
    }
    if (label === 'SL1' || label === 'SL2') {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
          포승 · {label}
        </span>
      );
    }
    if (label === '공용') {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          포승 · 공용(포장/출하)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
        {label}
      </span>
    );
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = name.trim();
    const trimmedId = username.trim();

    if (!trimmedName) {
      setFormError('사용자 이름(수령자명)을 입력해주세요.');
      return;
    }
    if (!trimmedId) {
      setFormError('로그인 ID를 입력해주세요.');
      return;
    }
    if (accounts.some((a) => a.username.toLowerCase() === trimmedId.toLowerCase())) {
      setFormError(`이미 등록된 로그인 ID('${trimmedId}')입니다. 다른 아이디를 입력해주세요.`);
      return;
    }

    const roleLabel =
      level === 0 ? 'LV.0 최고관리자' : level === 2 ? 'LV.2 사무실관리자' : 'LV.1 현장사용자';

    const newAcc: UserAccount = {
      id: `usr_${Date.now()}`,
      username: trimmedId,
      password: '1234',
      name: trimmedName,
      affiliation,
      department: affiliation,
      phone: phone.trim() || undefined,
      level,
      roleLabel,
      isActive: true,
      createdAt: TODAY_STR,
    };

    onAddAccount(newAcc);
    setName('');
    setPhone('');
    setUsername('');
    setLevel(1);
  };

  const handleOpenEditModal = (acc: UserAccount) => {
    setEditingAccount({ ...acc });
    setEditOriginalUsername(acc.username);
    setEditError('');
  };

  const handleSaveEditModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setEditError('');

    const trimmedName = editingAccount.name.trim();
    const trimmedId = editingAccount.username.trim();

    if (!trimmedName) {
      setEditError('사용자 이름(수령자명)을 입력해주세요.');
      return;
    }
    if (!trimmedId) {
      setEditError('로그인 ID를 입력해주세요.');
      return;
    }

    const duplicate = accounts.find(
      (a) => a.id !== editingAccount.id && a.username.toLowerCase() === trimmedId.toLowerCase()
    );
    if (duplicate) {
      setEditError(`이미 사용 중인 로그인 ID('${trimmedId}')입니다.`);
      return;
    }

    const roleLabel =
      editingAccount.level === 0
        ? 'LV.0 최고관리자'
        : editingAccount.level === 2
        ? 'LV.2 사무실관리자'
        : 'LV.1 현장사용자';

    onUpdateAccount(
      {
        ...editingAccount,
        name: trimmedName,
        username: trimmedId,
        phone: editingAccount.phone?.trim() || undefined,
        department: editingAccount.affiliation || editingAccount.department,
        roleLabel,
      },
      editOriginalUsername
    );
    setEditingAccount(null);
  };

  const totalFieldUsers = accounts.filter((a) => a.level === 1).length;
  const totalManagers = accounts.filter((a) => a.level === 0 || a.level === 2).length;
  const initialPwCount = accounts.filter((a) => {
    const pw = userPasswords[a.username];
    return !pw || pw === '1234';
  }).length;

  return (
    <div className="space-y-4 w-full">
      {/* Top Header & Summary KPI Cards */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              사내 및 현장 사용자 계정 관리
            </h3>
            <span className="px-2 py-0.5 text-xs font-black rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
              LV.0 최고관리자 전용
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            현장 라인별 수령 담당자 및 관리자 계정을 통합 관리합니다. 여기에 등록된 사용자는 [품목 마스터]의 수령자(담당자) 드롭다운에 자동 연동됩니다.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 w-full lg:w-auto shrink-0">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-center">
            <div className="text-xs text-slate-500">전체 등록 계정</div>
            <div className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
              {accounts.length}명
            </div>
          </div>
          <div className="bg-blue-50/70 border border-blue-200 rounded-lg px-3.5 py-2 text-center">
            <div className="text-xs text-blue-700">현장사용자 / 관리자</div>
            <div className="text-base font-extrabold text-blue-900 font-mono mt-0.5">
              {totalFieldUsers} / {totalManagers}명
            </div>
          </div>
          <div className="bg-amber-50/80 border border-amber-200 rounded-lg px-3.5 py-2 text-center">
            <div className="text-xs text-amber-800">초기PW(1234) 대기</div>
            <div className="text-base font-extrabold text-amber-900 font-mono mt-0.5">
              {initialPwCount}명
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: New Account Registration Form */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-bold text-slate-900">
                신규 사용자 계정 등록
              </h4>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-lg">
            <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              신규 생성 시 초기 비밀번호는 <strong>&apos;1234&apos;</strong>로 자동 설정되며, 최초 로그인 시 비밀번호 변경이 강제됩니다.
            </span>
          </div>
        </div>

        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleCreateAccount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              소속 (공장/라인) <span className="text-rose-500">*</span>
            </label>
            <select
              value={affiliation}
              onChange={(e) => setAffiliation(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
            >
              {AFFILIATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'SL1'
                    ? 'SL1 (포승 1호라인)'
                    : opt === 'SL2'
                    ? 'SL2 (포승 2호라인)'
                    : opt === '공용'
                    ? '공용 (포승 포장/출하)'
                    : opt === '포승공장'
                    ? '포승공장 (공통)'
                    : opt === '아산공장'
                    ? '아산공장 (SL라인)'
                    : '관리팀 (사무실)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              사용자 이름 (수령자명) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="예: 박현장 반장, 홍길동 기장"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              수령자 연락처 (발주서 연동)
            </label>
            <input
              type="text"
              placeholder="예: 010-8899-7721"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              로그인 ID <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="예: field_sl3"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              접근 권한 <span className="text-rose-500">*</span>
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(Number(e.target.value) as UserLevel)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>현장사용자 (LV.1 · 실사/입고)</option>
              <option value={2}>사무실관리자 (LV.2 · 발주/통계)</option>
              <option value={0}>최고관리자 (LV.0 · 전체권한)</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>계정 생성 (초기PW: 1234)</span>
            </button>
          </div>
        </form>
      </div>

      {/* Section 2: Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700">소속 필터:</span>
          {['전체', '포승공장 전체', 'SL1', 'SL2', '공용', '아산공장'].map((aff) => (
            <button
              key={aff}
              type="button"
              onClick={() => setAffiliationFilter(aff)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                affiliationFilter === aff
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {aff}
            </button>
          ))}

          <span className="text-slate-300 mx-1">|</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2.5 py-1 bg-white text-slate-800"
          >
            <option value="전체">전체 권한</option>
            <option value="field">현장사용자 (LV.1)</option>
            <option value="office">사무실관리자 (LV.2)</option>
            <option value="admin">최고관리자 (LV.0)</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이름, 로그인 ID, 소속, 연락처 검색..."
            className="w-full text-xs border border-slate-300 rounded-lg pl-9 pr-3 py-2 bg-white text-slate-900 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Section 3: Registered Accounts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse table-auto whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 text-sm">
                <th className="px-3.5 py-3 border-r border-slate-200 text-center w-14 text-slate-500 font-mono">
                  No.
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 w-36">
                  소속
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 min-w-[180px]">
                  사용자 이름 (수령자명)
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 w-40">
                  로그인 ID
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 w-44">
                  권한
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 w-48">
                  비밀번호 변경 상태
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 text-center w-36">
                  담당 품목 수
                </th>
                <th className="px-3.5 py-3 border-r border-slate-200 text-center w-24">
                  계정 상태
                </th>
                <th className="px-3.5 py-3 text-center min-w-[240px]">
                  관리 기능
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-normal text-sm">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    조건에 해당하는 사용자 계정이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc, idx) => {
                  const customPw = userPasswords[acc.username];
                  const isInitial1234 = !customPw || customPw === '1234';
                  const assignedItems = itemCountByAccount.get(acc.id) || [];
                  const isActive = acc.isActive !== false;
                  const isSelf = currentUser?.username === acc.username;

                  return (
                    <tr
                      key={acc.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        !isActive ? 'bg-slate-50/70 opacity-65' : ''
                      }`}
                    >
                      <td className="px-3.5 py-3 border-r border-slate-200 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200">
                        {getAffiliationBadge(acc.affiliation)}
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200 font-normal">
                        <div className="text-base font-normal text-slate-900 leading-snug">
                          {acc.name}
                        </div>
                        {acc.phone ? (
                          <div className="text-xs font-mono text-slate-500 mt-0.5">
                            {acc.phone}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 mt-0.5">연락처 미등록</div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200">
                        <span className="font-mono text-base font-normal text-slate-900">
                          {acc.username}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200">
                        {getRoleBadge(acc.level)}
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200">
                        {isInitial1234 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            <span>초기PW (1234 · 변경대기)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>본인 PW 변경완료</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200 text-center">
                        {assignedItems.length > 0 ? (
                          <div
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-xs font-mono"
                            title={assignedItems.map((i) => `[${i.line}] ${i.itemName} (${i.spec})`).join('\n')}
                          >
                            <Package className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-sm font-semibold">{assignedItems.length}</span>
                            <span>품목</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">0 품목</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 border-r border-slate-200 text-center">
                        {isActive ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                            활성
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-600">
                            비활성
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `'${acc.name} (${acc.username})' 계정의 비밀번호를 초기값('1234')으로 초기화하시겠습니까?\n\n초기화 후 해당 사용자가 다음 로그인 시 새 비밀번호 변경이 강제됩니다.`
                                )
                              ) {
                                onResetUserPassword(acc.username, acc.name);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors cursor-pointer"
                            title="비밀번호를 '1234'로 초기화"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                            <span>비밀번호 초기화(1234)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(acc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 transition-colors cursor-pointer"
                            title="계정 정보 수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>정보 수정</span>
                          </button>

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => onToggleAccountActive(acc.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              isSelf
                                ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                                : isActive
                                ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300 cursor-pointer'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 cursor-pointer'
                            }`}
                            title={isSelf ? '현재 로그인 중인 본인 계정은 비활성화할 수 없습니다' : isActive ? '계정 비활성화' : '계정 활성화'}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{isActive ? '비활성화' : '활성화'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => {
                              if (
                                confirm(
                                  `'${acc.name} (${acc.username})' 계정을 삭제하시겠습니까?\n(담당 품목이 있는 경우 비활성화를 권장합니다)`
                                )
                              ) {
                                onDeleteAccount(acc.id);
                              }
                            }}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isSelf
                                ? 'text-slate-300 border-slate-200 cursor-not-allowed'
                                : 'text-rose-600 hover:bg-rose-50 border-rose-200 cursor-pointer'
                            }`}
                            title={isSelf ? '현재 로그인 중인 본인 계정은 삭제할 수 없습니다' : '계정 삭제'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Account Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <h4 className="text-sm font-bold">사용자 계정 정보 수정</h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditModal} className="p-5 space-y-3.5 text-sm">
              {editError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  소속 (공장/라인)
                </label>
                <select
                  value={editingAccount.affiliation || '포승공장'}
                  onChange={(e) =>
                    setEditingAccount({ ...editingAccount, affiliation: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900"
                >
                  {AFFILIATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  사용자 이름 (수령자명)
                </label>
                <input
                  type="text"
                  value={editingAccount.name}
                  onChange={(e) =>
                    setEditingAccount({ ...editingAccount, name: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  수령자 연락처
                </label>
                <input
                  type="text"
                  value={editingAccount.phone || ''}
                  onChange={(e) =>
                    setEditingAccount({ ...editingAccount, phone: e.target.value })
                  }
                  placeholder="예: 010-8899-7721"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  로그인 ID
                </label>
                <input
                  type="text"
                  value={editingAccount.username}
                  onChange={(e) =>
                    setEditingAccount({ ...editingAccount, username: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono bg-white text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  권한 설정
                </label>
                <select
                  value={editingAccount.level}
                  onChange={(e) =>
                    setEditingAccount({
                      ...editingAccount,
                      level: Number(e.target.value) as UserLevel,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900"
                >
                  <option value={1}>현장사용자 (LV.1 · 실사/입고)</option>
                  <option value={2}>사무실관리자 (LV.2 · 발주/통계)</option>
                  <option value={0}>최고관리자 (LV.0 · 전체권한)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
