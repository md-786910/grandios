import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ConfirmModal from "../components/ConfirmModal";
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
  const [editingGroup, setEditingGroup] = useState(null); // Group being edited
  const [discountItems, setDiscountItems] = useState([]); // Items for discount group: [{orders: [id1, id2], isBundle: true}]
  const [expandedBundles, setExpandedBundles] = useState({}); // Track which bundles are expanded: {groupId_bundleIdx: true}
  const [deleteGroupId, setDeleteGroupId] = useState(null); // Group ID to delete (for confirmation modal)
  const [redeemGroupId, setRedeemGroupId] = useState(null); // Group ID to redeem (for confirmation modal)
  const [expandedItems, setExpandedItems] = useState({}); // Track which added items are expanded: {index: true}
  const [draftItemsLoaded, setDraftItemsLoaded] = useState(false); // Track if draft items have been loaded from DB

  // Save discountItems to database whenever it changes (after initial load)
  useEffect(() => {
    if (!draftItemsLoaded) return; // Don't save until we've loaded from DB

    const saveDraftItems = async () => {
      try {
        await discountsAPI.saveDraftItems(id, discountItems);
      } catch (error) {
        console.error("Failed to save draft items:", error);
      }
    };

    // Debounce the save to avoid too many API calls
    const timeoutId = setTimeout(saveDraftItems, 500);
    return () => clearTimeout(timeoutId);
  }, [discountItems, id, draftItemsLoaded]);

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

        // Load draft items from database (only on initial load)
        if (!draftItemsLoaded && data.draftDiscountItems) {
          setDiscountItems(data.draftDiscountItems);
        }
        setDraftItemsLoaded(true);
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
    const ordersInItems = getOrdersInItems();

    // Can't select redeemed orders
    if (orderStatus.status === 'redeemed') {
      return;
    }

    // Can't select orders already added to discount items
    if (ordersInItems.includes(orderId)) {
      return;
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
    setDiscountItems([]);
  };

  // Add selected orders as one item (single order or bundle)
  const handleAddAsItem = () => {
    if (selectedOrders.length === 0) return;

    const newItem = {
      orders: [...selectedOrders],
      isBundle: selectedOrders.length > 1
    };

    setDiscountItems(prev => [...prev, newItem]);
    setSelectedOrders([]);
  };

  // Create discount group from both discountItems and selected orders
  const handleCreateDirectDiscountGroup = async () => {
    // Allow creation if we have either discountItems or selectedOrders
    if (selectedOrders.length === 0 && discountItems.length === 0) return;

    setCreatingGroup(true);
    setMessage({ type: "", text: "" });

    try {
      let ordersWithBundles = [];
      let bundleIndex = 0;

      // First, add orders from discountItems (pre-added groups)
      discountItems.forEach((item) => {
        item.orders.forEach(orderId => {
          ordersWithBundles.push({
            orderId,
            bundleIndex: bundleIndex
          });
        });
        bundleIndex++; // Each item gets its own bundleIndex
      });

      // Then, add selected orders (each as individual item)
      selectedOrders.forEach((orderId) => {
        ordersWithBundles.push({
          orderId,
          bundleIndex: bundleIndex
        });
        bundleIndex++; // Each selected order gets its own bundleIndex
      });

      await discountsAPI.createGroup(id, ordersWithBundles, settings.discountRate);
      setMessage({ type: "success", text: "Rabattgruppe erfolgreich erstellt!" });
      setSelectedOrders([]);
      setDiscountItems([]);
      await fetchData();
    } catch (error) {
      console.error("Failed to create discount group:", error);
      setMessage({ type: "error", text: error.message || "Fehler beim Erstellen der Rabattgruppe" });
    } finally {
      setCreatingGroup(false);
    }
  };

  // Remove an item from discount items
  const handleRemoveItem = (index) => {
    setDiscountItems(prev => prev.filter((_, i) => i !== index));
    setExpandedItems(prev => {
      const newExpanded = { ...prev };
      delete newExpanded[index];
      return newExpanded;
    });
  };

  // Remove individual order from a bundle item
  const handleRemoveOrderFromItem = (itemIndex, orderId) => {
    setDiscountItems(prev => {
      const newItems = [...prev];
      const item = newItems[itemIndex];
      const newOrders = item.orders.filter(id => id !== orderId);

      if (newOrders.length === 0) {
        // Remove entire item if no orders left
        return prev.filter((_, i) => i !== itemIndex);
      } else {
        // Update item with remaining orders
        newItems[itemIndex] = {
          ...item,
          orders: newOrders,
          isBundle: newOrders.length > 1
        };
        return newItems;
      }
    });
  };

  // Toggle expanded state for added items
  const toggleItemExpanded = (index) => {
    setExpandedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Get all order IDs that are already in discount items
  const getOrdersInItems = () => {
    return discountItems.flatMap(item => item.orders);
  };

  // Create or update discount group
  const handleCreateDiscountGroup = async () => {
    // Validate at least one item is provided
    if (discountItems.length === 0) {
      setMessage({
        type: "error",
        text: "Bitte fügen Sie mindestens einen Artikel hinzu"
      });
      return;
    }

    setCreatingGroup(true);
    setMessage({ type: "", text: "" });

    try {
      // Flatten all orders from items with bundleIndex
      const ordersWithBundles = discountItems.flatMap((item, index) =>
        item.orders.map(orderId => ({ orderId, bundleIndex: index }))
      );

      if (editingGroup) {
        // Update existing group
        await discountsAPI.updateGroup(id, editingGroup._id, ordersWithBundles, settings.discountRate);
        setMessage({ type: "success", text: "Rabattgruppe erfolgreich aktualisiert!" });
      } else {
        // Create new group
        await discountsAPI.createGroup(id, ordersWithBundles, settings.discountRate);
        setMessage({ type: "success", text: "Rabattgruppe erfolgreich erstellt!" });
      }
      setSelectedOrders([]);
      setDiscountItems([]);
      setEditingGroup(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to create/update discount group:", error);
      setMessage({ type: "error", text: error.message || "Fehler beim Erstellen/Aktualisieren der Rabattgruppe" });
    } finally {
      setCreatingGroup(false);
    }
  };

  // Redeem discount group - show confirmation modal
  const handleRedeemGroup = (groupId) => {
    setRedeemGroupId(groupId);
  };

  // Confirm redeem discount group
  const confirmRedeemGroup = async () => {
    if (!redeemGroupId) return;

    try {
      await discountsAPI.redeemGroup(id, redeemGroupId);
      setMessage({ type: "success", text: "Rabatt erfolgreich eingelöst!" });
      setRedeemGroupId(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to redeem group:", error);
      setMessage({ type: "error", text: error.message || "Fehler beim Einlösen" });
      setRedeemGroupId(null);
    }
  };

  // Delete discount group - show confirmation modal
  const handleDeleteGroup = (groupId) => {
    setDeleteGroupId(groupId);
  };

  // Confirm delete discount group
  const confirmDeleteGroup = async () => {
    if (!deleteGroupId) return;

    try {
      await discountsAPI.deleteGroup(id, deleteGroupId);
      setMessage({ type: "success", text: "Rabattgruppe gelöscht!" });
      setDeleteGroupId(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to delete group:", error);
      setMessage({ type: "error", text: error.message || "Fehler beim Löschen" });
      setDeleteGroupId(null);
    }
  };

  const formatCurrency = (value) => {
    return (value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // Selection status for items (manual creation allows any number of items)
  const hasItems = discountItems.length > 0;
  const hasSelectedOrders = selectedOrders.length > 0;

  // Calculate total discount from all items
  const itemsTotal = discountItems.reduce((acc, item) => {
    return acc + item.orders.reduce((sum, orderId) => {
      const order = orders.find(o => (o._id || o.id) === orderId);
      if (order) {
        const eligible = order.items?.filter(i => i.discountEligible) || [];
        return sum + eligible.reduce((s, i) => s + (i.priceSubtotalIncl || i.priceUnit * i.quantity), 0);
      }
      return sum;
    }, 0);
  }, 0);
  const itemsDiscount = (itemsTotal * settings.discountRate) / 100;

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

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rabatt Details</h1>
          <p className="text-gray-500 text-sm mt-1">{customer?.name || 'Kunde'}</p>
        </div>
        <button
          onClick={() => navigate("/rabatt")}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
        >
          Zurück
        </button>
      </div>

      {/* Pending Discount Group - Professional Design */}
      {discountItems.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 mb-6 overflow-hidden shadow-sm">
          {/* Header with Status */}
          <div className="bg-gradient-to-r from-amber-100 to-orange-100 px-5 py-4 border-b border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Pending Icon */}
                <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center shadow-sm">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-amber-900">Rabattgruppe wird erstellt</h3>
                  <p className="text-xs text-amber-600 mt-0.5">Anzahl der Bestellungen</p>
                  <p className="text-sm font-bold text-amber-900">
                    {discountItems.reduce((sum, item) => sum + item.orders.length, 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Total Discount Preview */}
                <div className="text-right">
                  <p className="text-xs text-amber-600 font-medium">Voraussichtlicher Rabatt</p>
                  <p className="text-lg font-bold text-amber-900">€ {formatCurrency(itemsDiscount)}</p>
                </div>
                {/* Expand/Collapse Button */}
                <button
                  onClick={() => setExpandedItems(prev => ({ ...prev, accordion: !prev.accordion }))}
                  className="p-2 rounded-lg bg-white/60 hover:bg-white transition-colors border border-amber-200"
                >
                  <svg className={`h-5 w-5 text-amber-700 transition-transform ${expandedItems.accordion ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Expanded Content */}
          {expandedItems.accordion && (
            <div className="bg-white/80">
              {/* Column Headers */}
              <div className="grid grid-cols-[40px_1fr_120px_100px_50px] gap-2 px-5 py-2 bg-amber-50/50 border-b border-amber-100 text-xs font-semibold text-amber-800 uppercase tracking-wide">
                <span>#</span>
                <span>Artikel / Bestellung</span>
                <span className="text-right">Rabattfähig</span>
                <span className="text-right">Rabatt</span>
                <span></span>
              </div>

              {/* Items List */}
              <div className="divide-y divide-amber-100">
                {discountItems.map((item, index) => {
                  const isItemExpanded = expandedItems[index];
                  const itemOrders = item.orders.map(orderId =>
                    orders.find(o => (o._id || o.id) === orderId)
                  ).filter(Boolean);

                  // Calculate item totals
                  const itemEligible = itemOrders.reduce((sum, order) => {
                    const eligible = order?.items?.filter(i => i.discountEligible) || [];
                    return sum + eligible.reduce((s, i) => s + (i.priceSubtotalIncl || i.priceUnit * i.quantity), 0);
                  }, 0);
                  const itemDiscount = (itemEligible * settings.discountRate) / 100;

                  return (
                    <div key={index}>
                      {/* Item Row */}
                      <div
                        className={`grid grid-cols-[40px_1fr_120px_100px_50px] gap-2 px-5 py-3 items-center ${item.isBundle ? 'cursor-pointer hover:bg-amber-50/50' : ''} transition-colors`}
                        onClick={() => item.isBundle && toggleItemExpanded(index)}
                      >
                        {/* Index */}
                        <div className="flex items-center justify-center">
                          <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center">
                            {index + 1}
                          </span>
                        </div>

                        {/* Item Info */}
                        <div className="flex items-center gap-3">
                          {item.isBundle ? (
                            <>
                              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <rect x="6" y="2" width="12" height="14" rx="2" className="fill-blue-50" />
                                  <rect x="4" y="4" width="12" height="14" rx="2" className="fill-blue-100" />
                                  <rect x="2" y="6" width="12" height="14" rx="2" className="fill-white" />
                                </svg>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">Gruppe</span>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                    {item.orders.length} Bestellungen
                                  </span>
                                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${isItemExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">Klicken zum Erweitern</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                                <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{itemOrders[0]?.posReference || 'Bestellung'}</p>
                                <p className="text-xs text-gray-500">{formatDate(itemOrders[0]?.orderDate)}</p>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Eligible Amount */}
                        <div className="text-right">
                          <span className="text-sm text-gray-700">€ {formatCurrency(itemEligible)}</span>
                        </div>

                        {/* Discount Amount */}
                        <div className="text-right">
                          <span className="text-sm font-semibold text-green-600">€ {formatCurrency(itemDiscount)}</span>
                        </div>

                        {/* Remove Button */}
                        <div className="flex justify-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveItem(index); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Entfernen"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expanded Bundle Orders */}
                      {item.isBundle && isItemExpanded && (
                        <div className="bg-blue-50/30 border-t border-blue-100">
                          {itemOrders.map((order, orderIdx) => {
                            const orderId = order._id || order.id;
                            const orderEligible = (order?.items?.filter(i => i.discountEligible) || [])
                              .reduce((s, i) => s + (i.priceSubtotalIncl || i.priceUnit * i.quantity), 0);
                            const orderDiscount = (orderEligible * settings.discountRate) / 100;

                            return (
                              <div
                                key={orderId}
                                className={`grid grid-cols-[40px_1fr_120px_100px_50px] gap-2 px-5 py-2.5 items-center ml-4 ${orderIdx < itemOrders.length - 1 ? 'border-b border-blue-100' : ''}`}
                              >
                                <div className="flex items-center justify-center">
                                  <span className="text-xs text-gray-400">{orderIdx + 1}.</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-700">{order.posReference}</span>
                                  <span className="text-xs text-gray-400">• {formatDate(order.orderDate)}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs text-gray-500">€ {formatCurrency(orderEligible)}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs text-green-600">€ {formatCurrency(orderDiscount)}</span>
                                </div>
                                <div className="flex justify-center">
                                  <button
                                    onClick={() => handleRemoveOrderFromItem(index, orderId)}
                                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    title="Aus Gruppe entfernen"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer with Total and Actions */}
              <div className="px-5 py-4 bg-amber-50 border-t border-amber-200">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setDiscountItems([])}
                    className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
                  >
                    Alle löschen
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-amber-600">Gesamtrabatt</p>
                      <p className="text-xl font-bold text-amber-900">€ {formatCurrency(itemsDiscount)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editing Mode Banner */}
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

      {/* Queue Info Bar */}
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

      {/* Action Bar - Selection and Creation */}
      {(() => {
        // Calculate total items: selected orders + added bundles
        const MANUAL_MIN_ORDERS = 2; // Manual creation requires 2+ orders
        const totalItems = selectedOrders.length + discountItems.length;
        const isReadyForManual = totalItems >= MANUAL_MIN_ORDERS;
        const isReadyForAuto = totalItems >= settings.ordersRequiredForDiscount;

        return (
          <div
            className={`rounded-xl border p-4 mb-6 transition-colors ${
              isReadyForManual
                ? "bg-green-50 border-green-200"
                : totalItems > 0
                  ? "bg-blue-50 border-blue-200"
                  : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Progress indicator - shows 2 dots for manual creation */}
                <div className="flex items-center gap-1">
                  {[...Array(MANUAL_MIN_ORDERS)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-colors ${
                        i < totalItems
                          ? isReadyForManual ? "bg-green-500" : "bg-blue-500"
                          : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>

                {/* Status text */}
                <div className="flex items-center gap-3">
                  {totalItems === 0 ? (
                    <span className="text-sm text-gray-500">
                      Wählen Sie mindestens {MANUAL_MIN_ORDERS} Bestellungen
                    </span>
                  ) : (
                    <>
                      <span className={`text-sm font-medium ${isReadyForManual ? "text-green-700" : "text-blue-700"}`}>
                        {totalItems} Bestellung{totalItems > 1 ? 'en' : ''} ausgewählt
                      </span>
                      {hasSelectedOrders && (
                        <span className="text-xs text-gray-500">
                          ({selectedOrders.length} ausgewählt)
                        </span>
                      )}
                      {hasItems && (
                        <span className="text-xs text-gray-500">
                          ({discountItems.length} Gruppe{discountItems.length > 1 ? 'n' : ''})
                        </span>
                      )}
                      {isReadyForManual && (
                        <span className="text-sm text-green-600 font-medium">
                          • Rabatt: € {formatCurrency(itemsDiscount + selectedDiscount)}
                        </span>
                      )}
                      {!isReadyForManual && (
                        <span className="text-xs text-gray-400">
                          (noch {MANUAL_MIN_ORDERS - totalItems} benötigt)
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {hasSelectedOrders && (
                  <>
                    {selectedOrders.length > 1 && (
                      <button
                        onClick={handleAddAsItem}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                        title="Ausgewählte Bestellungen als eine Gruppe zusammenfassen"
                      >
                        Als Gruppe
                      </button>
                    )}
                    <button
                      onClick={handleCreateDirectDiscountGroup}
                      disabled={creatingGroup || !isReadyForManual}
                      className={`px-4 py-1.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        isReadyForManual
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {creatingGroup ? "..." : "Rabattgruppe erstellen"}
                    </button>
                    <button
                      onClick={() => setSelectedOrders([])}
                      className="px-2 py-1.5 text-gray-500 hover:text-gray-700 text-sm"
                    >
                      ✕
                    </button>
                  </>
                )}
                {hasItems && !hasSelectedOrders && (
                  <>
                    <button
                      onClick={handleCreateDiscountGroup}
                      disabled={creatingGroup || !isReadyForManual}
                      className={`px-4 py-1.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        isReadyForManual
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {creatingGroup ? "..." : editingGroup ? "Aktualisieren" : "Rabattgruppe erstellen"}
                    </button>
                    <button
                      onClick={() => { setDiscountItems([]); setSelectedOrders([]); }}
                      className="px-2 py-1.5 text-gray-500 hover:text-gray-700 text-sm"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Orders List with Selection */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {orders.length > 0 ? (
          <>
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                Wählen Sie Bestellungen aus, um eine Rabattgruppe zu erstellen.
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
              {/* Render discount groups first - sorted by date (recent first) */}
              {[...discountGroups].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((group) => {
                const isRedeemed = group.status === 'redeemed';
                const isBeingEdited = editingGroup?._id === group._id;

                // Get orders that belong to this group
                const groupOrderIds = group.orders?.map(o => (o.orderId?._id || o.orderId)?.toString()) || [];
                const groupOrders = orders.filter(order =>
                  groupOrderIds.includes((order._id || order.id)?.toString())
                );

                // If editing this group, don't show it here (show orders individually below)
                if (isBeingEdited) return null;

                // Group orders by bundleIndex
                const ordersByBundle = {};
                group.orders?.forEach(o => {
                  const bundleIdx = o.bundleIndex ?? 0;
                  if (!ordersByBundle[bundleIdx]) {
                    ordersByBundle[bundleIdx] = [];
                  }
                  const foundOrder = groupOrders.find(go =>
                    (go._id || go.id)?.toString() === (o.orderId?._id || o.orderId)?.toString()
                  );
                  if (foundOrder) {
                    ordersByBundle[bundleIdx].push(foundOrder);
                  }
                });

                // Convert to array of bundles
                const bundles = Object.entries(ordersByBundle).map(([bundleIdx, bundleOrders]) => ({
                  bundleIndex: parseInt(bundleIdx),
                  orders: bundleOrders,
                  isBundle: bundleOrders.length > 1
                }));

                // Toggle bundle expansion
                const toggleBundle = (bundleKey) => {
                  setExpandedBundles(prev => ({
                    ...prev,
                    [bundleKey]: !prev[bundleKey]
                  }));
                };

                return (
                  <div
                    key={group._id || group.id}
                    className="border-b border-gray-200 bg-white"
                  >
                    <div className="flex">
                      {/* Group orders container */}
                      <div className="flex-1">
                        {bundles.map((bundle, bundleIdx) => {
                          const bundleKey = `${group._id}_${bundle.bundleIndex}`;
                          const isExpanded = expandedBundles[bundleKey];
                          const firstOrder = bundle.orders[0];

                          // Calculate total for bundle
                          const bundleTotalEligible = bundle.orders.reduce((total, order) => {
                            const eligible = order.items?.filter(item => item.discountEligible) || [];
                            return total + eligible.reduce((sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0);
                          }, 0);

                          // If bundle has only 1 order, show single order row
                          if (!bundle.isBundle) {
                            const order = firstOrder;
                            const orderId = order._id || order.id;
                            const discountEligibleItems = order.items?.filter(item => item.discountEligible) || [];
                            const discountEligibleAmount = discountEligibleItems.reduce(
                              (sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0
                            );
                            const isLastBundle = bundleIdx === bundles.length - 1;

                            return (
                              <div
                                key={orderId}
                                className={`grid grid-cols-[60px_1fr_1fr_100px] ${!isLastBundle ? 'border-b border-gray-100' : ''}`}
                              >
                                <div className="p-4 flex items-center justify-center border-r border-gray-100">
                                  <input type="checkbox" checked={false} disabled className="w-5 h-5 rounded border-gray-300 cursor-not-allowed" />
                                </div>
                                <div className="p-4 border-r border-gray-100">
                                  <p className="text-sm text-gray-900"><span className="font-semibold">Bestellnummer</span> - {order.posReference || order.orderId}</p>
                                  <p className="text-sm text-gray-900"><span className="font-semibold">Bestelldatum</span> - {formatDate(order.orderDate)}</p>
                                  <p className="text-sm mt-1 text-gray-600"><span className="font-semibold">Rabattfähig:</span> € {formatCurrency(discountEligibleAmount)}</p>
                                </div>
                                <div className="p-4 border-r border-gray-100">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {(order.items || []).slice(0, 4).map((item, imgIdx) => (
                                      <img key={`${orderId}-item-${imgIdx}`} src={item.image || "https://via.placeholder.com/50"} alt="" className="w-12 h-12 object-cover rounded border border-gray-200" />
                                    ))}
                                    {(order.items?.length || 0) > 4 && <span className="text-sm font-medium text-gray-600">+{order.items.length - 4}</span>}
                                  </div>
                                </div>
                                <div className="p-4 flex items-center justify-center">
                                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                              </div>
                            );
                          }

                          // Bundle with multiple orders - show collapsed or expanded
                          const isLastBundle = bundleIdx === bundles.length - 1;

                          return (
                            <div key={bundleKey} className={!isLastBundle ? 'border-b border-gray-100' : ''}>
                              {/* Collapsed bundle header - click to expand */}
                              <div
                                className={`grid grid-cols-[60px_1fr_1fr_100px] cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50' : ''}`}
                                onClick={() => toggleBundle(bundleKey)}
                              >
                                <div className="p-4 flex items-center justify-center border-r border-gray-100">
                                  <input type="checkbox" checked={false} disabled className="w-5 h-5 rounded border-gray-300 cursor-not-allowed" />
                                </div>
                                <div className="p-4 border-r border-gray-100">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                      {bundle.orders.length} Bestellungen
                                    </span>
                                    <svg className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                  <p className="text-sm mt-1 text-gray-600"><span className="font-semibold">Rabattfähig:</span> € {formatCurrency(bundleTotalEligible)}</p>
                                </div>
                                <div className="p-4 border-r border-gray-100">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {bundle.orders.flatMap(o => o.items || []).slice(0, 6).map((item, imgIdx) => (
                                      <img key={`bundle-${bundleKey}-item-${imgIdx}`} src={item.image || "https://via.placeholder.com/50"} alt="" className="w-10 h-10 object-cover rounded border border-gray-200" />
                                    ))}
                                    {bundle.orders.flatMap(o => o.items || []).length > 6 && (
                                      <span className="text-sm font-medium text-gray-600">+{bundle.orders.flatMap(o => o.items || []).length - 6}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="p-4 flex items-center justify-center">
                                  <svg className="h-7 w-7 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <rect x="6" y="2" width="14" height="16" rx="2" className="fill-blue-100 stroke-blue-500" />
                                    <rect x="4" y="4" width="14" height="16" rx="2" className="fill-blue-50 stroke-blue-400" />
                                    <rect x="2" y="6" width="14" height="16" rx="2" className="fill-white stroke-blue-500" />
                                    <line x1="5" y1="11" x2="13" y2="11" className="stroke-blue-300" strokeWidth="1" />
                                    <line x1="5" y1="14" x2="11" y2="14" className="stroke-blue-300" strokeWidth="1" />
                                    <line x1="5" y1="17" x2="9" y2="17" className="stroke-blue-300" strokeWidth="1" />
                                  </svg>
                                </div>
                              </div>

                              {/* Expanded bundle - show all orders */}
                              {isExpanded && (
                                <div className="bg-blue-50/50 border-t border-blue-100">
                                  {bundle.orders.map((order, orderIdx) => {
                                    const orderId = order._id || order.id;
                                    const discountEligibleItems = order.items?.filter(item => item.discountEligible) || [];
                                    const discountEligibleAmount = discountEligibleItems.reduce(
                                      (sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0
                                    );
                                    const isLastOrder = orderIdx === bundle.orders.length - 1;

                                    return (
                                      <div key={orderId} className={`grid grid-cols-[60px_1fr_1fr_100px] ml-4 ${!isLastOrder ? 'border-b border-blue-100' : ''}`}>
                                        <div className="p-3 flex items-center justify-center border-r border-blue-100">
                                          <span className="text-xs text-gray-400">{orderIdx + 1}</span>
                                        </div>
                                        <div className="p-3 border-r border-blue-100">
                                          <p className="text-sm text-gray-900"><span className="font-semibold">Bestellnummer</span> - {order.posReference || order.orderId}</p>
                                          <p className="text-sm text-gray-900"><span className="font-semibold">Bestelldatum</span> - {formatDate(order.orderDate)}</p>
                                          <p className="text-sm mt-1 text-gray-600"><span className="font-semibold">Rabattfähig:</span> € {formatCurrency(discountEligibleAmount)}</p>
                                        </div>
                                        <div className="p-3 border-r border-blue-100">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {(order.items || []).slice(0, 4).map((item, imgIdx) => (
                                              <img key={`${orderId}-item-${imgIdx}`} src={item.image || "https://via.placeholder.com/50"} alt="" className="w-10 h-10 object-cover rounded border border-gray-200" />
                                            ))}
                                            {(order.items?.length || 0) > 4 && <span className="text-sm font-medium text-gray-600">+{order.items.length - 4}</span>}
                                          </div>
                                        </div>
                                        <div className="p-3"></div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
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
                            <div className="flex gap-1 w-full">
                              <button
                                onClick={() => handleStartEditGroup(group)}
                                className="flex-1 px-2 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-100 transition-colors"
                              >
                                Bearbeiten
                              </button>
                              <button
                                onClick={() => handleDeleteGroup(group._id)}
                                className="px-2 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition-colors"
                                title="Rabattgruppe löschen"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
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

              {/* Render available orders (not in any group or being edited) - sorted by date (recent first) */}
              {[...orders].sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate)).map((order, index) => {
                const orderId = order._id || order.id || `order-${index}`;
                const orderStatus = getOrderStatus(orderId);
                const isSelected = selectedOrders.includes(orderId);

                // Skip orders that are in groups (unless editing that group)
                const isRedeemed = orderStatus.status === 'redeemed';
                const isInEditingGroup = editingGroup && orderStatus.groupId === editingGroup._id && !isRedeemed;

                // Skip if in a group and not editing
                if (orderStatus.inGroup && !isInEditingGroup) return null;

                // Check if order is already in discount items
                const isInDiscountItems = getOrdersInItems().includes(orderId);
                const canSelect = (!orderStatus.inGroup || isInEditingGroup) && !isRedeemed && !isInDiscountItems;

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
                        : isInDiscountItems
                          ? "bg-green-50"
                          : isInEditingGroup && !isSelected
                            ? "bg-orange-50"
                            : "bg-white"
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="p-4 flex items-center justify-center border-r border-gray-100">
                      <input
                        type="checkbox"
                        checked={isSelected || isInDiscountItems}
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
                          {isInDiscountItems && (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              In Artikel
                            </span>
                          )}
                          {isSelected && !isInDiscountItems && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                              Ausgewählt
                            </span>
                          )}
                          {isInEditingGroup && !isSelected && !isInDiscountItems && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                              In Gruppe
                            </span>
                          )}
                          {!isSelected && !isInEditingGroup && !isInDiscountItems && (
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

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteGroupId}
        onClose={() => setDeleteGroupId(null)}
        onConfirm={confirmDeleteGroup}
        title="RABATTGRUPPE LÖSCHEN"
        message="Möchten Sie diese Rabattgruppe wirklich löschen? Die Bestellungen werden wieder verfügbar."
        confirmText="Ja, löschen"
        cancelText="Abbrechen"
      />

      {/* Redeem Confirmation Modal */}
      <ConfirmModal
        isOpen={!!redeemGroupId}
        onClose={() => setRedeemGroupId(null)}
        onConfirm={confirmRedeemGroup}
        title="RABATT EINLÖSEN"
        message="Möchten Sie diesen Rabatt wirklich einlösen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmText="Ja, einlösen"
        cancelText="Abbrechen"
      />
    </Layout>
  );
};

export default RabattDetail;
