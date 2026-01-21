import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Users,
  TrendingDown,
  BarChart3,
  Settings,
  FileText,
  LogOut,
  Menu,
  Shield,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { refreshAccessToken, logout } from "../lib/api"; 

const AdminLayout = () => {

  // State to control sidebar visibility
  const { user, isAuthenticated, loading, setUser, setIsAuthenticated} = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState("w-64");
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Function to check screen size and update sidebar state and width
  const checkScreenSize = () => {
    const screenWidth = window.innerWidth;
    const wasMobile = isMobile;
    const isMobileNow = screenWidth < 768;
    setIsMobile(isMobileNow);
    
    // Adjust sidebar width based on screen size
    if (screenWidth < 1024 && screenWidth >= 768) {
      setSidebarWidth("w-56");
    } else if (screenWidth < 768 && screenWidth >= 640) {
      setSidebarWidth("w-48");
    } else if (screenWidth < 640) {
      setSidebarWidth("w-44");
    } else {
      setSidebarWidth("w-64"); // Default for large screens
    }
    
    // Only auto-collapse when transitioning from larger to smaller screen
    // Don't auto-expand when going from smaller to larger screen
    if (isMobileNow && !wasMobile) {
      setIsSidebarOpen(false);
    }
  };

  // Initialize sidebar state based on screen size and add resize listener
  useEffect(() => {
    // Initial check for screen size and setup
    const initialScreenWidth = window.innerWidth;
    const initialIsMobile = initialScreenWidth < 768;
    
    // Set initial state
    setIsMobile(initialIsMobile);
    
    // Only set sidebar closed on initial load if screen is small
    if (initialIsMobile) {
      setIsSidebarOpen(false);
    }
    
    // Set initial sidebar width
    if (initialScreenWidth < 1024 && initialScreenWidth >= 768) {
      setSidebarWidth("w-56");
    } else if (initialScreenWidth < 768 && initialScreenWidth >= 640) {
      setSidebarWidth("w-48");
    } else if (initialScreenWidth < 640) {
      setSidebarWidth("w-44");
    } else {
      setSidebarWidth("w-64");
    }

    // Add event listener for window resize
    window.addEventListener('resize', checkScreenSize);
    
    // Cleanup event listener on component unmount
    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [loading, isAuthenticated, navigate]);

  // UI Check: Jab tak verification chal raha hai, tabhi loading dikhao
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background text-foreground">
        <p>Loading...</p> 
      </div>
    );
  }

  // Agar user nahi hai, toh render na karein (redirect ho jayega)
  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null); 
      toast({
        title: "Logged out successfully",
        description: "You have been signed out of the system.",
      });
      navigate("/login");
    } catch (err: any) {
      console.error("Logout failed:", err.message);
      toast({
        title: "Logout failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const navigationItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Customers", href: "/customers", icon: Users },
    { name: "Returns", href: "/returns", icon: TrendingDown },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Reports", href: "/reports", icon: FileText },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  const isActive = (path: string) => location.pathname === path;

  // Main layout rendering
  return (
    <div className="min-h-screen bg-background font-inter"> {/* Added font-inter for consistent typography */}
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-card shadow-elevated transition-all duration-300 ${
          isSidebarOpen ? sidebarWidth : "w-16"
        } rounded-r-lg`}
      >
        {/* Sidebar Header */}
        <div className={`flex items-center justify-between ${sidebarWidth === "w-44" ? "p-3" : "p-4"} border-b border-border`}>
          <div className={`flex items-center ${sidebarWidth === "w-44" || sidebarWidth === "w-48" ? "gap-1" : "gap-2"} ${!isSidebarOpen && "justify-center w-full"}`}>
            <div 
              className={`${sidebarWidth === "w-44" ? "w-7 h-7" : "w-8 h-8"} bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md cursor-pointer transition-all duration-200 ${!isSidebarOpen ? 'hover:shadow-lg hover:bg-gradient-to-br hover:from-purple-700 hover:to-indigo-700 hover:scale-110' : ''}`}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            > 
              <Shield className={`${sidebarWidth === "w-44" ? "w-4 h-4" : "w-5 h-5"} text-white`} />
            </div>
            {isSidebarOpen && (
              <>
                <span className={`font-semibold ${sidebarWidth === "w-44" || sidebarWidth === "w-48" ? "text-base" : "text-lg"} text-foreground ${sidebarWidth === "w-44" ? "truncate max-w-[60%]" : ""}`}>Risk Analyzer</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className={`h-7 w-7 p-0 ml-auto rounded-full hover:bg-muted flex-shrink-0 ${sidebarWidth === "w-44" ? "ml-1" : ""}`}
                >
                  <Menu className="w-4 h-4 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.href}
                to={item.href}
                className={`flex items-center ${isSidebarOpen ? 'gap-2 px-2' : 'justify-center px-2'} py-2 rounded-lg transition-colors duration-200 ${
                  isActive(item.href)
                    ? "bg-primary text-primary-foreground shadow-md" // Stronger shadow for active link
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className={`${isSidebarOpen ? 'w-5 h-5' : 'w-5 h-5'} flex-shrink-0`} />
                {isSidebarOpen && <span className={`font-medium ${sidebarWidth === "w-44" || sidebarWidth === "w-48" ? "text-sm" : ""} truncate`}>{item.name}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile & Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-card rounded-br-lg"> {/* Added bg-card and rounded-br-lg for consistency */}
          {isSidebarOpen && (
            <div className="mb-3">
              <p className={`${sidebarWidth === "w-44" || sidebarWidth === "w-48" ? "text-xs" : "text-sm"} font-medium text-foreground truncate`}>{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.role}</p>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={handleLogout}
            className={`w-full ${isSidebarOpen ? 'justify-start gap-2 px-2' : 'justify-center p-2'} text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg`}
          >
            <LogOut className={`${isSidebarOpen ? 'w-4 h-4' : 'w-4 h-4'}`} />
            {isSidebarOpen && <span className={`${sidebarWidth === "w-44" || sidebarWidth === "w-48" ? "text-sm" : ""}`}>Logout</span>}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={`transition-all duration-300 ${
          isSidebarOpen ? 
            (sidebarWidth === "w-64" ? "ml-64" : 
             sidebarWidth === "w-56" ? "ml-56" : 
             sidebarWidth === "w-48" ? "ml-48" : 
             sidebarWidth === "w-44" ? "ml-44" : "ml-64") 
          : "ml-16"
        }`}
      >
        {/* Header (Top Bar) */}
        <header className="bg-card shadow-sm border-b border-border p-4 rounded-bl-lg"> {/* Added rounded-bl-lg */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {navigationItems.find((item) => isActive(item.href))?.name || "Dashboard"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Monitor and manage customer return risks
              </p>
            </div>
            <div className="flex items-center gap-4">
  <div className="text-right">
    <p className="text-sm text-muted-foreground">Welcome back,</p>
    <p className="font-medium text-foreground">{user.username}</p>
  </div>
  <ThemeToggle />
</div>

          </div>
        </header>

        {/* Page Specific Content (rendered by React Router's Outlet) */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;

  