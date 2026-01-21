import React, { createContext, useContext, useState, useEffect } from "react";
import { refreshAccessToken } from "../lib/api";

type User = {
  id: string;
  username: string;
  email: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  setUser: (user: User | null) => void;
  setIsAuthenticated: (auth: boolean) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const res: any = await refreshAccessToken();
        
        // Agar response mein user data hai (api.js ke logic ke according)
        // Data nesting check: res.data ya res.data.data
        const userData = res?.data?.data || res?.data || res;

        if (userData && userData.username) {
          setUser(userData); 
          setIsAuthenticated(true);
        }
      } catch (error) {
        // Localhost par 401 aana normal hai agar session expired hai
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false); // Ye line sabse zaroori hai
      }
    };

    initAuth();
  }, []);

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, setUser, setIsAuthenticated, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};