import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { discountsAPI } from "../services/api";

const Rabatt = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [customersData, setCustomersData] = useState([]);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalOrderValue: 0,
    totalDiscount: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDiscounts = async () => {
      try {
        const response = await discountsAPI.getAll();
        if (response.data.success) {
          setCustomersData(response.data.data);
          // Calculate stats
          const customers = response.data.data;
          const totalOrderVal = customers.reduce((sum, c) => sum + (c.totalOrderValue || 0), 0);
          const totalDiscountVal = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
          setStats({
            totalCustomers: customers.length,
            totalOrderValue: totalOrderVal,
            totalDiscount: totalDiscountVal
          });
        }
      } catch (error) {
        console.error("Failed to fetch discounts:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDiscounts();
  }, []);

  const filteredCustomers = customersData.filter(customer =>
    customer.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.customer?.ref?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.customer?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (value) => {
    return value?.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') || '0,00';
  };

  const handleViewCustomer = (customerId) => {
    navigate(`/rabatt/${customerId}`);
  };

  return (
    <Layout>
      {/* Search and Filter */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64 pl-4 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
        <button className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm">
          Filter
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Gesamtzahl der Kunden */}
        <div className="bg-green-50 rounded-xl border border-green-100 p-6">
          <h3 className="text-center font-semibold text-green-600 mb-2">Gesamtzahl der Kunden</h3>
          <p className="text-center text-3xl font-bold text-gray-900">{stats.totalCustomers}</p>
        </div>

        {/* Gesamtbestellwert */}
        <div className="bg-red-50 rounded-xl border border-red-100 p-6">
          <h3 className="text-center font-semibold text-red-500 mb-2">Gesamtbestellwert</h3>
          <p className="text-center text-3xl font-bold text-gray-900">€ {formatCurrency(stats.totalOrderValue)}</p>
        </div>

        {/* Gesamter Gewährter Rabatt */}
        <div className="bg-rose-50 rounded-xl border border-rose-100 p-6">
          <h3 className="text-center font-semibold text-gray-700 mb-2">Gesamter Gewährter Rabatt</h3>
          <p className="text-center text-3xl font-bold text-gray-900">€ {formatCurrency(stats.totalDiscount)}</p>
        </div>
      </div>

      {/* Customers List */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-gray-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Keine Kunden gefunden
          </div>
        ) : (
          filteredCustomers.map((discount, index) => (
            <div
              key={discount._id}
              className={`flex items-center justify-between p-4 ${
                index !== filteredCustomers.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              {/* Customer Info */}
              <div className="min-w-[250px]">
                <h4 className="font-semibold text-gray-900">{discount.customer?.name || "Unbekannt"}</h4>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Kundennummer:</span> {discount.customer?.ref || `CustNo_${discount.partnerId}`}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">E-Mail:</span> {discount.customer?.email || "-"}
                </p>
              </div>

              {/* Order Values */}
              <div className="min-w-[200px]">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Gesamtbestellwert:</span> € {formatCurrency(discount.totalOrderValue)}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Gesamtrabatt Gewährt:</span> € {formatCurrency(discount.totalGranted)}
                </p>
              </div>

              {/* Rabattpreis */}
              <div className="min-w-[150px]">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Rabattpreis:</span> € {formatCurrency(discount.balance)}
                </p>
              </div>

              {/* Action Button */}
              <div className="flex flex-col items-end">
                <button
                  onClick={() => handleViewCustomer(discount.customerId)}
                  className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
                >
                  Sicht
                </button>
                {discount.balance > 0 && (
                  <span className="text-green-500 text-sm mt-1">Einlösbar</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
};

export default Rabatt;
