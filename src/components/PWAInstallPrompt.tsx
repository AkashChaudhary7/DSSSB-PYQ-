import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detect iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    if (isIOS && isSafari) {
      const hasDismissed = localStorage.getItem('pwa_ios_dismissed');
      if (!hasDismissed) {
        setShowIOSPrompt(true);
      }
    }

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  if (isInstalled || isDismissed) return null;

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the A2HS prompt');
    } else {
      console.log('User dismissed the A2HS prompt');
    }
    setDeferredPrompt(null);
  };

  const dismissIOSPrompt = () => {
    localStorage.setItem('pwa_ios_dismissed', 'true');
    setShowIOSPrompt(false);
    setIsDismissed(true);
  };

  const dismissPrompt = () => {
    setIsDismissed(true);
  };

  if (!deferredPrompt && !showIOSPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96"
      >
        <div className="bg-white dark:bg-[#161A1D] rounded-2xl shadow-xl p-4 border border-slate-200 dark:border-white/10 flex flex-col gap-3 backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-indigo-900/30 flex items-center justify-center text-blue-600 dark:text-indigo-400">
                <Icons.Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Install AT Mocks App</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Install for offline use & better experience</p>
              </div>
            </div>
            <button onClick={showIOSPrompt ? dismissIOSPrompt : dismissPrompt} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
              <Icons.X className="w-4 h-4" />
            </button>
          </div>

          {deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-[0.98]"
            >
              Install App
            </button>
          )}

          {showIOSPrompt && (
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-white/5 flex items-center gap-2 leading-relaxed">
              <div className="flex-1">
                To install on iOS: tap <Icons.Share className="w-[14px] h-[14px] inline-flex mb-0.5 mx-0.5 text-blue-500" /> and select <strong className="font-bold">Add to Home Screen</strong> <Icons.PlusSquare className="w-[14px] h-[14px] inline-flex mb-0.5 mx-0.5 text-slate-700 dark:text-slate-300" />
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
