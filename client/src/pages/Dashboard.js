import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { dashboardAPI } from "../services/api";
import { sanitizeName } from "../utils/helpers";

const formatCurrency = (value) => {
  return (value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [stats, setStats] = useState([
    {
      label: "Gesamter gewährter Bonus",
      value: "€ 0,00",
      bgColor: "bg-blue-100",
      labelColor: "text-blue-500",
    },
    {
      label: "Anzahl der verkauften Artikel",
      value: "€ 0,00",
      bgColor: "bg-green-100",
      labelColor: "text-green-500",
    },
    {
      label: "Gesamtzahl der Kunden",
      value: "€ 0,00",
      bgColor: "bg-purple-100",
      labelColor: "text-purple-500",
    },
  ]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // URL-based params
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = 10;

  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  // Helper to update URL params
  const updateParams = (updates) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      });
      return newParams;
    });
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const statsRes = await dashboardAPI.getStats();
        if (statsRes.data.success) {
          const data = statsRes.data.data;
          setStats([
            {
              label: "Gesamter gewährter Bonus",
              value: `€ ${formatCurrency(data.totalDiscountGranted)}`,
              bgColor: "bg-blue-100",
              labelColor: "text-blue-500",
            },
            {
              label: "Anzahl der verkauften Artikel",
              value: `€ ${formatCurrency(data.totalItemsSold)}`,
              bgColor: "bg-green-100",
              labelColor: "text-green-500",
            },
            {
              label: "Gesamtzahl der Kunden",
              value: `${formatCurrency(data.totalCustomers)}`,
              bgColor: "bg-purple-100",
              labelColor: "text-purple-500",
            },
          ]);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const ordersRes = await dashboardAPI.getRecentOrders(
          currentPage,
          itemsPerPage
        );
        if (ordersRes.data.success) {
          setOrders(ordersRes.data.data);
          setTotalPages(ordersRes.data.pagination.pages);
          setTotalOrders(ordersRes.data.total);
        }
      } catch (error) {
        console.error("Failed to fetch orders:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [currentPage]);

  const getStatusInfo = (order) => {
    if (order.state === "pending")
      return { status: "Ausstehend", statusType: "pending" };
    if (order.state === "paid") return { status: "Offen", statusType: "paid" };
    if (order.state === "completed")
      return { status: "Eingelöst", statusType: "redeemed" };
    return { status: order.state, statusType: "pending" };
  };

  const getStatusStyles = (statusType) => {
    switch (statusType) {
      case "pending":
        return "text-orange-500 border-orange-300 bg-white"; // Orange: not ready yet
      case "paid":
        return "text-green-500 border-green-300 bg-white"; // Green: ready to redeem
      case "redeemed":
        return "bg-red-500 text-white"; // Red: already redeemed
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
            <p className={`${stat.labelColor} text-sm font-bold mb-3`}>
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
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Keine Einkäufe gefunden
          </div>
        ) : (
          orders.map((order, index) => {
            const statusInfo = getStatusInfo(order);
            return (
              <div
                key={order._id}
                className={`flex items-center justify-between px-6 py-5 ${index !== orders.length - 1 ? "border-b border-gray-100" : ""
                  }`}
              >
                {/* Order Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-sm font-semibold text-gray-900">
                      Einkaufsnummer -
                    </span>
                    <span className="text-sm text-gray-600">
                      {order.posReference}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-gray-900">
                      Gesamtbestellwert -
                    </span>
                    <span className="text-sm text-gray-600">
                      € {formatCurrency(order.amountTotal)}
                    </span>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    {sanitizeName(order.customerId?.name)}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-gray-900">
                      Kundennummer -
                    </span>
                    <span className="text-sm text-gray-600">
                      {order.customerId?.contactId ||
                        `CustNo_${order.partnerId}`}
                    </span>
                  </div>
                </div>

                {/* Status & Action */}
                <div className="flex items-center gap-6">
                  <button
                    className={`px-5 py-2 text-sm font-medium border rounded-lg cursor-default ${getStatusStyles(
                      statusInfo.statusType
                    )}`}
                  >
                    {statusInfo.status}
                  </button>
                  <button
                    onClick={() => navigate(`/bestellungen/${order._id}`)}
                    className="px-4 py-3 rounded-lg bg-gray-800 text-white hover:bg-gray-900 font-medium tracking-wide transition-all duration-500 ease-in-out hover:-translate-y-[1px] text-sm"
                  >
                    Mehr Anzeigen
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-600">
            Zeige {(currentPage - 1) * itemsPerPage + 1}-
            {Math.min(currentPage * itemsPerPage, totalOrders)} von{" "}
            {totalOrders} Einkäufe
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParams({ page: Math.max(currentPage - 1, 1) })}
              disabled={currentPage === 1}
              className="px-2 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Zurück
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                if (totalPages <= 7) return true;
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - currentPage) <= 1) return true;
                return false;
              })
              .map((page, index, array) => (
                <React.Fragment key={page}>
                  {index > 0 && array[index - 1] !== page - 1 && (
                    <span className="px-2 text-gray-400">...</span>
                  )}
                  <button
                    onClick={() => updateParams({ page })}
                    className={`px-3 py-1 text-sm font-medium rounded-lg ${currentPage === page
                        ? "bg-gray-900 text-white"
                        : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    {page}
                  </button>
                </React.Fragment>
              ))}
            <button
              onClick={() =>
                updateParams({ page: Math.min(currentPage + 1, totalPages) })
              }
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Weiter
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Dashboard;
