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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchCustomerDiscount = async () => {
      try {
        const response = await discountsAPI.getCustomerDiscount(id);
        if (response.data.success) {
          const data = response.data.data;
          setCustomer(data.customer);
          setOrders(data.orders || []);
          setDiscountGroups(data.discountGroups || []);
          setNotizen(data.discount?.notes || "");
        }
      } catch (error) {
        console.error("Failed to fetch customer discount:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCustomerDiscount();
  }, [id]);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await discountsAPI.updateNotes(id, notizen);
    } catch (error) {
      console.error("Failed to save notes:", error);
    } finally {
      setSaving(false);
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

  // Group orders for display (simplified - will show each order with discount groups)
  const processedOrders = orders.map((order, idx) => {
    // Find if this order belongs to a discount group
    const belongsToGroup = discountGroups.find(g =>
      g.orders?.some(o => o.orderId?.toString() === order._id?.toString())
    );
    return {
      ...order,
      group: belongsToGroup,
      isFirstInGroup: belongsToGroup ?
        discountGroups.findIndex(g => g._id === belongsToGroup._id) === idx : false
    };
  });

  return (
    <Layout>
      {/* Header Buttons */}
      <div className="flex justify-end gap-2 mb-6">
        <button className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm">
          Bestellungen zusammenfassen
        </button>
        <button
          onClick={() => navigate("/rabatt")}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
        >
          Zurück
        </button>
      </div>

      {/* Top Section */}
      <div className="flex gap-4 mb-4">
        {/* Kundendetails */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 w-[350px]">
          <h3 className="text-center font-semibold text-gray-900 mb-6">Kundendetails</h3>
          <div className="space-y-3 text-sm">
            <div className="flex">
              <span className="text-gray-500 w-32">Kundennummer:</span>
              <span className="text-gray-900">{customer.ref || `KUNDE-${customer.contactId}`}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">Kundenname:</span>
              <span className="text-gray-900">{customer.name}</span>
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

      {/* Orders List with Rabatt Summary - Table Layout */}
      {orders.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <tbody>
              {orders.map((order, index) => {
                // Calculate discount eligible amount for this order
                const discountEligibleItems = order.items?.filter(item => item.discountEligible) || [];
                const discountEligibleAmount = discountEligibleItems.reduce(
                  (sum, item) => sum + (item.priceSubtotalIncl * item.quantity), 0
                );

                return (
                  <tr
                    key={order._id}
                    className={index !== orders.length - 1 ? "border-b border-gray-100" : ""}
                  >
                    {/* Order Info */}
                    <td className="p-5 w-[420px]">
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">Bestellnummer</span> - {order.posReference} |{" "}
                        <span className="font-semibold">Bestelldatum</span> - {formatDate(order.orderDate)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-semibold">Gesamtbestellwert Nicht Rabattierter Artikel:</span> €{" "}
                        {formatCurrency(discountEligibleAmount)}
                      </p>
                    </td>

                    {/* Product Images */}
                    <td className="p-5">
                      <div className="flex items-center gap-3">
                        {(order.items || []).slice(0, 5).map((item, idx) => (
                          <img
                            key={idx}
                            src={item.image || "https://via.placeholder.com/60"}
                            alt=""
                            className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                          />
                        ))}
                        {(order.items?.length || 0) > 5 && (
                          <span className="text-gray-600 text-xl font-medium ml-1">+{order.items.length - 5}</span>
                        )}
                      </div>
                    </td>

                    {/* Action Column */}
                    <td className="p-5 w-[180px] text-center align-middle border-l border-gray-100">
                      {discountEligibleAmount > 0 && (
                        <div className="flex flex-col items-center">
                          <p className="text-2xl font-bold text-gray-900">€ {formatCurrency(discountEligibleAmount * 0.1)}</p>
                          <p className="text-sm text-gray-500 mt-1">Rabatt Ist Verfügbar</p>
                          <button
                            onClick={() => navigate(`/rabatt/${id}/tilgen`)}
                            className="mt-4 px-8 py-2 border border-green-500 text-green-500 rounded-lg text-sm hover:bg-green-50 transition-colors font-medium"
                          >
                            Tilgen
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Keine Bestellungen vorhanden
        </div>
      )}
    </Layout>
  );
};

export default RabattDetail;
