/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  auth, 
  setupUserProfile
} from '../lib/firebase';
import { 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import * as Icons from 'lucide-react';
import { motion } from 'motion/react';

interface UserAuthProps {
  onAuthChanged: () => void;
  currentUser: any;
  userProfile: any;
}

export default function UserAuth({ onAuthChanged, currentUser, userProfile }: UserAuthProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      try {
        const result = await signInWithPopup(auth, provider);
        await setupUserProfile(result.user, result.user.displayName || 'Google User');
        onAuthChanged();
      } catch (err: any) {
        if (err.code === 'auth/internal-error' || err.code === 'auth/popup-blocked') {
          // Fallback to redirect on mobile/iframes
          const { signInWithRedirect } = await import('firebase/auth');
          await signInWithRedirect(auth, provider);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Google Sign-In is restricted by AI Studio. Please use Email/Password.');
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || 'Google sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      onAuthChanged();
    } catch (err: any) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (currentUser) {
    return (
      <div className="bg-white/60 dark:bg-[#1A1D21]/90 border border-slate-200 dark:border-white/10 rounded-2xl p-4 backdrop-blur-xl flex flex-col items-center justify-center text-center shadow-lg">
        <div className="w-12 h-12 bg-linear-to-tr from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-lg mb-3 shadow-md">
          {userProfile?.displayName?.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase() || 'U'}
        </div>
        <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-1">
          {userProfile?.displayName || 'Student'}
        </h4>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">{currentUser.email}</span>
        
        <button
          onClick={handleLogout}
          disabled={loading}
          className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
          title="Sign Out"
          id="auth-signout-btn"
        >
          <Icons.LogOut className="w-4 h-4" />
          <span className="text-xs tracking-wider uppercase font-mono">Sign Out</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white/45 dark:bg-[#161A1D]/80 border border-slate-200 dark:border-white/10 rounded-2xl p-5 backdrop-blur-md">
      <div className="text-center mb-4">
        <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-600 dark:text-neon-lime font-mono mb-1 block">Account Access</span>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-sans">
          Sign in to Sync Progress
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Save your progress, custom generated topics, bookmarks, and compete in standard arena leaderboards.
        </p>
      </div>

      <div className="space-y-3.5">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-600 dark:text-rose-300 text-xs rounded-xl flex items-start gap-2 leading-relaxed shadow-sm"
          >
            <Icons.AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full py-3 bg-white dark:bg-[#202528] hover:bg-slate-50 dark:hover:bg-[#2A3035] text-slate-700 dark:text-white font-bold rounded-xl text-sm tracking-wider flex items-center justify-center gap-3 cursor-pointer shadow-sm border border-slate-200 dark:border-white/10 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Icons.Loader2 className="w-4.5 h-4.5 animate-spin text-slate-700 dark:text-white" />
          ) : (
            <>
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
