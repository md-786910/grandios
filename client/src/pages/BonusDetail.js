import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import Layout from "../components/Layout";
import ConfirmModal from "../components/ConfirmModal";
import UnsavedChangesModal from "../components/UnsavedChangesModal";
import { discountsAPI } from "../services/api";
import { sanitizeName } from "../utils/helpers";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";

// Default product image fallback
const DEFAULT_PRODUCT_IMAGE =
  "https://11316b7a2b.wawi.onretail.eu/web/image/product.template/472/image_256";

// Fallback component for broken/missing images
const ProductImage = ({ src, size = "md", className = "" }) => {
  const [hasError, setHasError] = useState(false);
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-12 h-12",
  };

  const imageSrc = !src || hasError ? DEFAULT_PRODUCT_IMAGE : src;

  return (
    <img
      src={imageSrc}
      alt=""
      className={`${sizeClasses[size]} ${className} object-cover rounded border border-gray-200`}
      onError={() => setHasError(true)}
    />
  );
};

const BonusDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setHasUnsavedChanges, checkUnsavedChanges, showModal, setShowModal, proceedWithNavigation, cancelNavigation } = useUnsavedChanges();
  const [notizen, setNotizen] = useState("");
  const [originalNotizen, setOriginalNotizen] = useState(""); // Track original notes from server
  const [notesHistory, setNotesHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [discountGroups, setDiscountGroups] = useState([]);
  const [queue, setQueue] = useState(null);
  const [settings, setSettings] = useState({
    discountRate: 10,
    ordersRequiredForDiscount: 3,
  });
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
  const [showGroupConfirm, setShowGroupConfirm] = useState(false); // Confirmation for "Als Gruppe" action
  const [createGroupConfirm, setCreateGroupConfirm] = useState({
    open: false,
    mode: null,
  });
  const [removeItemIndex, setRemoveItemIndex] = useState(null); // Index of item to remove (for confirmation modal)
  const [removeOrderFromItem, setRemoveOrderFromItem] = useState(null); // {itemIndex, orderId} for removing order from bundle
  const [expandedItems, setExpandedItems] = useState({}); // Track which added items are expanded: {index: true}
  const [draftItemsLoaded, setDraftItemsLoaded] = useState(false); // Track if draft items have been loaded from DB
  const [selectedDiscountItems, setSelectedDiscountItems] = useState([]); // Track which discount items are selected (by index)
  const [pendingSectionCollapsed, setPendingSectionCollapsed] = useState(true); // Track if pending discount section is collapsed
  const [clearAllConfirm, setClearAllConfirm] = useState(false); // Confirmation for clearing all discount items

  // Dynamic Layout state
  const pendingGroupRef = useRef(null);
  const [pendingGroupHeight, setPendingGroupHeight] = useState(0);

  // Monitor pending group height for sticky adjustment
  useLayoutEffect(() => {
    const updateHeight = () => {
      if (pendingGroupRef.current) {
        setPendingGroupHeight(pendingGroupRef.current.offsetHeight);
      } else {
        setPendingGroupHeight(0);
      }
    };

    // Initial measure
    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    if (pendingGroupRef.current) {
      observer.observe(pendingGroupRef.current);
    }

    return () => observer.disconnect();
  }, [discountItems.length, pendingSectionCollapsed]); // dependencies that might mount/unmount or change content

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
        const notes = data.notes || "";
        setNotizen(notes);
        setOriginalNotizen(notes); // Track original value
        setQueue(data.queue || null);
        setSettings(
          data.settings || { discountRate: 10, ordersRequiredForDiscount: 3 }
        );

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

  // Check if notes have unsaved changes
  const hasUnsavedNotes = notizen !== originalNotizen;

  // Update context when unsaved changes status changes
  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedNotes);
  }, [hasUnsavedNotes, setHasUnsavedChanges]);

  // Warn user before leaving page with unsaved notes (browser close/refresh)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedNotes) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedNotes]);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await discountsAPI.updateNotes(id, notizen);
      setOriginalNotizen(notizen); // Update original after successful save
      setMessage({ type: "success", text: "Notizen gespeichert!" });
      setTimeout(() => setMessage({ type: "", text: "" }), 3000);
    } catch (error) {
      console.error("Failed to save notes:", error);
      setMessage({ type: "error", text: "Fehler beim Speichern" });
    } finally {
      setSaving(false);
    }
  };

  // Handle discard changes
  const handleDiscardChanges = () => {
    setNotizen(originalNotizen); // Reset notes to original
    proceedWithNavigation(); // This will trigger the pending navigation
  };

  // Handle save and continue
  const handleSaveAndContinue = async () => {
    await handleSaveNotes();
    proceedWithNavigation(); // This will trigger the pending navigation
  };

  // Fetch notes history
  const fetchNotesHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await discountsAPI.getNotesHistory(id);
      if (response.data.success) {
        setNotesHistory(response.data.data.history);
      }
    } catch (error) {
      console.error("Failed to fetch notes history:", error);
      toast.error("Fehler beim Laden der Historie");
    } finally {
      setHistoryLoading(false);
    }
  };

  // Handle cancel modal
  const handleCancelNavigation = () => {
    cancelNavigation(); // Cancel the navigation
  };

  // Check if order is already in a discount group
  const getOrderStatus = (orderId) => {
    for (const group of discountGroups) {
      const orderInGroup = group.orders?.find(
        (o) =>
          o.orderId?._id?.toString() === orderId?.toString() ||
          o.orderId?.toString() === orderId?.toString()
      );
      if (orderInGroup) {
        return {
          inGroup: true,
          status: group.status,
          groupId: group._id,
          discountAmount: orderInGroup.discountAmount,
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
    if (orderStatus.status === "redeemed") {
      return;
    }

    // Can't select orders already added to discount items
    if (ordersInItems.includes(orderId)) {
      return;
    }

    setSelectedOrders((prev) => {
      if (prev.includes(orderId)) {
        return prev.filter((id) => id !== orderId);
      } else {
        return [...prev, orderId];
      }
    });
  };

  // Start editing a discount group
  const handleStartEditGroup = (group) => {
    if (group.status === "redeemed") return; // Can't edit redeemed groups

    setEditingGroup(group);

    // Group orders by bundleIndex to preserve the bundle structure
    const bundleMap = {};
    group.orders?.forEach((o) => {
      const orderId = o.orderId?._id || o.orderId;
      // Ensure bundleIndex is a number for consistent grouping
      const bundleIdx = Number(o.bundleIndex ?? 0);
      if (!bundleMap[bundleIdx]) {
        bundleMap[bundleIdx] = [];
      }
      bundleMap[bundleIdx].push(orderId);
    });

    // Sort by bundleIndex to maintain order
    const sortedBundles = Object.entries(bundleMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, orderIds]) => orderIds);

    // Automatic groups use single-order bundles (each bundleIndex has 1 order).
    const allSingleOrders = sortedBundles.every(
      (bundle) => bundle.length === 1
    );

    let editItems;
    if (allSingleOrders) {
      // Automatic group: use direct order selection (no pending bundle items)
      const allOrders = sortedBundles.flat();
      setSelectedOrders(allOrders);
      setSelectedDiscountItems([]);
      return;
    } else {
      // Manual group with actual bundles: preserve bundle structure
      editItems = sortedBundles.map((orderIds) => ({
        orders: orderIds,
        isBundle: orderIds.length > 1,
      }));
    }

    // Append edit items to existing pending items (preserve existing)
    setDiscountItems((prev) => {
      const newItems = [...prev, ...editItems];
      // Auto-select only the newly added edit items
      const startIndex = prev.length;
      setSelectedDiscountItems(editItems.map((_, index) => startIndex + index));
      return newItems;
    });
    setSelectedOrders([]);
  };

  // Cancel editing - remove only the edit items, keep other pending items
  const handleCancelEdit = () => {
    // Remove the selected edit items (they were auto-selected when editing started)
    setDiscountItems((prev) =>
      prev.filter((_, index) => !selectedDiscountItems.includes(index))
    );
    setEditingGroup(null);
    setSelectedOrders([]);
    setSelectedDiscountItems([]);
  };

  // Memoized toggle handler for discount item selection - prevents laggy checkbox behavior
  const toggleDiscountItemSelection = useCallback((itemIndex) => {
    setSelectedDiscountItems((prev) => {
      if (prev.includes(itemIndex)) {
        return prev.filter((i) => i !== itemIndex);
      } else {
        return [...prev, itemIndex];
      }
    });
  }, []);

  // Add selected orders as one item (single order or bundle)
  const handleAddAsItem = () => {
    if (selectedOrders.length === 0) return;

    const newItem = {
      orders: [...selectedOrders],
      isBundle: selectedOrders.length > 1,
    };

    setDiscountItems((prev) => {
      const newItems = [...prev, newItem];
      return newItems;
    });
    setSelectedOrders([]);
    toast.success("Als Gruppe hinzugefügt.");
  };

  // Create discount group from both selected discountItems and selected orders
  const handleCreateDirectDiscountGroup = async () => {
    // Allow creation if we have either selected discountItems or selectedOrders
    if (selectedOrders.length === 0 && selectedDiscountItems.length === 0)
      return;

    setCreatingGroup(true);
    setMessage({ type: "", text: "" });

    try {
      let ordersWithBundles = [];
      let bundleIndex = 0;

      // First, add orders from selected discountItems (pre-added groups)
      discountItems.forEach((item, index) => {
        if (selectedDiscountItems.includes(index)) {
          item.orders.forEach((orderId) => {
            ordersWithBundles.push({
              orderId,
              bundleIndex: bundleIndex,
            });
          });
          bundleIndex++; // Each item gets its own bundleIndex
        }
      });

      // Then, add selected orders (each as individual item)
      selectedOrders.forEach((orderId) => {
        ordersWithBundles.push({
          orderId,
          bundleIndex: bundleIndex,
        });
        bundleIndex++; // Each selected order gets its own bundleIndex
      });

      if (editingGroup) {
        await discountsAPI.updateGroup(
          id,
          editingGroup._id,
          ordersWithBundles,
          settings.discountRate
        );
        setMessage({
          type: "success",
          text: "Bonusgruppe erfolgreich aktualisiert!",
        });
        toast.success("Bonusgruppe aktualisiert.");
      } else {
        await discountsAPI.createGroup(
          id,
          ordersWithBundles,
          settings.discountRate
        );
        setMessage({
          type: "success",
          text: "Bonusgruppe erfolgreich erstellt!",
        });
        toast.success("Bonusgruppe erstellt.");
      }
      setSelectedOrders([]);
      setEditingGroup(null);
      // Only remove selected discount items, keep unselected ones
      setDiscountItems((prev) =>
        prev.filter((_, index) => !selectedDiscountItems.includes(index))
      );
      setSelectedDiscountItems([]);
      await fetchData();
    } catch (error) {
      console.error("Failed to create discount group:", error);
      setMessage({
        type: "error",
        text: error.message || "Fehler beim Erstellen der Bonusgruppe",
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  // Remove an item from discount items
  const handleRemoveItem = (index) => {
    setDiscountItems((prev) => prev.filter((_, i) => i !== index));
    // Also remove from selected and adjust indices
    setSelectedDiscountItems((prev) =>
      prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
    );
    setExpandedItems((prev) => {
      const newExpanded = { ...prev };
      delete newExpanded[index];
      return newExpanded;
    });
    toast.success("Artikel entfernt.");
  };

  // Remove individual order from a bundle item
  const handleRemoveOrderFromItem = (itemIndex, orderId) => {
    setDiscountItems((prev) => {
      const newItems = [...prev];
      const item = newItems[itemIndex];
      const newOrders = item.orders.filter((id) => id !== orderId);

      if (newOrders.length === 0) {
        // Remove entire item if no orders left
        return prev.filter((_, i) => i !== itemIndex);
      } else {
        // Update item with remaining orders
        newItems[itemIndex] = {
          ...item,
          orders: newOrders,
          isBundle: newOrders.length > 1,
        };
        return newItems;
      }
    });
    toast.success("Einkauf aus Gruppe entfernt.");
  };

  // Get all order IDs that are already in discount items
  const getOrdersInItems = () => {
    return discountItems.flatMap((item) => item.orders);
  };

  // Create or update discount group
  const handleCreateDiscountGroup = async () => {
    // Validate at least one selected item is provided
    if (selectedDiscountItems.length === 0) {
      setMessage({
        type: "error",
        text: "Bitte wählen Sie mindestens einen Artikel aus",
      });
      return;
    }

    setCreatingGroup(true);
    setMessage({ type: "", text: "" });

    try {
      // Flatten only selected items with bundleIndex
      let bundleIndex = 0;
      const ordersWithBundles = [];
      discountItems.forEach((item, index) => {
        if (selectedDiscountItems.includes(index)) {
          item.orders.forEach((orderId) => {
            ordersWithBundles.push({ orderId, bundleIndex });
          });
          bundleIndex++;
        }
      });

      // Validate minimum 2 orders for a discount group
      if (ordersWithBundles.length < 2) {
        setMessage({
          type: "error",
          text: "Eine Bonusgruppe muss mindestens 2 Einkäufe enthalten",
        });
        setCreatingGroup(false);
        return;
      }

      if (editingGroup) {
        // Update existing group
        await discountsAPI.updateGroup(
          id,
          editingGroup._id,
          ordersWithBundles,
          settings.discountRate
        );
        setMessage({
          type: "success",
          text: "Bonusgruppe erfolgreich aktualisiert!",
        });
        toast.success("Bonusgruppe aktualisiert.");
      } else {
        // Create new group
        await discountsAPI.createGroup(
          id,
          ordersWithBundles,
          settings.discountRate
        );
        setMessage({
          type: "success",
          text: "Bonusgruppe erfolgreich erstellt!",
        });
        toast.success("Bonusgruppe erstellt.");
      }
      setSelectedOrders([]);
      // Only remove selected discount items, keep unselected ones
      setDiscountItems((prev) =>
        prev.filter((_, index) => !selectedDiscountItems.includes(index))
      );
      setSelectedDiscountItems([]);
      setEditingGroup(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to create/update discount group:", error);
      setMessage({
        type: "error",
        text:
          error.message ||
          "Fehler beim Erstellen/Aktualisieren der Bonusgruppe",
      });
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
      setMessage({ type: "success", text: "Bonus erfolgreich eingelöst!" });
      toast.success("Bonus eingelöst.");
      setRedeemGroupId(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to redeem group:", error);
      setMessage({
        type: "error",
        text: error.message || "Fehler beim Einlösen",
      });
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
      setMessage({ type: "success", text: "Bonusgruppe gelöscht!" });
      toast.success("Bonusgruppe gelöscht.");
      setDeleteGroupId(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to delete group:", error);
      setMessage({
        type: "error",
        text: error.message || "Fehler beim Löschen",
      });
      setDeleteGroupId(null);
    }
  };

  const formatCurrency = (value) => {
    return (value || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("de-DE");
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <svg
            className="animate-spin h-8 w-8 text-gray-400"
            viewBox="0 0 24 24"
          >
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
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
            onClick={() => navigate("/bonus")}
            className="mt-4 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Zurück zur Liste
          </button>
        </div>
      </Layout>
    );
  }

  const totalOrders = orders.length;
  const totalItems = orders.reduce(
    (acc, order) => acc + (order.items?.length || 0),
    0
  );
  const totalOrderValue = orders.reduce(
    (acc, order) => acc + (order.amountTotal || 0),
    0
  );

  // Calculate discount amounts by status
  const redeemableBonus = discountGroups.reduce((acc, g) => {
    if (g.status === "redeemed") return acc;
    const uniqueBundles = new Set(g.orders?.map(o => Number(o.bundleIndex ?? 0))).size;
    return uniqueBundles >= 3 ? acc + (g.totalDiscount || 0) : acc;
  }, 0);

  // Get all order IDs that are in groups
  const ordersInGroups = new Set(
    discountGroups.flatMap(g =>
      g.orders?.map(o => (o.orderId?._id || o.orderId)?.toString()) || []
    )
  );

  // Calculate bonus from orders NOT in any group yet (available/pending orders)
  const availableOrdersBonus = orders.reduce((acc, order) => {
    const orderId = (order._id || order.id)?.toString();
    // Skip if order is already in a group
    if (ordersInGroups.has(orderId)) return acc;

    // Calculate potential bonus from this order
    const eligible = order.items?.filter(i => i.discountEligible) || [];
    const eligibleAmount = eligible.reduce(
      (sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity),
      0
    );
    const orderBonus = (eligibleAmount * settings.discountRate) / 100;
    return acc + orderBonus;
  }, 0);

  const pendingBonus = discountGroups.reduce((acc, g) => {
    if (g.status === "redeemed") return acc;
    const uniqueBundles = new Set(g.orders?.map(o => Number(o.bundleIndex ?? 0))).size;
    return uniqueBundles < 3 ? acc + (g.totalDiscount || 0) : acc;
  }, 0) + availableOrdersBonus; // Add available orders bonus to pending

  const redeemedBonus = discountGroups.reduce((acc, g) => {
    return g.status === "redeemed" ? acc + (g.totalDiscount || 0) : acc;
  }, 0);

  // Calculate selected orders discount
  const selectedOrdersTotal = selectedOrders.reduce((acc, orderId) => {
    const order = orders.find((o) => (o._id || o.id) === orderId);
    if (order) {
      const eligible = order.items?.filter((i) => i.discountEligible) || [];
      return (
        acc +
        eligible.reduce(
          (sum, item) =>
            sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity),
          0
        )
      );
    }
    return acc;
  }, 0);
  const selectedDiscount = (selectedOrdersTotal * settings.discountRate) / 100;

  // Selection status for items (manual creation allows any number of items)
  const hasSelectedItems = selectedDiscountItems.length > 0;
  const hasSelectedOrders = selectedOrders.length > 0;

  // Calculate total discount from selected items only
  const itemsTotal = discountItems.reduce((acc, item, index) => {
    // Only count selected items
    if (!selectedDiscountItems.includes(index)) return acc;
    return (
      acc +
      item.orders.reduce((sum, orderId) => {
        const order = orders.find((o) => (o._id || o.id) === orderId);
        if (order) {
          const eligible = order.items?.filter((i) => i.discountEligible) || [];
          return (
            sum +
            eligible.reduce(
              (s, i) => s + (i.priceSubtotalIncl || i.priceUnit * i.quantity),
              0
            )
          );
        }
        return sum;
      }, 0)
    );
  }, 0);
  const itemsDiscount = (itemsTotal * settings.discountRate) / 100;

  return (
    <Layout>
      {/* Message */}
      <div className="mb-4" style={{ minHeight: message.text ? "auto" : 0 }}>
        {message.text && (
          <div
            className={`p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bonus Details</h1>
          <p className="text-gray-500 text-sm mt-1">
            {sanitizeName(customer?.customerName || customer?.name)}
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-900 font-medium tracking-wide transition-all duration-500 ease-in-out hover:-translate-y-[1px] text-sm"
        >
          Zurück
        </button>
      </div>

      {/* Pending Discount Group - Table Style like saved groups */}
      {discountItems.length > 0 && (
        <div
          ref={pendingGroupRef}
          className="bg-white rounded-xl border border-amber-300 mb-6 overflow-hidden shadow-lg sticky top-[64px] z-30 transform transition-all duration-200 max-h-[40vh] overflow-y-auto"
        >
          {/* Header - Clickable to collapse/expand */}
          <div
            className="bg-gradient-to-r from-amber-100 to-orange-100 px-4 py-2 border-b border-amber-200 flex items-center justify-between cursor-pointer hover:from-amber-150 hover:to-orange-150"
            onClick={() => setPendingSectionCollapsed(!pendingSectionCollapsed)}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center">
                <svg
                  className="h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-amber-900">
                Bonusgruppe wird erstellt
              </span>
              <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-medium">
                {discountItems.reduce(
                  (sum, item) => sum + item.orders.length,
                  0
                )}{" "}
                Einkäufe
              </span>
              {/* Collapse/Expand indicator */}
              <svg
                className={`h-4 w-4 text-amber-700 transition-transform ${
                  pendingSectionCollapsed ? "" : "rotate-180"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
            <div className="flex items-center gap-3">
              {/* <span className="text-sm font-bold text-amber-900">
                € {formatCurrency(itemsDiscount)}
              </span> */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setClearAllConfirm(true);
                }}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                Alle löschen
              </button>
            </div>
          </div>

          {/* Items as collapsible rows - only show when not collapsed */}
          {!pendingSectionCollapsed && (
            <div className="divide-y divide-gray-100">
              {discountItems.map((item, index) => {
                const itemKey = `pending_${index}`;
                const isExpanded = expandedItems[itemKey];
                const itemOrders = item.orders
                  .map((orderId) =>
                    orders.find((o) => (o._id || o.id) === orderId)
                  )
                  .filter(Boolean);

                // Calculate totals
                const itemEligible = itemOrders.reduce((sum, order) => {
                  const eligible =
                    order?.items?.filter((i) => i.discountEligible) || [];
                  return (
                    sum +
                    eligible.reduce(
                      (s, i) =>
                        s + (i.priceSubtotalIncl || i.priceUnit * i.quantity),
                      0
                    )
                  );
                }, 0);
                const itemDiscount =
                  (itemEligible * settings.discountRate) / 100;

                // Toggle item expansion
                const toggleItem = () => {
                  setExpandedItems((prev) => ({
                    ...prev,
                    [itemKey]: !prev[itemKey],
                  }));
                };

                // For single orders (not bundle)
                if (!item.isBundle) {
                  const order = itemOrders[0];
                  if (!order) return null;
                  const orderId = order._id || order.id;

                  return (
                    <div
                      key={index}
                      className="grid grid-cols-[60px_1fr_1fr_100px_80px] bg-white hover:bg-gray-50"
                    >
                      <div className="p-3 flex items-center justify-center border-r border-gray-100">
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center">
                          {index + 1}
                        </span>
                      </div>
                      <div className="p-3 border-r border-gray-100">
                        <p className="text-sm text-gray-900">
                          <span className="font-semibold">Einkaufsnummer</span> -{" "}
                          <button
                            onClick={() => navigate(`/bestellungen/${orderId}`)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          >
                            {order.posReference || order.orderId}
                          </button>
                        </p>
                        <p className="text-sm text-gray-900">
                          <span className="font-semibold">Einkaufsdatum</span> -{" "}
                          {formatDate(order.orderDate)}
                        </p>
                        <p className="text-sm mt-1 text-gray-600">
                          <span className="font-semibold">Bonusfähig:</span> €{" "}
                          {formatCurrency(itemEligible)}
                        </p>
                      </div>
                      <div className="p-3 border-r border-gray-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          {(order.items || [])
                            .slice(0, 4)
                            .map((itm, imgIdx) => (
                              <ProductImage
                                key={`pending-${orderId}-${imgIdx}`}
                                src={itm.image}
                                size="sm"
                              />
                            ))}
                          {(order.items?.length || 0) > 4 && (
                            <span className="text-sm font-medium text-gray-600">
                              +{order.items.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-3 border-r border-gray-100 flex items-center justify-center">
                        <span className="text-sm font-semibold text-green-600">
                          € {formatCurrency(itemDiscount)}
                        </span>
                      </div>
                      <div className="p-3 flex items-center justify-center">
                        <button
                          onClick={() => setRemoveItemIndex(index)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Entfernen"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                }

                // For bundles (multiple orders grouped with "Als Gruppe")
                return (
                  <div key={index} className="bg-white">
                    {/* Collapsed bundle header */}
                    <div
                      className={`grid grid-cols-[60px_1fr_1fr_100px_80px] cursor-pointer hover:bg-amber-50 transition-colors ${
                        isExpanded ? "bg-amber-50" : ""
                      }`}
                      onClick={toggleItem}
                    >
                      <div className="p-3 flex items-center justify-center border-r border-gray-100">
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center">
                          {index + 1}
                        </span>
                      </div>
                      <div className="p-3 border-r border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            Gruppenbestellung - {item.orders.length}{" "}
                            Einkäufe
                          </span>
                          <svg
                            className={`h-4 w-4 text-gray-500 transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                        <p className="text-sm mt-1 text-gray-600">
                          <span className="font-semibold">Bonusfähig:</span> €{" "}
                          {formatCurrency(itemEligible)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Erweitern
                        </p>
                      </div>
                      <div className="p-3 border-r border-gray-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          {itemOrders
                            .flatMap((o) => o.items || [])
                            .slice(0, 6)
                            .map((itm, imgIdx) => (
                              <ProductImage
                                key={`pending-bundle-${index}-${imgIdx}`}
                                src={itm.image}
                                size="sm"
                              />
                            ))}
                          {itemOrders.flatMap((o) => o.items || []).length >
                            6 && (
                            <span className="text-sm font-medium text-gray-600">
                              +
                              {itemOrders.flatMap((o) => o.items || []).length -
                                6}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-3 border-r border-gray-100 flex items-center justify-center">
                        <span className="text-sm font-semibold text-green-600">
                          € {formatCurrency(itemDiscount)}
                        </span>
                      </div>
                      <div className="p-3 flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRemoveItemIndex(index);
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Entfernen"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Expanded orders */}
                    {isExpanded && (
                      <div className="bg-blue-50/30 border-t border-blue-100">
                        {itemOrders.map((order, orderIdx) => {
                          const orderId = order._id || order.id;
                          const orderEligible = (
                            order?.items?.filter((i) => i.discountEligible) ||
                            []
                          ).reduce(
                            (s, i) =>
                              s +
                              (i.priceSubtotalIncl || i.priceUnit * i.quantity),
                            0
                          );
                          const orderDiscount =
                            (orderEligible * settings.discountRate) / 100;
                          const isLastOrder =
                            orderIdx === itemOrders.length - 1;

                          return (
                            <div
                              key={orderId}
                              className={`grid grid-cols-[60px_1fr_1fr_100px_80px] ml-4 ${
                                !isLastOrder ? "border-b border-blue-100" : ""
                              }`}
                            >
                              <div className="p-2 flex items-center justify-center border-r border-blue-100">
                                <span className="text-xs text-gray-400">
                                  {orderIdx + 1}
                                </span>
                              </div>
                              <div className="p-2 border-r border-blue-100">
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">
                                    Einkaufsnummer
                                  </span>{" "}
                                  -{" "}
                                  <button
                                    onClick={() => navigate(`/bestellungen/${orderId}`)}
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                  >
                                    {order.posReference || order.orderId}
                                  </button>
                                </p>
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">
                                    Einkaufsdatum
                                  </span>{" "}
                                  - {formatDate(order.orderDate)}
                                </p>
                                <p className="text-sm mt-1 text-gray-600">
                                  <span className="font-semibold">
                                    Bonusfähig:
                                  </span>{" "}
                                  € {formatCurrency(orderEligible)}
                                </p>
                              </div>
                              <div className="p-2 border-r border-blue-100">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(order.items || [])
                                    .slice(0, 4)
                                    .map((itm, imgIdx) => (
                                      <ProductImage
                                        key={`${orderId}-item-${imgIdx}`}
                                        src={itm.image}
                                        size="sm"
                                      />
                                    ))}
                                  {(order.items?.length || 0) > 4 && (
                                    <span className="text-sm font-medium text-gray-600">
                                      +{order.items.length - 4}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="p-2 border-r border-blue-100 flex items-center justify-center">
                                <span className="text-xs text-green-600">
                                  € {formatCurrency(orderDiscount)}
                                </span>
                              </div>
                              <div className="p-2 flex items-center justify-center">
                                <button
                                  onClick={() =>
                                    setRemoveOrderFromItem({
                                      itemIndex: index,
                                      orderId,
                                    })
                                  }
                                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Aus Gruppe entfernen"
                                >
                                  <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
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
          )}
        </div>
      )}

      {/* Editing Mode Banner */}
      {editingGroup && (
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-orange-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              <span className="text-sm text-orange-800">
                <strong>Bearbeitungsmodus:</strong> Bonusgruppe wird bearbeitet
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
              <svg
                className="h-5 w-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <span className="text-sm text-blue-800">
                <strong>{queue.orderCount}</strong> Einkauf(e) in
                Warteschlange ({queue.orderCount}/
                {settings.ordersRequiredForDiscount} für automatischen Bonus)
              </span>
            </div>
            {queue.readyForDiscount && (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                Bereit für automatischen Bonus
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top Section with Notizen spanning full height */}
      <div className="flex gap-4 mb-6">
        {/* Left side: Kundendetails + Bottom Stats */}
        <div className="flex flex-col gap-4">
          {/* Top row */}
          <div className="flex gap-4 items-stretch">
            {/* Kundendetails */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 w-[350px]">
              <h3 className="text-center font-semibold text-gray-900 mb-6">
                Kundendetails
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex">
                  <span className="text-gray-500 w-32">Kundennummer:</span>
                  <span className="text-gray-900">
                    {customer.customerNumber || customer.ref || "-"}
                  </span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-32">Kundenname:</span>
                  <span className="text-gray-900">
                    {sanitizeName(customer.customerName || customer.name)}
                  </span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-32">E-Mail:</span>
                  <span className="text-gray-900">{customer.email}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-32">Telefonnummer:</span>
                  <span className="text-gray-900">
                    {customer.phone || customer.mobile || "-"}
                  </span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-32">Adresse:</span>
                  <div className="text-gray-900">
                    <div>{customer.address?.street || "-"}</div>
                    <div>
                      {customer.address?.postalCode} {customer.address?.city}
                    </div>
                    <div>{customer.address?.country}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Stats */}
            <div className="flex flex-col gap-4">
              {/* Gesamtbonus Gewährt */}
              <div className={`rounded-xl border p-6 flex flex-col items-center justify-center flex-1 ${
                redeemableBonus > 0
                  ? 'bg-green-50 border-green-200'
                  : pendingBonus > 0
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-red-50 border-red-200'
              }`}>
                <h3 className={`font-bold mb-3 text-sm ${
                  redeemableBonus > 0
                    ? 'text-green-600'
                    : pendingBonus > 0
                      ? 'text-orange-500'
                      : 'text-red-600'
                }`}>
                  Gesamtbonus Gewährt
                </h3>
                {(() => {
                  const handleCopyAmount = (amount) => {
                    const formattedAmount = `€ ${formatCurrency(amount)}`;
                    navigator.clipboard.writeText(formattedAmount);
                    toast.success("Betrag kopiert!");
                  };

                  // Determine which bonus to display and its color
                  if (redeemableBonus > 0) {
                    return (
                      <button
                        onClick={() => handleCopyAmount(redeemableBonus)}
                        className="text-4xl font-extrabold text-green-600 hover:text-green-700 cursor-pointer transition-colors"
                        title="Klicken zum Kopieren"
                      >
                        € {formatCurrency(redeemableBonus)}
                      </button>
                    );
                  }
                  if (pendingBonus > 0) {
                    return (
                      <button
                        onClick={() => handleCopyAmount(pendingBonus)}
                        className="text-4xl font-extrabold text-orange-500 hover:text-orange-600 cursor-pointer transition-colors"
                        title="Klicken zum Kopieren"
                      >
                        € {formatCurrency(pendingBonus)}
                      </button>
                    );
                  }
                  // All redeemed or nothing
                  return (
                    <button
                      onClick={() => handleCopyAmount(0)}
                      className="text-4xl font-extrabold text-red-600 hover:text-red-700 cursor-pointer transition-colors"
                      title="Klicken zum Kopieren"
                    >
                      € 0,00
                    </button>
                  );
                })()}
              </div>

              {/* Gesamtbestellwert */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center min-w-[220px] flex-1">
                <h3 className="font-semibold text-gray-600 mb-2 text-sm">
                  Gesamtbestellwert
                </h3>
                <p className="text-3xl font-bold text-gray-900">
                  € {formatCurrency(totalOrderValue)}
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Stats Row */}
          <div className="flex gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center w-[350px]">
              <h3 className="font-semibold text-gray-600 mb-2 text-sm">
                Anzahl Der Einkäufe
              </h3>
              <p className="text-3xl font-bold text-gray-900">{totalOrders}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center min-w-[220px]">
              <h3 className="font-semibold text-gray-600 mb-2 text-sm">
                Anzahl Der Artikel
              </h3>
              <p className="text-3xl font-bold text-gray-900">{totalItems}</p>
            </div>
          </div>
        </div>

        {/* Notizen - spans full height */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              Notizen Hinzufügen
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowHistory(true);
                  fetchNotesHistory();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Historie anzeigen"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            {hasUnsavedNotes && (
              <span className="text-xs text-orange-600 font-medium flex items-center gap-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                Nicht gespeichert
              </span>
            )}
            </div>
          </div>
          <textarea
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            className={`w-full flex-1 border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 transition-colors ${
              hasUnsavedNotes
                ? "border-orange-300 focus:ring-orange-200"
                : "border-gray-200 focus:ring-gray-200"
            }`}
            placeholder=""
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleSaveNotes}
              disabled={saving || !hasUnsavedNotes}
              className={`px-4 py-2 rounded-lg font-medium tracking-wide transition-all duration-500 ease-in-out text-sm ${
                hasUnsavedNotes
                  ? "bg-orange-600 text-white hover:bg-orange-700 hover:-translate-y-[1px]"
                  : "bg-gray-800 text-white hover:bg-gray-900 cursor-not-allowed opacity-50"
              }`}
            >
              {saving ? "Speichern..." : "Speichern"}
            </button>
          </div>
        </div>
      </div>

      {/* Action Bar - Selection and Creation */}
      {(() => {
        // Calculate total items: selected orders + selected discount items (groups)
        const MANUAL_MIN_ORDERS = 3; // Manual creation requires exactly 3 orders/groups
        const selectedItemsCount = selectedDiscountItems.length;
        const totalItems = selectedOrders.length + selectedItemsCount;
        const isReadyForManual = totalItems === MANUAL_MIN_ORDERS;
        const isTooMany = totalItems > MANUAL_MIN_ORDERS;
        const isReadyForAuto = totalItems >= settings.ordersRequiredForDiscount;

        const headerOffset = 70; // Height of the main fixed header
        const dynamicTop =
          discountItems.length > 0
            ? headerOffset + pendingGroupHeight // Sticky below pending group (no extra gap needed as it's flush)
            : headerOffset;

        return (
          <div
            style={{ top: `${dynamicTop}px` }}
            className={`rounded-xl border p-4 mb-6 transition-all duration-200 ease-out overflow-hidden sticky z-30 ${
              isTooMany
                ? "bg-blue-50 border-blue-200"
                : isReadyForManual
                ? "bg-green-50 border-green-200"
                : totalItems > 0
                ? "bg-blue-50 border-blue-200"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Progress indicator - shows 3 dots for manual creation */}
                <div className="flex items-center gap-1">
                  {[...Array(MANUAL_MIN_ORDERS)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-colors ${
                        i < totalItems
                          ? isTooMany
                            ? "bg-blue-500"
                            : isReadyForManual
                            ? "bg-green-500"
                            : "bg-blue-500"
                          : "bg-gray-200"
                      }`}
                    />
                  ))}
                  {/* Show extra dot if more than 3 */}
                  {isTooMany && (
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </div>

                {/* Status text */}
                <div className="flex items-center gap-3">
                  {totalItems === 0 ? (
                    <span className="text-sm text-gray-500">
                      Wählen Sie genau {MANUAL_MIN_ORDERS} Einkäufe oder
                      Gruppen
                    </span>
                  ) : isTooMany ? (
                    <>
                      <span className="text-sm font-medium text-blue-700">
                        {totalItems} Einkäufe/Gruppen sind für einen Bonus
                        erforderlich!{totalItems > 1 ? "en" : ""}
                      </span>
                      <span className="text-sm text-blue-600 font-medium">
                        • {MANUAL_MIN_ORDERS} Ausgewählte Einkäufe, die für
                        Gruppenbestellungen in Frage kommen
                      </span>
                      {hasSelectedOrders && (
                        <span className="text-xs text-blue-500">
                          ({selectedOrders.length} ausgewählt)
                        </span>
                      )}
                      {hasSelectedItems && (
                        <span className="text-xs text-red-500">
                          ({selectedItemsCount} Gruppe
                          {selectedItemsCount > 1 ? "n" : ""})
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span
                        className={`text-sm font-medium ${
                          isReadyForManual ? "text-green-700" : "text-blue-700"
                        }`}
                      >
                        {totalItems === 1 ? "Einkauf" : "Einkäufe"} ausgewählt
                      </span>
                      {hasSelectedOrders && (
                        <span className="text-xs text-gray-500">
                          ({selectedOrders.length} ausgewählt)
                        </span>
                      )}
                      {hasSelectedItems && (
                        <span className="text-xs text-gray-500">
                          ({selectedItemsCount} Gruppe
                          {selectedItemsCount > 1 ? "n" : ""})
                        </span>
                      )}
                      {isReadyForManual && (
                        <span className="text-sm text-green-600 font-medium">
                          • Bonus: €{" "}
                          {formatCurrency(itemsDiscount + selectedDiscount)}
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
                    {selectedOrders.length > 1 && !hasSelectedItems && (
                      <button
                        onClick={() => setShowGroupConfirm(true)}
                        className={`px-3 py-1.5 text-white rounded-lg text-sm font-medium transition-colors ${
                          isTooMany
                            ? "bg-blue-600 hover:bg-blue-700"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                        title="Ausgewählte Einkäufe als eine Gruppe zusammenfassen"
                      >
                        Als Gruppe
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setCreateGroupConfirm({
                          open: true,
                          mode: "direct",
                        })
                      }
                      disabled={creatingGroup || !isReadyForManual || isTooMany}
                      className={`px-4 py-1.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        isReadyForManual && !isTooMany
                          ? "bg-green-600 hover:bg-green-700"
                          : isTooMany
                          ? "bg-red-400 cursor-not-allowed"
                          : "bg-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {creatingGroup
                        ? "..."
                        : editingGroup
                        ? "Aktualisieren"
                        : "Bonusgruppe erstellen"}
                    </button>
                    <button
                      onClick={() => setSelectedOrders([])}
                      className={`px-2 py-1.5 text-sm ${
                        isTooMany
                          ? "text-blue-500 hover:text-blue-700"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      ✕
                    </button>
                  </>
                )}
                {hasSelectedItems && !hasSelectedOrders && (
                  <>
                    {editingGroup && (
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Zurück
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setCreateGroupConfirm({
                          open: true,
                          mode: "selected",
                        })
                      }
                      disabled={creatingGroup || !isReadyForManual || isTooMany}
                      className={`px-4 py-1.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        isReadyForManual && !isTooMany
                          ? "bg-green-600 hover:bg-green-700"
                          : isTooMany
                          ? "bg-red-400 cursor-not-allowed"
                          : "bg-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {creatingGroup
                        ? "..."
                        : editingGroup
                        ? "Aktualisieren"
                        : "Bonusgruppe erstellen"}
                    </button>
                    {/* <button
                      onClick={() => {
                        setSelectedDiscountItems([]);
                        setSelectedOrders([]);
                      }}
                      className={`px-2 py-1.5 text-sm ${
                        isTooMany
                          ? "text-red-500 hover:text-red-700"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      ✕
                    </button> */}
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
                Wählen Sie Einkäufe aus, um eine Bonusgruppe zu erstellen.
                {editingGroup
                  ? " Sie bearbeiten gerade eine bestehende Gruppe."
                  : " Bereits gruppierte oder eingelöste Einkäufe können nicht ausgewählt werden."}
              </p>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[60px_1fr_1fr_100px_160px] border-b border-gray-200 bg-gray-50">
              <div className="p-3 text-center text-xs font-semibold text-gray-600 uppercase border-r border-gray-200"></div>
              <div className="p-3 text-xs font-semibold text-gray-600 uppercase border-r border-gray-200">
                Bestelldetails
              </div>
              <div className="p-3 text-xs font-semibold text-gray-600 uppercase border-r border-gray-200">
                Artikel
              </div>
              <div className="p-3 text-center text-xs font-semibold text-gray-600 uppercase border-r border-gray-200">
                Gruppe
              </div>
              <div className="p-3 text-center text-xs font-semibold text-gray-600 uppercase">
                Aktion
              </div>
            </div>

            <div>
              {/* Render ACTIVE discount groups first */}
              {discountGroups
                .filter((group) => group.status !== "redeemed")
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map((group) => {
                  const isRedeemed = group.status === "redeemed";
                  const isBeingEdited = editingGroup?._id === group._id;
                  const groupKey = group._id || group.id;
                  const isExpanded = expandedBundles[groupKey];

                  // Get orders that belong to this group
                  const groupOrderIds =
                    group.orders?.map((o) =>
                      (o.orderId?._id || o.orderId)?.toString()
                    ) || [];
                  const groupOrders = orders.filter((order) =>
                    groupOrderIds.includes((order._id || order.id)?.toString())
                  );

                  // If editing this group, don't show it here
                  if (isBeingEdited) return null;

                  // Calculate total eligible amount for entire group
                  const groupTotalEligible = groupOrders.reduce(
                    (total, order) => {
                      const eligible =
                        order.items?.filter((item) => item.discountEligible) ||
                        [];
                      return (
                        total +
                        eligible.reduce(
                          (sum, item) =>
                            sum +
                            (item.priceSubtotalIncl ||
                              item.priceUnit * item.quantity),
                          0
                        )
                      );
                    },
                    0
                  );

                  // Toggle group expansion
                  const toggleGroup = () => {
                    setExpandedBundles((prev) => ({
                      ...prev,
                      [groupKey]: !prev[groupKey],
                    }));
                  };

                  return (
                    <div
                      key={groupKey}
                      className="border-b border-gray-200 bg-white flex"
                    >
                      {/* Left side - Header and Expanded content */}
                      <div className="flex-1">
                        {/* Collapsed Group Header */}
                        <div
                          className={`grid grid-cols-[60px_1fr_1fr_100px] cursor-pointer hover:bg-gray-50 transition-colors ${
                            isExpanded ? "bg-green-50" : ""
                          }`}
                          onClick={toggleGroup}
                        >
                          <div className="p-4 flex items-center justify-center border-r border-gray-100">
                            <input
                              type="checkbox"
                              checked={false}
                              disabled
                              className="w-5 h-5 rounded border-gray-300 cursor-not-allowed"
                            />
                          </div>
                          <div className="p-4 border-r border-gray-100">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  isRedeemed
                                    ? "bg-gray-100 text-gray-600"
                                    : "bg-green-100 text-green-700"
                                }`}
                              >
                                Bonusgruppe
                              </span>
                              {(() => {
                                const uniqueBundles = new Set(
                                  group.orders?.map(o => Number(o.bundleIndex ?? 0))
                                ).size;
                                return (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    uniqueBundles < 3
                                      ? "bg-orange-100 text-orange-700"
                                      : "bg-blue-100 text-blue-700"
                                  }`}>
                                    {uniqueBundles} Einkäufe
                                  </span>
                                );
                              })()}
                              <svg
                                className={`h-4 w-4 text-gray-500 transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </div>
                            <p className="text-sm mt-1 text-gray-600">
                              <span className="font-semibold">
                                Bonusfähig:
                              </span>{" "}
                              € {formatCurrency(groupTotalEligible)}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Erweitern
                            </p>
                          </div>
                          <div className="p-4 border-r border-gray-100">
                            <div className="flex items-center gap-2 flex-wrap">
                              {groupOrders
                                .flatMap((o) => o.items || [])
                                .slice(0, 6)
                                .map((item, imgIdx) => (
                                  <ProductImage
                                    key={`group-${groupKey}-item-${imgIdx}`}
                                    src={item.image}
                                    size="sm"
                                  />
                                ))}
                              {groupOrders.flatMap((o) => o.items || [])
                                .length > 6 && (
                                <span className="text-sm font-medium text-gray-600">
                                  +
                                  {groupOrders.flatMap((o) => o.items || [])
                                    .length - 6}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-4 flex items-center justify-center">
                            <svg
                              className={`h-7 w-7 ${
                                isRedeemed ? "text-gray-400" : "text-green-500"
                              }`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <rect
                                x="6"
                                y="2"
                                width="14"
                                height="16"
                                rx="2"
                                className={
                                  isRedeemed
                                    ? "fill-gray-100 stroke-gray-400"
                                    : "fill-green-100 stroke-green-500"
                                }
                              />
                              <rect
                                x="4"
                                y="4"
                                width="14"
                                height="16"
                                rx="2"
                                className={
                                  isRedeemed
                                    ? "fill-gray-50 stroke-gray-300"
                                    : "fill-green-50 stroke-green-400"
                                }
                              />
                              <rect
                                x="2"
                                y="6"
                                width="14"
                                height="16"
                                rx="2"
                                className={
                                  isRedeemed
                                    ? "fill-white stroke-gray-400"
                                    : "fill-white stroke-green-500"
                                }
                              />
                            </svg>
                          </div>
                        </div>

                        {/* Expanded - Show orders grouped by bundleIndex */}
                        {isExpanded && (
                          <div className="bg-green-50/30 border-t border-green-100">
                            {(() => {
                              // Group orders by bundleIndex
                              const bundleMap = {};
                              group.orders?.forEach((o) => {
                                // Ensure bundleIndex is a number for consistent grouping
                                const bundleIdx = Number(o.bundleIndex ?? 0);
                                if (!bundleMap[bundleIdx]) {
                                  bundleMap[bundleIdx] = [];
                                }
                                const orderData = orders.find(
                                  (ord) =>
                                    (ord._id || ord.id)?.toString() ===
                                    (o.orderId?._id || o.orderId)?.toString()
                                );
                                if (orderData) {
                                  bundleMap[bundleIdx].push({
                                    ...orderData,
                                    discountAmount: o.discountAmount,
                                  });
                                }
                              });

                              // Sort by bundleIndex to maintain order
                              const bundles = Object.entries(bundleMap).sort(
                                ([a], [b]) => Number(a) - Number(b)
                              );

                              return bundles.map(
                                ([bundleIdx, bundleOrders], bundleIndex) => {
                                  const isBundle = bundleOrders.length > 1;
                                  const isLastBundle =
                                    bundleIndex === bundles.length - 1;
                                  const groupNumber = bundleIndex + 1;
                                  const getSubIndex = (index) => {
                                    if (index < 0 || index > 25) {
                                      return String(index + 1);
                                    }
                                    return String.fromCharCode(97 + index);
                                  };

                                  // Calculate bundle total eligible
                                  const bundleEligible = bundleOrders.reduce(
                                    (sum, order) => {
                                      const eligible =
                                        order.items?.filter(
                                          (i) => i.discountEligible
                                        ) || [];
                                      return (
                                        sum +
                                        eligible.reduce(
                                          (s, i) =>
                                            s +
                                            (i.priceSubtotalIncl ||
                                              i.priceUnit * i.quantity),
                                          0
                                        )
                                      );
                                    },
                                    0
                                  );

                                  return (
                                    <div
                                      key={`bundle-${bundleIdx}`}
                                      className={`${
                                        !isLastBundle
                                          ? "border-b-2 border-green-200"
                                          : ""
                                      }`}
                                    >
                                      {/* Bundle header if multiple orders */}
                                      {isBundle && (
                                        <div className="bg-blue-50 px-4 py-2  border-b border-blue-100">
                                          <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                              Gruppenbestellung -{" "}
                                              {bundleOrders.length} Einkäufe
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              Bonusfähig: €{" "}
                                              {formatCurrency(bundleEligible)}
                                            </span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Orders in this bundle */}
                                      <div className="ml-8 relative">
                                        {/* Group number - centered and spanning all rows (for both bundles and single orders) */}
                                        <div className="absolute left-0 top-0 bottom-0 w-[60px] flex items-center justify-center border-r border-green-100 bg-green-50/30 z-10">
                                          <span className="text-base font-semibold text-gray-600">
                                            {groupNumber}
                                          </span>
                                        </div>

                                        {bundleOrders.map((order, orderIdx) => {
                                          const orderId = order._id || order.id;
                                          const orderSubLabel = isBundle
                                            ? getSubIndex(orderIdx)
                                            : "";
                                          const discountEligibleItems =
                                            order.items?.filter(
                                              (item) => item.discountEligible
                                            ) || [];
                                          const discountEligibleAmount =
                                            discountEligibleItems.reduce(
                                              (sum, item) =>
                                                sum +
                                                (item.priceSubtotalIncl ||
                                                  item.priceUnit *
                                                    item.quantity),
                                              0
                                            );
                                          const isLastOrder =
                                            orderIdx ===
                                            bundleOrders.length - 1;

                                          return (
                                            <div
                                              key={orderId}
                                              className={`grid ${
                                                isBundle
                                                  ? "grid-cols-[60px_40px_1fr_1fr_100px]"
                                                  : "grid-cols-[60px_1fr_1fr_100px]"
                                              } ${
                                                !isLastOrder
                                                  ? "border-b border-green-100"
                                                  : ""
                                              }`}
                                            >
                                              {/* First column - empty spacer (group number is absolutely positioned) */}
                                              <div className="p-3 border-r border-transparent"></div>

                                              {/* Sub-label column (only for bundles) */}
                                              {isBundle && (
                                                <div className="p-3 flex items-center justify-center border-r border-green-100">
                                                  <span className="text-sm font-medium text-gray-600">
                                                    {orderSubLabel}
                                                  </span>
                                                </div>
                                              )}

                                              {/* Order details */}
                                              <div className="p-3 border-r border-green-100">
                                                <p className="text-sm text-gray-900">
                                                  <span className="font-semibold">
                                                    Einkaufsnummer
                                                  </span>{" "}
                                                  -{" "}
                                                  <button
                                                    onClick={() => navigate(`/bestellungen/${(order._id || order.id)?.toString()}`)}
                                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                                  >
                                                    {order.posReference ||
                                                      order.orderId}
                                                  </button>
                                                </p>
                                                <p className="text-sm text-gray-900">
                                                  <span className="font-semibold">
                                                    Einkaufsdatum
                                                  </span>{" "}
                                                  -{" "}
                                                  {formatDate(order.orderDate)}
                                                </p>
                                                <p className="text-sm mt-1 text-gray-600">
                                                  <span className="font-semibold">
                                                    Bonusfähig:
                                                  </span>{" "}
                                                  €{" "}
                                                  {formatCurrency(
                                                    discountEligibleAmount
                                                  )}
                                                </p>
                                              </div>
                                              <div className="p-3 border-r border-green-100">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  {(order.items || [])
                                                    .slice(0, 4)
                                                    .map((item, imgIdx) => (
                                                      <ProductImage
                                                        key={`${orderId}-item-${imgIdx}`}
                                                        src={item.image}
                                                        size="sm"
                                                      />
                                                    ))}
                                                  {(order.items?.length || 0) >
                                                    4 && (
                                                    <span className="text-sm font-medium text-gray-600">
                                                      +{order.items.length - 4}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              {/* Empty column for discount amount placeholder */}
                                              <div className="p-3"></div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                }
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Action Column - Single column spanning header and expanded */}
                      <div className="w-[160px] flex flex-col items-center justify-center gap-2 p-4 border-l border-gray-200 bg-gray-50">
                        {/* Status Badge */}
                        {(() => {
                          // Count unique bundles (each bundleIndex represents 1 item/group)
                          const uniqueBundles = new Set(
                            group.orders?.map(o => Number(o.bundleIndex ?? 0))
                          ).size;

                          if (isRedeemed) {
                            return (
                              <span className="w-full px-4 py-2 bg-gray-400 text-white rounded-lg text-sm font-medium text-center cursor-not-allowed">
                                Eingelöst
                              </span>
                            );
                          }

                          if (uniqueBundles < 3) {
                            return (
                              <span className="w-full px-4 py-2 bg-white text-orange-500 border border-orange-300 rounded-lg text-sm font-medium text-center">
                                Ausstehend
                              </span>
                            );
                          }

                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRedeemGroup(group._id);
                              }}
                              className="w-full px-4 py-2 bg-white text-green-500 border border-green-300 rounded-lg text-sm font-medium hover:bg-green-500 hover:text-white transition-all cursor-pointer"
                            >
                              Offen
                            </button>
                          );
                        })()}

                        {/* Action Buttons - Only show for open groups */}
                        {!isRedeemed && (
                          <div className="flex gap-1 w-full">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditGroup(group);
                              }}
                              className="flex-1 px-2 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-[#22c55e] hover:text-white hover:border-none transition-all ease-in-out duration-300 font-medium"
                            >
                              Bearbeiten
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteGroup(group._id);
                              }}
                              className="px-2 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition-colors"
                              title="Bonusgruppe löschen"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        )}

                        <span className={`text-xs font-medium ${isRedeemed ? 'text-red-600' : 'text-green-600'}`}>
                          € {formatCurrency(group.totalDiscount)}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {/* Render pending discount items as collapsible groups */}
              {discountItems.map((item, itemIndex) => {
                const itemKey = `table_pending_${itemIndex}`;
                const isExpanded = expandedBundles[itemKey];
                const itemOrders = item.orders
                  .map((orderId) =>
                    orders.find((o) => (o._id || o.id) === orderId)
                  )
                  .filter(Boolean);

                if (itemOrders.length === 0) return null;

                // Calculate totals
                const itemEligible = itemOrders.reduce((sum, order) => {
                  const eligible =
                    order?.items?.filter((i) => i.discountEligible) || [];
                  return (
                    sum +
                    eligible.reduce(
                      (s, i) =>
                        s + (i.priceSubtotalIncl || i.priceUnit * i.quantity),
                      0
                    )
                  );
                }, 0);

                // Toggle expansion
                const togglePendingItem = () => {
                  setExpandedBundles((prev) => ({
                    ...prev,
                    [itemKey]: !prev[itemKey],
                  }));
                };

                // Check if this item is selected
                const isItemSelected =
                  selectedDiscountItems.includes(itemIndex);

                // For single orders
                if (!item.isBundle) {
                  const order = itemOrders[0];
                  const orderId = order._id || order.id;
                  const discountEligibleItems =
                    order.items?.filter((i) => i.discountEligible) || [];
                  const discountEligibleAmount = discountEligibleItems.reduce(
                    (sum, i) =>
                      sum + (i.priceSubtotalIncl || i.priceUnit * i.quantity),
                    0
                  );

                  return (
                    <div
                      key={itemKey}
                      className={`grid grid-cols-[60px_1fr_1fr_100px_160px] border-b border-gray-100 ${
                        isItemSelected ? "bg-amber-50" : "bg-gray-50"
                      }`}
                    >
                      <div className="p-4 flex items-center justify-center border-r border-gray-100">
                        <input
                          type="checkbox"
                          checked={isItemSelected}
                          onChange={() =>
                            toggleDiscountItemSelection(itemIndex)
                          }
                          className={`w-5 h-5 rounded border-gray-300 cursor-pointer ${
                            isItemSelected
                              ? "text-amber-500 focus:ring-amber-500"
                              : "text-gray-400 focus:ring-gray-400"
                          }`}
                        />
                      </div>
                      <div className="p-4 border-r border-gray-100">
                        <p className="text-sm text-gray-900">
                          <span className="font-semibold">Einkaufsnummer</span> -{" "}
                          <button
                            onClick={() => navigate(`/bestellungen/${orderId}`)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          >
                            {order.posReference || order.orderId}
                          </button>
                        </p>
                        <p className="text-sm text-gray-900">
                          <span className="font-semibold">Einkaufsdatum</span> -{" "}
                          {formatDate(order.orderDate)}
                        </p>
                        <p className="text-sm mt-1 text-gray-600">
                          <span className="font-semibold">Bonusfähig:</span> €{" "}
                          {formatCurrency(discountEligibleAmount)}
                        </p>
                      </div>
                      <div className="p-4 border-r border-gray-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          {(order.items || []).slice(0, 4).map((itm, idx) => (
                            <ProductImage
                              key={`${orderId}-table-${idx}`}
                              src={itm.image}
                              size="md"
                            />
                          ))}
                          {(order.items?.length || 0) > 4 && (
                            <span className="text-sm font-medium text-gray-600">
                              +{order.items.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-4 border-r border-gray-100 flex items-center justify-center">
                        <svg
                          className={`h-6 w-6 ${
                            isItemSelected ? "text-amber-500" : "text-gray-400"
                          }`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div
                        className={`p-4 flex flex-col items-center justify-center ${
                          isItemSelected ? "bg-amber-100/50" : "bg-gray-100/50"
                        }`}
                      >
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            isItemSelected
                              ? "bg-amber-200 text-amber-800"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {isItemSelected ? "Ausgewählt" : "Nicht ausgewählt"}
                        </span>
                      </div>
                    </div>
                  );
                }

                // For bundles (multiple orders grouped with "Als Gruppe")
                return (
                  <div
                    key={itemKey}
                    className="border-b border-gray-200 bg-white"
                  >
                    {/* Collapsed bundle header */}
                    <div className="flex">
                      <div
                        className={`flex-1 grid grid-cols-[60px_1fr_1fr_100px] cursor-pointer hover:bg-amber-50 transition-colors ${
                          isExpanded
                            ? isItemSelected
                              ? "bg-amber-50"
                              : "bg-gray-100"
                            : isItemSelected
                            ? "bg-amber-50/50"
                            : "bg-gray-50"
                        }`}
                        onClick={togglePendingItem}
                      >
                        <div className="p-4 flex items-center justify-center border-r border-gray-100">
                          <input
                            type="checkbox"
                            checked={isItemSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleDiscountItemSelection(itemIndex);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={`w-5 h-5 rounded border-gray-300 cursor-pointer ${
                              isItemSelected
                                ? "text-amber-500 focus:ring-amber-500"
                                : "text-gray-400 focus:ring-gray-400"
                            }`}
                          />
                        </div>
                        <div className="p-4 border-r border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded text-xs font-medium">
                              Gruppenbestellung - {item.orders.length}{" "}
                              Einkäufe
                            </span>
                            <svg
                              className={`h-4 w-4 text-gray-500 transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </div>
                          <p className="text-sm mt-1 text-gray-600">
                            <span className="font-semibold">Bonusfähig:</span>{" "}
                            € {formatCurrency(itemEligible)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Erweitern
                          </p>
                        </div>
                        <div className="p-4 border-r border-gray-100">
                          <div className="flex items-center gap-2 flex-wrap">
                            {itemOrders
                              .flatMap((o) => o.items || [])
                              .slice(0, 6)
                              .map((itm, imgIdx) => (
                                <ProductImage
                                  key={`pending-table-${itemIndex}-${imgIdx}`}
                                  src={itm.image}
                                  size="sm"
                                />
                              ))}
                            {itemOrders.flatMap((o) => o.items || []).length >
                              6 && (
                              <span className="text-sm font-medium text-gray-600">
                                +
                                {itemOrders.flatMap((o) => o.items || [])
                                  .length - 6}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="p-4 flex items-center justify-center">
                          <svg
                            className={`h-7 w-7 ${
                              isItemSelected
                                ? "text-amber-500"
                                : "text-gray-400"
                            }`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <rect
                              x="6"
                              y="2"
                              width="14"
                              height="16"
                              rx="2"
                              className={
                                isItemSelected
                                  ? "fill-amber-100 stroke-amber-500"
                                  : "fill-gray-100 stroke-gray-400"
                              }
                            />
                            <rect
                              x="4"
                              y="4"
                              width="14"
                              height="16"
                              rx="2"
                              className={
                                isItemSelected
                                  ? "fill-amber-50 stroke-amber-400"
                                  : "fill-gray-50 stroke-gray-300"
                              }
                            />
                            <rect
                              x="2"
                              y="6"
                              width="14"
                              height="16"
                              rx="2"
                              className={
                                isItemSelected
                                  ? "fill-white stroke-amber-500"
                                  : "fill-white stroke-gray-400"
                              }
                            />
                          </svg>
                        </div>
                      </div>

                      {/* Status Column */}
                      <div
                        className={`w-[160px] flex flex-col items-center justify-center gap-2 p-4 border-l border-gray-200 ${
                          isItemSelected ? "bg-amber-100/50" : "bg-gray-100/50"
                        }`}
                      >
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            isItemSelected
                              ? "bg-amber-200 text-amber-800"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {isItemSelected ? "Ausgewählt" : "Nicht ausgewählt"}
                        </span>
                      </div>
                    </div>

                    {/* Expanded orders */}
                    {isExpanded && (
                      <div className="bg-amber-50/30 border-t border-amber-100">
                        {itemOrders.map((order, orderIdx) => {
                          const orderId = order._id || order.id;
                          const orderEligible = (
                            order?.items?.filter((i) => i.discountEligible) ||
                            []
                          ).reduce(
                            (s, i) =>
                              s +
                              (i.priceSubtotalIncl || i.priceUnit * i.quantity),
                            0
                          );
                          const isLastOrder =
                            orderIdx === itemOrders.length - 1;

                          return (
                            <div
                              key={orderId}
                              className={`grid grid-cols-[60px_1fr_1fr_100px_160px] ml-4 ${
                                !isLastOrder ? "border-b border-amber-100" : ""
                              }`}
                            >
                              <div className="p-3 flex items-center justify-center border-r border-amber-100">
                                <span className="text-xs text-gray-400">
                                  {orderIdx + 1}
                                </span>
                              </div>
                              <div className="p-3 border-r border-amber-100">
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">
                                    Einkaufsnummer
                                  </span>{" "}
                                  -{" "}
                                  <button
                                    onClick={() => navigate(`/bestellungen/${orderId}`)}
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                  >
                                    {order.posReference || order.orderId}
                                  </button>
                                </p>
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">
                                    Einkaufsdatum
                                  </span>{" "}
                                  - {formatDate(order.orderDate)}
                                </p>
                                <p className="text-sm mt-1 text-gray-600">
                                  <span className="font-semibold">
                                    Bonusfähig:
                                  </span>{" "}
                                  € {formatCurrency(orderEligible)}
                                </p>
                              </div>
                              <div className="p-3 border-r border-amber-100">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(order.items || [])
                                    .slice(0, 4)
                                    .map((itm, imgIdx) => (
                                      <ProductImage
                                        key={`${orderId}-expanded-${imgIdx}`}
                                        src={itm.image}
                                        size="sm"
                                      />
                                    ))}
                                  {(order.items?.length || 0) > 4 && (
                                    <span className="text-sm font-medium text-gray-600">
                                      +{order.items.length - 4}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="p-3 border-r border-amber-100"></div>
                              <div className="p-3"></div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Render available orders (not in any group or being edited) - sorted by date (recent first) */}
              {[...orders]
                .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
                .map((order, index) => {
                  const orderId = order._id || order.id || `order-${index}`;
                  const orderStatus = getOrderStatus(orderId);
                  const isSelected = selectedOrders.includes(orderId);

                  // Skip orders that are in groups (unless editing that group)
                  const isRedeemed = orderStatus.status === "redeemed";
                  const isInEditingGroup =
                    editingGroup &&
                    orderStatus.groupId === editingGroup._id &&
                    !isRedeemed;

                  // Skip if in a group and not editing
                  if (orderStatus.inGroup && !isInEditingGroup) return null;

                  // Check if order is already in discount items - SKIP these as they are shown above
                  const isInDiscountItems =
                    getOrdersInItems().includes(orderId);
                  if (isInDiscountItems) return null;

                  const canSelect =
                    (!orderStatus.inGroup || isInEditingGroup) &&
                    !isRedeemed &&
                    !isInDiscountItems;

                  // Calculate discount eligible amount for this order
                  const discountEligibleItems =
                    order.items?.filter((item) => item.discountEligible) || [];
                  const discountEligibleAmount = discountEligibleItems.reduce(
                    (sum, item) =>
                      sum +
                      (item.priceSubtotalIncl ||
                        item.priceUnit * item.quantity),
                    0
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
                          <span className="font-semibold">Einkaufsnummer</span> -{" "}
                          <button
                            onClick={() => navigate(`/bestellungen/${orderId}`)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          >
                            {order.posReference || order.orderId}
                          </button>
                        </p>
                        <p className="text-sm text-gray-900">
                          <span className="font-semibold">Einkaufsdatum</span> -{" "}
                          {formatDate(order.orderDate)}
                        </p>
                        <p className="text-sm mt-1 text-gray-600">
                          <span className="font-semibold">Bonusfähig:</span> €{" "}
                          {formatCurrency(discountEligibleAmount)}
                        </p>
                      </div>

                      {/* Product Images */}
                      <div className="p-4 border-r border-gray-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          {(order.items || []).slice(0, 4).map((item, idx) => (
                            <ProductImage
                              key={`${orderId}-item-${idx}`}
                              src={item.image}
                              size="md"
                            />
                          ))}
                          {(order.items?.length || 0) > 4 && (
                            <span className="text-sm font-medium text-gray-600">
                              +{order.items.length - 4}
                            </span>
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
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xs text-gray-500">
                                  Verfügbar
                                </span>
                                <span className="text-xs font-semibold text-orange-500">
                                  € {formatCurrency((discountEligibleAmount * settings.discountRate) / 100)}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Kein Bonus
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Render REDEEMED discount groups at bottom */}
              {discountGroups
                .filter((group) => group.status === "redeemed")
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map((group) => {
                  const isBeingEdited = editingGroup?._id === group._id;
                  const groupKey = group._id || group.id;
                  const isExpanded = expandedBundles[groupKey];

                  // Get orders that belong to this group
                  const groupOrderIds =
                    group.orders?.map((o) =>
                      (o.orderId?._id || o.orderId)?.toString()
                    ) || [];
                  const groupOrders = orders.filter((order) =>
                    groupOrderIds.includes((order._id || order.id)?.toString())
                  );

                  // If editing this group, don't show it here
                  if (isBeingEdited) return null;

                  // Calculate total eligible amount for entire group
                  const groupTotalEligible = groupOrders.reduce(
                    (total, order) => {
                      const eligible =
                        order.items?.filter((item) => item.discountEligible) ||
                        [];
                      return (
                        total +
                        eligible.reduce(
                          (sum, item) =>
                            sum +
                            (item.priceSubtotalIncl ||
                              item.priceUnit * item.quantity),
                          0
                        )
                      );
                    },
                    0
                  );

                  // Toggle group expansion
                  const toggleGroup = () => {
                    setExpandedBundles((prev) => ({
                      ...prev,
                      [groupKey]: !prev[groupKey],
                    }));
                  };

                  return (
                    <div
                      key={groupKey}
                      className="border-b border-gray-200 bg-white flex"
                    >
                      {/* Left side - Header and Expanded content */}
                      <div className="flex-1">
                        {/* Collapsed Group Header */}
                        <div
                          className={`grid grid-cols-[60px_1fr_1fr_100px] cursor-pointer hover:bg-gray-50 transition-colors ${
                            isExpanded ? "bg-green-50" : ""
                          }`}
                          onClick={toggleGroup}
                        >
                          <div className="p-4 flex items-center justify-center border-r border-gray-100">
                            <input
                              type="checkbox"
                              checked={false}
                              disabled
                              className="w-5 h-5 rounded border-gray-300 cursor-not-allowed"
                            />
                          </div>
                          <div className="p-4 border-r border-gray-100">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                Bonusgruppe
                              </span>
                              {(() => {
                                const uniqueBundles = new Set(
                                  group.orders?.map(o => Number(o.bundleIndex ?? 0))
                                ).size;
                                return (
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                    {uniqueBundles} Einkäufe
                                  </span>
                                );
                              })()}
                              <svg
                                className={`h-4 w-4 text-gray-500 transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </div>
                            <p className="text-sm mt-1 text-gray-600">
                              <span className="font-semibold">
                                Bonusfähig:
                              </span>{" "}
                              € {formatCurrency(groupTotalEligible)}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Erweitern
                            </p>
                          </div>
                          <div className="p-4 border-r border-gray-100">
                            <div className="flex items-center gap-2 flex-wrap">
                              {groupOrders
                                .flatMap((o) => o.items || [])
                                .slice(0, 6)
                                .map((item, imgIdx) => (
                                  <ProductImage
                                    key={`group-${groupKey}-item-${imgIdx}`}
                                    src={item.image}
                                    size="sm"
                                  />
                                ))}
                              {groupOrders.flatMap((o) => o.items || [])
                                .length > 6 && (
                                <span className="text-sm font-medium text-gray-600">
                                  +
                                  {groupOrders.flatMap((o) => o.items || [])
                                    .length - 6}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-4 flex items-center justify-center">
                            <svg
                              className="h-7 w-7 text-gray-400"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <rect
                                x="6"
                                y="2"
                                width="14"
                                height="16"
                                rx="2"
                                className="fill-gray-100 stroke-gray-400"
                              />
                              <rect
                                x="4"
                                y="4"
                                width="14"
                                height="16"
                                rx="2"
                                className="fill-gray-50 stroke-gray-300"
                              />
                              <rect
                                x="2"
                                y="6"
                                width="14"
                                height="16"
                                rx="2"
                                className="fill-white stroke-gray-400"
                              />
                            </svg>
                          </div>
                        </div>

                        {/* Expanded - Show orders grouped by bundleIndex */}
                        {isExpanded && (
                          <div className="bg-green-50/30 border-t border-green-100">
                            {(() => {
                              // Group orders by bundleIndex
                              const bundleMap = {};
                              group.orders?.forEach((o) => {
                                const bundleIdx = Number(o.bundleIndex ?? 0);
                                if (!bundleMap[bundleIdx]) {
                                  bundleMap[bundleIdx] = [];
                                }
                                const orderData = orders.find(
                                  (ord) =>
                                    (ord._id || ord.id)?.toString() ===
                                    (o.orderId?._id || o.orderId)?.toString()
                                );
                                if (orderData) {
                                  bundleMap[bundleIdx].push({
                                    ...orderData,
                                    discountAmount: o.discountAmount,
                                  });
                                }
                              });

                              const bundles = Object.entries(bundleMap).sort(
                                ([a], [b]) => Number(a) - Number(b)
                              );

                              return bundles.map(
                                ([bundleIdx, bundleOrders], bundleIndex) => {
                                  const isBundle = bundleOrders.length > 1;
                                  const isLastBundle =
                                    bundleIndex === bundles.length - 1;
                                  const groupNumber = bundleIndex + 1;
                                  const getSubIndex = (index) => {
                                    if (index < 0 || index > 25) {
                                      return String(index + 1);
                                    }
                                    return String.fromCharCode(97 + index);
                                  };

                                  const bundleEligible = bundleOrders.reduce(
                                    (sum, order) => {
                                      const eligible =
                                        order.items?.filter(
                                          (i) => i.discountEligible
                                        ) || [];
                                      return (
                                        sum +
                                        eligible.reduce(
                                          (s, i) =>
                                            s +
                                            (i.priceSubtotalIncl ||
                                              i.priceUnit * i.quantity),
                                          0
                                        )
                                      );
                                    },
                                    0
                                  );

                                  return (
                                    <div
                                      key={`bundle-${bundleIdx}`}
                                      className={`${
                                        !isLastBundle
                                          ? "border-b-2 border-green-200"
                                          : ""
                                      }`}
                                    >
                                      {isBundle && (
                                        <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
                                          <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                              Gruppenbestellung -{" "}
                                              {bundleOrders.length} Einkäufe
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              Bonusfähig: €{" "}
                                              {formatCurrency(bundleEligible)}
                                            </span>
                                          </div>
                                        </div>
                                      )}

                                      <div className="ml-8 relative">
                                        <div className="absolute left-0 top-0 bottom-0 w-[60px] flex items-center justify-center border-r border-green-100 bg-green-50/30 z-10">
                                          <span className="text-base font-semibold text-gray-600">
                                            {groupNumber}
                                          </span>
                                        </div>

                                        {bundleOrders.map((order, orderIdx) => {
                                          const orderId = order._id || order.id;
                                          const orderSubLabel = isBundle
                                            ? getSubIndex(orderIdx)
                                            : "";
                                          const discountEligibleItems =
                                            order.items?.filter(
                                              (item) => item.discountEligible
                                            ) || [];
                                          const discountEligibleAmount =
                                            discountEligibleItems.reduce(
                                              (sum, item) =>
                                                sum +
                                                (item.priceSubtotalIncl ||
                                                  item.priceUnit *
                                                    item.quantity),
                                              0
                                            );
                                          const isLastOrder =
                                            orderIdx ===
                                            bundleOrders.length - 1;

                                          return (
                                            <div
                                              key={orderId}
                                              className={`grid ${
                                                isBundle
                                                  ? "grid-cols-[60px_40px_1fr_1fr_100px]"
                                                  : "grid-cols-[60px_1fr_1fr_100px]"
                                              } ${
                                                !isLastOrder
                                                  ? "border-b border-green-100"
                                                  : ""
                                              }`}
                                            >
                                              <div className="p-3 border-r border-transparent"></div>

                                              {isBundle && (
                                                <div className="p-3 flex items-center justify-center border-r border-green-100">
                                                  <span className="text-sm font-medium text-gray-600">
                                                    {orderSubLabel}
                                                  </span>
                                                </div>
                                              )}

                                              <div className="p-3 border-r border-green-100">
                                                <p className="text-sm text-gray-900">
                                                  <span className="font-semibold">
                                                    Einkaufsnummer
                                                  </span>{" "}
                                                  -{" "}
                                                  <button
                                                    onClick={() => navigate(`/bestellungen/${(order._id || order.id)?.toString()}`)}
                                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                                  >
                                                    {order.posReference ||
                                                      order.orderId}
                                                  </button>
                                                </p>
                                                <p className="text-sm text-gray-900">
                                                  <span className="font-semibold">
                                                    Einkaufsdatum
                                                  </span>{" "}
                                                  -{" "}
                                                  {formatDate(order.orderDate)}
                                                </p>
                                                <p className="text-sm mt-1 text-gray-600">
                                                  <span className="font-semibold">
                                                    Bonusfähig:
                                                  </span>{" "}
                                                  €{" "}
                                                  {formatCurrency(
                                                    discountEligibleAmount
                                                  )}
                                                </p>
                                              </div>
                                              <div className="p-3 border-r border-green-100">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  {(order.items || [])
                                                    .slice(0, 4)
                                                    .map((item, imgIdx) => (
                                                      <ProductImage
                                                        key={`${orderId}-item-${imgIdx}`}
                                                        src={item.image}
                                                        size="sm"
                                                      />
                                                    ))}
                                                  {(order.items?.length || 0) >
                                                    4 && (
                                                    <span className="text-sm font-medium text-gray-600">
                                                      +{order.items.length - 4}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="p-3"></div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                }
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Action Column */}
                      <div className="w-[160px] flex flex-col items-center justify-center gap-2 p-4 border-l border-gray-200 bg-gray-50">
                        <span className="w-full px-4 py-2 bg-gray-400 text-white rounded-lg text-sm font-medium text-center cursor-not-allowed">
                          Eingelöst
                        </span>
                        <span className="text-xs text-red-600 font-medium">
                          € {formatCurrency(group.totalDiscount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-gray-500">
            Keine Einkäufe vorhanden
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteGroupId}
        onClose={() => setDeleteGroupId(null)}
        onConfirm={confirmDeleteGroup}
        title="RABATTGRUPPE LÖSCHEN"
        message="Möchten Sie diese Bonusgruppe wirklich löschen? Die Einkäufe werden wieder verfügbar."
        confirmText="Ja, löschen"
        cancelText="Abbrechen"
      />

      {/* Redeem Confirmation Modal */}
      <ConfirmModal
        isOpen={!!redeemGroupId}
        onClose={() => setRedeemGroupId(null)}
        onConfirm={confirmRedeemGroup}
        title="RABATT EINLÖSEN"
        message="Möchten Sie diesen Bonus wirklich einlösen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmText="Ja, einlösen"
        cancelText="Abbrechen"
      />

      {/* Als Gruppe Confirmation Modal */}
      <ConfirmModal
        isOpen={showGroupConfirm}
        onClose={() => setShowGroupConfirm(false)}
        onConfirm={() => {
          handleAddAsItem();
          setShowGroupConfirm(false);
        }}
        title="ALS GRUPPE ZUSAMMENFASSEN"
        message={`Möchten Sie die ${selectedOrders.length} ausgewählten Einkäufe als eine Gruppe zusammenfassen?`}
        confirmText="Ja, zusammenfassen"
        cancelText="Abbrechen"
      />

      {/* Create Discount Group Confirmation Modal */}
      <ConfirmModal
        isOpen={createGroupConfirm.open}
        onClose={() => setCreateGroupConfirm({ open: false, mode: null })}
        onConfirm={() => {
          if (createGroupConfirm.mode === "direct") {
            handleCreateDirectDiscountGroup();
          } else if (createGroupConfirm.mode === "selected") {
            handleCreateDiscountGroup();
          }
          setCreateGroupConfirm({ open: false, mode: null });
        }}
        title="RABATTGRUPPE ERSTELLEN"
        message="Möchten Sie diese Bonusgruppe erstellen?"
        confirmText="Ja, erstellen"
        cancelText="Abbrechen"
      />

      {/* Remove Item Confirmation Modal */}
      <ConfirmModal
        isOpen={removeItemIndex !== null}
        onClose={() => setRemoveItemIndex(null)}
        onConfirm={() => {
          handleRemoveItem(removeItemIndex);
          setRemoveItemIndex(null);
        }}
        title="ARTIKEL ENTFERNEN"
        message="Möchten Sie diesen Artikel wirklich aus der Bonusgruppe entfernen?"
        confirmText="Ja, entfernen"
        cancelText="Abbrechen"
      />

      {/* Remove Order from Bundle Confirmation Modal */}
      <ConfirmModal
        isOpen={removeOrderFromItem !== null}
        onClose={() => setRemoveOrderFromItem(null)}
        onConfirm={() => {
          handleRemoveOrderFromItem(
            removeOrderFromItem.itemIndex,
            removeOrderFromItem.orderId
          );
          setRemoveOrderFromItem(null);
        }}
        title="AUS GRUPPE ENTFERNEN"
        message="Möchten Sie diesen Einkauf wirklich aus der Gruppe entfernen?"
        confirmText="Ja, entfernen"
        cancelText="Abbrechen"
      />

      {/* Clear All Confirmation Modal */}
      <ConfirmModal
        isOpen={clearAllConfirm}
        onClose={() => setClearAllConfirm(false)}
        onConfirm={() => {
          setDiscountItems([]);
          setSelectedDiscountItems([]);
          setClearAllConfirm(false);
        }}
        title="ALLE LÖSCHEN"
        message="Möchten Sie wirklich alle Bonus-Positionen entfernen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmText="Ja, löschen"
        cancelText="Abbrechen"
      />

      {/* Unsaved Notes Warning Modal */}
      <UnsavedChangesModal
        isOpen={showModal}
        onClose={handleCancelNavigation}
        onDiscard={handleDiscardChanges}
        onSave={handleSaveAndContinue}
        saving={saving}
        message="Sie haben nicht gespeicherte Änderungen in den Notizen. Möchten Sie diese speichern oder verwerfen?"
      />

      {/* Notes History Sidebar */}
      {showHistory && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300"
            onClick={() => setShowHistory(false)}
          />

          {/* Sidebar */}
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out">
            <div className="h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Notizen Historie</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {historyLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : notesHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <svg className="h-12 w-12 mx-auto mb-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>Keine Historie vorhanden</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {notesHistory.map((entry, idx) => (
                      <div key={entry.id || entry._id} className="relative pl-6 pb-6 border-l-2 border-blue-500 last:pb-0">
                        {/* Timeline dot */}
                        <div className="absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow"></div>

                        {/* Entry content */}
                        <div>
                          <div className="flex flex-col mb-2">
                            <span className="font-semibold text-gray-900">{entry.changedByName}</span>
                            <span className="text-sm text-gray-500">
                              {new Date(entry.createdAt).toLocaleString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="mt-2 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap shadow-sm">
                            {entry.notes || <em className="text-gray-400">Leer</em>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-200">
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
};

export default BonusDetail;
