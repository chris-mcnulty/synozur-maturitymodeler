import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { UserPlus } from "lucide-react";
import { JOB_ROLES, INDUSTRIES, COMPANY_SIZES, COUNTRIES } from "@/lib/constants";

const proxyAssessmentSchema = z.object({
  modelId: z.string().min(1, "Model is required"),
  proxyName: z.string().min(1, "Name is required"),
  proxyCompany: z.string().min(1, "Company is required"),
  proxyJobTitle: z.string().optional(),
  proxyIndustry: z.string().optional(),
  proxyCompanySize: z.string().optional(),
  proxyCountry: z.string().optional(),
});

type ProxyAssessmentFormData = z.infer<typeof proxyAssessmentSchema>;

interface ProxyAssessmentDialogProps {
  models: Array<{ id: string; name: string; slug: string }>;
}

export function ProxyAssessmentDialog({ models }: ProxyAssessmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<ProxyAssessmentFormData>({
    resolver: zodResolver(proxyAssessmentSchema),
    defaultValues: {
      modelId: "",
      proxyName: "",
      proxyCompany: "",
      proxyJobTitle: "",
      proxyIndustry: "",
      proxyCompanySize: "",
      proxyCountry: "",
    },
  });

  const createProxyMutation = useMutation({
    mutationFn: async (data: ProxyAssessmentFormData) => {
      return await apiRequest(
        "/api/admin/assessments/proxy",
        "POST",
        data
      ) as { id: string; modelId: string };
    },
    onSuccess: (assessment) => {
      toast({
        title: "Proxy assessment created",
        description: "Redirecting to assessment wizard...",
      });
      setOpen(false);
      form.reset();
      // Navigate to the assessment wizard
      setLocation(`/assessment/${assessment.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create proxy assessment",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProxyAssessmentFormData) => {
    createProxyMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-proxy-assessment">
          <UserPlus className="h-4 w-4 mr-2" />
          Create Proxy Assessment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Proxy Assessment</DialogTitle>
          <DialogDescription>
            Create an assessment on behalf of a prospect without requiring them to create an account.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="modelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    data-testid="select-proxy-model"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proxyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prospect Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Smith"
                      {...field}
                      data-testid="input-proxy-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proxyCompany"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Acme Corporation"
                      {...field}
                      data-testid="input-proxy-company"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proxyJobTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Title</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    data-testid="select-proxy-job-title"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select job title (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {JOB_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proxyIndustry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    data-testid="select-proxy-industry"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INDUSTRIES.map((industry) => (
                        <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proxyCompanySize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Size</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    data-testid="select-proxy-company-size"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select company size (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMPANY_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>{size.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proxyCountry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    data-testid="select-proxy-country"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select country (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country} value={country}>{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-proxy"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createProxyMutation.isPending}
                data-testid="button-submit-proxy"
              >
                {createProxyMutation.isPending ? "Creating..." : "Create & Start Assessment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
