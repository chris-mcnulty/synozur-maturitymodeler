import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Send, Ticket, Clock, CheckCircle2 } from "lucide-react";
import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@shared/constants";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "@shared/schema";
import type { SupportTicket } from "@shared/schema";
import { Footer } from "@/components/Footer";
import { Helmet } from "react-helmet-async";

type ViewState = "list" | "new" | "detail";

function getStatusColor(status: string) {
  switch (status) {
    case "open": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "in_progress": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "resolved": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "closed": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    default: return "";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "high": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "medium": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "low": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    default: return "";
  }
}

export default function Support() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");

  const searchParams = useMemo(() => new URLSearchParams(location.split("?")[1] || ""), [location]);
  const prefillDescription = searchParams.get("description") || "";

  const [view, setView] = useState<ViewState>(prefillDescription ? "new" : "list");

  const [newTicket, setNewTicket] = useState({
    category: "question" as string,
    subject: "",
    description: prefillDescription,
    priority: "medium" as string,
  });

  interface TicketReplyResponse {
    id: string;
    message: string;
    isInternal: boolean;
    createdAt: string;
    authorName: string;
    authorRole: string;
  }

  interface TicketDetailResponse extends SupportTicket {
    authorName: string;
    replies: TicketReplyResponse[];
  }

  const { data: tickets = [], isLoading, isError: ticketsError } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets"],
  });

  const { data: ticketDetail, isError: detailError } = useQuery<TicketDetailResponse>({
    queryKey: ["/api/support/tickets", selectedTicketId],
    enabled: !!selectedTicketId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newTicket) => {
      return await apiRequest("/api/support/tickets", "POST", data);
    },
    onSuccess: () => {
      toast({ title: "Ticket submitted", description: "We'll get back to you soon." });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setView("list");
      setNewTicket({ category: "question", subject: "", description: "", priority: "medium" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit ticket.", variant: "destructive" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      return await apiRequest(`/api/support/tickets/${ticketId}/replies`, "POST", { message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
      setReplyMessage("");
    },
  });

  if (view === "new") {
    return (
      <>
        <Helmet><title>New Support Ticket - Orion</title></Helmet>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Button variant="ghost" onClick={() => setView("list")} className="mb-4 gap-2" data-testid="button-back-to-list">
            <ArrowLeft className="h-4 w-4" /> Back to Tickets
          </Button>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" /> New Support Ticket
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Category</label>
                <Select value={newTicket.category} onValueChange={(v) => setNewTicket({ ...newTicket, category: v })}>
                  <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{TICKET_CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Subject</label>
                <Input
                  value={newTicket.subject}
                  onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                  placeholder="Brief summary of your issue"
                  data-testid="input-subject"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Textarea
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  placeholder="Describe your issue in detail"
                  rows={6}
                  data-testid="input-description"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Priority</label>
                <Select value={newTicket.priority} onValueChange={(v) => setNewTicket({ ...newTicket, priority: v })}>
                  <SelectTrigger data-testid="select-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => createMutation.mutate(newTicket)}
                disabled={!newTicket.subject.trim() || !newTicket.description.trim() || createMutation.isPending}
                className="w-full"
                data-testid="button-submit-ticket"
              >
                {createMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  if (view === "detail" && detailError) {
    return (
      <>
        <Helmet><title>Ticket Error - Orion Support</title></Helmet>
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Button variant="ghost" onClick={() => { setView("list"); setSelectedTicketId(null); }} className="mb-4 gap-2" data-testid="button-back-to-list">
            <ArrowLeft className="h-4 w-4" /> Back to Tickets
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-destructive mb-2">Failed to load ticket details.</p>
              <p className="text-sm text-muted-foreground">Please try again later.</p>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  if (view === "detail" && ticketDetail) {
    return (
      <>
        <Helmet><title>Ticket #{ticketDetail.ticketNumber} - Orion Support</title></Helmet>
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Button variant="ghost" onClick={() => { setView("list"); setSelectedTicketId(null); }} className="mb-4 gap-2" data-testid="button-back-to-list">
            <ArrowLeft className="h-4 w-4" /> Back to Tickets
          </Button>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-muted-foreground mb-1" data-testid="text-ticket-number">Ticket #{ticketDetail.ticketNumber}</p>
                  <CardTitle data-testid="text-ticket-subject">{ticketDetail.subject}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    by {ticketDetail.authorName} &middot; {new Date(ticketDetail.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge className={getStatusColor(ticketDetail.status)} data-testid="badge-ticket-status">
                    {TICKET_STATUS_LABELS[ticketDetail.status] || ticketDetail.status}
                  </Badge>
                  <Badge className={getPriorityColor(ticketDetail.priority)} data-testid="badge-ticket-priority">
                    {TICKET_PRIORITY_LABELS[ticketDetail.priority] || ticketDetail.priority}
                  </Badge>
                  <Badge variant="outline" data-testid="badge-ticket-category">
                    {TICKET_CATEGORY_LABELS[ticketDetail.category] || ticketDetail.category}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap" data-testid="text-ticket-description">{ticketDetail.description}</p>
            </CardContent>
          </Card>

          <h3 className="font-semibold mb-4">Replies</h3>
          <div className="space-y-3 mb-6">
            {ticketDetail.replies?.length === 0 && (
              <p className="text-sm text-muted-foreground">No replies yet.</p>
            )}
            {ticketDetail.replies?.map((reply) => (
              <Card key={reply.id} className={reply.isInternal ? "border-yellow-500/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" data-testid={`text-reply-author-${reply.id}`}>{reply.authorName}</span>
                      {reply.isInternal && <Badge variant="outline" className="text-xs">Internal Note</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(reply.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap" data-testid={`text-reply-message-${reply.id}`}>{reply.message}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {ticketDetail.status !== "closed" && (
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Write a reply..."
                    rows={3}
                    className="flex-1"
                    data-testid="input-reply"
                  />
                  <Button
                    size="icon"
                    onClick={() => replyMutation.mutate({ ticketId: ticketDetail.id, message: replyMessage })}
                    disabled={!replyMessage.trim() || replyMutation.isPending}
                    data-testid="button-send-reply"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Support - Orion by Synozur</title>
        <meta name="description" content="Get help and submit support tickets for the Orion platform." />
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-4xl" data-testid="page-support">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Ticket className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-support-title">Support</h1>
          </div>
          <Button onClick={() => setView("new")} className="gap-2" data-testid="button-new-ticket">
            <Plus className="h-4 w-4" /> New Ticket
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : ticketsError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-destructive mb-2">Failed to load support tickets.</p>
              <p className="text-sm text-muted-foreground">Please try refreshing the page.</p>
            </CardContent>
          </Card>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No support tickets yet.</p>
              <Button onClick={() => setView("new")} data-testid="button-create-first-ticket">
                Create Your First Ticket
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Card
                key={ticket.id}
                className="hover-elevate cursor-pointer"
                onClick={() => { setSelectedTicketId(ticket.id); setView("detail"); }}
                data-testid={`card-ticket-${ticket.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm text-muted-foreground">#{ticket.ticketNumber}</span>
                        <span className="font-medium truncate" data-testid={`text-ticket-subject-${ticket.id}`}>{ticket.subject}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                        {ticket.resolvedAt && (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            <span>Resolved {new Date(ticket.resolvedAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getStatusColor(ticket.status)} data-testid={`badge-status-${ticket.id}`}>
                        {TICKET_STATUS_LABELS[ticket.status] || ticket.status}
                      </Badge>
                      <Badge className={getPriorityColor(ticket.priority)} data-testid={`badge-priority-${ticket.id}`}>
                        {TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
