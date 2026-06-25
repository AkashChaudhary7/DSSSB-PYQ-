/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  auth, 
  setupUserProfile
} from '../lib/firebase';
import { 
  signOut,
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
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
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    // Check for redirect result on mount
    setLoading(true);
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        setupUserProfile(result.user, result.user.displayName || 'Google User').then(() => {
          onAuthChanged();
        });
      }
      setLoading(false);
    }).catch((err: any) => {
      console.error("Redirect auth error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Google Sign-In is restricted. Please enable Google provider in Firebase Console.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized. Please add this app URL to your Firebase Console -> Authentication -> Settings -> Authorized domains.');
      } else {
        setError(err.message || 'Google sign-in failed.');
      }
      setLoading(false);
    });
  }, [onAuthChanged]);

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
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/internal-error') {
          // Fallback to redirect on mobile/iframes
          await signInWithRedirect(auth, provider);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Google Sign-In is restricted. Please enable Google provider in Firebase Console.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized. Please add this app URL to your Firebase Console -> Authentication -> Settings -> Authorized domains.');
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || 'Google sign-in failed.');
      }
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address in the field below first, then click "Forgot?" again.');
      return;
    }
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfoMessage(`A password reset link has been successfully sent to ${email}. Please check your inbox and spam folder.`);
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setError('No registered account was found with this email. Please check the email spelling or Sign Up instead.');
      } else {
        setError(err.message || 'Failed to send password reset email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      if (isSignUp) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await setupUserProfile(result.user, displayName || email.split('@')[0]);
        onAuthChanged();
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        onAuthChanged();
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered! Please switch to "Sign In" below. If you forgot your password, enter your email and click the "Forgot?" link above.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. If you do not have an account yet, please click "Don\'t have an account? Sign Up" below to create one.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password provider is disabled in Firebase Console. Please enable Email/Password provider.');
      } else {
        setError(err.message || 'Authentication failed.');
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
    <div className="bg-white/45 dark:bg-[#161A1D]/80 border border-slate-200 dark:border-white/10 rounded-2xl p-5 backdrop-blur-md max-w-sm mx-auto">
      <div className="text-center mb-4">
        <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-600 dark:text-neon-lime font-mono mb-1 block">Account Access</span>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-sans">
          {isSignUp ? 'Create your Account' : 'Sign In to Sync'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Save your progress, generated topics, bookmarks, and compete in the leaderboards.
        </p>
      </div>

      <div className="space-y-3.5">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-600 dark:text-rose-300 text-xs rounded-xl flex items-start gap-2 leading-relaxed shadow-sm"
          >
            <Icons.AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}

        {infoMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-start gap-2 leading-relaxed shadow-sm"
          >
            <Icons.CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </motion.div>
        )}

        {/* Google Provider Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full py-2.5 bg-white dark:bg-[#202528] hover:bg-slate-50 dark:hover:bg-[#2A3035] text-slate-700 dark:text-white font-bold rounded-xl text-xs tracking-wider flex items-center justify-center gap-2.5 cursor-pointer shadow-sm border border-slate-200 dark:border-white/10 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Icons.Loader2 className="w-4 h-4 animate-spin text-slate-700 dark:text-white" />
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              <span>Google Sign-In</span>
            </>
          )}
        </motion.button>

        {/* Divider */}
        <div className="flex items-center my-3.5">
          <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
          <span className="px-2.5 text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 font-mono">or email credentials</span>
          <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          {isSignUp && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 font-mono">Your Name</label>
              <input
                type="text"
                placeholder="eg. Alex Mercer"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                required={isSignUp}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1E2226] border border-slate-200 dark:border-white/5 rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 font-mono">Email Address</label>
            <input
              type="email"
              placeholder="alex@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1E2226] border border-slate-200 dark:border-white/5 rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">Password</label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold font-mono cursor-pointer"
                >
                  Forgot?
                </button>
              )}
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1E2226] border border-slate-200 dark:border-white/5 rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs tracking-wider uppercase font-mono flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-75 disabled:cursor-not-allowed mt-4"
          >
            {loading ? (
              <Icons.Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <>
                <Icons.Lock className="w-3.5 h-3.5" />
                <span>{isSignUp ? 'Sign Up' : 'Sign In'}</span>
              </>
            )}
          </motion.button>
        </form>

        {/* Form Toggle Link */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setInfoMessage(null);
            }}
            disabled={loading}
            className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}
