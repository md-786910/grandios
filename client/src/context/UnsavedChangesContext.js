import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const UnsavedChangesContext = createContext(null);

export const UnsavedChangesProvider = ({ children }) => {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const pendingNavigationRef = useRef(null);
  const onProceedRef = useRef(null);
  const isBlockingBackRef = useRef(false);

  // Handle browser back button
  useEffect(() => {
    if (!hasUnsavedChanges) {
      isBlockingBackRef.current = false;
      return;
    }

    // Push a dummy state to prevent immediate back navigation
    if (!isBlockingBackRef.current) {
      window.history.pushState({ unsavedChangesGuard: true }, '');
      isBlockingBackRef.current = true;
    }

    const handlePopState = () => {
      if (hasUnsavedChanges) {
        // Push state back to prevent navigation
        window.history.pushState({ unsavedChangesGuard: true }, '');
        // Show modal
        onProceedRef.current = () => {
          isBlockingBackRef.current = false;
          window.history.back();
        };
        setShowModal(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedChanges]);

  const checkUnsavedChanges = useCallback((onProceed) => {
    if (hasUnsavedChanges) {
      onProceedRef.current = onProceed;
      setShowModal(true);
      return false; // Block navigation
    }
    // No unsaved changes - execute callback immediately
    onProceed();
    return true; // Allow navigation
  }, [hasUnsavedChanges]);

  const proceedWithNavigation = useCallback(() => {
    isBlockingBackRef.current = false;
    if (onProceedRef.current) {
      onProceedRef.current();
      onProceedRef.current = null;
    }
    setShowModal(false);
  }, []);

  const cancelNavigation = useCallback(() => {
    onProceedRef.current = null;
    setShowModal(false);
  }, []);

  const value = {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    checkUnsavedChanges,
    showModal,
    setShowModal,
    proceedWithNavigation,
    cancelNavigation,
    pendingNavigationRef,
  };

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
};

export const useUnsavedChanges = () => {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider');
  }
  return context;
};
