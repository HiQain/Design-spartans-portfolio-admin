import { useState } from "react";
import { ApiError } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_TITLE, BRAND_LOGO_SRC, BRAND_NAME, BRAND_TAGLINE } from "@/lib/branding";
import { Loader2 } from "lucide-react";

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password. Please try again.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError("Sign in failed. Please check your credentials and try again.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef4ff_100%)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src={BRAND_LOGO_SRC}
            alt={`${BRAND_NAME} logo`}
            className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover shadow-sm ring-1 ring-blue-100"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Brand Access</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{APP_TITLE}</h1>
          <p className="text-sm text-gray-500 mt-1">{BRAND_TAGLINE}</p>
        </div>

        <Card className="border-blue-100/80 shadow-lg shadow-blue-100/40">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Sign In</CardTitle>
            <CardDescription>Enter your credentials to access the {BRAND_NAME} workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
