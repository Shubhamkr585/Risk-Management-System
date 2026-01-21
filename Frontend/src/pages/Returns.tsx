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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Download,
  Search,
  Eye,
  List,
  Package,
  MessageSquare,
  AlertTriangle
} from 'lucide-react';
import { useQuery } from "@tanstack/react-query";
import { getReturnStats, getReturns, getReturnById } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";


// --- Type Interfaces ---
interface ReturnStat {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  highRisk: number;
}

interface ReturnData {
  id: string;
  returnId: string;
  orderId: string;
  customerId: string;
  customer: string; // The customer's name as a string
  product: string; // The product name as a string
  productPrice: number; // Corrected to number
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  riskScore: number;
  flags: string[];
}

interface SingleReturnData {
  id: string;
  returnId: string;
  orderId: string;
  product: {
    name: string;
    sku: string;
    category: string;
    price: number;
  };
  customer: {
    name: string;
    email: string;
    id: string;
  };
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  riskScore: number;
  requestDate: string;
  responseTime: string;
  images: string[];
  adminNotes: string;
  flags: string[];
}

interface ApiResponseWrapper<T> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;
}

const statusMap = {
  Pending: { icon: Clock, color: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-800' },
  Approved: { icon: CheckCircle2, color: 'text-green-600', badge: 'bg-green-100 text-green-800' },
  Rejected: { icon: XCircle, color: 'text-red-600', badge: 'bg-red-100 text-red-800' },
  // Handle case from backend where status is lowercased
  pending: { icon: Clock, color: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-800' },
  approved: { icon: CheckCircle2, color: 'text-green-600', badge: 'bg-green-100 text-green-800' },
  rejected: { icon: XCircle, color: 'text-red-600', badge: 'bg-red-100 text-red-800' },
};

const getRiskBadge = (score: number) => {
  if (score >= 70) return { variant: "destructive" as const, label: `${score}`, color: "text-red-600" };
  if (score >= 40) return { variant: "secondary" as const, label: `${score}`, color: "text-yellow-600" };
  return { variant: "default" as const, label: `${score}`, color: "text-green-600" };
};
// --- End Type Interfaces ---


const Returns = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const { toast } = useToast();
  
  const { data: statsData, isLoading: isLoadingStats } = useQuery<ApiResponseWrapper<ReturnStat>, Error>({
    queryKey: ['returnStats'],
    queryFn: getReturnStats,
    staleTime: 5 * 60 * 1000,
  });

  const { data: returnsData, isLoading: isLoadingReturns, isError, error } = useQuery<ApiResponseWrapper<ReturnData[]>, Error>({
    queryKey: ['returns', searchTerm, statusFilter],
    queryFn: () => getReturns({ search: searchTerm, status: statusFilter === 'All' ? undefined : statusFilter }),
    staleTime: 60 * 1000,
  });
  
  const { data: singleReturnData, isLoading: isSingleReturnLoading, error: singleReturnError } = useQuery<ApiResponseWrapper<SingleReturnData>, Error>({
    queryKey: ['returnDetails', selectedReturnId],
    queryFn: () => getReturnById(selectedReturnId!),
    enabled: !!selectedReturnId,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
  
  const selectedReturnDetails = singleReturnData?.data || null;

  const handleExportCsv = () => {
    const allReturns = returnsData?.data || [];
    if (allReturns.length === 0) {
      toast({ title: "No data to export", description: "No returns found matching the criteria.", variant: "default" });
      return;
    }

    const headers = ["Return ID", "Customer ID", "Customer Name", "Product", "Reason", "Status", "Risk Score", "Order ID", "Price"];
    const csvRows = allReturns.map(ret => [
      `"${ret.returnId}"`,
      `"${ret.customerId}"`,
      `"${ret.customer}"`,
      `"${ret.product}"`,
      `"${ret.reason}"`,
      `"${ret.status}"`,
      ret.riskScore,
      `"${ret.orderId}"`,
      // FIXED: Convert to string first, then apply replace
      typeof ret.productPrice === 'number' 
        ? ret.productPrice.toFixed(2) 
        : String(ret.productPrice || '0').replace(/[^0-9.]/g, '') || '0.00'
    ].join(','));
    
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'return_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast({ title: "Export Successful", description: `${allReturns.length} return records exported to CSV.` });
  };

  const handleViewReturnDetails = (returnItem: ReturnData) => {
    setSelectedReturnId(returnItem.id);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setIsDialogOpen(false);
      setSelectedReturnId(null);
    }
  };

  const stats = statsData?.data || { total: 0, pending: 0, approved: 0, rejected: 0, highRisk: 0 };
  const returns = returnsData?.data || [];
  
  const isLoadingAny = isLoadingStats || isLoadingReturns;
  if (isLoadingAny) {
    return (
      <div className="flex justify-center items-center min-h-[60vh] text-foreground">
        <p>Loading returns data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh] text-red-500">
        <p>Error loading returns: {error?.message || "An unknown error occurred"}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }


  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="text-center">
          <CardHeader className="flex-row justify-between items-center pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Requests</CardTitle>
            <List className="h-5 w-5 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardHeader className="flex-row justify-between items-center pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardHeader className="flex-row justify-between items-center pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardHeader className="flex-row justify-between items-center pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
            <XCircle className="h-5 w-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-1 gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search returns..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Statuses</SelectItem>
              <SelectItem value="Pending">Pending Review</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleExportCsv} className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Returns Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Return Requests
            <Badge variant="secondary">{returns.length} requests</Badge>
          </CardTitle>
          <CardDescription>
            Manage and review customer return requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.length > 0 ? (
                  returns.map((returnItem) => {
                    const status = statusMap[returnItem.status] || { icon: null, color: 'text-gray-600', badge: 'bg-gray-100 text-gray-800' };
                    const Icon = status.icon;
                    const riskBadge = getRiskBadge(returnItem.riskScore);
                    return (
                      <TableRow key={returnItem.id}>
                        <TableCell>
                          <div className="font-medium text-foreground">{returnItem.returnId}</div>
                          <div className="text-sm text-muted-foreground">{returnItem.orderId}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{returnItem.customer}</div>
                          <div className="text-sm text-muted-foreground">{returnItem.customerId}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{returnItem.product}</div>
                          <div className="text-sm text-muted-foreground">${returnItem.productPrice}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-foreground">{returnItem.reason}</div>
                          {returnItem.flags && returnItem.flags.length > 0 && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                              <span>{returnItem.flags.length} flag(s)</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {Icon && <Icon className={`h-4 w-4 ${status.color}`} />}
                            <Badge className={`${status.badge}`}>{returnItem.status}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge {...riskBadge}>{returnItem.riskScore}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleViewReturnDetails(returnItem)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No returns found matching your criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Return Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        {selectedReturnId && !isSingleReturnLoading && singleReturnData?.data && (
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Return Request Details: {singleReturnData.data.returnId}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Customer Information</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{singleReturnData.data.customer.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium">{singleReturnData.data.customer.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer ID:</span>
                    <span className="font-medium">{singleReturnData.data.customer.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk Score:</span>
                    <Badge {...getRiskBadge(singleReturnData.data.riskScore)}>{singleReturnData.data.riskScore}</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Product Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Product Information</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Product:</span>
                    <span className="font-medium">{singleReturnData.data.product.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SKU:</span>
                    <span className="font-medium">{singleReturnData.data.product.sku}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span className="font-medium">{singleReturnData.data.product.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price:</span>
                    <span className="font-medium">${singleReturnData.data.product.price}</span>
                  </div>
                </CardContent>
              </Card>
              
              {/* Return Details Card */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Return Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Request Date</label>
                      <p className="text-sm">{singleReturnData.data.requestDate}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Response Time</label>
                      <p className="text-sm">{singleReturnData.data.responseTime}</p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Return Reason</label>
                    <p className="text-sm mt-1">{singleReturnData.data.reason}</p>
                  </div>
                  
                  {singleReturnData.data.flags && singleReturnData.data.flags.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Risk Flags</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {singleReturnData.data.flags.map((flag, index) => (
                          <Badge key={index} variant="destructive">{flag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Admin Notes
                    </label>
                    <Textarea 
                      value={singleReturnData.data.adminNotes}
                      readOnly
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        console.log(`🔥 FRONTEND: Navigating to approval page for return ID: ${selectedReturnId}`);
                        navigate(`/approval/${selectedReturnId}`);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve Return
                    </Button>

                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        console.log(`🔥 FRONTEND: Navigating to rejection page for return ID: ${selectedReturnId}`);
                        navigate(`/rejection/${selectedReturnId}`);
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject Return
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setIsDialogOpen(false)} variant="outline">Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
        
        {isSingleReturnLoading && selectedReturnId && (
          <DialogContent className="sm:max-w-md flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">Loading return details...</p>
          </DialogContent>
        )}
        {selectedReturnId && singleReturnError && (
          <DialogContent className="sm:max-w-md flex flex-col items-center justify-center h-[200px] text-red-500">
            <p>Error loading details: {singleReturnError.message}</p>
            <Button onClick={() => setIsDialogOpen(false)} className="mt-2">Close</Button>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};


export default Returns;