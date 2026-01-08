import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { dashboardAPI } from "../services/api";

const formatCurrency = (value) => {
  return (value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Dashboard = () => {
  const [stats, setStats] = useState([
    { label: "Gesamter gewährter Rabatt", value: "€ 0,00", bgColor: "bg-blue-100", labelColor: "text-blue-500" },
    { label: "Anzahl der verkauften Artikel", value: "0", bgColor: "bg-green-100", labelColor: "text-green-500" },
    { label: "Gesamtzahl Der Kunden", value: "0", bgColor: "bg-red-100", labelColor: "text-red-500" },
  ]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, ordersRes] = await Promise.all([
          dashboardAPI.getStats(),
          dashboardAPI.getRecentOrders()
        ]);

        if (statsRes.data.success) {
          const data = statsRes.data.data;
          setStats([
            {
              label: "Gesamter gewährter Rabatt",
              value: `€ ${formatCurrency(data.totalDiscountGranted)}`,
              bgColor: "bg-blue-100",
              labelColor: "text-blue-500"
            },
            {
              label: "Anzahl der verkauften Artikel",
              value: data.totalItemsSold.toString(),
              bgColor: "bg-green-100",
              labelColor: "text-green-500"
            },
            {
              label: "Gesamtzahl Der Kunden",
              value: data.totalCustomers.toString(),
              bgColor: "bg-red-100",
              labelColor: "text-red-500"
            },
          ]);
        }

        if (ordersRes.data.success) {
          setOrders(ordersRes.data.data);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getStatusInfo = (order) => {
    if (order.state === "pending") return { status: "Ausstehend", statusType: "pending" };
    if (order.state === "paid") return { status: "Tilgen", statusType: "paid" };
    if (order.state === "completed") return { status: "Eingelöst", statusType: "redeemed" };
    return { status: order.state, statusType: "pending" };
  };

  const getStatusStyles = (statusType) => {
    switch (statusType) {
      case "pending":
        return "text-red-500 border-red-300 bg-white";
      case "paid":
        return "text-green-500 border-green-300 bg-white";
      case "redeemed":
        return "text-orange-500 border-orange-300 bg-white";
      default:
        return "text-gray-500 border-gray-300 bg-white";
    }
  };

  return (
    <Layout>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={`${stat.bgColor} rounded-2xl p-8 text-center`}
          >
            <p className={`${stat.labelColor} text-sm font-medium mb-3`}>
              {stat.label}
            </p>
            <p className="text-4xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-gray-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Keine Bestellungen gefunden
          </div>
        ) : (
          orders.map((order, index) => {
            const statusInfo = getStatusInfo(order);
            return (
              <div
                key={order._id}
                className={`flex items-center justify-between px-6 py-5 ${
                  index !== orders.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                {/* Order Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-sm font-semibold text-gray-900">
                      Bestellnummer -
                    </span>
                    <span className="text-sm text-gray-600">
                      {order.posReference}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-gray-900">
                      Gesamtbestellwert -
                    </span>
                    <span className="text-sm text-gray-600">€ {formatCurrency(order.amountTotal)}</span>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    {order.customerId?.name || "Unbekannt"}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-gray-900">
                      Kundennummer -
                    </span>
                    <span className="text-sm text-gray-600">
                      {order.customerId?.ref || `CustNo_${order.partnerId}`}
                    </span>
                  </div>
                </div>

                {/* Status & Action */}
                <div className="flex items-center gap-6">
                  <button
                    className={`px-5 py-2 text-sm font-medium border rounded-lg cursor-pointer transition-all hover:opacity-80 active:scale-95 ${getStatusStyles(
                      statusInfo.statusType
                    )}`}
                  >
                    {statusInfo.status}
                  </button>
                  <button
                    onClick={() => navigate(`/bestellungen/${order._id}`)}
                    className="text-sm text-gray-500 hover:text-gray-700 hover:underline whitespace-nowrap"
                  >
                    Mehr Anzeigen
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
