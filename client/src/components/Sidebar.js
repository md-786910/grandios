import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
import menuItems from "./menuItems";

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { checkUnsavedChanges } = useUnsavedChanges();
  const [logoutModal, setLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  const handleLogoutClick = () => {
    setError("");
    setLogoutModal(true);
  };

  const handleCloseLogoutModal = () => {
    if (!loggingOut) {
      setLogoutModal(false);
      setError("");
    }
  };

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    setError("");

    try {
      await logout();
      setLogoutModal(false);
      navigate("/");
    } catch (err) {
      setError(
        err.message || "Abmeldung fehlgeschlagen. Bitte versuchen Sie es erneut."
      );
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-100 flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 py-8">
        <h1 className="text-xl tracking-[0.2em] font-medium text-gray-800 text-center">
          GRANDIOS
        </h1>
        <p className="text-[11px] tracking-[0.08em] text-gray-600 uppercase text-center mt-0.5">
          The Curvy Fashion Store
        </p>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 px-4">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              location.pathname.startsWith(item.path + "/");
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    checkUnsavedChanges(() => navigate(item.path));
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                    isActive
                      ? "bg-gray-800 hover:bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {item.icon}
                  <span className="font-medium text-sm">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="px-4 pb-6">
        <button
          onClick={handleLogoutClick}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-gray-600 hover:bg-gray-50 rounded-xl transition-all"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span className="font-medium text-sm">Ausloggen</span>
        </button>
      </div>

      {/* Logout Confirmation Modal */}
      {logoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/20" onClick={handleCloseLogoutModal} />

          {/* Modal */}
          <div className="relative bg-white rounded-lg shadow-lg w-full max-w-sm mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">
                ABMELDEN
              </h3>
              <button
                onClick={handleCloseLogoutModal}
                disabled={loggingOut}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-8">
              <p className="text-center text-gray-700 text-sm">
                Möchten Sie sich wirklich abmelden?
              </p>
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-4 px-5 pb-6">
              <button
                onClick={handleConfirmLogout}
                disabled={loggingOut}
                className="min-w-[100px] px-6 py-2.5 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loggingOut ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Abmelden...
                  </>
                ) : (
                  "Ja"
                )}
              </button>
              <button
                onClick={handleCloseLogoutModal}
                disabled={loggingOut}
                className="min-w-[100px] px-6 py-2.5 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Stornieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
