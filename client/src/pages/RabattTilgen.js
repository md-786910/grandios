import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

const ordersData = [
  {
    id: 1,
    bestellnummer: "GRAND12345",
    datum: "26-12-2024",
    gesamtNichtRabattiert: "99,90",
    items: [
      { image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=60&h=60&fit=crop" },
      { image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=60&h=60&fit=crop" },
      { image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=60&h=60&fit=crop" },
    ],
  },
  {
    id: 2,
    bestellnummer: "GRAND09867",
    datum: "26-12-2024",
    gesamtNichtRabattiert: "149,90",
    items: [
      { image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=60&h=60&fit=crop" },
      { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
    ],
  },
  {
    id: 3,
    bestellnummer: "GRAND45678",
    datum: "26-12-2024",
    gesamtNichtRabattiert: "49,90",
    items: [
      { image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=60&h=60&fit=crop" },
      { image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=60&h=60&fit=crop" },
      { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
    ],
  },
];

const RabattTilgen = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedOrders, setSelectedOrders] = useState([1, 2]); // Pre-select first two

  const handleToggleOrder = (orderId) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleKombinieren = () => {
    console.log("Kombinieren orders:", selectedOrders);
    // Handle combine logic here
  };

  return (
    <Layout>
      {/* Header with Zurück button */}
      <div className="flex justify-end mb-6">
        <button
          onClick={() => navigate(`/rabatt/${id}`)}
          className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
        >
          Zurück
        </button>
      </div>

      {/* Orders Table with Checkboxes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <tbody>
            {ordersData.map((order, index) => {
              const isSelected = selectedOrders.includes(order.id);
              const showKombinieren = index === 0;

              return (
                <tr
                  key={order.id}
                  className={index !== ordersData.length - 1 ? "border-b border-gray-100" : ""}
                >
                  {/* Order Info */}
                  <td className="p-5 w-[420px]">
                    <p className="text-sm text-gray-900">
                      <span className="font-semibold">Bestellnummer</span> - {order.bestellnummer} |{" "}
                      <span className="font-semibold">Bestelldatum</span> - {order.datum}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold">Gesamtbestellwert Nicht Rabattierter Artikel:</span> €{" "}
                      {order.gesamtNichtRabattiert}
                    </p>
                  </td>

                  {/* Product Images */}
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      {order.items.slice(0, 5).map((item, idx) => (
                        <img
                          key={idx}
                          src={item.image}
                          alt=""
                          className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                        />
                      ))}
                      {order.items.length > 5 && (
                        <span className="text-gray-600 text-xl font-medium ml-1">+{order.items.length - 5}</span>
                      )}
                    </div>
                  </td>

                  {/* Checkbox */}
                  <td className="p-5 w-[60px] text-center border-l border-gray-100">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleOrder(order.id)}
                      className="w-5 h-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                    />
                  </td>

                  {/* Kombinieren Button - spans all rows */}
                  {showKombinieren && (
                    <td rowSpan={ordersData.length} className="p-5 w-[150px] text-center align-middle border-l border-gray-100">
                      <button
                        onClick={handleKombinieren}
                        disabled={selectedOrders.length < 2}
                        className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        Kombinieren
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

export default RabattTilgen;
