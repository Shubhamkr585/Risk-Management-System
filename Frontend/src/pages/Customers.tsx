import ThemeToggle from "@/components/ThemeToggle"; // Assuming ThemeToggle is correctly imported and used elsewhere if needed
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Filter,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardData } from "../lib/api";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader as DialogHeaderUI,
  DialogTitle as DialogTitleUI,
  DialogDescription as DialogDescriptionUI,
  DialogFooter as DialogFooterUI,
} from "@/components/ui/dialog";

interface Stat {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: string;
  color: string;
}

interface CustomerData {
  id: string;
  name: string;
  riskScore: number;
  returns: number;
  totalOrders: number;
}

interface RecentReturn {
  id: string;
  customer: string;
  product: string;
  reason: string;
  riskScore: number;
  time: string; // This will be a formatted string like "X hours ago"
}

interface RiskDistributionItem {
  label: string;
  count: string;
  percentage: string;
  color: string;
}

interface ActualDashboardPayload {
  stats: Stat[];
  highRiskCustomers: CustomerData[];
  recentReturns: RecentReturn[];
  riskDistribution: RiskDistributionItem[];
}

interface ApiResponseData {
  statusCode: number;
  data: ActualDashboardPayload;
  message: string;
  success: boolean;
}

const iconMap: { [key: string]: React.ElementType } = {
  Users: Users,
  TrendingDown: TrendingDown,
  AlertTriangle: AlertTriangle,
  DollarSign: DollarSign,
};

