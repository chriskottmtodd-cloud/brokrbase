import { useState } from "react";

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        // Create account
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
          credentials: "include",
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Registration failed");
          return;
        }
      }

      // Log in (also auto-logs in after registration)
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        return;
      }

      onSuccess();
    } catch {
      setError("Could not connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "#d03238" }}>Brokrbase</h1>
          <p className="text-gray-500 mt-2">The CRM that updates itself.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#d03238] focus:border-transparent"
                placeholder="Your name"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#d03238] focus:border-transparent"
              placeholder="you@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#d03238] focus:border-transparent"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 disabled:opacity-50 text-white font-medium rounded-md transition-colors"
            style={{ backgroundColor: "#d03238" }}
          >
            {loading
              ? (mode === "register" ? "Creating account..." : "Signing in...")
              : (mode === "register" ? "Create Account" : "Sign In")
            }
          </button>
        </form>

        <div className="text-center mt-4">
          {mode === "login" ? (
            <p className="text-sm text-gray-500">
              Don't have an account?{" "}
              <button
                onClick={() => { setMode("register"); setError(""); }}
                className="font-medium hover:underline"
                style={{ color: "#d03238" }}
              >
                Create one
              </button>
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              Already have an account?{" "}
              <button
                onClick={() => { setMode("login"); setError(""); }}
                className="font-medium hover:underline"
                style={{ color: "#d03238" }}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
