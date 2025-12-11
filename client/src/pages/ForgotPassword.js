import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authAPI } from "../services/api";
import loginBg from "../assets/login-bg.png";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await authAPI.forgotPassword(email);
      setSuccess(true);
    } catch (err) {
      setError(
        err.message || "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-8 lg:px-16 py-12 bg-white">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-12">
            <h1 className="text-4xl tracking-[0.3em] font-light text-gray-800 mb-1">
              GRANDIOS
            </h1>
            <p className="text-xs tracking-[0.15em] text-gray-500 uppercase">
              The Curvy Fashion Store
            </p>
          </div>

          {/* Title */}
          <div className="text-center mb-10">
            <h2 className="text-3xl font-semibold text-gray-900 mb-3">
              Passwort vergessen?
            </h2>
            <p className="text-gray-600">
              Geben Sie Ihre E-Mail-Adresse ein und wir senden
              <br />
              Ihnen einen Link zum Zurucksetzen
            </p>
          </div>

          {success ? (
            <div className="space-y-6">
              {/* Success Message */}
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-4 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg
                    className="h-6 w-6 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <p className="font-medium">E-Mail gesendet!</p>
                    <p className="text-sm mt-1">
                      Bitte uberprufen Sie Ihren Posteingang und folgen Sie den
                      Anweisungen zum Zurucksetzen Ihres Passworts.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                to="/"
                className="block w-full py-4 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors text-center"
              >
                Zuruck zur Anmeldung
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Email Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  E-Mail-Adresse
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                  placeholder="ihre@email.de"
                  required
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
                    Senden...
                  </span>
                ) : (
                  "Link senden"
                )}
              </button>

              {/* Back to Login */}
              <div className="text-center">
                <Link
                  to="/"
                  className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-2"
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
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                  Zuruck zur Anmeldung
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Right Side - Image */}
      <div className="hidden lg:block lg:w-1/2 bg-gray-100">
        <img
          src={loginBg}
          alt="Grandios Fashion"
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
};

export default ForgotPassword;
