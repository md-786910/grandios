import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { settingsAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

const Einstellungen = () => {
  const { user, updateUser } = useAuth();
  const [settings, setSettings] = useState({
    name: "",
    email: "",
    notifications: {
      emailOnNewOrders: true,
      dailySummary: false
    },
    discount: {
      discountRate: 10,
      ordersRequiredForDiscount: 3,
      autoCreateDiscount: true
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await settingsAPI.get();
        if (response.data.success) {
          setSettings({
            ...response.data.data,
            discount: response.data.data.discount || {
              discountRate: 10,
              ordersRequiredForDiscount: 3,
              autoCreateDiscount: true
            }
          });
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const response = await settingsAPI.update(settings);
      if (response.data.success) {
        setMessage({ type: "success", text: "Einstellungen gespeichert!" });
        if (updateUser) {
          updateUser(response.data.data);
        }
      }
    } catch (error) {
      setMessage({ type: "error", text: "Fehler beim Speichern der Einstellungen" });
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
        <p className="text-gray-500 mt-1">Systemeinstellungen verwalten</p>
      </div>

      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Profile Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Profil Einstellungen
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                E-Mail
              </label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
              />
            </div>
          </div>
        </div>

        {/* Discount Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Rabatt Einstellungen
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rabattsatz (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.discount?.discountRate || 10}
                onChange={(e) => setSettings({
                  ...settings,
                  discount: {
                    ...settings.discount,
                    discountRate: parseFloat(e.target.value) || 0
                  }
                })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Prozentsatz des Rabatts, der auf qualifizierende Bestellungen angewendet wird
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bestellungen für Rabatt
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.discount?.ordersRequiredForDiscount || 3}
                onChange={(e) => setSettings({
                  ...settings,
                  discount: {
                    ...settings.discount,
                    ordersRequiredForDiscount: parseInt(e.target.value) || 3
                  }
                })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Anzahl der Bestellungen, die erforderlich sind, um einen Rabatt zu erhalten
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  Automatische Rabatterstellung
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  Rabatt automatisch erstellen, wenn die erforderliche Anzahl von Bestellungen erreicht ist
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.discount?.autoCreateDiscount || false}
                onChange={(e) => setSettings({
                  ...settings,
                  discount: {
                    ...settings.discount,
                    autoCreateDiscount: e.target.checked
                  }
                })}
                className="w-5 h-5 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
              />
            </label>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Benachrichtigungen
          </h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700">
                E-Mail Benachrichtigungen bei neuen Bestellungen
              </span>
              <input
                type="checkbox"
                checked={settings.notifications?.emailOnNewOrders || false}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    emailOnNewOrders: e.target.checked
                  }
                })}
                className="w-5 h-5 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700">
                Tägliche Zusammenfassung
              </span>
              <input
                type="checkbox"
                checked={settings.notifications?.dailySummary || false}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    dailySummary: e.target.checked
                  }
                })}
                className="w-5 h-5 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
              />
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {saving ? "Speichern..." : "Einstellungen speichern"}
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default Einstellungen;
