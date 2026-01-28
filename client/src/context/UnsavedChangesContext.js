import { createContext, useContext, useState, useCallback, useRef } from 'react';

const UnsavedChangesContext = createContext(null);

export const UnsavedChangesProvider = ({ children }) => {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const pendingNavigationRef = useRef(null);
  const onProceedRef = useRef(null);

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
