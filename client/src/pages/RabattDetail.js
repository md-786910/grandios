import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { discountsAPI } from "../services/api";

const RabattDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notizen, setNotizen] = useState("");
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [discountGroups, setDiscountGroups] = useState([]);
  const [queue, setQueue] = useState(null);
  const [settings, setSettings] = useState({ discountRate: 10, ordersRequiredForDiscount: 3 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [dataVersion, setDataVersion] = useState(0);
  const [editingGroup, setEditingGroup] = useState(null); // Group being edited

  const fetchData = async () => {
    try {
      const response = await discountsAPI.getCustomerDiscount(id);
      if (response.data.success) {
        const data = response.data.data;
        setCustomer(data.customer);
        setOrders(data.orders || []);
        setDiscountGroups(data.discountGroups || []);
        setNotizen(data.notes || "");
        setQueue(data.queue || null);
        setSettings(data.settings || { discountRate: 10, ordersRequiredForDiscount: 3 });
        setDataVersion(v => v + 1);
      }
    } catch (error) {
      console.error("Failed to fetch customer discount:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await discountsAPI.updateNotes(id, notizen);
      setMessage({ type: "success", text: "Notizen gespeichert!" });
      setTimeout(() => setMessage({ type: "", text: "" }), 3000);
    } catch (error) {
      console.error("Failed to save notes:", error);
      setMessage({ type: "error", text: "Fehler beim Speichern" });
    } finally {
      setSaving(false);
    }
  };

  // Check if order is already in a discount group
  const getOrderStatus = (orderId) => {
    for (const group of discountGroups) {
      const orderInGroup = group.orders?.find(o =>
        o.orderId?._id?.toString() === orderId?.toString() ||
        o.orderId?.toString() === orderId?.toString()
      );
      if (orderInGroup) {
        return {
          inGroup: true,
          status: group.status,
          groupId: group._id,
          discountAmount: orderInGroup.discountAmount
        };
      }
    }
    return { inGroup: false, status: null };
  };

  // Handle order selection
  const handleOrderSelect = (orderId) => {
    const orderStatus = getOrderStatus(orderId);

    // When editing, allow selecting orders that are in the editing group
    if (orderStatus.inGroup && (!editingGroup || orderStatus.groupId !== editingGroup._id)) {
      return; // Can't select orders in other groups
    }

    setSelectedOrders(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      } else {
        return [...prev, orderId];
      }
    });
  };

  // Start editing a discount group
  const handleStartEditGroup = (group) => {
    if (group.status === 'redeemed') return; // Can't edit redeemed groups

    setEditingGroup(group);
    // Pre-select the orders in this group
    const orderIds = group.orders?.map(o => o.orderId?._id || o.orderId) || [];
    setSelectedOrders(orderIds);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingGroup(null);
    setSelectedOrders([]);
  };

  // Create or update discount group
  const handleCreateDiscountGroup = async () => {
    // Validate exact order count
    if (selectedOrders.length !== settings.ordersRequiredForDiscount) {
      setMessage({
        type: "error",
        text: `Sie müssen genau ${settings.ordersRequiredForDiscount} Bestellungen auswählen`
      });
      return;
    }

    setCreatingGroup(true);
    setMessage({ type: "", text: "" });

    try {
      if (editingGroup) {
        // Update existing group
        await discountsAPI.updateGroup(id, editingGroup._id, selectedOrders, settings.discountRate);
        setMessage({ type: "success", text: "Rabattgruppe erfolgreich aktualisiert!" });
      } else {
        // Create new group
        await discountsAPI.createGroup(id, selectedOrders, settings.discountRate);
        setMessage({ type: "success", text: "Rabattgruppe erfolgreich erstellt!" });
      }
      setSelectedOrders([]);
      setEditingGroup(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to create/update discount group:", error);
      setMessage({ type: "error", text: error.message || "Fehler beim Erstellen/Aktualisieren der Rabattgruppe" });
    } finally {
      setCreatingGroup(false);
    }
  };

  // Redeem discount group
  const handleRedeemGroup = async (groupId) => {
    try {
      await discountsAPI.redeemGroup(id, groupId);
      setMessage({ type: "success", text: "Rabatt erfolgreich eingelöst!" });
      await fetchData();
    } catch (error) {
      console.error("Failed to redeem group:", error);
      setMessage({ type: "error", text: error.message || "Fehler beim Einlösen" });
    }
  };

  // Delete discount group
  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm("Möchten Sie diese Rabattgruppe wirklich löschen?")) return;

    try {
      await discountsAPI.deleteGroup(id, groupId);
      setMessage({ type: "success", text: "Rabattgruppe gelöscht!" });
      await fetchData();
    } catch (error) {
      console.error("Failed to delete group:", error);
      setMessage({ type: "error", text: error.message || "Fehler beim Löschen" });
    }
  };

  const formatCurrency = (value) => {
    return value?.toFixed(2).replace('.', ',') || '0,00';
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString('de-DE');
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

  if (!customer) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-500">Kunde nicht gefunden</p>
          <button
            onClick={() => navigate("/rabatt")}
            className="mt-4 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Zurück zur Liste
          </button>
        </div>
      </Layout>
    );
  }

  const totalOrders = orders.length;
  const totalItems = orders.reduce((acc, order) => acc + (order.items?.length || 0), 0);
  const totalOrderValue = orders.reduce((acc, order) => acc + (order.amountTotal || 0), 0);
  const totalDiscountGranted = discountGroups.reduce((acc, g) => acc + (g.totalDiscount || 0), 0);

  // Calculate selected orders discount
  const selectedOrdersTotal = selectedOrders.reduce((acc, orderId) => {
    const order = orders.find(o => (o._id || o.id) === orderId);
    if (order) {
      const eligible = order.items?.filter(i => i.discountEligible) || [];
      return acc + eligible.reduce((sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0);
    }
    return acc;
  }, 0);
  const selectedDiscount = (selectedOrdersTotal * settings.discountRate) / 100;

  // Selection status
  const isExactCount = selectedOrders.length === settings.ordersRequiredForDiscount;
  const isTooMany = selectedOrders.length > settings.ordersRequiredForDiscount;
  const isTooFew = selectedOrders.length > 0 && selectedOrders.length < settings.ordersRequiredForDiscount;

  return (
    <Layout>
      {/* Message */}
      <div className="mb-4" style={{ minHeight: message.text ? 'auto' : 0 }}>
        {message.text && (
          <div className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Header Buttons */}
      <div key={`header-${selectedOrders.length}-${editingGroup?._id || 'none'}`} className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div style={{ display: selectedOrders.length > 0 ? 'block' : 'none' }}>
            {selectedOrders.length > 0 && (
              <div className={`flex items-center gap-3 rounded-lg px-4 py-2 ${
                isExactCount
                  ? "bg-green-50 border border-green-200"
                  : isTooMany
                    ? "bg-red-50 border border-red-200"
                    : "bg-yellow-50 border border-yellow-200"
              }`}>
                <span className={`text-sm ${
                  isExactCount
                    ? "text-green-800"
                    : isTooMany
                      ? "text-red-800"
                      : "text-yellow-800"
                }`}>
                  <strong>{selectedOrders.length}</strong>/{settings.ordersRequiredForDiscount} Bestellung(en) ausgewählt
                </span>
                {isExactCount ? (
                  <span className="text-sm text-green-600">
                    Rabatt: <strong>€ {formatCurrency(selectedDiscount)}</strong> ({settings.discountRate}%)
                  </span>
                ) : isTooFew ? (
                  <span className="text-sm text-yellow-600 font-medium">
                    (Noch {settings.ordersRequiredForDiscount - selectedOrders.length} benötigt)
                  </span>
                ) : (
                  <span className="text-sm text-red-600 font-medium">
                    (Max. {settings.ordersRequiredForDiscount} erlaubt)
                  </span>
                )}
                <button
                  onClick={handleCreateDiscountGroup}
                  disabled={creatingGroup || !isExactCount}
                  className={`px-4 py-1.5 text-white rounded-lg transition-colors text-sm disabled:opacity-50 ${
                    isExactCount
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  {creatingGroup ? "Speichern..." : editingGroup ? "Gruppe aktualisieren" : "Rabattgruppe erstellen"}
                </button>
                <button
                  onClick={editingGroup ? handleCancelEdit : () => setSelectedOrders([])}
                  className={`px-3 py-1.5 text-sm ${
                    isExactCount
                      ? "text-green-600 hover:text-green-800"
                      : isTooMany
                        ? "text-red-600 hover:text-red-800"
                        : "text-yellow-600 hover:text-yellow-800"
                  }`}
                >
                  Abbrechen
                </button>
              </div>
            )}
          </div>
          <div style={{ display: selectedOrders.length === 0 ? 'block' : 'none' }}>
            {selectedOrders.length === 0 && (
              <div className="text-sm text-gray-500">
                Wählen Sie {settings.ordersRequiredForDiscount} Bestellungen aus, um eine Rabattgruppe zu erstellen
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/rabatt")}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
          >
            Zurück
          </button>
        </div>
      </div>

      {/* Editing Mode Banner */}
      <div key="editing-banner" style={{ display: editingGroup ? 'block' : 'none' }}>
        {editingGroup && (
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-sm text-orange-800">
                  <strong>Bearbeitungsmodus:</strong> Rabattgruppe wird bearbeitet
                </span>
              </div>
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1 text-orange-600 hover:text-orange-800 text-sm font-medium"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Queue Info Bar */}
      <div key="queue-banner" style={{ display: queue && queue.orderCount > 0 && !editingGroup ? 'block' : 'none' }}>
        {queue && queue.orderCount > 0 && !editingGroup && (
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="text-sm text-blue-800">
                  <strong>{queue.orderCount}</strong> Bestellung(en) in Warteschlange
                  ({queue.orderCount}/{settings.ordersRequiredForDiscount} für automatischen Rabatt)
                </span>
              </div>
              {queue.readyForDiscount && (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  Bereit für automatischen Rabatt
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top Section */}
      <div className="flex gap-4 mb-4">
        {/* Kundendetails */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 w-[350px]">
          <h3 className="text-center font-semibold text-gray-900 mb-6">Kundendetails</h3>
          <div className="space-y-3 text-sm">
            <div className="flex">
              <span className="text-gray-500 w-32">Kundennummer:</span>
              <span className="text-gray-900">{customer.customerNumber || customer.ref || "-"}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">Kundenname:</span>
              <span className="text-gray-900">{customer.customerName || customer.name}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">E-Mail:</span>
              <span className="text-gray-900">{customer.email}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">Telefonnummer:</span>
              <span className="text-gray-900">{customer.phone || customer.mobile || "-"}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">Adresse:</span>
              <div className="text-gray-900">
                <div>{customer.address?.street || "-"}</div>
                <div>{customer.address?.postalCode} {customer.address?.city}</div>
                <div>{customer.address?.country}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Stats */}
        <div className="flex flex-col gap-4">
          {/* Gesamtbestellwert */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center min-w-[220px]">
            <h3 className="font-semibold text-green-600 mb-2 text-sm">Gesamtbestellwert</h3>
            <p className="text-3xl font-bold text-gray-900">€ {formatCurrency(totalOrderValue)}</p>
          </div>

          {/* Gesamtrabatt Gewährt */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-600 mb-2 text-sm">Gesamtrabatt Gewährt</h3>
            <p className="text-3xl font-bold text-gray-900">€ {formatCurrency(totalDiscountGranted)}</p>
          </div>
        </div>

        {/* Notizen */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Notizen Hinzufügen</h3>
          <textarea
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            className="w-full h-32 border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
            placeholder=""
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm disabled:opacity-50"
            >
              {saving ? "Speichern..." : "Speichern"}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Stats Row */}
      <div className="flex gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center w-[350px]">
          <h3 className="font-semibold text-gray-600 mb-2 text-sm">Anzahl Der Bestellungen</h3>
          <p className="text-3xl font-bold text-gray-900">{totalOrders}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center min-w-[220px]">
          <h3 className="font-semibold text-gray-600 mb-2 text-sm">Anzahl Der Artikel</h3>
          <p className="text-3xl font-bold text-gray-900">{totalItems}</p>
        </div>
      </div>

      {/* Orders List with Selection */}
      <div key={`orders-${dataVersion}-${editingGroup?._id || 'none'}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {orders.length > 0 ? (
          <>
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                Wählen Sie genau <strong>{settings.ordersRequiredForDiscount}</strong> Bestellungen aus, um eine Rabattgruppe zu erstellen.
                {editingGroup ? " Sie bearbeiten gerade eine bestehende Gruppe." : " Bereits gruppierte oder eingelöste Bestellungen können nicht ausgewählt werden."}
              </p>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[60px_1fr_1fr_100px_160px] border-b border-gray-200 bg-gray-50">
              <div className="p-3 text-center text-xs font-semibold text-gray-600 uppercase border-r border-gray-200"></div>
              <div className="p-3 text-xs font-semibold text-gray-600 uppercase border-r border-gray-200">Bestelldetails</div>
              <div className="p-3 text-xs font-semibold text-gray-600 uppercase border-r border-gray-200">Artikel</div>
              <div className="p-3 text-center text-xs font-semibold text-gray-600 uppercase border-r border-gray-200">Gruppe</div>
              <div className="p-3 text-center text-xs font-semibold text-gray-600 uppercase">Aktion</div>
            </div>

            <div>
              {/* Render discount groups first */}
              {discountGroups.map((group) => {
                const isRedeemed = group.status === 'redeemed';
                const isBeingEdited = editingGroup?._id === group._id;

                // Get orders that belong to this group
                const groupOrderIds = group.orders?.map(o => (o.orderId?._id || o.orderId)?.toString()) || [];
                const groupOrders = orders.filter(order =>
                  groupOrderIds.includes((order._id || order.id)?.toString())
                );

                // If editing this group, don't show it here (show orders individually below)
                if (isBeingEdited) return null;

                return (
                  <div
                    key={group._id || group.id}
                    className="border-b border-gray-200 bg-white"
                  >
                    <div className="flex">
                      {/* Group orders container */}
                      <div className="flex-1">
                        {groupOrders.map((order, idx) => {
                          const orderId = order._id || order.id;
                          const discountEligibleItems = order.items?.filter(item => item.discountEligible) || [];
                          const discountEligibleAmount = discountEligibleItems.reduce(
                            (sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0
                          );

                          return (
                            <div
                              key={orderId}
                              className={`grid grid-cols-[60px_1fr_1fr_100px] ${idx !== groupOrders.length - 1 ? 'border-b border-gray-100' : ''}`}
                            >
                              {/* Empty checkbox space */}
                              <div className="p-4 flex items-center justify-center border-r border-gray-100">
                                <input
                                  type="checkbox"
                                  checked={false}
                                  disabled
                                  className="w-5 h-5 rounded border-gray-300 cursor-not-allowed"
                                />
                              </div>

                              {/* Order Info */}
                              <div className="p-4 border-r border-gray-100">
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">Bestellnummer</span> - {order.posReference || order.orderId}
                                </p>
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">Bestelldatum</span> - {formatDate(order.orderDate)}
                                </p>
                                <p className="text-sm mt-1 text-gray-600">
                                  <span className="font-semibold">Rabattfähig:</span> € {formatCurrency(discountEligibleAmount)}
                                </p>
                              </div>

                              {/* Product Images */}
                              <div className="p-4 border-r border-gray-100">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(order.items || []).slice(0, 4).map((item, imgIdx) => (
                                    <img
                                      key={`${orderId}-item-${imgIdx}`}
                                      src={item.image || "https://via.placeholder.com/50"}
                                      alt=""
                                      className="w-12 h-12 object-cover rounded border border-gray-200"
                                    />
                                  ))}
                                  {(order.items?.length || 0) > 4 && (
                                    <span className="text-sm font-medium text-gray-600">+{order.items.length - 4}</span>
                                  )}
                                </div>
                              </div>

                              {/* Group icon column */}
                              <div className="p-4 flex items-center justify-center">
                                {idx === 0 && (
                                  <svg className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Action Column for entire group */}
                      <div className="w-[160px] flex flex-col items-center justify-center gap-2 p-4 border-l border-gray-200 bg-gray-50">
                        {isRedeemed ? (
                          <button
                            disabled
                            className="w-full px-4 py-2 bg-gray-400 text-white rounded-lg text-sm cursor-not-allowed"
                          >
                            Eingelöst
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleRedeemGroup(group._id)}
                              className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition-colors font-medium"
                            >
                              Tilgen
                            </button>
                            <button
                              onClick={() => handleStartEditGroup(group)}
                              className="w-full px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-100 transition-colors"
                            >
                              Bearbeiten
                            </button>
                          </>
                        )}
                        <span className="text-xs text-green-600 font-medium">
                          € {formatCurrency(group.totalDiscount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Render available orders (not in any group or being edited) */}
              {orders.map((order, index) => {
                const orderId = order._id || order.id || `order-${index}`;
                const orderStatus = getOrderStatus(orderId);
                const isSelected = selectedOrders.includes(orderId);

                // Skip orders that are in groups (unless editing that group)
                const isRedeemed = orderStatus.status === 'redeemed';
                const isInEditingGroup = editingGroup && orderStatus.groupId === editingGroup._id && !isRedeemed;

                // Skip if in a group and not editing
                if (orderStatus.inGroup && !isInEditingGroup) return null;

                const canSelect = (!orderStatus.inGroup || isInEditingGroup) && !isRedeemed;

                // Calculate discount eligible amount for this order
                const discountEligibleItems = order.items?.filter(item => item.discountEligible) || [];
                const discountEligibleAmount = discountEligibleItems.reduce(
                  (sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0
                );

                return (
                  <div
                    key={orderId}
                    className={`grid grid-cols-[60px_1fr_1fr_100px_160px] border-b border-gray-100 ${
                      isSelected
                        ? "bg-blue-50"
                        : isInEditingGroup && !isSelected
                          ? "bg-orange-50"
                          : "bg-white"
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="p-4 flex items-center justify-center border-r border-gray-100">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleOrderSelect(orderId)}
                        disabled={!canSelect}
                        className={`w-5 h-5 rounded border-gray-300 ${
                          canSelect
                            ? "text-blue-600 focus:ring-blue-500 cursor-pointer"
                            : "text-gray-300 cursor-not-allowed"
                        }`}
                      />
                    </div>

                    {/* Order Info */}
                    <div className="p-4 border-r border-gray-100">
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">Bestellnummer</span> - {order.posReference || order.orderId}
                      </p>
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">Bestelldatum</span> - {formatDate(order.orderDate)}
                      </p>
                      <p className="text-sm mt-1 text-gray-600">
                        <span className="font-semibold">Rabattfähig:</span> € {formatCurrency(discountEligibleAmount)}
                      </p>
                    </div>

                    {/* Product Images */}
                    <div className="p-4 border-r border-gray-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(order.items || []).slice(0, 4).map((item, idx) => (
                          <img
                            key={`${orderId}-item-${idx}`}
                            src={item.image || "https://via.placeholder.com/50"}
                            alt=""
                            className="w-12 h-12 object-cover rounded border border-gray-200"
                          />
                        ))}
                        {(order.items?.length || 0) > 4 && (
                          <span className="text-sm font-medium text-gray-600">+{order.items.length - 4}</span>
                        )}
                      </div>
                    </div>

                    {/* Empty Group Column */}
                    <div className="p-4 border-r border-gray-100 flex items-center justify-center">
                      {/* Available orders have no group icon */}
                    </div>

                    {/* Status Column */}
                    <div className="p-4 flex flex-col items-center justify-center bg-gray-50">
                      {discountEligibleAmount > 0 ? (
                        <>
                          {isSelected && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                              Ausgewählt
                            </span>
                          )}
                          {isInEditingGroup && !isSelected && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                              In Gruppe
                            </span>
                          )}
                          {!isSelected && !isInEditingGroup && (
                            <span className="text-xs text-gray-500">Verfügbar</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">Kein Rabatt</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-gray-500">
            Keine Bestellungen vorhanden
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RabattDetail;
