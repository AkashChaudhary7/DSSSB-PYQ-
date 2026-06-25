/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  auth, 
  setupUserProfile, 
  syncUserData 
} from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile 
} from 'firebase/auth';
import * as Icons from 'lucide-react';
import { motion } from 'motion/react';

interface UserAuthProps {
  onAuthChanged: () => void;
  currentUser: any;
  userProfile: any;
}

export default function UserAuth({ onAuthChanged, currentUser, userProfile }: UserAuthProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegistering) {
        if (!displayName.trim()) {
          throw new Error("Display Name is required.");
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        await setupUserProfile(userCredential.user, displayName);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onAuthChanged();
      // Clear forms
      setEmail('');
      setPassword('');
      setDisplayName('');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Email is already registered. Please log in.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password login is not enabled in Firebase Authentication settings.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Invalid credentials. Check email or password.');
      } else {
        setError(err.message || 'An authentication error occurred.');
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
      <div className="p-4 bg-white/45 dark:bg-[#161A1D]/80 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-linear-to-tr from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {userProfile?.displayName?.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
              {userProfile?.displayName || 'Student Colleague'}
            </h4>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">{currentUser.email}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {userProfile && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-300 font-bold font-mono text-[10px] px-2 py-1 rounded-lg flex items-center gap-1">
              <Icons.Trophy className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              <span>{userProfile.points} PTS</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            disabled={loading}
            className="p-1.5 bg-slate-100 dark:bg-white/5 hover:bg-rose-500/10 border border-slate-200 dark:border-white/10 hover:border-rose-500/30 text-slate-500 dark:text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer transition-colors"
            title="Sign Out"
            id="auth-signout-btn"
          >
            <Icons.LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/45 dark:bg-[#161A1D]/80 border border-slate-200 dark:border-white/10 rounded-2xl p-5 backdrop-blur-md">
      <div className="text-center mb-4">
        <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-600 dark:text-neon-lime font-mono mb-1 block">Account Access</span>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-sans">
          {isRegistering ? 'Register Practice Account' : 'Sign in to Sync Progress'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Save your points, custom generated topics, bookmarks, and compete in standard arena leaderboards.
        </p>
      </div>

      <form onSubmit={handleAuth} className="space-y-3">
        {isRegistering && (
          <div>
            <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500 dark:text-slate-400 block mb-1">Display Name</label>
            <div className="relative">
              <Icons.User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="eg. Linus Torvalds"
                className="w-full bg-slate-50 dark:bg-black/15 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-hidden transition-all"
                id="auth-input-name"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500 dark:text-slate-400 block mb-1">Email Address</label>
          <div className="relative">
            <Icons.Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="eg. you@sanyfoundry.edu"
              className="w-full bg-slate-50 dark:bg-black/15 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-hidden transition-all"
              id="auth-input-email"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500 dark:text-slate-400 block mb-1">Secret Password</label>
          <div className="relative">
            <Icons.Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 dark:bg-black/15 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-hidden transition-all"
              id="auth-input-password"
            />
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/25 text-rose-650 dark:text-rose-300 text-[11px] rounded-xl flex items-start gap-1.5 leading-relaxed">
            <Icons.AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white dark:bg-none dark:bg-neon-lime dark:hover:bg-neon-lime/95 dark:text-black font-extrabold rounded-xl text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-500/15 dark:shadow-[0_0_15px_rgba(158,255,51,0.2)] border border-white/10 dark:border-neon-lime/20 transition-all"
          id="auth-submit-btn"
        >
          {loading ? (
            <Icons.Loader2 className="w-4 h-4 animate-spin text-white dark:text-black" />
          ) : (
            <>
              {isRegistering ? <Icons.UserPlus className="w-4 h-4" /> : <Icons.LogIn className="w-4 h-4" />}
              <span>{isRegistering ? 'Create Active Account' : 'Authenticate credentials'}</span>
            </>
          )}
        </motion.button>
      </form>

      <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-[11px]">
        <span className="text-slate-500 dark:text-slate-400">
          {isRegistering ? 'Already have credentials?' : "Don't have an account yet?"}
        </span>
        <button
          type="button"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setError(null);
          }}
          className="text-indigo-600 dark:text-neon-lime hover:underline font-bold cursor-pointer"
        >
          {isRegistering ? 'Sign In' : 'Sign Up Free'}
        </button>
      </div>
    </div>
  );
}
