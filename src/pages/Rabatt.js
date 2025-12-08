import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

const customersData = [
  {
    id: 1,
    name: "Kunde 1",
    kundennummer: "CustNo_1234",
    email: "Jane_doe@Gmail.Com",
    gesamtbestellwert: "99,90",
    gesamtrabattGewahrt: "19,50",
    rabattpreis: "80,40",
    einlosbar: true,
  },
  {
    id: 2,
    name: "Kunde 2",
    kundennummer: "CustNo_5678",
    email: "Jane_doe@Gmail.Com",
    gesamtbestellwert: "130,90",
    gesamtrabattGewahrt: "21,50",
    rabattpreis: "109,40",
    einlosbar: false,
  },
  {
    id: 3,
    name: "Kunde 3",
    kundennummer: "CustNo_9012",
    email: "Jane_doe@Gmail.Com",
    gesamtbestellwert: "121,90",
    gesamtrabattGewahrt: "26,50",
    rabattpreis: "95,40",
    einlosbar: true,
  },
  {
    id: 4,
    name: "Kunde 4",
    kundennummer: "CustNo_3456",
    email: "Jane_doe@Gmail.Com",
    gesamtbestellwert: "215,90",
    gesamtrabattGewahrt: "59,50",
    rabattpreis: "156,40",
    einlosbar: true,
  },
  {
    id: 5,
    name: "Kunde 5",
    kundennummer: "CustNo_7890",
    email: "Jane_doe@Gmail.Com",
    gesamtbestellwert: "89,90",
    gesamtrabattGewahrt: "19,50",
    rabattpreis: "70,40",
    einlosbar: false,
  },
  {
    id: 6,
    name: "Kunde 6",
    kundennummer: "CustNo_2345",
    email: "Jane_doe@Gmail.Com",
    gesamtbestellwert: "143,90",
    gesamtrabattGewahrt: "29,50",
    rabattpreis: "114,40",
    einlosbar: false,
  },
];

const Rabatt = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  // Calculate totals
  const totalCustomers = "4.890";
  const totalOrderValue = "15.530,60";
  const totalDiscount = "1.070,50";

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
          <p className="text-center text-3xl font-bold text-gray-900">{totalCustomers}</p>
        </div>

        {/* Gesamtbestellwert */}
        <div className="bg-red-50 rounded-xl border border-red-100 p-6">
          <h3 className="text-center font-semibold text-red-500 mb-2">Gesamtbestellwert</h3>
          <p className="text-center text-3xl font-bold text-gray-900">€ {totalOrderValue}</p>
        </div>

        {/* Gesamter Gewährter Rabatt */}
        <div className="bg-rose-50 rounded-xl border border-rose-100 p-6">
          <h3 className="text-center font-semibold text-gray-700 mb-2">Gesamter Gewährter Rabatt</h3>
          <p className="text-center text-3xl font-bold text-gray-900">€ {totalDiscount}</p>
        </div>
      </div>

      {/* Customers List */}
      <div className="bg-white rounded-xl border border-gray-200">
        {customersData.map((customer, index) => (
          <div
            key={customer.id}
            className={`flex items-center justify-between p-4 ${
              index !== customersData.length - 1 ? "border-b border-gray-100" : ""
            }`}
          >
            {/* Customer Info */}
            <div className="min-w-[250px]">
              <h4 className="font-semibold text-gray-900">{customer.name}</h4>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Kundennummer:</span> {customer.kundennummer}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">E-Mail:</span> {customer.email}
              </p>
            </div>

            {/* Order Values */}
            <div className="min-w-[200px]">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Gesamtbestellwert:</span> € {customer.gesamtbestellwert}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Gesamtrabatt Gewährt:</span> € {customer.gesamtrabattGewahrt}
              </p>
            </div>

            {/* Rabattpreis */}
            <div className="min-w-[150px]">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Rabattpreis:</span> € {customer.rabattpreis}
              </p>
            </div>

            {/* Action Button */}
            <div className="flex flex-col items-end">
              <button
                onClick={() => handleViewCustomer(customer.id)}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
              >
                Sicht
              </button>
              {customer.einlosbar && (
                <span className="text-green-500 text-sm mt-1">Einlösbar</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
};

export default Rabatt;