const Dashboard = () => {
  const navigate = useNavigate();

  // Dialog state for high risk customer details
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<RecentReturn | null>(null);

  const { data: apiResponse, isLoading, isError, error } = useQuery<ApiResponseData, Error>({
    queryKey: ['dashboardData'],
    queryFn: getDashboardData,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  const getRiskBadge = (score: number) => {
    if (score >= 70) return { variant: "destructive" as const, label: "High Risk" };
    if (score >= 40) return { variant: "secondary" as const, label: "Medium Risk" };
    return { variant: "default" as const, label: "Low Risk" };
  };

  // Handle navigation for "View All High Risk Customers"
  const handleViewAllHighRiskCustomers = () => {
    navigate('/customers?riskLevel=High');
  };

  // Handle navigation for "View All Recent Returns"
  const handleViewAllRecentReturns = () => {
    navigate('/returns');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh] text-foreground">
        <p>Loading dashboard data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh] text-red-500">
        <p>Error loading dashboard: {error?.message || "An unknown error occurred"}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const {
    stats = [],
    highRiskCustomers = [],
    recentReturns = [],
    riskDistribution = []
  } = apiResponse?.data || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = iconMap[stat.icon];
          if (!Icon) return null;
          return (
            <Card key={stat.title} className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="flex items-center mt-1">
                  {stat.trend === "up" ? (
                    <ArrowUpRight className="h-4 w-4 text-green-600" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-red-600" />
                  )}
                  <span
                    className={`text-xs font-medium ${
                      stat.trend === "up" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {stat.change}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">vs last month</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High Risk Customers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">High Risk Customers</CardTitle>
              <CardDescription>Customers with risk score above 70</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleViewAllHighRiskCustomers}>
              <Filter className="h-4 w-4 mr-2" />
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {highRiskCustomers.length > 0 ? (
                highRiskCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-3 bg-muted text-foreground rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-medium">{customer.name}</span>
                        <Badge {...getRiskBadge(customer.riskScore)}>
                          Score: {customer.riskScore}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Returns: {customer.returns}/{customer.totalOrders}</span>
                        <span>Rate: {customer.totalOrders > 0 ? Math.round((customer.returns / customer.totalOrders) * 100) : 0}%</span>
                      </div>
                      <Progress value={customer.riskScore} className="mt-2 h-2" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCustomer(customer)}
                      aria-label="View customer details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">No high risk customers found.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Returns */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Recent Returns</CardTitle>
              <CardDescription>Latest return requests and their risk assessment</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleViewAllRecentReturns}>
              <Eye className="h-4 w-4 mr-2" />
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentReturns.length > 0 ? (
                recentReturns.map((return_item) => (
                  <div
                    key={return_item.id}
                    className="flex items-center justify-between p-3 bg-muted text-foreground rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-medium">{return_item.customer}</span>
                        <Badge {...getRiskBadge(return_item.riskScore)}>
                          {return_item.riskScore}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">{return_item.product}</p>
                      <p className="text-xs text-muted-foreground">
                        Reason: {return_item.reason} • {return_item.time}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedReturn(return_item)}
                      aria-label="View return details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">No recent returns found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Risk Score Distribution</CardTitle>
          <CardDescription>Customer distribution across risk categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {riskDistribution.map((item) => (
              <div key={item.label} className="text-center p-6 bg-muted text-foreground rounded-lg border">
                <div className="text-3xl font-bold mb-2">{item.count}</div>
                <div className={`text-sm font-medium ${item.color} mb-1`}>{item.label}</div>
                <div className={`text-xs ${item.color.replace('500', '400')}`}>{item.percentage}% of customers</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog for High Risk Customer */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-md rounded-2xl shadow-2xl border-0 bg-gradient-to-br from-white to-slate-100">
          <DialogHeaderUI>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-shrink-0">
                <Users className="h-8 w-8 text-red-500 drop-shadow" />
              </div>
              <div>
                <DialogTitleUI className="text-xl font-bold">Customer Details</DialogTitleUI>
                <DialogDescriptionUI className="text-sm text-muted-foreground">
                  Detailed information about the selected high risk customer.
                </DialogDescriptionUI>
              </div>
            </div>
          </DialogHeaderUI>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">{selectedCustomer.name}</span>
                <Badge {...getRiskBadge(selectedCustomer.riskScore)} className="text-base px-3 py-1">
                  {getRiskBadge(selectedCustomer.riskScore).label}
                </Badge>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <div>
                  <span className="font-semibold">Risk Score:</span>{" "}
                  <span className="text-red-600 font-bold">{selectedCustomer.riskScore}</span>
                </div>
                <div>
                  <span className="font-semibold">Returns:</span> {selectedCustomer.returns}
                </div>
                <div>
                  <span className="font-semibold">Total Orders:</span> {selectedCustomer.totalOrders}
                </div>
                <div>
                  <span className="font-semibold">Return Rate:</span>{" "}
                  {selectedCustomer.totalOrders > 0
                    ? Math.round((selectedCustomer.returns / selectedCustomer.totalOrders) * 100)
                    : 0}
                  %
                </div>
              </div>
              <div className="py-2">
                <Progress value={selectedCustomer.riskScore} className="h-3 rounded-full bg-slate-200" />
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setSelectedCustomer(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog for Recent Return */}
      <Dialog open={!!selectedReturn} onOpenChange={() => setSelectedReturn(null)}>
        <DialogContent className="max-w-md rounded-2xl shadow-2xl border-0 bg-gradient-to-br from-white to-slate-100">
          <DialogHeaderUI>
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="h-8 w-8 text-yellow-500 drop-shadow" />
              <div>
                <DialogTitleUI className="text-xl font-bold">Return Details</DialogTitleUI>
                <DialogDescriptionUI className="text-sm text-muted-foreground">
                  Detailed information about the selected return.
                </DialogDescriptionUI>
              </div>
            </div>
          </DialogHeaderUI>
          {selectedReturn && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">{selectedReturn.customer}</span>
                <Badge {...getRiskBadge(selectedReturn.riskScore)} className="text-base px-3 py-1">
                  {getRiskBadge(selectedReturn.riskScore).label}
                </Badge>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <div>
                  <span className="font-semibold">Product:</span> {selectedReturn.product}
                </div>
                <div>
                  <span className="font-semibold">Reason:</span> {selectedReturn.reason}
                </div>
                <div>
                  <span className="font-semibold">Risk Score:</span>{" "}
                  <span className="text-yellow-600 font-bold">{selectedReturn.riskScore}</span>
                </div>
                <div>
                  <span className="font-semibold">Time:</span> {selectedReturn.time}
                </div>
              </div>
              <div className="py-2">
                <Progress value={selectedReturn.riskScore} className="h-3 rounded-full bg-slate-200" />
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setSelectedReturn(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;