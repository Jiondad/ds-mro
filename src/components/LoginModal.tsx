import React, { useState } from 'react';
import { UserAccount } from '../types';
import { Lock, User } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onLogin: (user: UserAccount) => void;
  onOpenPasswordChange?: () => void;
  userPasswords?: Record<string, string>;
  registeredUsers?: UserAccount[];
}

// 사내 등록된 표준 계정 데이터베이스 (4단계 RBAC)
export const SYSTEM_USERS: UserAccount[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    name: '김종현 실장',
    level: 0,
    roleLabel: 'LV.0 최고관리자',
    department: '관리팀',
  },
  {
    id: 'usr_field_mgr',
    username: 'field_mgr',
    name: '박총괄 팀장',
    level: 1,
    roleLabel: 'LV.1 현장관리자',
    department: '생산관리팀',
  },
  {
    id: 'usr_field_sl1',
    username: 'field_sl1',
    name: '박현장 반장',
    level: 2,
    roleLabel: 'LV.2 현장사용자',
    affiliation: 'SL1',
    department: 'SL1',
  },
  {
    id: 'usr_office',
    username: 'office1',
    name: '이지원 대리',
    level: 3,
    roleLabel: 'LV.3 사무실사용자',
    department: '구매자재팀',
  },
];

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onLogin,
  onOpenPasswordChange,
  userPasswords = {},
  registeredUsers = SYSTEM_USERS,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedId = username.trim();
    const userPool = registeredUsers.length > 0 ? registeredUsers : SYSTEM_USERS;
    const found = userPool.find((u) => u.username === trimmedId);
    if (!found) {
      setErrorMsg('등록되지 않은 아이디이거나 권한이 없습니다.');
      return;
    }

    if (found.isActive === false) {
      setErrorMsg('비활성화된 계정입니다. 최고관리자(LV.0)에게 문의하세요.');
      return;
    }

    const customPassword = userPasswords[found.username];
    const isPasswordValid = customPassword
      ? password === customPassword
      : password === '1234' || (found.username === 'admin' && password === 'admin123!');

    if (!isPasswordValid) {
      setErrorMsg('비밀번호가 일치하지 않습니다.');
      return;
    }

    onLogin(found);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 text-center space-y-1.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 mx-auto flex items-center justify-center font-black text-base shadow-inner">
            DS
          </div>
          <h2 className="text-base font-black tracking-tight text-white">대성스틸 MRO 로그인</h2>
          <p className="text-[11px] text-slate-400">자재 소모품 재고 실사 및 발주 시스템</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLoginSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-bold text-center">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">아이디 (ID)</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                autoComplete="username"
                required
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 font-medium bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">비밀번호 (Password)</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
                required
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black rounded-xl shadow-md transition-all cursor-pointer text-xs"
            >
              로그인 (Sign In)
            </button>
          </div>

          {/* Password Change Trigger */}
          {onOpenPasswordChange && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onOpenPasswordChange}
                className="text-[11px] font-semibold text-slate-500 hover:text-blue-600 underline cursor-pointer transition-colors"
              >
                비밀번호 변경
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
